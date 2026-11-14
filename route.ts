import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { datasets, projects } from "@/db/schema";
import { ensureSeed } from "@/lib/seed";
import { currentUser, isUuid, notFound, projectForUser, serverError, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureSeed();
    const user = await currentUser();
    if (!user) return unauthorized();
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const provider = url.searchParams.get("provider");
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 250);

    if (projectId) {
      if (!isUuid(projectId)) return notFound("Research not found");
      const project = await projectForUser(projectId, user);
      if (!project) return notFound("Research not found");
    }

    const filters = [
      projectId
        ? eq(datasets.projectId, projectId)
        : undefined,
      provider ? eq(datasets.provider, provider) : undefined,
      category ? eq(datasets.category, category) : undefined,
      status ? eq(datasets.status, status) : undefined,
      q ? ilike(datasets.title, `%${q}%`) : undefined,
    ].filter((f): f is Exclude<typeof f, undefined> => f !== undefined);

    const rows = await db
      .select({
        id: datasets.id,
        projectId: datasets.projectId,
        projectTitle: projects.title,
        provider: datasets.provider,
        providerLabel: datasets.providerLabel,
        collectionId: datasets.collectionId,
        title: datasets.title,
        description: datasets.description,
        platform: datasets.platform,
        instrument: datasets.instrument,
        category: datasets.category,
        variables: datasets.variables,
        temporalStart: datasets.temporalStart,
        temporalEnd: datasets.temporalEnd,
        spatialResolution: datasets.spatialResolution,
        temporalResolution: datasets.temporalResolution,
        license: datasets.license,
        accessUrl: datasets.accessUrl,
        accessType: datasets.accessType,
        status: datasets.status,
        relevance: datasets.relevance,
        rationale: datasets.rationale,
        granuleCount: datasets.granuleCount,
        metadata: datasets.metadata,
        createdAt: datasets.createdAt,
      })
      .from(datasets)
      .leftJoin(projects, eq(datasets.projectId, projects.id))
      .where(and(...filters))
      .orderBy(desc(datasets.createdAt), desc(datasets.relevance))
      .limit(limit);

    const totals = await db
      .select({ provider: datasets.provider, count: sql<number>`count(*)::int` })
      .from(datasets)
      .groupBy(datasets.provider);

    return Response.json({ datasets: rows, totals });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "Could not load datasets");
  }
}
