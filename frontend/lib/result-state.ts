import type { ExecutionMode } from "./types";

export type ResultState = "real_live" | "cached_real" | "prototype" | "unverified";

export function resultStateFromExecution(mode: ExecutionMode, artifact: string | null | undefined): ResultState {
  if (mode === "live" && !artifact) return "real_live";
  if (mode === "cached_result" && artifact) return "cached_real";
  return "unverified";
}

export function resultStateLabel(state: ResultState): string {
  return {
    real_live: "REAL / LIVE",
    cached_real: "CACHED REAL",
    prototype: "PROTOTYPE",
    unverified: "UNVERIFIED",
  }[state];
}
