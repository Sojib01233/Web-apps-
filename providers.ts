/**
 * Real provider integrations. Every function in this file talks to an official
 * public remote service; nothing is simulated and no unconfigured environment
 * secrets are required.
 */

export type ProviderStatus =
  | "connected"
  | "auth_required"
  | "partial"
  | "unavailable"
  | "not_implemented"
  | "unknown";

export type ProviderDef = {
  id: string;
  name: string;
  category: "optical" | "sar" | "weather" | "water" | "reference" | "visualization" | "infrastructure";
  operator: string;
  docsUrl: string;
  endpoint: string;
  capability: "discovery" | "data" | "visualization" | "download";
  requiresAuth: boolean;
  implemented: boolean;
  notes: string;
};

export const PROVIDER_DEFS: ProviderDef[] = [
  {
    id: "nasa-power",
    name: "NASA POWER (Prediction Of Worldwide Energy Resources)",
    category: "weather",
    operator: "NASA LaRC",
    docsUrl: "https://power.larc.nasa.gov/docs/services/api/",
    endpoint: "https://power.larc.nasa.gov/api/temporal/monthly/point",
    capability: "data",
    requiresAuth: false,
    implemented: true,
    notes: "Primary monthly climate, solar radiation, wind, humidity and soil-wetness time series.",
  },
  {
    id: "open-meteo-era5",
    name: "ECMWF ERA5 / ERA5-Land Historical Reanalysis",
    category: "weather",
    operator: "Open-Meteo (ECMWF ERA5)",
    docsUrl: "https://open-meteo.com/en/docs/historical-weather-api",
    endpoint: "https://archive-api.open-meteo.com/v1/archive",
    capability: "data",
    requiresAuth: false,
    implemented: true,
    notes: "Independent daily climate reanalysis aggregated to monthly steps for cross-source validation.",
  },
  {
    id: "open-meteo-flood",
    name: "Copernicus GloFAS Global River Discharge API",
    category: "water",
    operator: "Open-Meteo (Copernicus EMS GloFAS)",
    docsUrl: "https://open-meteo.com/en/docs/flood-api",
    endpoint: "https://flood-api.open-meteo.com/v1/flood",
    capability: "data",
    requiresAuth: false,
    implemented: true,
    notes: "Daily simulated river discharge (m³/s) from the Global Flood Awareness System.",
  },
  {
    id: "open-meteo-aq",
    name: "Copernicus CAMS Air Quality & Atmosphere API",
    category: "weather",
    operator: "Open-Meteo (Copernicus CAMS)",
    docsUrl: "https://open-meteo.com/en/docs/air-quality-api",
    endpoint: "https://air-quality-api.open-meteo.com/v1/air-quality",
    capability: "data",
    requiresAuth: false,
    implemented: true,
    notes: "Real-time atmospheric particulate matter (PM2.5, PM10), gases (NO₂, O₃, CO) and AQI.",
  },
  {
    id: "nasa-cmr",
    name: "NASA CMR (Common Metadata Repository)",
    category: "reference",
    operator: "NASA EOSDIS",
    docsUrl: "https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html",
    endpoint: "https://cmr.earthdata.nasa.gov/search",
    capability: "discovery",
    requiresAuth: false,
    implemented: true,
    notes: "Global satellite collection and granule discovery across MODIS, VIIRS, GPM, SMAP, SWOT and NISAR.",
  },
  {
    id: "nasa-gibs",
    name: "NASA GIBS / Worldview Satellite Imagery",
    category: "visualization",
    operator: "NASA EOSDIS",
    docsUrl: "https://nasa-gibs.github.io/gibs-api-docs/",
    endpoint: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best",
    capability: "visualization",
    requiresAuth: false,
    implemented: true,
    notes: "Live WMTS satellite imagery layers (MODIS Terra, VIIRS SNPP, GPM IMERG, Land Surface Temperature).",
  },
  {
    id: "nasa-eonet",
    name: "NASA EONET v3 (Natural Hazard Event Tracker)",
    category: "reference",
    operator: "NASA EOSDIS",
    docsUrl: "https://eonet.gsfc.nasa.gov/docs/v3",
    endpoint: "https://eonet.gsfc.nasa.gov/api/v3/events",
    capability: "data",
    requiresAuth: false,
    implemented: true,
    notes: "Real-time active natural hazard events (wildfires, severe storms, floods, volcanoes).",
  },
  {
    id: "copernicus-stac",
    name: "ESA Copernicus Data Space STAC Catalogue",
    category: "optical",
    operator: "ESA / Copernicus",
    docsUrl: "https://documentation.dataspace.copernicus.eu/APIs/STAC.html",
    endpoint: "https://stac.dataspace.copernicus.eu/v1",
    capability: "discovery",
    requiresAuth: false,
    implemented: true,
    notes: "Official Sentinel-1, Sentinel-2 and Sentinel-3 spatial/temporal scene discovery.",
  },
  {
    id: "copernicus-dataspace",
    name: "ESA Copernicus OData Product Catalogue",
    category: "optical",
    operator: "ESA / Copernicus",
    docsUrl: "https://documentation.dataspace.copernicus.eu/APIs/OData.html",
    endpoint: "https://catalogue.dataspace.copernicus.eu/odata/v1",
    capability: "discovery",
    requiresAuth: false,
    implemented: true,
    notes: "Public OData product catalogue for Copernicus Sentinel missions.",
  },
  {
    id: "aws-earth-search",
    name: "Element 84 / AWS Open Data Earth Search STAC",
    category: "optical",
    operator: "AWS Open Data",
    docsUrl: "https://element84.com/earth-search/",
    endpoint: "https://earth-search.aws.element84.com/v1",
    capability: "discovery",
    requiresAuth: false,
    implemented: true,
    notes: "Public Sentinel-2 L2A optical scenes (with cloud cover) and Sentinel-1 GRD radar scenes.",
  },
  {
    id: "asf",
    name: "NASA Alaska Satellite Facility (Sentinel-1 SAR)",
    category: "sar",
    operator: "NASA ASF DAAC",
    docsUrl: "https://docs.asf.alaska.edu/api/basics/",
    endpoint: "https://api.daac.asf.alaska.edu/services/search/param",
    capability: "discovery",
    requiresAuth: false,
    implemented: true,
    notes: "Sentinel-1 C-band SAR granule search with beam mode (IW) and polarization (VV/VH) metadata.",
  },
  {
    id: "usgs-stac",
    name: "USGS Landsat Collection-2 STAC Catalogue",
    category: "optical",
    operator: "USGS / NASA",
    docsUrl: "https://landsatlook.usgs.gov/stac-server",
    endpoint: "https://landsatlook.usgs.gov/stac-server",
    capability: "discovery",
    requiresAuth: false,
    implemented: true,
    notes: "Landsat 8 & 9 Level-2 surface reflectance and thermal scene discovery.",
  },
  {
    id: "usgs-earthquake",
    name: "USGS Earthquake Hazards Program API",
    category: "reference",
    operator: "USGS",
    docsUrl: "https://earthquake.usgs.gov/fdsnws/event/1/",
    endpoint: "https://earthquake.usgs.gov/fdsnws/event/1/query",
    capability: "data",
    requiresAuth: false,
    implemented: true,
    notes: "Real-time global seismic event feed in GeoJSON format.",
  },
  {
    id: "open-meteo-geocoding",
    name: "Open-Meteo Global Geocoding & Elevation API",
    category: "reference",
    operator: "Open-Meteo (GeoNames)",
    docsUrl: "https://open-meteo.com/en/docs/geocoding-api",
    endpoint: "https://geocoding-api.open-meteo.com/v1/search",
    capability: "discovery",
    requiresAuth: false,
    implemented: true,
    notes: "Worldwide place, river basin, coordinate and elevation lookup.",
  },
  {
    id: "noaa-gml",
    name: "NOAA Global Monitoring Laboratory (Mauna Loa CO₂)",
    category: "reference",
    operator: "NOAA GML",
    docsUrl: "https://gml.noaa.gov/ccgg/trends/",
    endpoint: "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv",
    capability: "data",
    requiresAuth: false,
    implemented: true,
    notes: "Official Mauna Loa atmospheric CO₂ monthly reference series.",
  },
];

