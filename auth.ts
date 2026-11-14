import { randomBytes, scryptSync } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";

export type Role = "admin" | "researcher" | "viewer";
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

const WORKSPACE_EMAIL = "researcher@terrascope.earth";
const WORKSPACE_NAME = "TerraScope Research Workspace";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

let cachedUser: SessionUser | null = null;

/**
 * Login/sign-up has been removed by design. A single database-backed workspace
 * identity owns projects and audit records so every route works directly without
 * authentication while preserving foreign-key integrity.
 */
export async function getWorkspaceUser(): Promise<SessionUser> {
  if (cachedUser) return cachedUser;
  const existing = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(sql`lower(${users.email}) = ${WORKSPACE_EMAIL}`)
    .limit(1);
  if (existing[0]) {
    cachedUser = {
      id: existing[0].id,
      email: existing[0].email,
      name: WORKSPACE_NAME,
      role: "admin",
    };
    return cachedUser;
  }
  const [created] = await db
    .insert(users)
    .values({
      email: WORKSPACE_EMAIL,
      name: WORKSPACE_NAME,
      passwordHash: hashPassword("workspace-internal"),
      role: "admin",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: WORKSPACE_NAME, role: "admin" },
    })
    .returning({ id: users.id, email: users.email });
  cachedUser = { id: created.id, email: created.email, name: WORKSPACE_NAME, role: "admin" };
  return cachedUser;
}

export async function getSessionUser(): Promise<SessionUser> {
  return getWorkspaceUser();
}

export async function recordAudit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({ userId, action, entity, entityId: entityId ?? undefined, meta: meta ?? {} });
  } catch {
    /* audit failures must never break the request */
  }
}

export function canCreateResearch(role?: Role): boolean {
  return role !== "viewer";
}
