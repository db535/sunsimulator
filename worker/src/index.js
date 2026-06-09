const ORS_BASE = "https://api.openrouteservice.org";

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    ...extra,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({
      "Content-Type": "application/json; charset=utf-8",
    }),
  });
}

function normalizeLngLatPair(value, name) {
  if (!value) return null;
  const parts = String(value).split(",").map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`${name} must be lng,lat. Example: 139.767125,35.681236`);
  }
  const [lng, lat] = parts;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    throw new Error(`${name} is out of range. Expected lng,lat.`);
  }
  return `${lng},${lat}`;
}

async function proxyOrsRoute(url, env) {
  const profile = url.searchParams.get("profile") || "foot-walking";
  const startRaw = url.searchParams.get("start");
  const endRaw = url.searchParams.get("end");

  if (!env.ORS_API_KEY) {
    return json({
      error: "missing ORS_API_KEY",
      hint: "Run: npx.cmd wrangler secret put ORS_API_KEY",
    }, 500);
  }

  let start;
  let end;
  try {
    start = normalizeLngLatPair(startRaw, "start");
    end = normalizeLngLatPair(endRaw, "end");
  } catch (e) {
    return json({ error: e.message }, 400);
  }

  if (!start || !end) {
    return json({
      error: "missing start or end",
      example: "/routes?profile=foot-walking&start=139.767125,35.681236&end=139.758101,35.674510",
    }, 400);
  }

  const endpoint = new URL(`${ORS_BASE}/v2/directions/${profile}`);
  endpoint.searchParams.set("start", start);
  endpoint.searchParams.set("end", end);

  const r = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      "Authorization": env.ORS_API_KEY,
      "Accept": "application/geo+json",
    },
  });

  const text = await r.text();

  return new Response(text, {
    status: r.status,
    headers: corsHeaders({
      "Content-Type": r.headers.get("Content-Type") || "application/geo+json; charset=utf-8",
      "Cache-Control": "no-store",
    }),
  });
}

async function proxyGeocode(url, env) {
  const text = url.searchParams.get("text") || url.searchParams.get("q") || "";

  if (!env.ORS_API_KEY) {
    return json({
      error: "missing ORS_API_KEY",
      hint: "Run: npx.cmd wrangler secret put ORS_API_KEY",
    }, 500);
  }

  if (!text.trim()) {
    return json({
      error: "missing text",
      example: "/geocode?text=東京駅",
    }, 400);
  }

  const endpoint = new URL(`${ORS_BASE}/geocode/search`);
  endpoint.searchParams.set("text", text.trim());
  endpoint.searchParams.set("size", url.searchParams.get("size") || "5");
  endpoint.searchParams.set("boundary.country", url.searchParams.get("country") || "JP");

  const r = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      "Authorization": env.ORS_API_KEY,
      "Accept": "application/json",
    },
  });

  const textBody = await r.text();
  return new Response(textBody, {
    status: r.status,
    headers: corsHeaders({
      "Content-Type": r.headers.get("Content-Type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    }),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return json({
        ok: true,
        service: "ShadeRoute ORS Worker",
        available: ["/health", "/routes", "/geocode"],
      });
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        provider: "openrouteservice",
        hasOrsKey: !!env.ORS_API_KEY,
        time: new Date().toISOString(),
        available: ["/health", "/routes", "/geocode"],
      });
    }

    if (url.pathname === "/routes") {
      if (request.method !== "GET") {
        return json({ error: "method not allowed", method: request.method }, 405);
      }
      return proxyOrsRoute(url, env);
    }

    if (url.pathname === "/geocode") {
      if (request.method !== "GET") {
        return json({ error: "method not allowed", method: request.method }, 405);
      }
      return proxyGeocode(url, env);
    }

    return json({
      error: "not found",
      path: url.pathname,
      available: ["/health", "/routes", "/geocode"],
    }, 404);
  },
};
