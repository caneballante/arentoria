"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="fatal-state">
      <span>Arentoria civic archive</span>
      <h1>The registry could not be opened.</h1>
      <p>Run <code>npm run data:prepare</code> to validate and rebuild the local source database.</p>
      <button type="button" onClick={reset}>Try again</button>
    </main>
  );
}
