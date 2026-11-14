import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getWorkspaceUser, type Role, type SessionUser } from "@/lib/auth";

export async function currentUser(): Promise<SessionUser> {
  return getWorkspaceUser();
}

export function unauthorized(): Response {
  return Response.json({ error: "Not permitted" }, { status: 401 });
}

export function forbidden(): Response {
  return Response.json({ error: "Action not permitted" }, { status: 403 });
}

export function badRequest(message: string, details?: unknown): Response {
  return Response.json({ error: message, details }, { status: 400 });
}

export function notFound(message = "Not found"): Response {
  return Response.json({ error: message }, { status: 404 });
}

export function serverError(message: string): Response {
  return Response.json({ error: message }, { status: 500 });
}

export function hasRole(user: SessionUser | null, roles: Role[]): user is SessionUser {
  return !!user && roles.includes(user.role);
}

export async function projectForUser(
  projectId: string,
  _user?: SessionUser,
): Promise<typeof projects.$inferSelect | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return project ?? null;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
