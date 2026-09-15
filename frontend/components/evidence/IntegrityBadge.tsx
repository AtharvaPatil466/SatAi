export type IntegrityState = "UNCHECKED" | "VERIFIED" | "FAILED" | "UNAVAILABLE";

export function IntegrityBadge({ state = "UNCHECKED" }: { state?: IntegrityState }) {
  const tone = state === "VERIFIED" ? "text-success" : state === "FAILED" ? "text-error" : state === "UNAVAILABLE" ? "text-warning" : "text-slate-500";
  return <span className={`font-mono text-[9px] font-bold tracking-[0.1em] ${tone}`}>{state === "UNCHECKED" ? "Unchecked" : state}</span>;
}
