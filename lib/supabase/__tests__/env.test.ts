/**
 * @jest-environment node
 */
import { supabaseSecretKey } from "../env";

describe("supabaseSecretKey", () => {
  const original = process.env.SUPABASE_SECRET_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = original;
  });

  it("reads SUPABASE_SECRET_KEY", () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test_not_real";
    expect(supabaseSecretKey()).toBe("sb_secret_test_not_real");
  });

  it("names the missing variable without printing any value", () => {
    delete process.env.SUPABASE_SECRET_KEY;
    expect(() => supabaseSecretKey()).toThrow("Missing environment variable SUPABASE_SECRET_KEY");
  });
});
