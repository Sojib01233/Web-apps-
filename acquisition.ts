import {
  countCmrGranules,
  fetchEra5Daily,
  fetchGlofasDaily,
  fetchPowerMonthly,
  searchAsf,
  searchCmrCollections,
  searchStac,
  type RawSeries,
} from "@/lib/providers";
import { getTopic, VARIABLES, type TopicSpec, type VariableKey } from "@/lib/catalog";

export type BBox = { west: number; south: number; east: number; north: number };

export type DatasetCandidate = {
  provider: string;
  providerLabel: string;
  collectionId: string;
  title: string;
  description?: string;
  platform?: string;
  instrument?: string;
  category: string;
  variables: string[];
  temporalStart?: string;
  temporalEnd?: string;
  spatialResolution?: string;
  temporalResolution?: string;
  license?: string;
  accessUrl?: string;
  accessType: "metadata" | "open" | "auth" | "visualization";
  status: "discovered" | "rejected";
  relevance: number;
  rationale: string;
  granuleCount?: number | null;
  metadata?: Record<string, unknown>;
};

export type AccessCall = {
  provider: string;
  url: string;
  method: string;
  httpStatus: number | null;
  bytes: number;
  durationMs: number;
  outcome: "success" | "error";
  error?: string;
};

export type DiscoveryResult = {
  candidates: DatasetCandidate[];
  calls: AccessCall[];
  warnings: string[];
  cloudCover?: number | null;
  searchedCollections: number;
};

const CATEGORY_KEYWORDS: Record<string, string> = {
  optical: "vegetation index surface reflectance",
  sar: "Sentinel-1 SAR",
  weather: "precipitation",
  water: "soil moisture",
};

const CATEGORY_PLATFORM_HINTS: Record<string, string[]> = {
  optical: ["MODIS", "VIIRS", "Landsat", "Sentinel-2"],
  sar: ["Sentinel-1", "NISAR", "ALOS"],
  weather: ["GPM", "GOES", "JPSS", "Meteosat", "IMERG"],
  water: ["SMAP", "SWOT", "Sentinel-3", "Sentinel-6"],
};

function temporalFor(startYear: number, endYear: number): string {
  return `${startYear}-01-01T00:00:00Z,${endYear}-12-31T23:59:59Z`;
}

function stacDatetime(startYear: number, endYear: number): string {
  return `${startYear}-01-01T00:00:00Z/${endYear}-12-31T23:59:59Z`;
}

function overlapScore(tStart: string | undefined, tEnd: string | undefined, startYear: number, endYear: number): number {
  if (!tStart) return 0.5;
  const startMs = new Date(tStart).getTime();
  const endMs = tEnd ? new Date(tEnd).getTime() : Date.now();
  const reqStart = Date.UTC(startYear, 0, 1);
  const reqEnd = Date.UTC(endYear, 11, 31);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0.5;
  const overlapMs = Math.min(endMs, reqEnd) - Math.max(startMs, reqStart);
  return Math.max(0, Math.min(1, overlapMs / Math.max(1, reqEnd - reqStart)));
}

