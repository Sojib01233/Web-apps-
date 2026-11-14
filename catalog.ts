/**
 * Scientific catalogue: variables, missions, analysis methods and topics.
 * Every variable assigned to a research topic is acquired from official open APIs
 * and analyzed end-to-end.
 */

export type VariableKey =
  | "temperature"
  | "precipitation"
  | "soil_moisture"
  | "humidity"
  | "river_discharge"
  | "snowfall"
  | "solar_radiation"
  | "wind_speed"
  | "ndvi"
  | "water_extent"
  | "backscatter";

export type VariableSpec = {
  key: VariableKey;
  label: string;
  unit: string;
  description: string;
  aggregation: "mean" | "sum";
  decimals: number;
  powerParam?: string;
  powerUnits?: string;
  era5Param?: string;
  era5Units?: string;
  glofas?: boolean;
  rasterOnly?: boolean;
};

export const VARIABLES: Record<VariableKey, VariableSpec> = {
  temperature: {
    key: "temperature",
    label: "Air Temperature (2 m)",
    unit: "°C",
    description: "Monthly mean 2-metre air temperature.",
    aggregation: "mean",
    decimals: 2,
    powerParam: "T2M",
    powerUnits: "°C",
    era5Param: "temperature_2m_mean",
    era5Units: "°C",
  },
  precipitation: {
    key: "precipitation",
    label: "Rainfall / Precipitation",
    unit: "mm/month",
    description: "Monthly accumulated precipitation.",
    aggregation: "sum",
    decimals: 1,
    powerParam: "PRECTOTCORR",
    powerUnits: "mm/day",
    era5Param: "precipitation_sum",
    era5Units: "mm/day",
  },
  soil_moisture: {
    key: "soil_moisture",
    label: "Surface Soil Moisture",
    unit: "m³/m³",
    description: "Monthly mean surface soil wetness and volumetric moisture.",
    aggregation: "mean",
    decimals: 3,
    powerParam: "GWETTOP",
    powerUnits: "fraction",
    era5Param: "soil_moisture_0_to_7cm_mean",
    era5Units: "m³/m³",
  },
  humidity: {
    key: "humidity",
    label: "Relative Humidity (2 m)",
    unit: "%",
    description: "Monthly mean near-surface relative humidity.",
    aggregation: "mean",
    decimals: 1,
    powerParam: "RH2M",
    powerUnits: "%",
    era5Param: "relative_humidity_2m_mean",
    era5Units: "%",
  },
  river_discharge: {
    key: "river_discharge",
    label: "River Discharge Flow",
    unit: "m³/s",
    description: "Monthly mean river discharge from Copernicus GloFAS.",
    aggregation: "mean",
    decimals: 1,
    glofas: true,
  },
  snowfall: {
    key: "snowfall",
    label: "Snowfall Accumulation",
    unit: "cm/month",
    description: "Monthly accumulated snowfall from ECMWF ERA5.",
    aggregation: "sum",
    decimals: 1,
    era5Param: "snowfall_sum",
    era5Units: "cm/day",
  },
  solar_radiation: {
    key: "solar_radiation",
    label: "Surface Solar Radiation",
    unit: "MJ/m²/day",
    description: "Monthly mean daily downward shortwave solar irradiance.",
    aggregation: "mean",
    decimals: 2,
    powerParam: "ALLSKY_SFC_SW_DWN",
    powerUnits: "MJ/m²/day",
    era5Param: "shortwave_radiation_sum",
    era5Units: "MJ/m²/day",
  },
  wind_speed: {
    key: "wind_speed",
    label: "Near-Surface Wind Speed",
    unit: "m/s",
    description: "Monthly mean near-surface wind speed.",
    aggregation: "mean",
    decimals: 2,
    powerParam: "WS2M",
    powerUnits: "m/s",
    era5Param: "wind_speed_10m_max",
    era5Units: "m/s",
  },
  ndvi: {
    key: "ndvi",
    label: "NDVI (Vegetation Index)",
    unit: "index",
    description: "Normalised Difference Vegetation Index.",
    aggregation: "mean",
    decimals: 3,
    rasterOnly: true,
  },
  water_extent: {
    key: "water_extent",
    label: "Surface Water Extent",
    unit: "index",
    description: "Surface water extent from optical and radar observations.",
    aggregation: "mean",
    decimals: 3,
    rasterOnly: true,
  },
  backscatter: {
    key: "backscatter",
    label: "SAR Backscatter (VV/VH)",
    unit: "dB",
    description: "Calibrated Sentinel-1 radar backscatter.",
    aggregation: "mean",
    decimals: 2,
    rasterOnly: true,
  },
};

