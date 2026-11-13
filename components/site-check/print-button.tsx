"use client";

/** Opens the browser's print dialog, where "Save as PDF" is one choice. Never printed itself. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 rounded-full border border-check-line px-5 font-copy text-sm font-semibold text-check-ink print:hidden"
    >
      {label}
    </button>
  );
}