export async function discoverDatasets(input: {
  topicSlug: string;
  bbox: BBox;
  startYear: number;
  endYear: number;
}): Promise<DiscoveryResult> {
  const topic = getTopic(input.topicSlug);
  if (!topic) throw new Error(`Unknown research topic: ${input.topicSlug}`);
  const candidates: DatasetCandidate[] = [];
  const calls: AccessCall[] = [];
  const warnings: string[] = [];
  const temporal = temporalFor(input.startYear, input.endYear);
  const stacTemporal = stacDatetime(input.startYear, input.endYear);
  const start = `${input.startYear}-01-01`;
  const end = `${input.endYear}-12-31`;
  let cloudCover: number | null = null;
  let searched = 0;

  /* ---------------- NASA CMR collection search ---------------- */
  const keywords = new Set<string>();
  topic.keywords.slice(0, 2).forEach((keyword) => keywords.add(keyword));
  topic.categories.forEach((cat) => keywords.add(CATEGORY_KEYWORDS[cat]));
  for (const keyword of [...keywords].slice(0, 3)) {
    const cmr = await searchCmrCollections({ keyword, bbox: input.bbox, temporal, pageSize: 5 });
    searched += 1;
    calls.push({
      provider: "nasa-cmr",
      url: cmr.url,
      method: "GET",
      httpStatus: cmr.httpStatus || null,
      bytes: 0,
      durationMs: 0,
      outcome: cmr.error ? "error" : "success",
      error: cmr.error,
    });
    if (cmr.error) continue;

    for (const collection of cmr.collections) {
      const platforms = collection.platforms ?? [];
      const category =
        topic.categories.find((cat) =>
          CATEGORY_PLATFORM_HINTS[cat].some(
            (hint) =>
              platforms.some((p) => p.toLowerCase().includes(hint.toLowerCase())) ||
              collection.title.toLowerCase().includes(hint.toLowerCase()),
          ),
        ) ?? topic.categories[0];
      const overlap = overlapScore(collection.timeStart, collection.timeEnd, input.startYear, input.endYear);
      const text = `${collection.title} ${collection.abstract ?? ""}`.toLowerCase();
      const platformText = platforms.join(" ").toLowerCase();
      const hintMatch =
        CATEGORY_PLATFORM_HINTS[category]?.some(
          (hint) => text.includes(hint.toLowerCase()) || platformText.includes(hint.toLowerCase()),
        ) ?? false;
      const variableTerms: Record<string, string[]> = {
        temperature: ["temperature", "thermal", "air temp"],
        precipitation: ["precipitation", "rainfall", "rain", "imerg"],
        soil_moisture: ["soil moisture", "soil wetness", "smap"],
        humidity: ["humidity", "vapour", "vapor"],
        river_discharge: ["discharge", "runoff", "river", "swot"],
        snowfall: ["snow", "snowfall", "cryosphere"],
        solar_radiation: ["solar", "shortwave", "irradiance", "ceres"],
        wind_speed: ["wind", "cyclone", "storm"],
      };
      const matchedVariables = topic.variables.filter((v) =>
        (variableTerms[v] ?? []).some((term) => text.includes(term)),
      );
      const relevant = (hintMatch || matchedVariables.length > 0) && overlap > 0;
      if (!relevant) continue;

      candidates.push({
        provider: "nasa-cmr",
        providerLabel: "NASA Earthdata CMR",
        collectionId: collection.id,
        title: collection.title,
        description: collection.abstract,
        platform: platforms.join(", ") || undefined,
        instrument: (collection.instruments ?? []).join(", ") || undefined,
        category,
        variables: matchedVariables.length > 0 ? matchedVariables : topic.variables,
        temporalStart: collection.timeStart,
        temporalEnd: collection.timeEnd,
        spatialResolution: extractResolution(collection.title),
        temporalResolution: /daily|monthly|8-day|16-day|3-hourly/i.exec(collection.title)?.[0] ?? "Continuous",
        license: "NASA Open Data Policy",
        accessUrl:
          collection.links?.find((l) => l.rel === "self" || l.rel === "html")?.href ??
          `https://cmr.earthdata.nasa.gov/search/concepts/${collection.id}.html`,
        accessType: "open",
        status: "discovered",
        relevance: Math.round(65 + overlap * 30),
        rationale: `Matches research topic with ${Math.round(overlap * 100)}% temporal coverage over ${input.startYear}–${input.endYear}.`,
        metadata: { keyword, cloudHosted: collection.cloudHosted },
      });
    }
  }

  /* ---------------- STAC: Copernicus + Earth Search + USGS --------------- */
  const stacTargets: {
    endpoint: string;
    provider: string;
    label: string;
    collections: string[];
  }[] = [];
  if (topic.categories.includes("optical")) {
    stacTargets.push({
      endpoint: "https://earth-search.aws.element84.com/v1",
      provider: "aws-earth-search",
      label: "Element 84 / AWS Earth Search",
      collections: ["sentinel-2-l2a"],
    });
  }
  if (topic.categories.includes("sar")) {
    stacTargets.push({
      endpoint: "https://earth-search.aws.element84.com/v1",
      provider: "aws-earth-search",
      label: "Element 84 / AWS Earth Search",
      collections: ["sentinel-1-grd"],
    });
  }
  if (topic.categories.includes("optical") || topic.categories.includes("water")) {
    const usgs = await searchStac("https://landsatlook.usgs.gov/stac-server", {
      bbox: [input.bbox.west, input.bbox.south, input.bbox.east, input.bbox.north],
      datetime: stacTemporal,
      limit: 5,
    });
    searched += 1;
    calls.push({
      provider: "usgs-stac",
      url: usgs.url,
      method: "POST",
      httpStatus: usgs.httpStatus || null,
      bytes: 0,
      durationMs: 0,
      outcome: usgs.error ? "error" : "success",
      error: usgs.error,
    });
    if (!usgs.error && usgs.items.length > 0) {
      const platforms = new Set(usgs.items.map((i) => String(i.properties?.["platform"] ?? "Landsat 8/9")));
      candidates.push({
        provider: "usgs-stac",
        providerLabel: "USGS Landsat STAC",
        collectionId: "landsat-c2-l2",
        title: `Landsat 8/9 Collection-2 Level-2 Surface Reflectance & Thermal`,
        platform: [...platforms].join(", ") || "Landsat 8/9",
        instrument: "OLI / TIRS",
        category: "optical",
        variables: topic.variables,
        temporalStart: `${input.startYear}-01-01`,
        temporalEnd: `${input.endYear}-12-31`,
        spatialResolution: "30 m",
        temporalResolution: "8–16 days",
        license: "USGS Public Domain",
        accessUrl: "https://landsatlook.usgs.gov/",
        accessType: "open",
        status: "discovered",
        relevance: 90,
        rationale: `${(usgs.matched ?? usgs.items.length).toLocaleString()} Landsat scenes intersect the study area during ${input.startYear}–${input.endYear}.`,
        granuleCount: usgs.matched ?? usgs.items.length,
        metadata: { sampleSceneIds: usgs.items.slice(0, 3).map((i) => i.id) },
      });
    }
  }

  for (const target of stacTargets) {
    const res = await searchStac(target.endpoint, {
      bbox: [input.bbox.west, input.bbox.south, input.bbox.east, input.bbox.north],
      datetime: stacTemporal,
      collections: target.collections,
      limit: 5,
    });
    searched += 1;
    calls.push({
      provider: target.provider,
      url: res.url,
      method: "POST",
      httpStatus: res.httpStatus || null,
      bytes: 0,
      durationMs: 0,
      outcome: res.error ? "error" : "success",
      error: res.error,
    });
    if (res.error || res.items.length === 0) continue;

    const item = res.items[0];
    const cloudValues = res.items
      .map((i) => Number(i.properties?.["eo:cloud_cover"]))
      .filter((v) => Number.isFinite(v));
    const meanCloud = cloudValues.length ? cloudValues.reduce((a, b) => a + b, 0) / cloudValues.length : null;
    if (cloudValues.length) cloudCover = meanCloud;
    const isSar = target.collections[0] === "sentinel-1-grd";
    const collectionLabel = isSar
      ? "Sentinel-1 C-Band SAR Ground Range Detected (GRD)"
      : "Sentinel-2 Level-2A Multispectral Surface Reflectance";
    candidates.push({
      provider: target.provider,
      providerLabel: target.label,
      collectionId: target.collections[0],
      title: collectionLabel,
      description: item
        ? `Sample scene ${item.id} (${String(item.datetime ?? "").slice(0, 10)}).${
            meanCloud !== null ? ` Mean cloud cover: ${meanCloud.toFixed(1)}%.` : ""
          }`
        : undefined,
      platform: isSar ? "Sentinel-1" : "Sentinel-2",
      instrument: isSar ? "C-SAR" : "MSI",
      category: isSar ? "sar" : "optical",
      variables: topic.variables,
      temporalStart: `${input.startYear}-01-01`,
      temporalEnd: `${input.endYear}-12-31`,
      spatialResolution: isSar ? "10 m" : "10–60 m",
      temporalResolution: isSar ? "6–12 days" : "5 days",
      license: "Copernicus Open Access",
      accessUrl: item?.assets?.visual?.href ?? item?.assets?.thumbnail?.href ?? target.endpoint,
      accessType: "open",
      status: "discovered",
      relevance: 92,
      rationale: `${(res.matched ?? res.items.length).toLocaleString()} ${isSar ? "Sentinel-1 radar" : "Sentinel-2 optical"} scenes available over the study region.${
        meanCloud !== null ? ` Average cloud cover in sample: ${meanCloud.toFixed(1)}%.` : ""
      }`,
      granuleCount: res.matched ?? res.items.length,
      metadata: {
        sampleSceneIds: res.items.slice(0, 3).map((i) => i.id),
        meanCloudCover: meanCloud,
      },
    });
  }

  /* ---------------- ASF Sentinel-1 ---------------- */
  if (topic.categories.includes("sar") || topic.categories.includes("water")) {
    const asf = await searchAsf({ bbox: input.bbox, start, end, maxResults: 5 });
    searched += 1;
    calls.push({
      provider: "asf",
      url: asf.url,
      method: "GET",
      httpStatus: asf.httpStatus || null,
      bytes: 0,
      durationMs: 0,
      outcome: asf.error ? "error" : "success",
      error: asf.error,
    });
    if (!asf.error && asf.results.length > 0) {
      const first = asf.results[0];
      candidates.push({
        provider: "asf",
        providerLabel: "NASA ASF (Sentinel-1 SAR)",
        collectionId: "SENTINEL-1-SAR",
        title: `Sentinel-1 Interferometric Wide-Swath (IW) SAR Granules`,
        description: first
          ? `Latest sampled granule: ${first.granuleName} (${first.beamMode} mode, polarization ${first.polarization || "VV+VH"}).`
          : undefined,
        platform: "Sentinel-1A/B",
        instrument: "C-SAR",
        category: "sar",
        variables: topic.variables,
        temporalStart: start,
        temporalEnd: end,
        spatialResolution: "5 × 20 m",
        temporalResolution: "6–12 days",
        license: "ESA / NASA ASF Open Data",
        accessUrl: "https://search.asf.alaska.edu/",
        accessType: "open",
        status: "discovered",
        relevance: 88,
        rationale: `Verified Sentinel-1 C-band radar coverage (${first?.beamMode || "IW"} beam mode, ${first?.polarization || "VV/VH"} polarization) intersecting the study bounding box.`,
        granuleCount: asf.results.length,
        metadata: { sampleGranules: asf.results.map((r) => r.granuleName) },
      });
    }
  }

  /* ---------------- Granule counts for top CMR collections ---------------- */
  const cmrTop = candidates
    .filter((c) => c.provider === "nasa-cmr")
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);
  for (const cand of cmrTop) {
    const count = await countCmrGranules({ conceptId: cand.collectionId, bbox: input.bbox, temporal });
    cand.granuleCount = count;
    if (count === 0) {
      cand.status = "rejected";
    } else if (typeof count === "number" && count > 0) {
      cand.rationale = `${count.toLocaleString()} satellite granules intersect the study region over ${input.startYear}–${input.endYear}.`;
    }
  }

  // Only return relevant discovered datasets so users see a clean, meaningful list
  const cleanCandidates = candidates
    .filter((c) => c.status === "discovered")
    .sort((a, b) => b.relevance - a.relevance);

  return {
    candidates: cleanCandidates,
    calls,
    warnings,
    cloudCover,
    searchedCollections: searched,
  };
}

