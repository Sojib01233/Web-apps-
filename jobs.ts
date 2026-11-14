import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { advanceProject } from "@/lib/runner";

/**
 * In-process background worker. Research runs step by step against the database
 * so that it survives page reloads and can be resumed after a restart.
 */
const globalForJobs = globalThis as typeof globalThis & {
  __terrascopeActiveJobs?: Set<string>;
};

const active = (globalForJobs.__terrascopeActiveJobs ??= new Set<string>());

export function isDriving(projectId: string): boolean {
  return active.has(projectId);
}

export function ensureDrive(projectId: string): void {
  if (active.has(projectId)) return;
  void driveProject(projectId);
}

export async function driveProject(projectId: string): Promise<void> {
  if (active.has(projectId)) return;
  active.add(projectId);
  try {
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) break;
      if (["completed", "failed", "cancelled"].includes(project.status)) break;
      const result = await advanceProject(projectId);
      if (result.finished) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } catch (err) {
    await db
      .update(projects)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message : "Background worker failed",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  } finally {
    active.delete(projectId);
  }
}
