import type { Metadata } from "next";
import { signInWithGitHub } from "./actions";

export const metadata: Metadata = { title: "Sign in · Denkore" };

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "This GitHub account isn't allowed in.",
  sign_in_failed: "Sign-in didn't complete. Try again.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const { error } = await props.searchParams;
  // Only our own two codes are shown; anything else in the address is ignored, never echoed.
  const message = typeof error === "string" ? ERROR_MESSAGES[error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-xl font-semibold">Denkore Orchestrator</h1>
      <form action={signInWithGitHub} className="space-y-3">
        <button type="submit" className="min-h-12 w-full rounded-md bg-foreground font-medium text-background">
          Sign in with GitHub
        </button>
        {message && (
          <p role="alert" className="text-sm text-accent">
            {message}
          </p>
        )}
      </form>
    </main>
  );
}
