/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const OWNER_ID = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const OTHER_ID = "8b3e4d1a-6c5f-4e3a-9d9c-4f7a0b2c3d5e";
const CODE = "one-time-code-not-real";
const EMAIL = "someone@example.com";

const exchangeCodeForSession = jest.fn();
const signOut = jest.fn();
const createClient = jest.fn();
jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

process.env.DENKORE_OWNER_USER_ID = OWNER_ID;

import { GET } from "@/app/auth/callback/route";

const call = (query = `?code=${CODE}`) => GET(new NextRequest(`http://localhost:3000/auth/callback${query}`));
const location = (res: Response) => new URL(res.headers.get("location")!);

let consoleError: jest.SpyInstance;
beforeEach(() => {
  exchangeCodeForSession.mockReset().mockResolvedValue({ data: { user: { id: OWNER_ID, email: EMAIL }, session: { access_token: "token-not-real" } }, error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
  createClient.mockReset().mockResolvedValue({ auth: { exchangeCodeForSession, signOut } });
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

/** Everything the route logged, as one string. */
const logged = () => JSON.stringify(consoleError.mock.calls);

describe("/auth/callback", () => {
  it("sends the owner to /approvals, after trading the code for a session", async () => {
    const res = await call();
    expect(exchangeCodeForSession).toHaveBeenCalledWith(CODE);
    expect(location(res).pathname).toBe("/approvals");
    expect(location(res).origin).toBe("http://localhost:3000");
    expect(signOut).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("signs a different user straight out and shows the not-allowed message", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: OTHER_ID, email: EMAIL }, session: {} }, error: null });
    const res = await call();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(location(res).pathname + location(res).search).toBe("/login?error=not_allowed");
    expect(logged()).not.toContain(EMAIL);
    expect(logged()).not.toContain(OTHER_ID);
  });

  it("still sends a non-owner away, and logs the code, if signing them out fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: OTHER_ID }, session: {} }, error: null });
    signOut.mockResolvedValue({ error: { code: "session_not_found", status: 403 } });
    const res = await call();
    expect(location(res).search).toBe("?error=not_allowed");
    expect(logged()).toContain("session_not_found");
  });

  it("without a code, goes back to login with the sign-in-failed message and exchanges nothing", async () => {
    const res = await call("");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(location(res).pathname + location(res).search).toBe("/login?error=sign_in_failed");
  });

  it("treats GitHub's refusal (an error and no code) as a failed sign-in", async () => {
    const res = await call("?error=access_denied&error_description=The+user+denied");
    expect(location(res).search).toBe("?error=sign_in_failed");
    expect(logged()).not.toContain("denied");
  });

  it("when the exchange fails, shows the failed message and logs the error code only", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "bad_code_verifier", status: 400, message: `bad verifier for ${EMAIL}` },
    });
    const res = await call();
    expect(location(res).pathname + location(res).search).toBe("/login?error=sign_in_failed");
    expect(signOut).not.toHaveBeenCalled();
    expect(logged()).toContain("bad_code_verifier");
    expect(logged()).not.toContain(EMAIL);
    expect(logged()).not.toContain(CODE);
  });

  it("falls back to the status when the exchange error has no code", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null, session: null }, error: { status: 500, message: "boom" } });
    await call();
    expect(logged()).toContain("500");
    expect(logged()).not.toContain("boom");
  });
});
