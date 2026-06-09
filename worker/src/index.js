const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const ORS_BASE = "https://api.openrouteservice.org";

function corsHeaders(origin, env) {
  const allow = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim()).filter(Boolean);
  const ok = allow.includes("*") || allow.includes(origin);
  return ok ? {
    "Access-Control-Allow-Origin": allow.includes("*") ? "*" : origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin"
  } : {};
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function normalizeProfile(profile) {
  const p = String(profile || "foot-walking");
  const allowed = new Set(["foot-walking", "cycling-regular", "driving-car", "wheelchair"]);
  return allowed.has(p) ? p : "foot-walking";
}
function pointToCoordinate(p) { return [Number(p.lng), Number(p.lat)]; }

export default {
  async fetch(request, env) {
    const originHeader = request.headers.get("Origin") || "";
    const cors = corsHeaders(originHeader, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, provider: "openrouteservice", hasOrsKey: Boolean(env.ORS_API_KEY), time: new Date().toISOString() }, 200, cors);
    }

    if (url.pathname === "/geocode" && request.method === "POST") {
      const body = await readJson(request);
      const text = String(body.text || body.address || "").trim();
      if (!text) return json({ error: "text is required" }, 400, cors);
      const endpoint = new URL(`${ORS_BASE}/geocode/search`);
      endpoint.searchParams.set("text", text);
      endpoint.searchParams.set("size", "1");
      endpoint.searchParams.set("boundary.country", body.country || "JP");
      endpoint.searchParams.set("api_key", env.ORS_API_KEY);
      const r = await fetch(endpoint.toString(), { headers: { "Accept": "application/json" } });
      const data = await r.json();
      if (!r.ok || !data.features?.length) return json({ error: "geocode failed", details: data }, r.status || 400, cors);
      const [lng, lat] = data.features[0].geometry.coordinates;
      return json({ lat, lng, label: data.features[0].properties?.label || text }, 200, cors);
    }

    if (url.pathname === "/routes" && request.method === "POST") {
  const body = await readJson(request);

  if (!body.origin || !body.destination) {
    return json({ error: "origin and destination are required" }, 400, cors);
  }

  const profile = normalizeProfile(body.profile);

  const startLng = Number(body.origin.lng);
  const startLat = Number(body.origin.lat);
  const endLng = Number(body.destination.lng);
  const endLat = Number(body.destination.lat);

  if (
    !Number.isFinite(startLng) ||
    !Number.isFinite(startLat) ||
    !Number.isFinite(endLng) ||
    !Number.isFinite(endLat)
  ) {
    return json({ error: "invalid coordinates" }, 400, cors);
  }

  /*
    安定版:
    POST /v2/directions/{profile}/geojson ではなく、
    GET /v2/directions/{profile}?start=lng,lat&end=lng,lat
    を使う。
  */
  const endpoint = new URL(`${ORS_BASE}/v2/directions/${profile}`);

  endpoint.searchParams.set("start", `${startLng},${startLat}`);
  endpoint.searchParams.set("end", `${endLng},${endLat}`);

  const r = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      "Authorization": env.ORS_API_KEY,
      "Accept": "application/geo+json"
    }
  });

  const data = await r.json();

  if (!r.ok) {
    return json(
      {
        error: "openrouteservice routes failed",
        details: data
      },
      r.status,
      cors
    );
  }

  const routes = (data.features || []).map((f, i) => ({
    index: i,
    coordinates: f.geometry?.coordinates || [],
    distance: f.properties?.summary?.distance || 0,
    duration: f.properties?.summary?.duration || 0,
    summary: f.properties?.summary || {},
    bbox: f.bbox || null
  }));

  return json(
    {
      routes,
      provider: "openrouteservice",
      mode: "get-basic-geojson"
    },
    200,
    cors
  );
}

    return json({ error: "not found" }, 404, cors);
  }
};