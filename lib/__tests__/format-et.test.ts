/**
 * @jest-environment node
 *
 * The time zone of a process is fixed when it starts, so these run the real formatter in child
 * processes with different TZ values.
 */
import { execFileSync } from "node:child_process";
import { formatEt } from "../format";

jest.setTimeout(60_000);

const SCRIPT = `
const { formatEt } = require("./lib/format");
console.log(JSON.stringify({
  winter: formatEt("2026-11-08T10:00:00+00:00"),
  summer: formatEt("2026-07-04T16:30:00.000Z"),
  local: new Date("2026-11-08T10:00:00Z").toLocaleString(),
}));
`;

function underTz(tz: string): { winter: string; summer: string; local: string } {
  const out = execFileSync(process.execPath, ["-r", "ts-node/register", "-e", SCRIPT], {
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", TS_NODE_PROJECT: "scripts/tsconfig.json", TZ: tz },
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return JSON.parse(out);
}

describe("formatEt", () => {
  it("returns the same string under TZ=UTC and TZ=America/New_York (and anywhere else)", () => {
    const utc = underTz("UTC");
    const newYork = underTz("America/New_York");
    const tokyo = underTz("Asia/Tokyo");

    // The test only means something if the machine's own zone really changed between runs.
    expect(new Set([utc.local, newYork.local, tokyo.local]).size).toBe(3);

    expect({ winter: utc.winter, summer: utc.summer }).toEqual({ winter: newYork.winter, summer: newYork.summer });
    expect({ winter: tokyo.winter, summer: tokyo.summer }).toEqual({ winter: newYork.winter, summer: newYork.summer });
  });

  it("is Eastern time with the abbreviation ET, in winter and in summer", () => {
    expect(formatEt("2026-11-08T10:00:00+00:00")).toBe("Nov 8, 2026, 5:00 AM ET"); // EST, as PostgREST writes it
    expect(formatEt("2026-07-04T16:30:00.000Z")).toBe("Jul 4, 2026, 12:30 PM ET"); // EDT
  });

  it("throws on a value that is not a date, instead of printing nonsense", () => {
    expect(() => formatEt("not a date")).toThrow(RangeError);
  });
});

describe("formatEtDate", () => {
  it("is the date in Eastern time, so a late-evening report keeps its day", () => {
    const { formatEtDate } = jest.requireActual("../format") as typeof import("../format");
    expect(formatEtDate("2026-11-08T10:00:00.000Z")).toBe("Nov 8, 2026");
    expect(formatEtDate("2026-11-09T03:30:00.000Z")).toBe("Nov 8, 2026");
  });
});
