"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  message: string | null;
}

const emailSchema = z.email();

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { message: "Enter a valid email address." };

  const supabase = await createClient();
  // shouldCreateUser: false keeps this a single-user app; the owner is created in Supabase directly.
  await supabase.auth.signInWithOtp({ email: email.data, options: { shouldCreateUser: false } });
  // Same message either way, so the form does not reveal which addresses exist.
  return { message: "If that address is allowed in, a sign-in link is on its way." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
