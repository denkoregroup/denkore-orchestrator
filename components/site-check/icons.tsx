import type { AreaId, Light } from "@/lib/site-check/summarize";

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "size-6 shrink-0" } as const;

/** One drawing per area, so the card says what it is about before the words do. */
export function AreaIcon({ id }: { id: AreaId }) {
  switch (id) {
    case "sharing":
      return (
        <svg {...base}>
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6" />
        </svg>
      );
    case "google":
      return (
        <svg {...base}>
          <circle cx="11" cy="11" r="6" />
          <path d="M15.5 15.5L20 20" />
        </svg>
      );
    case "speed":
      return (
        <svg {...base}>
          <path d="M4 16a8 8 0 1 1 16 0" />
          <path d="M12 16l4-6" />
        </svg>
      );
    case "safety":
      return (
        <svg {...base}>
          <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
        </svg>
      );
  }
}

/** The light as a shape as well as a colour: a cross, a warning triangle or a tick. */
export function StatusIcon({ light }: { light: Light }) {
  const small = { ...base, className: "size-4 shrink-0" };
  switch (light) {
    case "red":
      return (
        <svg {...small}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      );
    case "amber":
      return (
        <svg {...small}>
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4M12 17.5h.01" />
        </svg>
      );
    case "green":
      return (
        <svg {...small}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.5 2.5L16 9.5" />
        </svg>
      );
  }
}
