import type { Metadata } from "next";
import { Workspace } from "./Workspace";

export const metadata: Metadata = { title: "Workspace" };

export default function WorkspacePage() {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-lg font-bold tracking-tight text-white">Scene intelligence</h1>
        <p className="font-mono text-[11px] text-slate-500">image → question → planner → capability → provider → answer → evidence → trace</p>
      </div>
      <Workspace />
    </div>
  );
}
