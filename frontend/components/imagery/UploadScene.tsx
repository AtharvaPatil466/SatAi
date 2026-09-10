export function UploadScene({ disabled, onSelect }: { disabled: boolean; onSelect: (file: File) => void }) {
  return <div className="space-y-2">
    <label htmlFor="scene-upload" className="block text-sm font-semibold">Upload PNG/JPEG</label>
    <input id="scene-upload" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={disabled}
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onSelect(file); }}
      className="w-full rounded-lg border border-border p-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent file:p-2 file:text-background disabled:opacity-50" />
    <p className="text-xs text-slate-400">Up to 20 MiB. Sensor, location, GSD, and date are not inferred.</p>
  </div>;
}
