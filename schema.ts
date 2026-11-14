import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Shared types                                                        */
/* ------------------------------------------------------------------ */

export type BBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type PlanStep = {
  key: string;
  label: string;
  module: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  note?: string;
};

export type Plan = {
  requiredVariables: string[];
  missions: string[];
  methods: string[];
  steps: PlanStep[];
  dataPolicy: string;
};

export type Finding = {
  id: string;
  title: string;
  statement: string;
  evidence: string;
  category: "observed" | "modelled" | "context";
  variable?: string;
  statistic?: number;
  unit?: string;
};

export type ProvenanceRecord = {
  dataset: string;
  provider: string;
  identifier: string;
  version?: string;
  accessedAt: string;
  accessMethod: string;
  role: string;
  transformation?: string;
};

/* ------------------------------------------------------------------ */
/* Identity & access                                                   */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("researcher"), // admin | researcher | viewer
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Providers & integration status                                      */
/* ------------------------------------------------------------------ */

export const providers = pgTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // optical | sar | weather | water | reference | visualization
  operator: text("operator").notNull(),
  docsUrl: text("docs_url").notNull(),
  endpoint: text("endpoint").notNull(),
  capability: text("capability").notNull(), // discovery | data | visualization
  requiresAuth: boolean("requires_auth").notNull().default(false),
  status: text("status").notNull().default("unknown"),
  statusDetail: text("status_detail"),
  latencyMs: integer("latency_ms"),
  httpStatus: integer("http_status"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  notes: text("notes"),
});

export const providerChecks = pgTable(
  "provider_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    ok: boolean("ok").notNull(),
    httpStatus: integer("http_status"),
    latencyMs: integer("latency_ms"),
    message: text("message"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("provider_checks_provider_idx").on(t.providerId)],
);

/* ------------------------------------------------------------------ */
/* Research projects                                                   */
/* ------------------------------------------------------------------ */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    topic: text("topic").notNull(),
    objective: text("objective").notNull(),
    locationName: text("location_name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    bbox: jsonb("bbox").$type<BBox>().notNull(),
    startYear: integer("start_year").notNull(),
    endYear: integer("end_year").notNull(),
    methods: jsonb("methods").$type<string[]>().notNull(),
    variables: jsonb("variables").$type<string[]>().notNull(),
    status: text("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    currentStep: text("current_step"),
    stepIndex: integer("step_index").notNull().default(0),
    plan: jsonb("plan").$type<Plan>(),
    findings: jsonb("findings").$type<Finding[]>(),
    provenance: jsonb("provenance").$type<ProvenanceRecord[]>(),
    summary: text("summary"),
    error: text("error"),
    datasetCount: integer("dataset_count").notNull().default(0),
    observationCount: integer("observation_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("projects_user_idx").on(t.userId), index("projects_status_idx").on(t.status)],
);

export const jobEvents = pgTable(
  "job_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    level: text("level").notNull().default("info"), // info | warn | error | success
    message: text("message").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_events_project_idx").on(t.projectId)],
);

/* ------------------------------------------------------------------ */
/* Datasets & observations                                             */
/* ------------------------------------------------------------------ */

export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerLabel: text("provider_label").notNull(),
    collectionId: text("collection_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    platform: text("platform"),
    instrument: text("instrument"),
    category: text("category").notNull(),
    variables: jsonb("variables").$type<string[]>(),
    temporalStart: text("temporal_start"),
    temporalEnd: text("temporal_end"),
    spatialResolution: text("spatial_resolution"),
    temporalResolution: text("temporal_resolution"),
    license: text("license"),
    accessUrl: text("access_url"),
    accessType: text("access_type").notNull().default("metadata"), // metadata | open | auth | visualization
    status: text("status").notNull().default("discovered"),
    relevance: integer("relevance"),
    rationale: text("rationale"),
    granuleCount: integer("granule_count"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("datasets_project_idx").on(t.projectId), index("datasets_provider_idx").on(t.provider)],
);

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    variable: text("variable").notNull(),
    period: text("period").notNull(), // YYYY-MM monthly harmonised
    value: doublePrecision("value").notNull(),
    unit: text("unit").notNull(),
    quality: text("quality").notNull().default("ok"), // ok | missing_filled | suspect
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("observations_project_idx").on(t.projectId, t.variable)],
);

export const accessLogs = pgTable(
  "access_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    url: text("url").notNull(),
    method: text("method").notNull().default("GET"),
    httpStatus: integer("http_status"),
    bytes: integer("bytes"),
    durationMs: integer("duration_ms"),
    outcome: text("outcome").notNull(), // success | error | rate_limited | timeout
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("access_logs_project_idx").on(t.projectId)],
);

/* ------------------------------------------------------------------ */
/* Analysis, validation, prediction                                    */
/* ------------------------------------------------------------------ */

export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // trend | change | anomaly | historical | risk | cause
    variable: text("variable").notNull(),
    method: text("method").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analyses_project_idx").on(t.projectId)],
);

export const validations = pgTable("validations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  variable: text("variable").notNull(),
  primarySource: text("primary_source").notNull(),
  referenceSource: text("reference_source").notNull(),
  method: text("method").notNull(),
  metrics: jsonb("metrics").$type<Record<string, number | string | null>>().notNull(),
  independent: boolean("independent").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const predictions = pgTable("predictions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  variable: text("variable").notNull(),
  method: text("method").notNull(),
  horizonYears: integer("horizon_years").notNull(),
  metrics: jsonb("metrics").$type<Record<string, number | string | null>>().notNull(),
  points: jsonb("points")
    .$type<{ period: string; value: number; lower: number; upper: number; kind: string }[]>()
    .notNull(),
  limitations: text("limitations"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Outputs                                                             */
/* ------------------------------------------------------------------ */

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(), // info | watch | warning | critical
  title: text("title").notNull(),
  message: text("message").notNull(),
  variable: text("variable"),
  observed: doublePrecision("observed"),
  threshold: doublePrecision("threshold"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systemEvents = pgTable("system_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  level: text("level").notNull().default("info"),
  source: text("source").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
