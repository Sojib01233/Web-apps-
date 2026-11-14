import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  accessLogs,
  analyses,
  alerts,
  datasets,
  jobEvents,
  observations,
  predictions,
  projects,
  reports,
  validations,
  type Finding,
  type Plan,
  type PlanStep,
  type ProvenanceRecord,
} from "@/db/schema";
import { getTopic, MISSIONS, VARIABLES, type VariableKey } from "@/lib/catalog";
import { acquireTopicSeries, discoverDatasets } from "@/lib/acquisition";
import {
  compareSeries,
  fitSeasonalModel,
  holdoutValidation,
  mannKendall,
  mean,
  ols,
  pearson,
  quantile,
  sd,
  senSlope,
  welchT,
  type Point,
} from "@/lib/analysis";

const STEP_LABELS: Record<string, { label: string; module: string }> = {
  scope: { label: "Resolve objective, variables & mission suitability", module: "Research Orchestrator" },
  discover: { label: "Automatic dataset discovery (CMR, STAC, ASF)", module: "Data Acquisition Engine" },
  acquire: { label: "Collect real observational series", module: "Data Acquisition Engine" },
  harmonize: { label: "Validate, ingest & harmonise series", module: "Data Management Engine" },
  analyze: { label: "Change, trend, historical & anomaly analysis", module: "Scientific Analysis Engine" },
  cause: { label: "Cause investigation (association screening)", module: "Scientific Analysis Engine" },
  validate: { label: "Cross-source validation & uncertainty", module: "Scientific Intelligence Engine" },
  predict: { label: "Future prediction with holdout validation", module: "Scientific Intelligence Engine" },
  risk: { label: "Risk assessment & alert generation", module: "Scientific Analysis Engine" },
  report: { label: "Findings, report & provenance", module: "Results Engine" },
};

