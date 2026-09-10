import type { Metadata } from "next";
import { Workspace } from "./Workspace";

export const metadata: Metadata = { title: "Workspace" };

export default function WorkspacePage() {
  return (
    <div>
      <div className="mb-6"><p className="eyebrow">Analysis workspace</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Scene intelligence</h1><p className="muted mt-2 max-w-2xl">Upload an image, inspect the plan, and run analysis. Live model execution requires a supported runtime; the exact golden demo offers a committed cached fallback.</p></div>
      <Workspace />
    </div>
  );
}