export const METHODS = [
  { key: "trend", label: "Trend Analysis", detail: "Decadal rate of change (Sen's slope & Mann–Kendall)" },
  { key: "change", label: "Change Detection", detail: "Early vs. recent period shift (Welch t-test)" },
  { key: "historical", label: "Seasonal & Annual Cycle", detail: "12-month seasonal cycle & annual bars" },
  { key: "anomaly", label: "Anomaly Detection", detail: "Unusual extreme months (z-score screening)" },
  { key: "cause", label: "Cause & Driver Analysis", detail: "Cross-variable relationships & lag effects" },
  { key: "risk", label: "Risk Assessment", detail: "High/low threshold exceedance risk level" },
  { key: "prediction", label: "5-Year Future Forecast", detail: "Seasonal forecast with 95% confidence band" },
] as const;

export type MethodKey = (typeof METHODS)[number]["key"];

export type MissionSpec = {
  id: string;
  name: string;
  operator: string;
  category: "optical" | "sar" | "weather" | "water";
  sensors: string;
  resolution: string;
  revisit: string;
  providerId: string;
};

export const MISSIONS: MissionSpec[] = [
  { id: "sentinel-2", name: "Sentinel-2 MSI", operator: "ESA / Copernicus", category: "optical", sensors: "13 bands, VNIR–SWIR", resolution: "10–60 m", revisit: "5 days", providerId: "copernicus-stac" },
  { id: "landsat-8-9", name: "Landsat 8 / 9 OLI-TIRS", operator: "NASA / USGS", category: "optical", sensors: "11 bands, VNIR–TIR", resolution: "30–100 m", revisit: "8–16 days", providerId: "usgs-stac" },
  { id: "modis", name: "MODIS Terra / Aqua", operator: "NASA", category: "optical", sensors: "36 spectral bands", resolution: "250–1000 m", revisit: "1–2 days", providerId: "nasa-cmr" },
  { id: "viirs", name: "VIIRS (Suomi NPP / NOAA-20)", operator: "NASA / NOAA", category: "optical", sensors: "22 spectral bands", resolution: "375–750 m", revisit: "12 hours", providerId: "nasa-cmr" },
  { id: "sentinel-1", name: "Sentinel-1 C-SAR", operator: "ESA / Copernicus", category: "sar", sensors: "C-band SAR (VV/VH)", resolution: "5 × 20 m", revisit: "6–12 days", providerId: "asf" },
  { id: "alos-2", name: "ALOS-2 PALSAR-2", operator: "JAXA", category: "sar", sensors: "L-band SAR", resolution: "10–100 m", revisit: "14 days", providerId: "nasa-cmr" },
  { id: "nisar", name: "NISAR", operator: "NASA / ISRO", category: "sar", sensors: "L-band + S-band SAR", resolution: "3–10 m", revisit: "12 days", providerId: "nasa-cmr" },
  { id: "gpm", name: "GPM IMERG", operator: "NASA / JAXA", category: "weather", sensors: "GMI + DPR Precipitation", resolution: "10 km (0.1°)", revisit: "30 min", providerId: "nasa-cmr" },
  { id: "goes", name: "GOES-R ABI", operator: "NOAA / NASA", category: "weather", sensors: "16-channel ABI", resolution: "0.5–2 km", revisit: "5–15 min", providerId: "nasa-cmr" },
  { id: "jpss", name: "JPSS (NOAA-20 / 21)", operator: "NOAA / NASA", category: "weather", sensors: "VIIRS, CrIS, ATMS", resolution: "0.75–50 km", revisit: "12 hours", providerId: "nasa-cmr" },
  { id: "swot", name: "SWOT Hydrology", operator: "NASA / CNES", category: "water", sensors: "KaRIn Interferometric Altimeter", resolution: "10–70 m", revisit: "21 days", providerId: "nasa-cmr" },
  { id: "smap", name: "SMAP Soil Moisture", operator: "NASA", category: "water", sensors: "L-band Radiometer", resolution: "9–36 km", revisit: "2–3 days", providerId: "nasa-cmr" },
  { id: "sentinel-3", name: "Sentinel-3 OLCI / SLSTR", operator: "ESA / Copernicus", category: "water", sensors: "OLCI, SLSTR, SRAL Altimeter", resolution: "300 m – 1 km", revisit: "2 days", providerId: "copernicus-stac" },
  { id: "sentinel-6", name: "Sentinel-6 Michael Freilich", operator: "ESA / NASA / NOAA", category: "water", sensors: "Poseidon-4 Radar Altimeter", resolution: "Along-track", revisit: "10 days", providerId: "nasa-cmr" },
];