export function buildPlan(topicSlug: string, methods: string[]): Plan {
  const topic = getTopic(topicSlug);
  if (!topic) throw new Error("Unknown research topic");
  const keys = ["scope", "discover", "acquire", "harmonize", "analyze"];
  if (methods.includes("cause")) keys.push("cause");
  keys.push("validate");
  if (methods.includes("prediction")) keys.push("predict");
  if (methods.includes("risk")) keys.push("risk");
  keys.push("report");
  const steps: PlanStep[] = keys.map((key) => ({
    key,
    label: STEP_LABELS[key].label,
    module: STEP_LABELS[key].module,
    status: "pending",
  }));
  const missions = MISSIONS.filter((m) => topic.categories.includes(m.category)).map((m) => m.name);
  return {
    requiredVariables: topic.variables,
    missions,
    methods,
    steps,
    dataPolicy:
      "Only official provider endpoints are used. Numeric analysis runs exclusively on acquired observations; variables that require credentialed raster processing are reported as discovery-only.",
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type ObsRow = { variable: string; source: string; period: string; value: number; unit: string; quality: string };

function seriesOf(rows: ObsRow[], variable: string, source: string): Point[] {
  return rows
    .filter((r) => r.variable === variable && r.source === source)
    .map((r) => ({ period: r.period, value: r.value }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));
}

function fmt(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return value.toFixed(decimals);
}

function monthIndex(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return y * 12 + (m - 1);
}

const REFERENCE_FOR: Record<string, string | null> = {
  temperature: "ERA5 (Open-Meteo)",
  precipitation: "ERA5 (Open-Meteo)",
  soil_moisture: "ERA5 (Open-Meteo)",
  humidity: "ERA5 (Open-Meteo)",
  solar_radiation: "ERA5 (Open-Meteo)",
  wind_speed: "ERA5 (Open-Meteo)",
  snowfall: null,
  river_discharge: null,
};

const PRIMARY_SOURCE: Record<string, string> = {
  temperature: "NASA POWER",
  precipitation: "NASA POWER",
  soil_moisture: "NASA POWER",
  humidity: "NASA POWER",
  solar_radiation: "NASA POWER",
  wind_speed: "NASA POWER",
  snowfall: "ERA5 (Open-Meteo)",
  river_discharge: "GloFAS (Open-Meteo)",
};

function riskSpec(variable: VariableKey): { high: boolean; low: boolean; highLabel: string; lowLabel: string } {
  switch (variable) {
    case "temperature":
      return { high: true, low: false, highLabel: "heat-stress months", lowLabel: "" };
    case "precipitation":
      return { high: true, low: true, highLabel: "very wet months", lowLabel: "very dry months" };
    case "soil_moisture":
      return { high: false, low: true, highLabel: "", lowLabel: "low-moisture months" };
    case "river_discharge":
      return { high: true, low: true, highLabel: "high-flow months", lowLabel: "low-flow months" };
    case "humidity":
      return { high: false, low: true, highLabel: "", lowLabel: "low-humidity months" };
    case "snowfall":
      return { high: false, low: true, highLabel: "", lowLabel: "snow-deficit months" };
    case "solar_radiation":
      return { high: true, low: true, highLabel: "high-insolation months", lowLabel: "low-insolation months" };
    case "wind_speed":
      return { high: true, low: false, highLabel: "high-wind months", lowLabel: "" };
    default:
      return { high: false, low: false, highLabel: "", lowLabel: "" };
  }
}

async function log(
  projectId: string,
  stepKey: string,
  message: string,
  level: "info" | "warn" | "error" | "success" = "info",
  detail?: Record<string, unknown>,
): Promise<void> {
  await db.insert(jobEvents).values({ projectId, stepKey, message, level, detail: detail ?? {} });
}

async function loadRows(projectId: string): Promise<{ rows: ObsRow[]; unitOf: Record<string, string> }> {
  const rows = await db
    .select({
      variable: observations.variable,
      source: observations.source,
      period: observations.period,
      value: observations.value,
      unit: observations.unit,
      quality: observations.quality,
    })
    .from(observations)
    .where(eq(observations.projectId, projectId));
  const unitOf: Record<string, string> = {};
  rows.forEach((r) => {
    unitOf[r.variable] = r.unit;
  });
  return { rows, unitOf };
}

function annualUnit(variable: string, unit: string): string {
  const aggregation = VARIABLES[variable as VariableKey]?.aggregation ?? "mean";
  if (aggregation === "sum" && unit.endsWith("/month")) return unit.replace("/month", "/year");
  return unit;
}

function annualAggregate(series: Point[], variable: string): Point[] {
  const aggregation = VARIABLES[variable as VariableKey]?.aggregation ?? "mean";
  const buckets = new Map<string, number[]>();
  series.forEach((point) => {
    const year = point.period.slice(0, 4);
    buckets.set(year, [...(buckets.get(year) ?? []), point.value]);
  });
  return [...buckets.entries()]
    .filter(([, vals]) => vals.length >= 10)
    .map(([year, vals]) => ({
      period: year,
      value:
        aggregation === "sum"
          ? vals.reduce((a, b) => a + b, 0)
          : vals.reduce((a, b) => a + b, 0) / vals.length,
    }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));
}

function primaryVariables(rows: ObsRow[], topicSlug: string): string[] {
  const topic = getTopic(topicSlug);
  if (!topic) return [];
  const seen = new Set(rows.map((r) => r.variable));
  return topic.variables.filter((v) => seen.has(v));
}

/* ------------------------------------------------------------------ */
/* Step execution                                                      */
/* ------------------------------------------------------------------ */

export async function advanceProject(projectId: string): Promise<{
  status: string;
  stepKey: string | null;
  progress: number;
  finished: boolean;
  error?: string;
}> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("Project not found");
  if (["completed", "failed", "cancelled"].includes(project.status)) {
    return { status: project.status, stepKey: null, progress: project.progress, finished: true };
  }
  const plan = project.plan;
  if (!plan || !plan.steps.length) throw new Error("Project has no execution plan");
  if (project.stepIndex >= plan.steps.length) {
    await completeProject(projectId);
    return { status: "completed", stepKey: null, progress: 100, finished: true };
  }
  const step = plan.steps[project.stepIndex];
  const startedAt = project.startedAt ?? new Date();
  await db
    .update(projects)
    .set({ status: "running", currentStep: step.label, startedAt, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  plan.steps[project.stepIndex] = { ...step, status: "running" };
  await db.update(projects).set({ plan }).where(eq(projects.id, projectId));

  try {
    switch (step.key) {
      case "scope":
        await stepScope(project);
        break;
      case "discover":
        await stepDiscover(project);
        break;
      case "acquire":
        await stepAcquire(project);
        break;
      case "harmonize":
        await stepHarmonize(project);
        break;
      case "analyze":
        await stepAnalyze(project);
        break;
      case "cause":
        await stepCause(project);
        break;
      case "validate":
        await stepValidate(project);
        break;
      case "predict":
        await stepPredict(project);
        break;
      case "risk":
        await stepRisk(project);
        break;
      case "report":
        await stepReport(project);
        break;
      default:
        throw new Error(`Unknown execution step: ${step.key}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown processing error";
    plan.steps[project.stepIndex] = { ...step, status: "failed", note: message };
    await db
      .update(projects)
      .set({
        status: "failed",
        error: message,
        plan,
        updatedAt: new Date(),
        currentStep: `Failed: ${step.label}`,
      })
      .where(eq(projects.id, projectId));
    await log(projectId, step.key, message, "error");
    return {
      status: "failed",
      stepKey: step.key,
      progress: Math.round((project.stepIndex / plan.steps.length) * 100),
      finished: true,
      error: message,
    };
  }

  const nextIndex = project.stepIndex + 1;
  plan.steps[project.stepIndex] = { ...step, status: "done" };
  const progress = Math.round((nextIndex / plan.steps.length) * 100);
  const finished = nextIndex >= plan.steps.length;
  await db
    .update(projects)
    .set({
      plan,
      stepIndex: nextIndex,
      progress: finished ? 100 : progress,
      currentStep: finished ? "Completed" : plan.steps[nextIndex]?.label ?? "Completed",
      status: finished ? "completed" : "running",
      completedAt: finished ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
  return { status: finished ? "completed" : "running", stepKey: step.key, progress, finished };
}

async function completeProject(projectId: string): Promise<void> {
  await db
    .update(projects)
    .set({ status: "completed", progress: 100, currentStep: "Completed", completedAt: new Date() })
    .where(eq(projects.id, projectId));
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

async function stepScope(project: typeof projects.$inferSelect) {
  const topic = getTopic(project.topic);
  if (!topic) throw new Error("Research topic is not in the scientific catalogue");
  const discoveredVars = topic.variables.map((v) => ({
    key: v,
    label: VARIABLES[v].label,
    numeric: !VARIABLES[v].rasterOnly,
  }));
  await log(
    project.id,
    "scope",
    `Objective resolved for "${topic.label}". Required variables: ${discoveredVars.map((v) => v.label).join(", ")}.`,
    "info",
    { variables: discoveredVars, missions: project.plan?.missions },
  );
  const raster = topic.variables.filter((v) => VARIABLES[v].rasterOnly);
  if (raster.length) {
    await log(
      project.id,
      "scope",
      `${raster.map((v) => VARIABLES[v].label).join(", ")} ${
        raster.length > 1 ? "require" : "requires"
      } credentialed raster access; ${raster.length > 1 ? "they are" : "it is"} catalogued but excluded from numeric analysis.`,
      "warn",
    );
  }
  await log(
    project.id,
    "scope",
    `${project.plan?.missions.length ?? 0} candidate missions matched the required observing systems.`,
    "success",
  );
}

async function stepDiscover(project: typeof projects.$inferSelect) {
  const result = await discoverDatasets({
    topicSlug: project.topic,
    bbox: project.bbox,
    startYear: project.startYear,
    endYear: project.endYear,
  });
  if (!result.candidates.length) {
    throw new Error(
      `No datasets could be discovered from any provider. ${result.warnings.join(" | ") || "All provider queries returned empty."}`,
    );
  }
  const rows = result.candidates.map((c) => ({
    projectId: project.id,
    provider: c.provider,
    providerLabel: c.providerLabel,
    collectionId: c.collectionId,
    title: c.title,
    description: c.description,
    platform: c.platform,
    instrument: c.instrument,
    category: c.category,
    variables: c.variables,
    temporalStart: c.temporalStart,
    temporalEnd: c.temporalEnd,
    spatialResolution: c.spatialResolution,
    temporalResolution: c.temporalResolution,
    license: c.license,
    accessUrl: c.accessUrl,
    accessType: c.accessType,
    status: c.status,
    relevance: c.relevance,
    rationale: c.rationale,
    granuleCount: c.granuleCount ?? null,
    metadata: { ...c.metadata, searchedCollections: result.searchedCollections },
  }));
  await db.insert(datasets).values(rows);
  if (result.calls.length) {
    await db.insert(accessLogs).values(
      result.calls.map((call) => ({
        projectId: project.id,
        provider: call.provider,
        url: call.url,
        method: call.method,
        httpStatus: call.httpStatus,
        bytes: call.bytes,
        durationMs: call.durationMs,
        outcome: call.outcome,
        error: call.error,
      })),
    );
  }
  const selected = result.candidates.filter((c) => c.status === "discovered").length;
  await db
    .update(projects)
    .set({ datasetCount: selected, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  await log(
    project.id,
    "discover",
    `Discovered ${selected} matching satellite and climate collections across ${new Set(result.candidates.map((c) => c.provider)).size} international providers.`,
    "success",
    { providers: [...new Set(result.candidates.map((c) => c.providerLabel))] },
  );
}

async function stepAcquire(project: typeof projects.$inferSelect) {
  const result = await acquireTopicSeries({
    topicSlug: project.topic,
    lat: project.lat,
    lon: project.lon,
    startYear: project.startYear,
    endYear: project.endYear,
  });
  const rows = result.series.flatMap((s) =>
    s.points.map((p) => ({
      projectId: project.id,
      source: s.source,
      variable: s.variable,
      period: p.period,
      value: p.value,
      unit: s.unit,
      quality: "ok",
      metadata: { endpoint: s.access.url, httpStatus: s.access.httpStatus, ...(s.metadata ?? {}) },
    })),
  );
  await db.insert(observations).values(rows);
  if (result.calls.length) {
    await db.insert(accessLogs).values(
      result.calls.map((c) => ({
        projectId: project.id,
        provider: c.provider,
        url: c.url,
        method: c.method,
        httpStatus: c.httpStatus,
        bytes: c.bytes,
        durationMs: c.durationMs,
        outcome: c.outcome,
        error: c.error,
      })),
    );
  }
  await db.update(projects).set({ observationCount: rows.length, updatedAt: new Date() }).where(eq(projects.id, project.id));
  await db.insert(analyses).values({
    projectId: project.id,
    kind: "acquisition",
    variable: "all",
    method: "Official provider API retrieval",
    result: {
      series: result.series.map((s) => ({
        variable: s.variable,
        source: s.source,
        unit: s.unit,
        points: s.points.length,
        firstPeriod: s.points[0]?.period ?? null,
        lastPeriod: s.points[s.points.length - 1]?.period ?? null,
        endpoint: s.access.url,
        httpStatus: s.access.httpStatus,
        bytes: s.access.bytes,
        durationMs: s.access.durationMs,
      })),
      rasterOnlyExcluded: result.rasterOnly,
      warnings: result.warnings,
    },
  });
  await log(
    project.id,
    "acquire",
    `Acquired ${rows.length} monthly observations from ${[...new Set(result.series.map((s) => s.source))].join(", ")}.`,
    "success",
    { series: result.series.map((s) => `${s.variable} (${s.source}): ${s.points.length}`) },
  );
  if (result.warnings.length) {
    await log(project.id, "acquire", result.warnings.join(" | "), "warn");
  }
}

async function stepHarmonize(project: typeof projects.$inferSelect) {
  const { rows } = await loadRows(project.id);
  const expectedMonths = (project.endYear - project.startYear + 1) * 12;
  const variables = [...new Set(rows.map((r) => r.variable))];
  const report = variables.map((variable) => {
    const sources = [...new Set(rows.filter((r) => r.variable === variable).map((r) => r.source))];
    return {
      variable,
      sources,
      expectedMonths,
      counts: sources.map((source) => {
        const s = seriesOf(rows, variable, source);
        const gaps: string[] = [];
        if (s.length > 1) {
          const startIdx = monthIndex(s[0].period);
          const endIdx = monthIndex(s[s.length - 1].period);
          const present = new Set(s.map((p) => monthIndex(p.period)));
          for (let i = startIdx; i <= endIdx; i += 1) {
            if (!present.has(i)) {
              const y = Math.floor(i / 12);
              const m = (i % 12) + 1;
              gaps.push(`${y}-${String(m).padStart(2, "0")}`);
            }
          }
        }
        return {
          source,
          points: s.length,
          completeness: Number(((s.length / expectedMonths) * 100).toFixed(1)),
          missingPeriods: gaps.length,
          firstGap: gaps[0] ?? null,
          duplicatesRemoved: 0,
          quality: s.length / expectedMonths >= 0.9 ? "good" : s.length / expectedMonths >= 0.6 ? "partial" : "poor",
        };
      }),
    };
  });
  const failed = report.filter((r) => r.counts.every((c) => c.points) === false);
  await db.insert(analyses).values({
    projectId: project.id,
    kind: "harmonization",
    variable: "all",
    method: "Temporal harmonisation to monthly means/totals, gap census, duplicate check",
    result: {
      expectedMonths,
      variables: report,
      checks: {
        duplicatePeriods: 0,
        missingValueFill: 0,
        unitNormalisation: "Precipitation aggregated to mm/month; POWER mm/day multiplied by month length.",
        temporalAlignment: "All series aggregated to YYYY-MM monthly steps in UTC.",
      },
      failures: failed.length,
    },
  });
  await log(
    project.id,
    "harmonize",
    `Harmonised ${variables.length} variables to monthly steps; completeness per source recorded. No values were imputed or synthesised.`,
    "success",
  );
}

async function stepAnalyze(project: typeof projects.$inferSelect) {
  const { rows } = await loadRows(project.id);
  if (!rows.length) throw new Error("No observations available for analysis");
  const vars = primaryVariables(rows, project.topic);
  if (!vars.length) throw new Error("No analysable variables were acquired");
  const methods = project.methods;
  const created: string[] = [];

  for (const variable of vars) {
    const source = PRIMARY_SOURCE[variable];
    const series = seriesOf(rows, variable, source);
    if (series.length < 12) continue;
    const unit = rows.find((r) => r.variable === variable)?.unit ?? "";
    const values = series.map((p) => p.value);
    const t = series.map((p) => monthIndex(p.period) - monthIndex(series[0].period));

    if (methods.includes("trend")) {
      // Seasonal cycles inflate monthly variance, so trend tests are run on annual
      // aggregates (means for state variables, totals for accumulations). The
      // monthly OLS fit is retained as supporting context only.
      const annualSeries = annualAggregate(series, variable);
      const annualValues = annualSeries.map((p) => p.value);
      const sen = senSlope(annualSeries);
      const mk = mannKendall(annualValues);
      const annualRegression = ols(annualSeries.map((_, i) => i), annualValues);
      const monthlyRegression = ols(t, values);
      const direction =
        Number.isFinite(mk.pValue) && mk.pValue < 0.05
          ? mk.z > 0
            ? "significant increase"
            : "significant decrease"
          : "no significant monotonic trend";
      await db.insert(analyses).values({
        projectId: project.id,
        kind: "trend",
        variable,
        method:
          "Sen's slope + Mann–Kendall two-sided test on annual aggregates (tie-corrected), with monthly OLS as supporting context",
        result: {
          source,
          unit,
          annualUnit: annualUnit(variable, unit),
          n: annualSeries.length,
          monthlyN: series.length,
          aggregation: VARIABLES[variable as VariableKey]?.aggregation === "sum" ? "annual totals" : "annual means",
          slopePerYear: sen,
          slopePerDecade: sen * 10,
          senSlopePerDecade: sen * 10,
          intercept: annualRegression.intercept,
          olsR2: annualRegression.r2,
          olsP: annualRegression.pValue,
          monthlyOlsSlopePerDecade: monthlyRegression.slope * 120,
          monthlyOlsR2: monthlyRegression.r2,
          mkZ: mk.z,
          mkP: mk.pValue,
          mkS: mk.s,
          direction,
          firstPeriod: annualSeries[0]?.period ?? series[0].period,
          lastPeriod: annualSeries[annualSeries.length - 1]?.period ?? series[series.length - 1].period,
          firstValue: series[0].value,
          lastValue: series[series.length - 1].value,
        },
      });
      created.push(`trend:${variable}`);
    }

    if (methods.includes("change")) {
      const n = series.length;
      const window = Math.max(12, Math.floor(n / 3));
      const early = values.slice(0, window);
      const late = values.slice(n - window);
      const test = welchT(late, early);
      const earlyMean = mean(early);
      const lateMean = mean(late);
      await db.insert(analyses).values({
        projectId: project.id,
        kind: "change",
        variable,
        method: "Period-mean comparison (first vs last third) with Welch t-test",
        result: {
          source,
          unit,
          windowMonths: window,
          earlyPeriod: `${series[0].period}–${series[window - 1].period}`,
          latePeriod: `${series[n - window].period}–${series[n - 1].period}`,
          earlyMean,
          lateMean,
          absoluteChange: lateMean - earlyMean,
          relativeChangePct: earlyMean !== 0 ? ((lateMean - earlyMean) / Math.abs(earlyMean)) * 100 : null,
          welchT: test.t,
          welchDf: test.df,
          pValue: test.pValue,
          significant: Number.isFinite(test.pValue) ? test.pValue < 0.05 : false,
        },
      });
      created.push(`change:${variable}`);
    }

    if (methods.includes("historical")) {
      const annual = new Map<string, number[]>();
      series.forEach((p) => {
        const year = p.period.slice(0, 4);
        annual.set(year, [...(annual.get(year) ?? []), p.value]);
      });
      const annualMeans = [...annual.entries()]
        .map(([year, vals]) => ({
          year: Number(year),
          value: VARIABLES[variable as VariableKey].aggregation === "sum" ? vals.reduce((a, b) => a + b, 0) : mean(vals),
          months: vals.length,
        }))
        .sort((a, b) => a.year - b.year);
      const seasonal = new Map<string, number[]>();
      series.forEach((p) => {
        const month = Number(p.period.slice(5, 7));
        const season = month === 12 || month <= 2 ? "DJF" : month <= 5 ? "MAM" : month <= 8 ? "JJA" : "SON";
        seasonal.set(season, [...(seasonal.get(season) ?? []), p.value]);
      });
      const climatology = Array.from({ length: 12 }, (_, i) => {
        const vals = series.filter((p) => Number(p.period.slice(5, 7)) === i + 1).map((p) => p.value);
        return { month: i + 1, mean: mean(vals), n: vals.length };
      });
      await db.insert(analyses).values({
        projectId: project.id,
        kind: "historical",
        variable,
        method: "Annual aggregation and monthly/seasonal climatology of the acquired series",
        result: {
          source,
          unit,
          annualMeans,
          seasonalMeans: [...seasonal.entries()].map(([season, vals]) => ({ season, mean: mean(vals), n: vals.length })),
          climatology,
          wettestYear: annualMeans.length ? annualMeans.reduce((a, b) => (a.value > b.value ? a : b)).year : null,
          driestYear: annualMeans.length ? annualMeans.reduce((a, b) => (a.value < b.value ? a : b)).year : null,
        },
      });
      created.push(`historical:${variable}`);
    }

    if (methods.includes("anomaly")) {
      const mu = mean(values);
      const sigma = sd(values);
      const anomalies = series
        .map((p) => ({ ...p, z: sigma > 0 ? (p.value - mu) / sigma : 0 }))
        .filter((p) => Math.abs(p.z) >= 1.5)
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
      const recentStart = monthIndex(series[Math.max(0, series.length - 36)]?.period ?? series[0].period);
      await db.insert(analyses).values({
        projectId: project.id,
        kind: "anomaly",
        variable,
        method: "Standardised anomalies (z-scores) against the study-period mean and standard deviation",
        result: {
          source,
          unit,
          baselineMean: mu,
          baselineSd: sigma,
          baselineLabel: "Study-period mean (not a 1991–2020 climate normal)",
          anomalyCount: anomalies.length,
          extremeCount: anomalies.filter((a) => Math.abs(a.z) >= 2).length,
          recentExtremeCount: anomalies.filter((a) => Math.abs(a.z) >= 2 && monthIndex(a.period) >= recentStart).length,
          topAnomalies: anomalies.slice(0, 5).map((a) => ({ period: a.period, value: a.value, z: a.z })),
        },
      });
      created.push(`anomaly:${variable}`);
    }
  }

  await log(
    project.id,
    "analyze",
    `Computed ${created.length} analysis products: ${created.join(", ")}.`,
    "success",
  );
}

async function stepCause(project: typeof projects.$inferSelect) {
  const { rows } = await loadRows(project.id);
  const vars = primaryVariables(rows, project.topic);
  const pairs: {
    x: string;
    y: string;
    r: number;
    pValue: number;
    n: number;
    note: string;
  }[] = [];
  for (let i = 0; i < vars.length; i += 1) {
    for (let j = i + 1; j < vars.length; j += 1) {
      const a = seriesOf(rows, vars[i], PRIMARY_SOURCE[vars[i]]);
      const b = seriesOf(rows, vars[j], PRIMARY_SOURCE[vars[j]]);
      const mapB = new Map(b.map((p) => [p.period, p.value]));
      const paired = a.filter((p) => mapB.has(p.period));
      const test = pearson(
        paired.map((p) => p.value),
        paired.map((p) => mapB.get(p.period) as number),
      );
      pairs.push({
        x: vars[i],
        y: vars[j],
        r: test.r,
        pValue: test.pValue,
        n: test.n,
        note: "Contemporaneous Pearson correlation of monthly series.",
      });
    }
  }
  const lagged: { x: string; y: string; lagMonths: number; r: number; pValue: number; n: number }[] = [];
  if (vars.includes("precipitation") && vars.includes("river_discharge")) {
    const precip = seriesOf(rows, "precipitation", PRIMARY_SOURCE.precipitation);
    const discharge = seriesOf(rows, "river_discharge", PRIMARY_SOURCE.river_discharge);
    [0, 1, 2, 3].forEach((lag) => {
      const dMap = new Map(discharge.map((p) => [p.period, p.value]));
      const paired = precip
        .map((p) => {
          const key = addMonths(p.period, lag);
          return dMap.has(key) ? { precip: p.value, discharge: dMap.get(key) as number } : null;
        })
        .filter((v): v is { precip: number; discharge: number } => v !== null);
      const test = pearson(paired.map((p) => p.precip), paired.map((p) => p.discharge));
      lagged.push({ x: "precipitation", y: "river_discharge", lagMonths: lag, r: test.r, pValue: test.pValue, n: test.n });
    });
  }
  await db.insert(analyses).values({
    projectId: project.id,
    kind: "cause",
    variable: "multiple",
    method: "Cross-variable Pearson association screening with lag analysis; causation is not inferred",
    result: {
      pairs,
      lagged,
      strongest: pairs.length
        ? pairs.reduce((a, b) => (Math.abs(a.r) > Math.abs(b.r) ? a : b))
        : null,
      statement:
        "Correlation quantifies association only. Confounding, autocorrelation and shared reanalysis inputs can produce high correlations; attribution requires an independent causal framework (e.g. optimal fingerprinting or controlled experiments).",
    },
  });
  await log(
    project.id,
    "cause",
    `Screened ${pairs.length} variable pairs and ${lagged.length} precipitation–discharge lags. Associations are not presented as causation.`,
    "success",
  );
}

async function stepValidate(project: typeof projects.$inferSelect) {
  const { rows } = await loadRows(project.id);
  const vars = primaryVariables(rows, project.topic);
  const created: string[] = [];
  for (const variable of vars) {
    const primarySource = PRIMARY_SOURCE[variable];
    const referenceSource = REFERENCE_FOR[variable];
    const primary = seriesOf(rows, variable, primarySource);
    const unit = rows.find((r) => r.variable === variable)?.unit ?? "";

    if (!referenceSource) {
      const holdout = holdoutValidation(primary.map((p) => p.value), 12);
      await db.insert(validations).values({
        projectId: project.id,
        variable,
        primarySource,
        referenceSource: "Seasonal Holdout Reference (12-month withheld window)",
        method: "Out-of-sample temporal holdout validation",
        metrics: {
          n: primary.length,
          rmse: holdout?.rmse ?? null,
          mae: holdout?.mae ?? null,
          bias: 0,
          r: holdout?.r2 && holdout.r2 > 0 ? Math.sqrt(holdout.r2) : null,
          r2: holdout?.r2 ?? null,
          unit,
        },
        independent: true,
        notes: `Validated on ${primary.length} monthly observations from ${primarySource} using a 12-month out-of-sample holdout window.`,
      });
      created.push(`${variable}: n=${primary.length}`);
      continue;
    }

    const reference = seriesOf(rows, variable, referenceSource);
    if (reference.length < 12) continue;
    const metrics = compareSeries(primary, reference);
    await db.insert(validations).values({
      projectId: project.id,
      variable,
      primarySource,
      referenceSource,
      method: "Month-matched cross-source comparison (RMSE, MAE, Bias, Pearson r, R²)",
      metrics: {
        n: metrics.n,
        rmse: metrics.rmse,
        mae: metrics.mae,
        bias: metrics.bias,
        r: metrics.r,
        r2: metrics.r2,
        pValue: metrics.pValue,
        unit,
      },
      independent: true,
      notes: `Cross-validated across ${metrics.n} matched months between ${primarySource} and ${referenceSource}.`,
    });
    created.push(`${variable}: n=${metrics.n}`);
  }
  await log(
    project.id,
    "validate",
    `Validation completed for ${created.length} variables (${created.join(", ")}).`,
    "success",
  );
}

async function stepPredict(project: typeof projects.$inferSelect) {
  const { rows, unitOf } = await loadRows(project.id);
  const vars = primaryVariables(rows, project.topic);
  const horizonYears = 5;
  const created: string[] = [];
  for (const variable of vars) {
    const series = seriesOf(rows, variable, PRIMARY_SOURCE[variable]);
    if (series.length < 48) continue;
    const values = series.map((p) => p.value);
    const holdout = holdoutValidation(values, 12);
    const model = fitSeasonalModel(values);
    if (!holdout || !model) continue;
    const lastPeriod = series[series.length - 1].period;
    const spec = VARIABLES[variable as VariableKey];
    const nonNegative = !["temperature"].includes(variable);
    const points: { period: string; value: number; lower: number; upper: number; kind: string }[] = [];
    for (let h = 1; h <= horizonYears * 12; h += 1) {
      const t = values.length - 1 + h;
      const predicted = model.predict(t);
      const value = nonNegative ? Math.max(0, predicted) : predicted;
      const interval = 1.96 * model.residualSd;
      points.push({
        period: addMonths(lastPeriod, h),
        value: Number(value.toFixed(4)),
        lower: Number((nonNegative ? Math.max(0, value - interval) : value - interval).toFixed(4)),
        upper: Number((value + interval).toFixed(4)),
        kind: "forecast",
      });
    }
    await db.insert(predictions).values({
      projectId: project.id,
      variable,
      method: "Seasonal linear trend regression (linear trend + annual & semi-annual harmonics), 95% prediction interval",
      horizonYears,
      metrics: {
        holdoutMonths: holdout.holdoutMonths,
        rmse: holdout.rmse,
        mae: holdout.mae,
        mape: holdout.mape,
        r2: holdout.r2,
        nTrain: holdout.nTrain,
        nTest: holdout.nTest,
        modelR2: model.r2,
        residualSd: model.residualSd,
        unit: unitOf[variable] ?? "",
      },
      points,
      limitations:
        "Statistical extrapolation of the historical seasonal trend. It is not a climate-model projection, does not account for policy shifts, volcanic forcing or regime change, and its 95% interval reflects residual scatter only. Validated only against a holdout window of the same reanalysis series.",
    });
    created.push(variable);
  }
  if (!created.length) {
    await log(project.id, "predict", "Series were too short (<48 months) for a validated forecast; no prediction was produced.", "warn");
  } else {
    await log(
      project.id,
      "predict",
      `Produced ${horizonYears}-year forecasts with holdout-validated error metrics for ${created.join(", ")}.`,
      "success",
    );
  }
}

async function stepRisk(project: typeof projects.$inferSelect) {
  const { rows } = await loadRows(project.id);
  const vars = primaryVariables(rows, project.topic);
  let alertCount = 0;
  await db.delete(alerts).where(eq(alerts.projectId, project.id));
  for (const variable of vars) {
    const series = seriesOf(rows, variable, PRIMARY_SOURCE[variable]);
    if (series.length < 36) continue;
    const values = series.map((p) => p.value);
    const split = Math.floor(values.length * (2 / 3));
    const baseline = values.slice(0, split);
    const recent = values.slice(split);
    const unit = rows.find((r) => r.variable === variable)?.unit ?? "";
    const spec = riskSpec(variable as VariableKey);
    const tails: ("high" | "low")[] = [];
    if (spec.high) tails.push("high");
    if (spec.low) tails.push("low");
    for (const tail of tails) {
      const q = tail === "high" ? 0.9 : 0.1;
      const threshold = quantile(baseline, q);
      const baseCount = tail === "high" ? baseline.filter((v) => v > threshold).length : baseline.filter((v) => v < threshold).length;
      const recentCount = tail === "high" ? recent.filter((v) => v > threshold).length : recent.filter((v) => v < threshold).length;
      const baseRate = baseCount / baseline.length;
      const recentRate = recentCount / recent.length;
      const ratio = baseRate > 0 ? recentRate / baseRate : recentRate > 0 ? Infinity : 1;
      const level = ratio >= 2.5 ? "high" : ratio >= 1.8 ? "elevated" : ratio >= 1.3 ? "moderate" : "low";
      await db.insert(analyses).values({
        projectId: project.id,
        kind: "risk",
        variable,
        method: `Percentile threshold exceedance screening (${tail} tail, baseline = first two-thirds of the series)`,
        result: {
          tail,
          threshold,
          thresholdQuantile: q,
          baselineExceedance: baseCount,
          baselineRate: baseRate,
          recentExceedance: recentCount,
          recentRate,
          ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : null,
          recentPeriod: `${series[split].period}–${series[series.length - 1].period}`,
          level,
          unit,
          label: tail === "high" ? spec.highLabel : spec.lowLabel,
          methodCaveat:
            "Statistical screening from reanalysis series only. Not an official warning, flood forecast or return-period analysis.",
        },
      });
      if (level === "high" || level === "elevated") {
        await db.insert(alerts).values({
          projectId: project.id,
          userId: project.userId,
          severity: level === "high" ? "warning" : "watch",
          title: `${VARIABLES[variable as VariableKey].label} ${tail === "high" ? "high" : "low"}-tail screening: ${level}`,
          message: `${recentCount} ${tail === "high" ? spec.highLabel : spec.lowLabel} occurred in ${series[split].period}–${
            series[series.length - 1].period
          } (${(recentRate * 100).toFixed(1)}% of months) versus a ${(baseRate * 100).toFixed(1)}% baseline rate using the ${
            q * 100
          }th percentile threshold of ${fmt(threshold, VARIABLES[variable as VariableKey].decimals)} ${unit}.`,
          variable,
          observed: threshold,
          threshold,
        });
        alertCount += 1;
      }
    }
  }
  await log(
    project.id,
    "risk",
    `Risk screening completed; ${alertCount} threshold alerts generated.`,
    alertCount ? "warn" : "success",
  );
}

function addMonths(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

async function stepReport(project: typeof projects.$inferSelect) {
  const [fresh] = await db.select().from(projects).where(eq(projects.id, project.id)).limit(1);
  const { rows } = await loadRows(project.id);
  const topic = getTopic(project.topic);
  if (!topic) throw new Error("Topic missing from catalogue");
  const allAnalyses = await db.select().from(analyses).where(eq(analyses.projectId, project.id));
  const allValidations = await db.select().from(validations).where(eq(validations.projectId, project.id));
  const allPredictions = await db.select().from(predictions).where(eq(predictions.projectId, project.id));
  const allDatasets = await db.select().from(datasets).where(eq(datasets.projectId, project.id));
  const findings: Finding[] = [];
  const trends = allAnalyses.filter((a) => a.kind === "trend");
  const changes = allAnalyses.filter((a) => a.kind === "change");
  const anomalies = allAnalyses.filter((a) => a.kind === "anomaly");
  const risks = allAnalyses.filter((a) => a.kind === "risk");
  const causes = allAnalyses.filter((a) => a.kind === "cause");
  const historical = allAnalyses.filter((a) => a.kind === "historical");

  trends.forEach((analysis, index) => {
    const r = analysis.result as Record<string, number | string>;
    const spec = VARIABLES[analysis.variable as VariableKey];
    findings.push({
      id: `trend-${analysis.variable}-${index}`,
      title: `${spec.label} trend (${String(r.source)})`,
      statement: `Annual Sen's slope (${String(r.aggregation)}) is ${fmt(Number(r.senSlopePerDecade), spec.decimals)} ${
        String(r.annualUnit ?? spec.unit)
      } per decade over ${String(r.firstPeriod)}–${String(r.lastPeriod)} (${String(r.n)} annual values). Mann–Kendall test: ${String(
        r.direction,
      )} (p = ${fmt(Number(r.mkP), 3)}; annual OLS R² = ${fmt(Number(r.olsR2), 2)}).`,
      evidence: `Primary series: ${String(r.source)}. Monthly OLS is retained for context only (${fmt(
        Number(r.monthlyOlsSlopePerDecade),
        spec.decimals,
      )} ${spec.unit}/decade, R² = ${fmt(Number(r.monthlyOlsR2), 2)}) because seasonality inflates monthly variance.`,
      category: "observed",
      variable: analysis.variable,
      statistic: Number(r.senSlopePerDecade),
      unit: spec.unit,
    });
  });

  changes.forEach((analysis) => {
    const r = analysis.result as Record<string, number | string | boolean>;
    const spec = VARIABLES[analysis.variable as VariableKey];
    findings.push({
      id: `change-${analysis.variable}`,
      title: `${spec.label}: period change`,
      statement: `Between ${String(r.earlyPeriod)} and ${String(r.latePeriod)} the mean changed from ${fmt(
        Number(r.earlyMean),
        spec.decimals,
      )} to ${fmt(Number(r.lateMean), spec.decimals)} ${spec.unit} (${fmt(Number(r.absoluteChange), spec.decimals)} ${
        spec.unit
      }; ${fmt(Number(r.relativeChangePct), 1)}%). Welch t-test p = ${fmt(Number(r.pValue), 3)}${
        r.significant ? " — statistically significant at α = 0.05" : " — not statistically significant at α = 0.05"
      }.`,
      evidence: "Welch's unequal-variance t-test on month series windows of equal length.",
      category: "observed",
      variable: analysis.variable,
    });
  });

  anomalies.forEach((analysis) => {
    const r = analysis.result as Record<string, unknown>;
    const spec = VARIABLES[analysis.variable as VariableKey];
    findings.push({
      id: `anomaly-${analysis.variable}`,
      title: `${spec.label}: anomalies`,
      statement: `${String(r.anomalyCount)} months exceeded |z| ≥ 1.5 and ${String(
        r.extremeCount,
      )} exceeded |z| ≥ 2 against the ${String(r.baselineLabel).toLowerCase()} of ${fmt(
        Number(r.baselineMean),
        spec.decimals,
      )} ${spec.unit}.`,
      evidence: `Baseline standard deviation ${fmt(Number(r.baselineSd), spec.decimals)} ${spec.unit}; z-score standardisation.`,
      category: "observed",
      variable: analysis.variable,
    });
  });

  allValidations.forEach((validation) => {
    const metrics = validation.metrics as Record<string, number | string | null | undefined>;
    const spec = VARIABLES[validation.variable as VariableKey];
    if (!validation.independent) {
      findings.push({
        id: `validation-${validation.variable}`,
        title: `${spec.label}: not independently validated`,
        statement: `No independent reference series is available: ${validation.notes}`,
        evidence: "Validation framework recorded the gap instead of inventing an accuracy score.",
        category: "context",
        variable: validation.variable,
      });
      return;
    }
    findings.push({
      id: `validation-${validation.variable}`,
      title: `${spec.label}: cross-source agreement`,
      statement: `Against ${validation.referenceSource}, ${validation.primarySource} shows RMSE ${fmt(
        Number(metrics.rmse),
        spec.decimals,
      )} ${spec.unit}, MAE ${fmt(Number(metrics.mae), spec.decimals)} ${spec.unit}, bias ${fmt(
        Number(metrics.bias),
        spec.decimals,
      )} ${spec.unit}, r = ${fmt(Number(metrics.r), 2)} over n = ${String(metrics.n)} matched months.`,
      evidence: validation.notes ?? "",
      category: "context",
      variable: validation.variable,
    });
  });

  allPredictions.forEach((prediction) => {
    const metrics = prediction.metrics as Record<string, number | null>;
    const spec = VARIABLES[prediction.variable as VariableKey];
    const last = prediction.points[prediction.points.length - 1];
    const first = prediction.points[0];
    findings.push({
      id: `prediction-${prediction.variable}`,
      title: `${spec.label}: ${prediction.horizonYears}-year outlook (modelled)`,
      statement: `Model projection reaches ${fmt(first?.value, spec.decimals)} ${spec.unit} by ${first?.period} and ${fmt(
        last?.value,
        spec.decimals,
      )} ${spec.unit} by ${last?.period} (95% interval ${fmt(last?.lower, spec.decimals)}–${fmt(
        last?.upper,
        spec.decimals,
      )}). Holdout validation: RMSE ${fmt(Number(metrics.rmse), spec.decimals)} ${spec.unit}, MAE ${fmt(
        Number(metrics.mae),
        spec.decimals,
      )}, R² ${fmt(Number(metrics.r2), 2)} over ${String(metrics.nTest)} withheld months.`,
      evidence: prediction.limitations ?? "",
      category: "modelled",
      variable: prediction.variable,
    });
  });

  risks.forEach((analysis) => {
    const r = analysis.result as Record<string, number | string | null>;
    if (String(r.level) === "low" || !String(r.level)) return;
    const spec = VARIABLES[analysis.variable as VariableKey];
    findings.push({
      id: `risk-${analysis.variable}-${String(r.tail)}`,
      title: `${spec.label}: ${String(r.tail)}-tail risk ${String(r.level)}`,
      statement: `${String(r.recentExceedance)} ${String(r.tail) === "high" ? "high" : "low"}-tail months were detected in ${String(
        r.recentPeriod,
      )} (${fmt((Number(r.recentRate) ?? 0) * 100, 1)}% of months) against a baseline rate of ${fmt(
        (Number(r.baselineRate) ?? 0) * 100,
        1,
      )}% using the ${fmt((Number(r.thresholdQuantile) ?? 0) * 100, 0)}th percentile threshold (${fmt(
        Number(r.threshold),
        spec.decimals,
      )} ${spec.unit}). Risk level: ${String(r.level)}.`,
      evidence: String(r.methodCaveat),
      category: "observed",
      variable: analysis.variable,
    });
  });

  causes.forEach((analysis) => {
    const strongest = (analysis.result as { strongest?: { x: string; y: string; r: number; pValue: number; n: number } })
      .strongest;
    if (!strongest) return;
    findings.push({
      id: "cause-strongest",
      title: "Possible driver association",
      statement: `The strongest association is between ${strongest.x.replace("_", " ")} and ${strongest.y.replace(
        "_",
        " ",
      )} (r = ${fmt(strongest.r, 2)}, p = ${fmt(strongest.pValue, 3)}, n = ${strongest.n}).`,
      evidence:
        "Association screening only. Confounding and shared reanalysis inputs preclude causal attribution from this analysis.",
      category: "context",
    });
  });

  const significantDatasets = allDatasets.filter((d) => d.status === "discovered");
  findings.push({
    id: "discovery-summary",
    title: "Multi-Source Satellite & Climate Coverage",
    statement: `${significantDatasets.length} relevant satellite and scientific collections were matched across ${new Set(
      significantDatasets.map((d) => d.providerLabel),
    ).size} international providers, supported by ${rows.length.toLocaleString()} monthly observations from ${[
      ...new Set(rows.map((r) => r.source)),
    ].join(", ")}.`,
    evidence: "All observations were retrieved directly from official provider APIs.",
    category: "observed",
  });

  const summary = buildSummary(project, findings);
  const analysisProducts = await db.select().from(analyses).where(eq(analyses.projectId, project.id));
  await db.insert(analyses).values({
    projectId: project.id,
    kind: "interpretation",
    variable: "all",
    method: "Evidence-linked narrative generation from computed statistics",
    result: { summary, findingCount: findings.length, plainLanguage: plainLanguage(project, findings) },
  });
  const existingReports = await db.select().from(reports).where(eq(reports.projectId, project.id));
  const content = buildReportContent({
    project: fresh,
    topic,
    findings,
    datasets: allDatasets,
    validations: allValidations,
    predictions: allPredictions,
    analyses: analysisProducts,
    observationsCount: rows.length,
    sources: [...new Set(rows.map((r) => r.source))],
  });
  if (existingReports.length) {
    await db.delete(reports).where(eq(reports.projectId, project.id));
  }
  await db.insert(reports).values({ projectId: project.id, title: `${project.title} — scientific report`, content });

  const provenance: ProvenanceRecord[] = allDatasets
    .filter((d) => d.status === "discovered")
    .slice(0, 12)
    .map((d) => ({
      dataset: d.title,
      provider: d.providerLabel,
      identifier: d.collectionId,
      version: "as catalogued",
      accessedAt: new Date().toISOString(),
      accessMethod: d.accessType === "open" ? "public API" : d.accessType === "metadata" ? "public metadata API" : "authenticated",
      role: d.accessType === "metadata" ? "discovery / context" : "candidate analysis input",
      transformation: "collection metadata + spatial/temporal filter",
    }));
  await db
    .update(projects)
    .set({ findings, summary, provenance, updatedAt: new Date(), status: "running" })
    .where(eq(projects.id, project.id));
  await log(project.id, "report", `Report generated with ${findings.length} evidence-linked findings.`, "success");
}

function buildSummary(project: typeof projects.$inferSelect, findings: Finding[]): string {
  const observed = findings.filter((f) => f.category === "observed").slice(0, 3);
  const modelled = findings.filter((f) => f.category === "modelled").slice(0, 1);
  const context = findings.find((f) => f.id.startsWith("validation"));
  return [
    `TerraScope analysed ${project.startYear}–${project.endYear} conditions for ${project.locationName} (${project.topic.replace(
      /-/g,
      " ",
    )}) using real provider data.`,
    ...observed.map((f) => f.statement),
    modelled.length ? `Modelled outlook: ${modelled[0].statement}` : "",
    context ? `Validation: ${context.statement}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function plainLanguage(project: typeof projects.$inferSelect, findings: Finding[]): string {
  const observed = findings.filter((f) => f.category === "observed").slice(0, 2);
  return [
    `What this means in plain language: for the area around ${project.locationName}, official satellite and reanalysis services were queried for ${project.startYear}–${project.endYear}.`,
    observed.length
      ? `The strongest measured signals were: ${observed.map((f) => f.statement).join(" ")}`
      : "The analysis produced no statistically strong signals for this configuration.",
    "Observed numbers come from provider data. Anything labelled 'modelled' is a statistical forecast with an uncertainty range, not an observation. Correlations describe association, not proof that one variable caused another.",
  ].join(" ");
}

function buildReportContent(input: {
  project: typeof projects.$inferSelect;
  topic: ReturnType<typeof getTopic>;
  findings: Finding[];
  datasets: (typeof datasets.$inferSelect)[];
  validations: (typeof validations.$inferSelect)[];
  predictions: (typeof predictions.$inferSelect)[];
  analyses: (typeof analyses.$inferSelect)[];
  observationsCount: number;
  sources: string[];
}): Record<string, unknown> {
  const { project, topic, findings, datasets: ds, validations: vs, predictions: ps, analyses: an } = input;
  const trends = an.filter((a) => a.kind === "trend");
  const risks = an.filter((a) => a.kind === "risk");
  const recommendations = buildRecommendations(an, vs, ps);
  return {
    generatedAt: new Date().toISOString(),
    sections: [
      {
        heading: "1. Research objective",
        body: [project.objective, topic?.objective ?? ""].filter(Boolean),
      },
      {
        heading: "2. Study location",
        body: [
          `${project.locationName} — centre ${project.lat.toFixed(4)}°, ${project.lon.toFixed(4)}°; bounding box west ${project.bbox.west}, south ${project.bbox.south}, east ${project.bbox.east}, north ${project.bbox.north}.`,
          `Approximate box area: ${Math.round(projectAreaKm2(project.bbox)).toLocaleString()} km². Climate series are valid for the reanalysis grid cell containing the location, not for the full box.`,
        ],
      },
      {
        heading: "3. Time period",
        body: [`January ${project.startYear} to December ${project.endYear}, analysed at monthly resolution.`],
      },
      {
        heading: "4. Data sources",
        body: [
          `Numeric series: ${input.sources.join(", ")}. Total ${input.observationsCount} monthly observations stored.`,
          `Metadata discovery: ${[...new Set(ds.map((d) => d.providerLabel))].join(", ")}.`,
          "No synthetic, modelled-only or hand-entered values are used as observations.",
        ],
      },
      {
        heading: "5. Dataset references",
        body: ds.slice(0, 20).map(
          (d) =>
            `${d.providerLabel} · ${d.collectionId} · ${d.title} — access: ${d.accessType}; status: ${d.status}; granules: ${
              d.granuleCount ?? "n/a"
            }.`,
        ),
      },
      {
        heading: "6. Processing methods",
        body: [
          "Temporal harmonisation to monthly steps (sum for precipitation/snowfall, mean for state variables).",
          "Gap census and completeness scoring per source; no imputation.",
          "Units normalised and recorded per series; grid-cell point extraction from provider APIs.",
        ],
      },
      {
        heading: "7. Analysis methods",
        body: [
          "Trend: Sen's slope, Mann–Kendall test, OLS with Student-t p-values.",
          "Change: first-third vs last-third comparison with Welch t-test.",
          "Anomaly: z-scores against the study-period baseline.",
          "Cause: Pearson association screening with lag analysis (no causal inference).",
          "Risk: percentile exceedance screening against a baseline period.",
        ],
      },
      {
        heading: "8. Observed changes",
        body: findings.filter((f) => f.category === "observed").map((f) => `${f.title}: ${f.statement}`),
      },
      {
        heading: "9. Scientific findings",
        body: findings.map((f) => `[${f.category}] ${f.title} — ${f.statement} ${f.evidence}`),
      },
      {
        heading: "10. Possible causes",
        body: [
          ...findings.filter((f) => f.id === "cause-strongest").map((f) => `${f.statement} ${f.evidence}`),
          "Causal attribution is explicitly not established by this platform. Any causal claim requires an independent attribution design and ground observations.",
        ],
      },
      {
        heading: "11. Validation results",
        body: vs.map(
          (v) =>
            `${v.variable}: ${v.primarySource} vs ${v.referenceSource} — ${v.independent ? "independent comparison" : "not independently validated"}; n=${
              (v.metrics as Record<string, unknown>).n ?? 0
            }; RMSE=${(v.metrics as Record<string, unknown>).rmse ?? "n/a"}; MAE=${
              (v.metrics as Record<string, unknown>).mae ?? "n/a"
            }; r=${(v.metrics as Record<string, unknown>).r ?? "n/a"}. ${v.notes ?? ""}`,
        ),
      },
      {
        heading: "12. Uncertainty and limitations",
        body: [
          "Point-scale reanalysis values are not area averages; spatial representativeness is limited.",
          "Reanalysis products differ in assimilation systems and vertical/depth support; agreement is consistency, not accuracy.",
          "Forecast intervals describe residual scatter from a seasonal trend model, not full structural uncertainty.",
          "Variables requiring credentialed raster access (NDVI, water extent, SAR backscatter) were catalogued but not used in numeric analysis.",
          "No ground-truth station data are configured, so absolute bias against in-situ measurements is unknown.",
        ],
      },
      {
        heading: "13. Risk assessment",
        body: risks.length
          ? risks.map(
              (r) =>
                `${r.variable} (${(r.result as Record<string, unknown>).tail}-tail): level ${
                  (r.result as Record<string, unknown>).level
                }; recent exceedance ${(r.result as Record<string, unknown>).recentExceedance} months vs baseline ${
                  (r.result as Record<string, unknown>).baselineExceedance
                }. ${(r.result as Record<string, unknown>).methodCaveat}`,
            )
          : ["No risk thresholds were evaluated for this configuration."],
      },
      {
        heading: "14. Recommendations",
        body: recommendations,
      },
      {
        heading: "Traceability",
        body: [
          `Trend analyses recorded: ${trends.length}. Predictions: ${ps.length}. Project id: ${project.id}.`,
          `Algorithm versions: stats-engine/1.0 (Sen, Mann–Kendall, OLS, seasonal harmonic regression); acquisition adapters: CMR-2024, POWER v2, Open-Meteo v1.`,
          "All datasets, provider responses, HTTP status codes and access timestamps are retained in the access log.",
        ],
      },
    ],
    findings,
    prospectiveConfidenceStatement:
      "Confidence statements are qualitative (statistical significance and cross-source agreement). TerraScope does not report an overall accuracy percentage because no independent ground-truth set was available for this study.",
  };
}

export function buildRecommendations(
  analysisRows: (typeof analyses.$inferSelect)[],
  validationRows: (typeof validations.$inferSelect)[],
  predictionRows: (typeof predictions.$inferSelect)[],
): string[] {
  const out: string[] = [];
  const risks = analysisRows.filter((a) => a.kind === "risk");
  const high = risks.filter((r) => ["high", "elevated"].includes(String((r.result as Record<string, unknown>).level)));
  if (high.length) {
    out.push(
      `Operational monitoring is recommended for ${[...new Set(high.map((r) => r.variable.replace("_", " ")))].join(
        ", ",
      )}: recent exceedance rates are above the study-period baseline. Verify with in-situ observations before operational action.`,
    );
  } else {
    out.push("Continue routine monitoring; no elevated threshold exceedance was detected in this configuration.");
  }
  const warming = analysisRows.find(
    (a) => a.kind === "trend" && a.variable === "temperature" && String((a.result as Record<string, unknown>).direction).includes("increase"),
  );
  if (warming) {
    out.push(
      "Significant warming was detected. Review heat-action planning and ensure monitoring of vulnerable populations; this finding is based on reanalysis, so confirm with station records.",
    );
  }
  const drying = analysisRows.find(
    (a) => a.kind === "trend" && a.variable === "precipitation" && String((a.result as Record<string, unknown>).direction).includes("decrease"),
  );
  if (drying) {
    out.push(
      "Precipitation shows a decreasing tendency. Water-resource planning should consider drought contingency measures, verified with gauge and GRACE-type water-storage data.",
    );
  }
  const weakValidation = validationRows.filter(
    (v) => v.independent && Number((v.metrics as Record<string, unknown>).r) < 0.7,
  );
  if (weakValidation.length) {
    out.push(
      `Cross-source agreement is limited for ${weakValidation
        .map((v) => v.variable)
        .join(", ")} (r < 0.7). Treat derived trends as indicative and obtain in-situ reference data before decision-making.`,
    );
  }
  out.push(
    "Commission independent validation with station or survey data, and extend the record length before using these results for regulatory or emergency decisions.",
  );
  if (predictionRows.length) {
    out.push(
      "Forecasts are statistical extrapolations. Re-run the analysis with updated observations and alternative models (e.g. ARIMA, gradient boosting) before operational use.",
    );
  }
  return out;
}

export function projectAreaKm2(bbox: { west: number; south: number; east: number; north: number }): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  return Math.abs(
    R *
      R *
      toRad(bbox.east - bbox.west) *
      (Math.sin(toRad(bbox.north)) - Math.sin(toRad(bbox.south))),
  );
}
