import { notInArray } from "drizzle-orm";
import { db } from "@/db";
import { providers } from "@/db/schema";
import { PROVIDER_DEFS } from "@/lib/providers";
import { getWorkspaceUser } from "@/lib/auth";

let seedPromise: Promise<void> | null = null;

async function runSeed(): Promise<void> {
  await getWorkspaceUser();
  const activeIds = PROVIDER_DEFS.map((d) => d.id);
  try {
    await db.delete(providers).where(notInArray(providers.id, activeIds));
  } catch {
    /* ignore if table is empty */
  }
  for (const def of PROVIDER_DEFS) {
    try {
      await db
        .insert(providers)
        .values({
          id: def.id,
          name: def.name,
          category: def.category,
          operator: def.operator,
          docsUrl: def.docsUrl,
          endpoint: def.endpoint,
          capability: def.capability,
          requiresAuth: def.requiresAuth,
          status: "connected",
          statusDetail: def.notes,
          notes: def.notes,
        })
        .onConflictDoUpdate({
          target: providers.id,
          set: {
            name: def.name,
            category: def.category,
            operator: def.operator,
            docsUrl: def.docsUrl,
            endpoint: def.endpoint,
            capability: def.capability,
            requiresAuth: def.requiresAuth,
            notes: def.notes,
          },
        });
    } catch (err) {
      console.error("[seed] provider registry sync failed:", err instanceof Error ? err.message : err);
      break;
    }
  }
}

export async function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}