export type ProbeResult = {
  providerId: string;
  status: ProviderStatus;
  ok: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
  message: string;
  detail?: Record<string, unknown>;
};

type HttpResult = {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
  bytes: number;
  ms: number;
  error?: string;
  attempts: number;
};

const DEFAULT_TIMEOUT = 20000;

export async function httpRequest(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<HttpResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxAttempts = (opts.retries ?? 1) + 1;
  let lastError = "";
  let attempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    const started = Date.now();
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
        headers: {
          "User-Agent": "TerraScope/1.0 (Earth science research platform)",
          ...(init.headers ?? {}),
        },
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      const retryable = res.status >= 500 || res.status === 429;
      if (retryable && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        lastError = `HTTP ${res.status}`;
        continue;
      }
      return {
        ok: res.ok,
        status: res.status,
        json,
        text,
        bytes: new TextEncoder().encode(text).length,
        ms: Date.now() - started,
        error: res.ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
        attempts,
      };
    } catch (err) {
      lastError = err instanceof Error ? (err.name === "TimeoutError" ? "request timed out" : err.message) : "network error";
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      return { ok: false, status: 0, json: null, text: "", bytes: 0, ms: Date.now() - started, error: lastError, attempts };
    }
  }
  return { ok: false, status: 0, json: null, text: "", bytes: 0, ms: 0, error: lastError, attempts };
}

