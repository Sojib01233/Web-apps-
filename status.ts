import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providerChecks, providers } from "@/db/schema";
import { PROVIDER_DEFS, probeProvider, type ProbeResult } from "@/lib/providers";

/** Runs real connection tests and persists the truthful outcome. */
export async function refreshProviders(ids?: string[]): Promise<ProbeResult[]> {
  const targets = ids?.length ? PROVIDER_DEFS.filter((p) => ids.includes(p.id)) : PROVIDER_DEFS;
  const results: ProbeResult[] = [];
  const batchSize = 4;
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((def) => probeProvider(def.id)));
    for (const entry of settled) {
      if (entry.status === "fulfilled") results.push(entry.value);
    }
  }
  for (const result of results) {
    await db
      .update(providers)
      .set({
        status: result.status,
        statusDetail: result.message,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
        lastCheckedAt: new Date(),
      })
      .where(eq(providers.id, result.providerId));
    await db.insert(providerChecks).values({
      providerId: result.providerId,
      ok: result.status === "connected",
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs,
      message: result.message,
    });
  }
  return results;
}

export { STATUS_META } from "@/lib/providerStatusMeta";
