"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel mx-auto mt-20 max-w-xl p-8 text-center">
      <p className="eyebrow text-error">Interface error</p>
      <h1 className="mt-3 text-2xl font-[600] text-ivory">This view could not be rendered safely.</h1>
      <p className="mt-3 text-sm leading-relaxed text-midgray">The Streamlit fallback and committed artifacts are unchanged. Retry this view or use the fallback demo.</p>
      <button onClick={reset} className="mt-6 rounded-pill bg-cobalt px-5 py-2.5 text-sm font-[500] text-white">Retry</button>
    </div>
  );
}
