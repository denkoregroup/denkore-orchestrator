import { create } from "qrcode";

const QUIET_ZONE = 3; // modules of empty border around the code, so a phone camera can find its edge

/**
 * A QR code as an inline SVG, drawn on the server from the code's own modules (no HTML is injected).
 * Dark modules and the border use the page's print ink on white, so it scans on the dark screen too.
 */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { modules } = create(text, { errorCorrectionLevel: "M" });
  const size = modules.size;
  const runs: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules.get(y, x)) continue;
      let length = 1;
      while (x + length < size && modules.get(y, x + length)) length++;
      runs.push(`M${x} ${y}h${length}v1h-${length}z`);
      x += length;
    }
  }
  const full = size + QUIET_ZONE * 2;
  return (
    <svg role="img" aria-label={label} viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${full} ${full}`} className="size-28 shrink-0 rounded-md print:size-24" shapeRendering="crispEdges">
      <rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={full} height={full} fill="#ffffff" />
      <path d={runs.join("")} fill="#14110d" />
    </svg>
  );
}
