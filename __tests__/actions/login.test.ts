/**
 * @jest-environment node
 */
const signInWithOtp = jest.fn();
const createClient = jest.fn();
const requestHeaders = jest.fn();

jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
jest.mock("next/headers", () => ({ headers: () => requestHeaders() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

import { sendMagicLink } from "@/app/login/actions";

const NEUTRAL = "If that address is allowed in, a sign-in link is on its way.";

function form(email: string) {
  const data = new FormData();
  data.set("email", email);
  return data;
}

const submit = (email = "owner@example.com") => sendMagicLink({ message: null }, form(email));

beforeEach(() => {
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  createClient.mockReset().mockResolvedValue({ auth: { signInWithOtp } });
  requestHeaders.mockReset();
});

describe("sendMagicLink", () => {
  it("builds the redirect from the Origin header, and keeps shouldCreateUser false", async () => {
    requestHeaders.mockResolvedValue(new Headers({ origin: "https://denkore-orchestrator-git-fix-denkoregroup.vercel.app" }));
    expect(await submit()).toEqual({ message: NEUTRAL });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "https://denkore-orchestrator-git-fix-denkoregroup.vercel.app/auth/confirm",
      },
    });
  });

  it("works on localhost", async () => {
    requestHeaders.mockResolvedValue(new Headers({ origin: "http://localhost:3000" }));
    await submit();
    expect(signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe("http://localhost:3000/auth/confirm");
  });

  it("falls back to the host, with the right scheme, when there is no Origin", async () => {
    requestHeaders.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    await submit();
    expect(signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe("http://localhost:3000/auth/confirm");

    requestHeaders.mockResolvedValue(new Headers({ host: "app.example" }));
    await submit();
    expect(signInWithOtp.mock.calls[1][0].options.emailRedirectTo).toBe("https://app.example/auth/confirm");
  });

  it("fails loudly with no Origin and no host, and sends nothing, rather than using a hardcoded address", async () => {
    requestHeaders.mockResolvedValue(new Headers());
    await expect(submit()).rejects.toThrow(/no Origin or Host header/);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("gives the same message when Supabase refuses the address, so it does not reveal who is allowed in", async () => {
    requestHeaders.mockResolvedValue(new Headers({ origin: "http://localhost:3000" }));
    signInWithOtp.mockResolvedValue({ error: { message: "Signups not allowed for otp" } });
    expect(await submit("stranger@example.com")).toEqual({ message: NEUTRAL });
  });

  it("rejects a malformed address before reading headers or calling Supabase", async () => {
    expect(await submit("not-an-email")).toEqual({ message: "Enter a valid email address." });
    expect(requestHeaders).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
