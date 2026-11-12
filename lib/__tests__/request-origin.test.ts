import { requestOrigin } from "../request-origin";

const h = (init: Record<string, string>) => new Headers(init);

describe("requestOrigin", () => {
  it("uses the Origin header", () => {
    expect(requestOrigin(h({ origin: "https://denkore-orchestrator-git-fix-denkoregroup.vercel.app" }))).toBe(
      "https://denkore-orchestrator-git-fix-denkoregroup.vercel.app",
    );
  });

  it("works for localhost, with its port", () => {
    expect(requestOrigin(h({ origin: "http://localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("prefers Origin over Host", () => {
    expect(requestOrigin(h({ origin: "https://app.example", host: "internal.example:8080" }))).toBe("https://app.example");
  });

  it("falls back to the host: http for localhost, https for anything else", () => {
    expect(requestOrigin(h({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(requestOrigin(h({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    expect(requestOrigin(h({ host: "app.example" }))).toBe("https://app.example");
  });

  it("falls back to the host when the browser sends the string null", () => {
    expect(requestOrigin(h({ origin: "null", host: "app.example" }))).toBe("https://app.example");
  });

  it("honours the proxy's forwarded host and scheme, taking the first of a list", () => {
    expect(requestOrigin(h({ host: "internal:3000", "x-forwarded-host": "app.example, proxy.internal", "x-forwarded-proto": "https,http" }))).toBe(
      "https://app.example",
    );
    expect(requestOrigin(h({ host: "localhost:3000", "x-forwarded-proto": "https" }))).toBe("https://localhost:3000");
  });

  it("throws, naming the problem, when there is neither Origin nor Host", () => {
    expect(() => requestOrigin(h({}))).toThrow(/no Origin or Host header/);
    expect(() => requestOrigin(h({ origin: "null" }))).toThrow(/no Origin or Host header/);
  });

  it("throws on an Origin that is not a URL, instead of guessing", () => {
    expect(() => requestOrigin(h({ origin: "not a url" }))).toThrow();
  });
});
