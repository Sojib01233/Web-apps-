/** Client-safe status presentation metadata (no database imports). */
export const STATUS_META: Record<string, { label: string; tone: string; description: string }> = {
  connected: {
    label: "Connected",
    tone: "emerald",
    description: "Live connection test succeeded and the documented capability is available.",
  },
  partial: {
    label: "Partially integrated",
    tone: "amber",
    description: "Connection succeeded but only part of the workflow is implemented (e.g. metadata only).",
  },
  auth_required: {
    label: "Authentication required",
    tone: "sky",
    description: "Service reachable; configured credentials are required for authenticated access.",
  },
  unavailable: {
    label: "Temporarily unavailable",
    tone: "rose",
    description: "The last live connection test failed.",
  },
  not_implemented: {
    label: "Not implemented",
    tone: "slate",
    description: "No connector is implemented for this service in this build.",
  },
  unknown: {
    label: "Not tested",
    tone: "slate",
    description: "No connection test has run in this deployment yet.",
  },
};