function extractResolution(title: string): string {
  const match = /(\d+(?:\.\d+)?)\s?(km|m|deg|degree)\b/i.exec(title);
  return match ? `${match[1]} ${match[2].toLowerCase()}` : "Global Grid";
}

/* ------------------------------------------------------------------ */
/* Acquisition of real numeric series                                  */
/* ------------------------------------------------------------------ */

export type AcquiredSeries = {
  variable: VariableKey;
  source: string;
  unit: string;
  points: { period: string; value: number }[];
  access: { url: string; httpStatus: number; bytes: number; durationMs: number };
  metadata?: Record<string, unknown>;
};

export type AcquisitionResult = {
  series: AcquiredSeries[];
  calls: AccessCall[];
  warnings: string[];
  rasterOnly: VariableKey[];
};

const POWER_FOR: Partial<Record<VariableKey, string>> = {
  temperature: "T2M",
  precipitation: "PRECTOTCORR",
  soil_moisture: "GWETTOP",
  humidity: "RH2M",
  solar_radiation: "ALLSKY_SFC_SW_DWN",
  wind_speed: "WS2M",
};

const ERA5_FOR: Partial<Record<VariableKey, string>> = {
  temperature: "temperature_2m_mean",
  precipitation: "precipitation_sum",
  soil_moisture: "soil_moisture_0_to_7cm_mean",
  humidity: "relative_humidity_2m_mean",
  snowfall: "snowfall_sum",
  solar_radiation: "shortwave_radiation_sum",
  wind_speed: "wind_speed_10m_max",
};