export type TopicSpec = {
  slug: string;
  label: string;
  short: string;
  objective: string;
  variables: VariableKey[];
  categories: ("optical" | "sar" | "weather" | "water")[];
  methods: MethodKey[];
  keywords: string[];
  interpretation: string;
};

export const TOPICS: TopicSpec[] = [
  {
    slug: "vegetation-dynamics",
    label: "Vegetation & Agro-Climatic Condition",
    short: "Track plant growth drivers: rainfall, soil moisture, temperature & solar energy.",
    objective:
      "Analyze the agro-climatic drivers of vegetation health — rainfall, root-zone/surface soil moisture, temperature, and solar radiation — alongside optical satellite coverage.",
    variables: ["precipitation", "soil_moisture", "temperature", "solar_radiation"],
    categories: ["optical", "weather"],
    methods: ["trend", "change", "historical", "anomaly", "cause", "risk", "prediction"],
    keywords: ["vegetation index", "NDVI", "land cover", "surface reflectance"],
    interpretation:
      "Combines Sentinel-2/Landsat/MODIS scene discovery with full monthly time-series of rainfall, soil moisture, temperature, and solar radiation.",
  },
  {
    slug: "surface-water",
    label: "Surface Water & River Hydrology",
    short: "River discharge flow, rainfall trends, and basin soil wetness.",
    objective:
      "Assess river discharge dynamics and determine how rainfall variability and basin soil moisture drive hydrological change.",
    variables: ["river_discharge", "precipitation", "soil_moisture"],
    categories: ["water", "weather", "optical", "sar"],
    methods: ["trend", "change", "historical", "anomaly", "cause", "risk", "prediction"],
    keywords: ["surface water", "SWOT", "altimetry", "discharge", "inundation"],
    interpretation:
      "Pairs Copernicus GloFAS river discharge with NASA POWER and ERA5 rainfall and soil moisture records.",
  },
  {
    slug: "flood-risk",
    label: "Flood Risk & Extreme Flow Screening",
    short: "High-flow river peaks, heavy monsoon rainfall, and soil saturation.",
    objective:
      "Screen flood exposure by evaluating high-flow river discharge peaks, extreme monthly rainfall, and antecedent soil saturation.",
    variables: ["river_discharge", "precipitation", "soil_moisture"],
    categories: ["water", "weather", "sar"],
    methods: ["trend", "anomaly", "change", "cause", "risk", "prediction", "historical"],
    keywords: ["flood", "inundation", "precipitation", "discharge", "Sentinel-1 SAR"],
    interpretation:
      "Evaluates 90th-percentile high-flow and heavy-rainfall exceedance rates alongside Sentinel-1 SAR scene availability.",
  },
  {
    slug: "drought-monitoring",
    label: "Drought & Moisture Deficit Monitoring",
    short: "Rainfall deficits, soil drying, heat stress, and relative humidity.",
    objective:
      "Characterise meteorological and agricultural drought using rainfall deficits, surface soil moisture, temperature, and relative humidity.",
    variables: ["precipitation", "soil_moisture", "temperature", "humidity"],
    categories: ["weather", "water", "optical"],
    methods: ["trend", "anomaly", "historical", "change", "cause", "risk", "prediction"],
    keywords: ["drought", "soil moisture", "SMAP", "evaporation", "precipitation"],
    interpretation:
      "Detects dry-tail (10th percentile) rainfall and soil-moisture deficits and tests warming-driven evaporative stress.",
  },
  {
    slug: "temperature-trends",
    label: "Temperature & Climate Warming Trends",
    short: "Long-term warming rate, seasonal shifts, and heat-stress frequency.",
    objective:
      "Quantify decadal warming rates, seasonal temperature shifts, and heat-extreme frequency verified across NASA POWER and ECMWF ERA5.",
    variables: ["temperature", "humidity", "solar_radiation"],
    categories: ["weather", "optical"],
    methods: ["trend", "change", "historical", "anomaly", "cause", "risk", "prediction"],
    keywords: ["temperature", "climate", "air temperature", "reanalysis"],
    interpretation:
      "Measures annual Sen's slope (°C/decade) and cross-validates NASA POWER against ECMWF ERA5.",
  },
  {
    slug: "precipitation-trends",
    label: "Rainfall & Water Availability Trends",
    short: "Monsoon & annual rainfall trends, dry/wet extremes, and river response.",
    objective:
      "Assess long-term rainfall trends, seasonal shifts, and their coupling with river discharge and soil moisture.",
    variables: ["precipitation", "river_discharge", "soil_moisture"],
    categories: ["weather", "water"],
    methods: ["trend", "historical", "anomaly", "change", "cause", "risk", "prediction"],
    keywords: ["precipitation", "GPM IMERG", "rainfall", "water availability", "discharge"],
    interpretation:
      "Tracks annual rainfall totals (mm/year) and tests lagged correlation between rainfall and river discharge.",
  },
  {
    slug: "glacier-change",
    label: "Snowfall & Cryosphere Environment",
    short: "Snowfall accumulation, freezing-season temperature, and precipitation.",
    objective:
      "Evaluate cryosphere climate signals — snowfall accumulation, air warming, and total precipitation — in mountain and polar regions.",
    variables: ["snowfall", "temperature", "precipitation"],
    categories: ["optical", "weather", "sar"],
    methods: ["trend", "historical", "change", "anomaly", "cause", "risk", "prediction"],
    keywords: ["glacier", "snow cover", "cryosphere", "snow water equivalent", "Sentinel-1"],
    interpretation:
      "Combines ERA5 snowfall accumulation with NASA POWER and ERA5 temperature and precipitation records.",
  },
  {
    slug: "urban-heat",
    label: "Urban Heat & Atmospheric Comfort",
    short: "Heat exposure, humidity, solar loading, and rainfall in cities.",
    objective:
      "Quantify urban heat exposure, relative humidity, and surface solar radiation trends relevant to population thermal comfort.",
    variables: ["temperature", "humidity", "solar_radiation", "precipitation"],
    categories: ["weather", "optical"],
    methods: ["trend", "historical", "anomaly", "change", "risk", "prediction"],
    keywords: ["urban heat", "land surface temperature", "population", "air temperature"],
    interpretation:
      "Evaluates high-temperature exceedance frequency alongside humidity and solar radiation loading.",
  },
  {
    slug: "solar-radiation",
    label: "Solar Energy & Surface Irradiance",
    short: "Downward shortwave solar radiation, cloudiness, and temperature.",
    objective:
      "Quantify long-term trends and seasonal cycles in surface solar irradiance alongside temperature and rainfall.",
    variables: ["solar_radiation", "temperature", "precipitation"],
    categories: ["weather", "optical"],
    methods: ["trend", "change", "historical", "anomaly", "cause", "risk", "prediction"],
    keywords: ["solar irradiance", "shortwave radiation", "CERES", "surface energy"],
    interpretation:
      "Cross-validates NASA POWER (CERES/GEWEX) surface solar irradiance against ECMWF ERA5 shortwave radiation.",
  },
  {
    slug: "coastal-storm-wind",
    label: "Wind Speed & Coastal Storm Exposure",
    short: "Near-surface wind trends, extreme rainfall, and coastal river surges.",
    objective:
      "Assess changes in near-surface wind speed, extreme rainfall, and river discharge to screen coastal storm and cyclone exposure.",
    variables: ["wind_speed", "precipitation", "river_discharge"],
    categories: ["weather", "water", "sar"],
    methods: ["trend", "change", "historical", "anomaly", "cause", "risk", "prediction"],
    keywords: ["wind speed", "cyclone", "storm", "precipitation", "Sentinel-1"],
    interpretation:
      "Screens high-wind and extreme-rainfall months alongside river discharge and Sentinel-1 SAR coverage.",
  },
];

export function getTopic(slug: string): TopicSpec | undefined {
  return TOPICS.find((t) => t.slug === slug);
}

export function missionsFor(categories: string[]): MissionSpec[] {
  return MISSIONS.filter((m) => categories.includes(m.category));
}
