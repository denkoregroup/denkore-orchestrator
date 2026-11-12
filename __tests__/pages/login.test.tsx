import { render, screen } from "@testing-library/react";

jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

import LoginPage from "@/app/login/page";

const page = (searchParams: Record<string, string | string[] | undefined>) =>
  LoginPage({ searchParams: Promise.resolve(searchParams) } as unknown as Parameters<typeof LoginPage>[0]);

describe("/login", () => {
  it("shows one Sign in with GitHub button and no email field", async () => {
    render(await page({}));
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains a rejected account", async () => {
    render(await page({ error: "not_allowed" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This GitHub account isn't allowed in.");
  });

  it("explains a sign-in that did not finish", async () => {
    render(await page({ error: "sign_in_failed" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in didn't complete. Try again.");
  });

  it("shows nothing for a code it does not know, and never echoes it", async () => {
    render(await page({ error: "<b>nope</b>" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/nope/)).toBeNull();
  });
});
