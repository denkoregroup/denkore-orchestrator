/**
 * @jest-environment node
 */
const signInWithOAuth = jest.fn();
const createClient = jest.fn();
const requestHeaders = jest.fn();
const redirect = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});

jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
jest.mock("next/headers", () => ({ headers: () => requestHeaders() }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

import { signInWithGitHub } from "@/app/login/actions";

const GITHUB_URL = "https://abcdefgh.supabase.co/auth/v1/authorize?provider=github&redirect_to=x";

beforeEach(() => {
  signInWithOAuth.mockReset().mockResolvedValue({ data: { provider: "github", url: GITHUB_URL }, error: null });
  createClient.mockReset().mockResolvedValue({ auth: { signInWithOAuth } });
  requestHeaders.mockReset();
  redirect.mockClear();
});

describe("signInWithGitHub", () => {
  it("asks Supabase for GitHub, coming back to /auth/callback on the request's origin, then redirects to the URL it returns", async () => {
    requestHeaders.mockResolvedValue(new Headers({ origin: "https://denkore-orchestrator-git-feat-denkoregroup.vercel.app" }));
    await expect(signInWithGitHub()).rejects.toThrow(`NEXT_REDIRECT ${GITHUB_URL}`);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: { redirectTo: "https://denkore-orchestrator-git-feat-denkoregroup.vercel.app/auth/callback" },
    });
    expect(redirect).toHaveBeenCalledWith(GITHUB_URL);
  });

  it("works on localhost", async () => {
    requestHeaders.mockResolvedValue(new Headers({ origin: "http://localhost:3000" }));
    await expect(signInWithGitHub()).rejects.toThrow("NEXT_REDIRECT");
    expect(signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe("http://localhost:3000/auth/callback");
  });

  it("falls back to the host, with the right scheme, when there is no Origin", async () => {
    requestHeaders.mockResolvedValue(new Headers({ host: "app.example" }));
    await expect(signInWithGitHub()).rejects.toThrow("NEXT_REDIRECT");
    expect(signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe("https://app.example/auth/callback");
  });

  it("fails loudly with no Origin and no host, and goes nowhere", async () => {
    requestHeaders.mockResolvedValue(new Headers());
    await expect(signInWithGitHub()).rejects.toThrow(/no Origin or Host header/);
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("fails loudly, naming the code and nothing else, if Supabase cannot start the sign-in", async () => {
    requestHeaders.mockResolvedValue(new Headers({ origin: "http://localhost:3000" }));
    signInWithOAuth.mockResolvedValue({
      data: { provider: null, url: null },
      error: { code: "validation_failed", message: "contains details we do not want in logs" },
    });
    const error = await signInWithGitHub().catch((e: Error) => e);
    expect((error as Error).message).toBe("GitHub sign-in could not start: validation_failed");
    expect(redirect).not.toHaveBeenCalled();
  });
});
