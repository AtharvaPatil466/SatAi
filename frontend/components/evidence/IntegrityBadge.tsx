import { ShieldCheck } from "lucide-react";

export function IntegrityBadge() {
  return <span className="inline-flex items-center gap-1.5 text-xs font-[500] text-success"><ShieldCheck size={14} /> Hash chained</span>;
}