export async function acquireTopicSeries(input: {
  topicSlug: string;
  lat: number;
  lon: number;
  startYear: number;
  endYear: number;
}): Promise<AcquisitionResult> {
  const topic = getTopic(input.topicSlug);
  if (!topic) throw new Error(`Unknown research topic: ${input.topicSlug}`);
  const requested = topic.variables.filter((v) => !VARIABLES[v].rasterOnly);
  const rasterOnly = topic.variables.filter((v) => VARIABLES[v].rasterOnly);
  const series: AcquiredSeries[] = [];
  const calls: AccessCall[] = [];
  const warnings: string[] = [];

  const powerParams = requested.map((v) => POWER_FOR[v]).filter((v): v is string => Boolean(v));
  if (powerParams.length) {
    const power = await fetchPowerMonthly(input.lat, input.lon, input.startYear, input.endYear, powerParams);
    calls.push({
      provider: "nasa-power",
      url: power.url,
      method: "GET",
      httpStatus: power.series[powerParams[0]]?.access.httpStatus ?? null,
      bytes: power.series[powerParams[0]]?.access.bytes ?? 0,
      durationMs: power.series[powerParams[0]]?.access.durationMs ?? 0,
      outcome: power.error ? "error" : "success",
      error: power.error,
    });
    if (power.error) warnings.push(`NASA POWER acquisition failed: ${power.error}`);
    requested.forEach((variable) => {
      const param = POWER_FOR[variable];
      if (!param) return;
      const raw = power.series[param];
      if (!raw || raw.points.length === 0) return;
      series.push({
        variable,
        source: "NASA POWER",
        unit: raw.unit,
        points: raw.points,
        access: raw.access,
        metadata: { ...raw.metadata, parameter: param, community: "AG" },
      });
    });
  }

  const eraParams = requested.map((v) => ERA5_FOR[v]).filter((v): v is string => Boolean(v));
  if (eraParams.length) {
    const era = await fetchEra5Daily(
      input.lat,
      input.lon,
      `${input.startYear}-01-01`,
      `${input.endYear}-12-31`,
      eraParams,
    );
    calls.push({
      provider: "open-meteo-era5",
      url: era.url,
      method: "GET",
      httpStatus: era.series[eraParams[0]]?.access.httpStatus ?? null,
      bytes: era.series[eraParams[0]]?.access.bytes ?? 0,
      durationMs: era.series[eraParams[0]]?.access.durationMs ?? 0,
      outcome: era.error ? "error" : "success",
      error: era.error,
    });
    if (era.error) warnings.push(`ERA5 acquisition failed: ${era.error}`);
    requested.forEach((variable) => {
      const param = ERA5_FOR[variable];
      if (!param) return;
      const raw = era.series[param];
      if (!raw || raw.points.length === 0) return;
      series.push({
        variable,
        source: "ERA5 (Open-Meteo)",
        unit: raw.unit,
        points: raw.points,
        access: raw.access,
        metadata: { ...raw.metadata, parameter: param, reanalysis: "ERA5 / ERA5-Land" },
      });
    });
  }

  if (requested.includes("river_discharge")) {
    const glofas = await fetchGlofasDaily(
      input.lat,
      input.lon,
      `${input.startYear}-01-01`,
      `${input.endYear}-12-31`,
    );
    if (glofas.series) {
      series.push({
        variable: "river_discharge",
        source: glofas.series.source,
        unit: glofas.series.unit,
        points: glofas.series.points,
        access: glofas.series.access,
        metadata: glofas.series.metadata,
      });
      calls.push({
        provider: "open-meteo-flood",
        url: glofas.url,
        method: "GET",
        httpStatus: glofas.series.access.httpStatus,
        bytes: glofas.series.access.bytes,
        durationMs: glofas.series.access.durationMs,
        outcome: "success",
      });
    } else {
      warnings.push(`GloFAS discharge acquisition failed: ${glofas.error}`);
      calls.push({
        provider: "open-meteo-flood",
        url: glofas.url,
        method: "GET",
        httpStatus: null,
        bytes: 0,
        durationMs: 0,
        outcome: "error",
        error: glofas.error,
      });
    }
  }

  if (series.length === 0) {
    throw new Error(
      `No observational series could be acquired. Provider warnings: ${warnings.join(" | ") || "unknown"}.`,
    );
  }

  return { series, calls, warnings, rasterOnly };
}

export type { RawSeries };
export type TopicSpecExport = TopicSpec;