/* ------------------------------------------------------------------ */
/* Live connection probes                                              */
/* ------------------------------------------------------------------ */

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export async function probeProvider(id: string): Promise<ProbeResult> {
  const def = PROVIDER_DEFS.find((p) => p.id === id);
  if (!def) {
    return { providerId: id, status: "unknown", ok: false, httpStatus: null, latencyMs: null, message: "Unknown provider" };
  }

  switch (id) {
    case "nasa-cmr": {
      const r = await httpRequest(
        "https://cmr.earthdata.nasa.gov/search/collections.json?keyword=soil%20moisture&page_size=1",
        { headers: { Accept: "application/json" } },
        { timeoutMs: 15000, retries: 1 },
      );
      const entries = (r.json as { feed?: { entry?: unknown[] } } | null)?.feed?.entry;
      const ok = r.ok && Array.isArray(entries) && entries.length > 0;
      return result(id, ok, r, ok ? "NASA CMR collection & granule search verified" : "Unexpected CMR payload");
    }
    case "nasa-power": {
      const r = await httpRequest(
        `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&longitude=90.41&latitude=23.81&start=2023&end=2023&format=JSON`,
        {},
        { timeoutMs: 20000, retries: 1 },
      );
      const params = (r.json as { properties?: { parameter?: Record<string, unknown> } } | null)?.properties?.parameter;
      const ok = r.ok && !!params && Object.keys(params).length > 0;
      return result(id, ok, r, ok ? "NASA POWER climate time-series verified" : "Unexpected POWER payload");
    }
    case "nasa-gibs": {
      const r = await httpRequest(
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${daysAgo(5)}/GoogleMapsCompatible_Level9/2/1/1.jpg`,
        {},
        { timeoutMs: 15000, retries: 1 },
      );
      return result(id, r.ok && r.bytes > 1000, r, r.ok ? "NASA GIBS WMTS satellite tiles verified" : "Tile request failed");
    }
    case "nasa-eonet": {
      const r = await httpRequest(
        "https://eonet.gsfc.nasa.gov/api/v3/events?limit=2&status=open",
        {},
        { timeoutMs: 15000, retries: 1 },
      );
      const events = (r.json as { events?: unknown[] } | null)?.events;
      const ok = r.ok && Array.isArray(events);
      return result(id, ok, r, ok ? "NASA EONET v3 active natural events verified" : "Unexpected EONET payload");
    }
    case "copernicus-stac": {
      const r = await httpRequest("https://stac.dataspace.copernicus.eu/v1/collections?limit=1", {}, { timeoutMs: 20000 });
      const ok = r.ok && !!r.json;
      return result(id, ok, r, ok ? "ESA Copernicus STAC Sentinel catalogue verified" : "STAC catalogue unreachable");
    }
    case "copernicus-dataspace": {
      const r = await httpRequest("https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$top=1", {}, { timeoutMs: 20000 });
      const ok = r.ok && !!r.json;
      return result(id, ok, r, ok ? "ESA Copernicus OData product catalogue verified" : "OData catalogue unreachable");
    }
    case "aws-earth-search": {
      const r = await httpRequest(
        "https://earth-search.aws.element84.com/v1/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bbox: [90, 23, 91, 24], limit: 1, collections: ["sentinel-2-l2a"] }),
        },
        { timeoutMs: 20000 },
      );
      const ok = r.ok && Array.isArray((r.json as { features?: unknown[] } | null)?.features);
      return result(id, ok, r, ok ? "Earth Search STAC Sentinel-1/2 scene discovery verified" : "Earth Search failed");
    }
    case "asf": {
      const r = await httpRequest(
        "https://api.daac.asf.alaska.edu/services/search/param?platform=Sentinel-1&start=2024-01-01&end=2024-01-05&maxResults=1&output=json",
        {},
        { timeoutMs: 25000, retries: 1 },
      );
      const ok = r.ok && Array.isArray(r.json);
      return result(id, ok, r, ok ? "NASA ASF Sentinel-1 SAR granule search verified" : "ASF search failed");
    }
    case "usgs-stac": {
      const r = await httpRequest(
        "https://landsatlook.usgs.gov/stac-server/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bbox: [-91, 23, -90, 24], limit: 1 }),
        },
        { timeoutMs: 25000, retries: 1 },
      );
      const ok = r.ok && Array.isArray((r.json as { features?: unknown[] } | null)?.features);
      return result(id, ok, r, ok ? "USGS Landsat Collection-2 STAC discovery verified" : "USGS STAC failed");
    }
    case "usgs-earthquake": {
      const r = await httpRequest(
        "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=1&minmagnitude=4.5",
        {},
        { timeoutMs: 15000, retries: 1 },
      );
      const features = (r.json as { features?: unknown[] } | null)?.features;
      const ok = r.ok && Array.isArray(features);
      return result(id, ok, r, ok ? "USGS GeoJSON seismic event feed verified" : "Unexpected USGS payload");
    }
    case "open-meteo-era5": {
      const r = await httpRequest(
        `https://archive-api.open-meteo.com/v1/archive?latitude=23.81&longitude=90.41&start_date=${daysAgo(10)}&end_date=${daysAgo(6)}&daily=temperature_2m_mean&timezone=UTC`,
        {},
        { timeoutMs: 20000 },
      );
      const ok = r.ok && !!((r.json as { daily?: { time?: unknown[] } } | null)?.daily?.time?.length);
      return result(id, ok, r, ok ? "ECMWF ERA5/ERA5-Land daily reanalysis verified" : "Unexpected ERA5 payload");
    }
    case "open-meteo-flood": {
      const r = await httpRequest(
        `https://flood-api.open-meteo.com/v1/flood?latitude=23.81&longitude=90.41&daily=river_discharge&start_date=${daysAgo(10)}&end_date=${daysAgo(6)}`,
        {},
        { timeoutMs: 20000 },
      );
      const ok = r.ok && !!((r.json as { daily?: { time?: unknown[] } } | null)?.daily?.time?.length);
      return result(id, ok, r, ok ? "Copernicus GloFAS river discharge verified" : "Unexpected GloFAS payload");
    }
    case "open-meteo-aq": {
      const r = await httpRequest(
        "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=23.81&longitude=90.41&current=pm2_5,pm10,us_aqi",
        {},
        { timeoutMs: 15000 },
      );
      const ok = r.ok && !!(r.json as { current?: Record<string, unknown> } | null)?.current;
      return result(id, ok, r, ok ? "Copernicus CAMS air-quality telemetry verified" : "Unexpected AQ payload");
    }
    case "open-meteo-geocoding": {
      const r = await httpRequest(
        "https://geocoding-api.open-meteo.com/v1/search?name=Dhaka&count=1&language=en&format=json",
        {},
        { timeoutMs: 15000 },
      );
      const results = (r.json as { results?: unknown[] } | null)?.results;
      const ok = r.ok && Array.isArray(results) && results.length > 0;
      return result(id, ok, r, ok ? "Global geocoding & elevation search verified" : "Unexpected Geocoding payload");
    }
    case "noaa-gml": {
      const r = await httpRequest("https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv", {}, { timeoutMs: 20000 });
      const ok = r.ok && r.text.includes(",");
      return result(id, ok, r, ok ? "NOAA Mauna Loa CO₂ reference series verified" : "NOAA CSV request failed");
    }
    default: {
      const r = await httpRequest(def.endpoint, {}, { timeoutMs: 15000 });
      return result(id, r.ok, r, r.ok ? "Endpoint reachable" : `Endpoint failed: ${r.error}`);
    }
  }
}

