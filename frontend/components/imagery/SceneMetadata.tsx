// Deliberately not a map pin: LoveDA is a dataset, not a place, and this scene carries
// no geographic coordinates. See ImageryViewer for the same reasoning.
import { Database, ScanLine } from "lucide-react";

export function SceneMetadata() {
  return (
    <div className="panel mt-4 grid gap-4 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div className="min-w-0"><p className="eyebrow">Scene</p><p className="mt-1 truncate font-mono text-xs text-deepgray">loveda_LoveDA_images_png_0_gsd0.3</p></div>
      <div className="flex items-center gap-2 text-sm text-deepgray"><Database size={15} className="text-ash" /> LoveDA</div>
      <div className="flex items-center gap-2 text-sm text-deepgray"><ScanLine size={15} className="text-ash" /> 0.3 m GSD</div>
    </div>
  );
}
