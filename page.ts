import { getWorkspaceUser, type SessionUser } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";

export async function pageUser(): Promise<SessionUser> {
  try {
    await ensureSeed();
  } catch {
    /* database may not be migrated yet during boot */
  }
  return getWorkspaceUser();
}

export async function requirePageUser(_next?: string): Promise<SessionUser> {
  return pageUser();
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
}

export function statusTone(status: string): string {
  switch (status) {
    case "completed":
    case "connected":
    case "discovered":
      return "emerald";
    case "running":
      return "sky";
    case "queued":
      return "slate";
    case "failed":
    case "unavailable":
      return "rose";
    case "cancelled":
      return "slate";
    case "partial":
      return "amber";
    case "auth_required":
      return "sky";
    default:
      return "slate";
  }
}