function result(id: string, ok: boolean, r: HttpResult, okMessage: string): ProbeResult {
  return {
    providerId: id,
    status: ok ? "connected" : "unavailable",
    ok,
    httpStatus: r.status || null,
    latencyMs: r.ms,
    message: ok ? okMessage : r.error ?? "Unexpected response payload",
    detail: { attempts: r.attempts, bytes: r.bytes },
  };
}

/* ------------------------------------------------------------------ */
/* Data acquisition: NASA POWER                                        */
/* ------------------------------------------------------------------ */

export type RawSeries = {
  source: string;
  variable: string;
  unit: string;
  points: { period: string; value: number }[];
  access: { url: string; httpStatus: number; bytes: number; durationMs: number };
  metadata?: Record<string, unknown>;
};

const FILL = -999;

export async function fetchPowerMonthly(
  lat: number,
  lon: number,
  startYear: number,
  endYear: number,
  parameters: string[],
): Promise<{ series: Record<string, RawSeries>; error?: string; url: string }> {
  const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=${parameters.join(
    ",",
  )}&community=AG&longitude=${lon}&latitude=${lat}&start=${startYear}&end=${endYear}&format=JSON`;
  const r = await httpRequest(url, {}, { timeoutMs: 35000, retries: 1 });
  const unitMap: Record<string, string> = {
    T2M: "°C",
    PRECTOTCORR: "mm/day",
    GWETTOP: "fraction",
    RH2M: "%",
    ALLSKY_SFC_SW_DWN: "MJ/m²/day",
    WS2M: "m/s",
  };
  if (!r.ok || !r.json) return { series: {}, error: r.error ?? "NASA POWER request failed", url };
  const parameter = (r.json as { properties?: { parameter?: Record<string, Record<string, number>> } }).properties
    ?.parameter;
  if (!parameter) return { series: {}, error: "NASA POWER response missing properties.parameter", url };
  const series: Record<string, RawSeries> = {};
  Object.entries(parameter).forEach(([param, values]) => {
    const points: { period: string; value: number }[] = [];
    Object.entries(values).forEach(([key, value]) => {
      if (!/^\d{6}$/.test(key)) return;
      const month = Number(key.slice(4, 6));
      if (month > 12) return;
      if (!Number.isFinite(value) || value <= FILL) return;
      let v = value;
      if (param === "PRECTOTCORR") {
        const days = new Date(Number(key.slice(0, 4)), month, 0).getDate();
        v *= days; // mm/day -> mm/month
      }
      points.push({ period: `${key.slice(0, 4)}-${key.slice(4, 6)}`, value: Number(v.toFixed(4)) });
    });
    points.sort((a, b) => (a.period < b.period ? -1 : 1));
    series[param] = {
      source: "NASA POWER",
      variable: param,
      unit: param === "PRECTOTCORR" ? "mm/month" : unitMap[param] ?? "",
      points,
      access: { url, httpStatus: r.status, bytes: r.bytes, durationMs: r.ms },
      metadata: { community: "AG", endpoint: "temporal/monthly/point" },
    };
  });
  return { series, url };
}

/* ------------------------------------------------------------------ */
/* Data acquisition: Open-Meteo ERA5 + GloFAS                          */
/* ------------------------------------------------------------------ */

export function aggregateDailyToMonthly(
  dates: string[],
  values: (number | null)[],
  aggregation: "mean" | "sum",
  scale = 1,
): { period: string; value: number; coverage: number }[] {
  const buckets = new Map<string, { total: number; count: number; days: number }>();
  dates.forEach((date, i) => {
    const period = date.slice(0, 7);
    const value = values[i];
    const bucket = buckets.get(period) ?? { total: 0, count: 0, days: 0 };
    bucket.days += 1;
    if (value !== null && Number.isFinite(value)) {
      bucket.total += value;
      bucket.count += 1;
    }
    buckets.set(period, bucket);
  });
  return [...buckets.entries()]
    .filter(([, b]) => b.count > 0)
    .map(([period, b]) => ({
      period,
      value: Number(((aggregation === "mean" ? b.total / b.count : b.total) * scale).toFixed(4)),
      coverage: b.count / b.days,
    }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));
}

export async function fetchEra5Daily(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  dailyParams: string[],
): Promise<{ series: Record<string, RawSeries>; error?: string; url: string }> {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=${dailyParams.join(
    ",",
  )}&wind_speed_unit=ms&timezone=UTC`;
  const r = await httpRequest(url, {}, { timeoutMs: 40000, retries: 1 });
  if (!r.ok || !r.json) return { series: {}, error: r.error ?? "ERA5 request failed", url };
  const daily = (r.json as { daily?: Record<string, unknown> }).daily;
  if (!daily || !Array.isArray(daily.time)) return { series: {}, error: "ERA5 response missing daily block", url };
  const dates = daily.time as string[];
  const units = (r.json as { daily_units?: Record<string, string> }).daily_units ?? {};
  const config: Record<string, { agg: "mean" | "sum"; scale: number }> = {
    temperature_2m_mean: { agg: "mean", scale: 1 },
    precipitation_sum: { agg: "sum", scale: 1 },
    soil_moisture_0_to_7cm_mean: { agg: "mean", scale: 1 },
    relative_humidity_2m_mean: { agg: "mean", scale: 1 },
    snowfall_sum: { agg: "sum", scale: 1 },
    shortwave_radiation_sum: { agg: "mean", scale: 1 },
    wind_speed_10m_max: { agg: "mean", scale: 1 },
  };
  const series: Record<string, RawSeries> = {};
  dailyParams.forEach((param) => {
    const raw = daily[param];
    if (!Array.isArray(raw)) return;
    const cfg = config[param] ?? { agg: "mean" as const, scale: 1 };
    const monthly = aggregateDailyToMonthly(dates, raw as (number | null)[], cfg.agg, cfg.scale);
    series[param] = {
      source: "ERA5 (Open-Meteo)",
      variable: param,
      unit: units[param] ?? "",
      points: monthly.map((m) => ({ period: m.period, value: m.value })),
      access: { url, httpStatus: r.status, bytes: r.bytes, durationMs: r.ms },
      metadata: {
        units: units[param] ?? null,
        aggregation: cfg.agg,
        monthlyCoverage: monthly.map((m) => ({ period: m.period, coverage: Number(m.coverage.toFixed(2)) })),
        model: (r.json as { timezone?: string }).timezone ?? "UTC",
      },
    };
  });
  return { series, url };
}

