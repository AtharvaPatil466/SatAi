"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ResolutionReport } from "@/lib/types";

export function ResolutionChart({ report }: { report: ResolutionReport }) {
  const data = Object.entries(report.per_rung).map(([gsd, metrics]) => ({
    gsd: Number(gsd),
    label: `${Number(gsd)} m`,
    open: metrics.open_accuracy,
    aggregate: metrics.accuracy,
    degenerate: report.degenerate_rungs.includes(gsd),
  }));
  return (
    <div className="panel h-[390px] p-4 sm:p-6">
      <div className="mb-4"><p className="eyebrow">Accuracy by ground sample distance</p><p className="mt-1 text-xs text-midgray">Open-question accuracy is primary; aggregate accuracy is shown for context.</p></div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 14, left: -16, bottom: 4 }}>
            <CartesianGrid stroke="#d6d6d6" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="label" stroke="#707070" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 0.6]} stroke="#707070" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #d6d6d6", borderRadius: 12, fontSize: 12, color: "#1d1d1f" }} formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8, color: "#707070" }} />
            <Line type="monotone" dataKey="open" name="Open-question accuracy" stroke="#0071e3" strokeWidth={3} dot={{ fill: "#ffffff", stroke: "#0071e3", strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="aggregate" name="Aggregate accuracy" stroke="#a1a1a6" strokeWidth={1.5} strokeDasharray="6 5" dot={false} />
            {data.filter((point) => point.degenerate).map((point) => <ReferenceDot key={point.gsd} x={point.label} y={point.open} r={7} fill="#b64400" stroke="#ffffff" strokeWidth={3} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
