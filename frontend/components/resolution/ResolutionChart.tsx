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
      <div className="mb-4"><p className="eyebrow">Accuracy by ground sample distance</p><p className="mt-1 text-xs text-slate-500">Open-question accuracy is primary; aggregate accuracy is shown for context.</p></div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 14, left: -16, bottom: 4 }}>
            <CartesianGrid stroke="#dfe5ee" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="label" stroke="#56657a" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 0.6]} stroke="#56657a" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #dfe5ee", borderRadius: 8, fontSize: 12 }} formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Line type="monotone" dataKey="open" name="Open-question accuracy" stroke="#245bdb" strokeWidth={3} dot={{ fill: "#ffffff", stroke: "#245bdb", strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="aggregate" name="Aggregate accuracy" stroke="#56657a" strokeWidth={1.5} strokeDasharray="6 5" dot={false} />
            {data.filter((point) => point.degenerate).map((point) => <ReferenceDot key={point.gsd} x={point.label} y={point.open} r={7} fill="#855400" stroke="#ffffff" strokeWidth={3} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