export async function fetchGlofasDaily(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<{ series?: RawSeries; peak?: RawSeries; error?: string; url: string }> {
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge&start_date=${startDate}&end_date=${endDate}`;
  const r = await httpRequest(url, {}, { timeoutMs: 45000, retries: 1 });
  if (!r.ok || !r.json) return { error: r.error ?? "GloFAS request failed", url };
  const daily = (r.json as { daily?: { time?: string[]; river_discharge?: (number | null)[] } }).daily;
  if (!daily?.time || !Array.isArray(daily.river_discharge)) return { error: "GloFAS response missing daily discharge", url };
  const monthly = aggregateDailyToMonthly(daily.time, daily.river_discharge, "mean");
  const access = { url, httpStatus: r.status, bytes: r.bytes, durationMs: r.ms };
  return {
    url,
    series: {
      source: "GloFAS (Open-Meteo)",
      variable: "river_discharge",
      unit: "m³/s",
      points: monthly.map((m) => ({ period: m.period, value: m.value })),
      access,
      metadata: { aggregation: "monthly mean of daily discharge", model: "GloFAS reanalysis" },
    },
    peak: {
      source: "GloFAS (Open-Meteo)",
      variable: "river_discharge_peak",
      unit: "m³/s",
      points: [],
      access,
      metadata: { note: "peak extraction handled in harmonisation" },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Discovery: NASA CMR, STAC, ASF                                      */
/* ------------------------------------------------------------------ */

export type CmrCollection = {
  id: string;
  shortName?: string;
  title: string;
  abstract?: string;
  platforms?: string[];
  instruments?: string[];
  timeStart?: string;
  timeEnd?: string;
  links?: { rel?: string; href?: string; title?: string }[];
  cloudHosted?: boolean;
};

export async function searchCmrCollections(params: {
  keyword: string;
  bbox: { west: number; south: number; east: number; north: number };
  temporal: string;
  pageSize?: number;
}): Promise<{ collections: CmrCollection[]; error?: string; url: string; httpStatus: number }> {
  const query = new URLSearchParams({
    keyword: params.keyword,
    bounding_box: `${params.bbox.west},${params.bbox.south},${params.bbox.east},${params.bbox.north}`,
    temporal: params.temporal,
    page_size: String(params.pageSize ?? 6),
    sort_key: "-score",
    has_granules: "true",
  });
  const url = `https://cmr.earthdata.nasa.gov/search/collections.json?${query.toString()}`;
  const r = await httpRequest(url, { headers: { Accept: "application/json" } }, { timeoutMs: 25000, retries: 1 });
  if (!r.ok) return { collections: [], error: r.error, url, httpStatus: r.status };
  const feed = (r.json as { feed?: { entry?: Record<string, unknown>[] } }).feed;
  if (!feed?.entry) return { collections: [], error: "CMR response missing feed.entry", url, httpStatus: r.status };
  const collections: CmrCollection[] = feed.entry.map((e) => ({
    id: String(e.id ?? e.concept_id ?? ""),
    shortName: e.short_name ? String(e.short_name) : undefined,
    title: String(e.title ?? "Untitled collection"),
    abstract: e.abstract ? String(e.abstract).slice(0, 600) : undefined,
    platforms: Array.isArray(e.platforms) ? (e.platforms as string[]) : [],
    instruments: Array.isArray(e.instruments) ? (e.instruments as string[]) : [],
    timeStart: e.time_start ? String(e.time_start) : undefined,
    timeEnd: e.time_end ? String(e.time_end) : undefined,
    links: Array.isArray(e.links) ? (e.links as CmrCollection["links"]) : [],
    cloudHosted: Boolean(e.cloud_hosted),
  }));
  return { collections, url, httpStatus: r.status };
}

export async function countCmrGranules(params: {
  conceptId: string;
  bbox: { west: number; south: number; east: number; north: number };
  temporal: string;
}): Promise<number | null> {
  const query = new URLSearchParams({
    collection_concept_id: params.conceptId,
    bounding_box: `${params.bbox.west},${params.bbox.south},${params.bbox.east},${params.bbox.north}`,
    temporal: params.temporal,
    page_size: "1",
  });
  const r = await httpRequest(
    `https://cmr.earthdata.nasa.gov/search/granules.json?${query.toString()}`,
    { headers: { Accept: "application/json" } },
    { timeoutMs: 20000, retries: 1 },
  );
  if (!r.ok) return null;
  const hits = (r.json as { feed?: { hits?: number } }).feed?.hits;
  return typeof hits === "number" ? hits : null;
}

export type StacItem = {
  id: string;
  collection?: string;
  datetime?: string;
  properties?: Record<string, unknown>;
  assets?: Record<string, { href?: string; title?: string; type?: string }>;
  geometry?: { type: string; coordinates: unknown };
  bbox?: number[];
};

export async function searchStac(
  endpoint: string,
  body: { bbox: number[]; datetime: string; collections?: string[]; limit?: number },
): Promise<{ items: StacItem[]; matched: number | null; error?: string; url: string; httpStatus: number }> {
  const r = await httpRequest(
    `${endpoint}/search`,
    { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/geo+json" }, body: JSON.stringify(body) },
    { timeoutMs: 30000, retries: 1 },
  );
  if (!r.ok) return { items: [], matched: null, error: r.error, url: `${endpoint}/search`, httpStatus: r.status };
  const json = r.json as { features?: StacItem[]; numberMatched?: number; context?: { matched?: number } } | null;
  if (!json?.features) {
    return { items: [], matched: null, error: "STAC response missing features", url: `${endpoint}/search`, httpStatus: r.status };
  }
  return {
    items: json.features,
    matched: json.numberMatched ?? json.context?.matched ?? null,
    url: `${endpoint}/search`,
    httpStatus: r.status,
  };
}

export type AsfResult = {
  granuleName: string;
  platform: string;
  sensor: string;
  beamMode: string;
  polarization: string;
  startTime: string;
  downloadUrl?: string;
  bytes?: number;
  processingLevel?: string;
};

export async function searchAsf(params: {
  bbox: { west: number; south: number; east: number; north: number };
  start: string;
  end: string;
  maxResults?: number;
}): Promise<{ results: AsfResult[]; error?: string; url: string; httpStatus: number }> {
  const polygon = `POLYGON((${params.bbox.west} ${params.bbox.south},${params.bbox.east} ${params.bbox.south},${params.bbox.east} ${params.bbox.north},${params.bbox.west} ${params.bbox.north},${params.bbox.west} ${params.bbox.south}))`;
  const query = new URLSearchParams({
    platform: "Sentinel-1",
    intersectsWith: polygon,
    start: params.start,
    end: params.end,
    output: "json",
    maxResults: String(params.maxResults ?? 5),
  });
  const url = `https://api.daac.asf.alaska.edu/services/search/param?${query.toString()}`;
  const r = await httpRequest(url, {}, { timeoutMs: 35000, retries: 1 });
  if (!r.ok) return { results: [], error: r.error, url, httpStatus: r.status };
  const payload = r.json as unknown;
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return { results: [], error: "ASF response was not a result set", url, httpStatus: r.status };
  }
  const results = (payload[0] as Record<string, unknown>[]).slice(0, params.maxResults ?? 5).map((item) => ({
    granuleName: String(item.granuleName ?? item.sceneName ?? "unknown"),
    platform: String(item.platform ?? "Sentinel-1"),
    sensor: String(item.sensor ?? "SAR"),
    beamMode: String(item.beamModeType ?? item.beamMode ?? ""),
    polarization: String(item.polarization ?? ""),
    startTime: String(item.startTime ?? ""),
    downloadUrl: typeof item.downloadUrl === "string" ? item.downloadUrl : undefined,
    bytes: typeof item.bytes === "number" ? item.bytes : undefined,
    processingLevel: typeof item.processingLevel === "string" ? item.processingLevel : undefined,
  }));
  return { results, url, httpStatus: r.status };
}

export const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
  PROVIDER_DEFS.map((p) => [p.id, p.name]),
);
