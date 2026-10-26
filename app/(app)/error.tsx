"use client";

import { useEffect } from "react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-xl font-semibold">This page didn’t load</h1>
      <p className="text-muted">Something went wrong reading the data. Try again in a moment.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="min-h-12 rounded-md border border-border px-4 font-medium"
      >
        Try again
      </button>
    </section>
  );
}
