/**
 * @jest-environment node
 */
import { createFakeSupabase, argsOf, hasOp, type FakeQuery } from "@/test-utils/fake-supabase";

const createClient = jest.fn();
const redirect = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});

jest.mock("@/lib/auth", () => ({ requireOwner: jest.fn().mockResolvedValue({ id: "owner", email: null }) }));
jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

import { createRunAction } from "@/app/(app)/prompt/actions";
import { EMPTY_PROMPT_FORM, UNKNOWN_PROJECT_MESSAGE } from "@/lib/runs/prompt-form";

const PROJECT_ID = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const NEW_RUN_ID = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

function db({ projectExists = true } = {}) {
  const fake = createFakeSupabase((q: FakeQuery) => {
    if (q.table === "projects") return { data: projectExists ? { id: PROJECT_ID } : null, error: null };
    if (q.table === "runs" && hasOp(q, "insert")) return { data: { id: NEW_RUN_ID }, error: null };
    return { data: null, error: null };
  });
  createClient.mockResolvedValue(fake.client);
  return fake;
}

const insertsInto = (fake: ReturnType<typeof db>) =>
  fake.queries.filter((q) => q.table === "runs" && hasOp(q, "insert"));

beforeEach(() => {
  createClient.mockReset();
  redirect.mockClear();
});

describe("createRunAction", () => {
  it("rejects a prompt shorter than 10 characters without touching the database", async () => {
    const fake = db();
    const state = await createRunAction(EMPTY_PROMPT_FORM, form({ projectId: PROJECT_ID, prompt: "  short  " }));
    expect(state.errors.prompt).toMatch(/at least 10 characters/);
    expect(state.values.prompt).toBe("  short  ");
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects a prompt over 4000 characters", async () => {
    db();
    const state = await createRunAction(
      EMPTY_PROMPT_FORM,
      form({ projectId: PROJECT_ID, prompt: "x".repeat(4001) }),
    );
    expect(state.errors.prompt).toMatch(/under 4,000/);
  });

  it.each(["-1", "11", "2.5", "lots"])("rejects max retries %s", async (value) => {
    db();
    const state = await createRunAction(
      EMPTY_PROMPT_FORM,
      form({ projectId: PROJECT_ID, prompt: "Build the booking page", maxTestRetries: value }),
    );
    expect(state.errors.maxTestRetries).toBeDefined();
  });

  it("rejects a project that does not exist and inserts nothing", async () => {
    const fake = db({ projectExists: false });
    const state = await createRunAction(
      EMPTY_PROMPT_FORM,
      form({ projectId: PROJECT_ID, prompt: "Build the booking page" }),
    );
    expect(state.errors.projectId).toBe(UNKNOWN_PROJECT_MESSAGE);
    expect(insertsInto(fake)).toHaveLength(0);
  });

  it("rejects a missing project", async () => {
    db();
    const state = await createRunAction(EMPTY_PROMPT_FORM, form({ prompt: "Build the booking page" }));
    expect(state.errors.projectId).toBe("Choose a project.");
  });

  it("inserts only project_id, prompt and max_test_retries, then opens the run", async () => {
    const fake = db();
    await expect(
      createRunAction(
        EMPTY_PROMPT_FORM,
        form({
          projectId: PROJECT_ID,
          prompt: "  Build the booking page  ",
          maxTestRetries: "5",
          // Extra fields a crafted request might add are ignored.
          state: "done",
          test_failures: "9",
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT /runs/${NEW_RUN_ID}`);

    const [insert] = insertsInto(fake);
    expect(argsOf(insert, "insert")?.[0]).toEqual({
      project_id: PROJECT_ID,
      prompt: "Build the booking page",
      max_test_retries: 5,
    });
  });

  it("defaults max retries to 3 when left blank", async () => {
    const fake = db();
    await expect(
      createRunAction(
        EMPTY_PROMPT_FORM,
        form({ projectId: PROJECT_ID, prompt: "Build the booking page", maxTestRetries: "" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(argsOf(insertsInto(fake)[0], "insert")?.[0]).toMatchObject({ max_test_retries: 3 });
  });
});
