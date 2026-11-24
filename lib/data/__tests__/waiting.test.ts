/**
 * @jest-environment node
 */
const requireOwner = jest.fn();
const listOpenPulls = jest.fn();

jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("@/lib/github/pulls", () => ({ listOpenPulls: (...args: unknown[]) => listOpenPulls(...args) }));
jest.mock("@/lib/registry/cached", () => ({
  getRegistry: async () =>
    new Map([
      ["honeybees", { id: "honeybees", repo: "denkoregroup/honeybees" }],
      ["barzini-publishing", { id: "barzini-publishing", repo: "denkoregroup/barzini-publishing" }],
    ]),
}));

import { getWaiting } from "../waiting";

const ENV = process.env.GITHUB_READ_TOKEN;
afterEach(() => {
  process.env.GITHUB_READ_TOKEN = ENV;
  jest.clearAllMocks();
});

describe("getWaiting", () => {
  it("checks the owner before anything else", async () => {
    requireOwner.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    process.env.GITHUB_READ_TOKEN = "tok";
    await expect(getWaiting()).rejects.toThrow("NEXT_REDIRECT");
    expect(listOpenPulls).not.toHaveBeenCalled();
  });

  it("asks nothing of GitHub without a token", async () => {
    delete process.env.GITHUB_READ_TOKEN;
    expect(await getWaiting()).toEqual({ configured: false });
    expect(listOpenPulls).not.toHaveBeenCalled();
  });

  it("reads every registered repo, names each PR's project, newest first, and keeps unreadable repos", async () => {
    process.env.GITHUB_READ_TOKEN = "tok";
    listOpenPulls.mockResolvedValueOnce([
      { repo: "denkoregroup/honeybees", error: null, notShared: false, pulls: [{ number: 1, updatedAt: "2026-11-24T10:00:00Z" }, { number: 2, updatedAt: "2026-11-24T12:00:00Z" }] },
      { repo: "denkoregroup/barzini-publishing", error: "GitHub didn't answer in time", notShared: false, pulls: [] },
    ]);
    const data = await getWaiting();
    expect(listOpenPulls).toHaveBeenCalledWith(expect.any(Function), "tok", ["denkoregroup/honeybees", "denkoregroup/barzini-publishing"]);
    expect(data).toEqual({
      configured: true,
      projectCount: 2,
      pulls: [expect.objectContaining({ number: 2, project: "honeybees" }), expect.objectContaining({ number: 1, project: "honeybees" })],
      unreadable: [{ project: "barzini-publishing", repo: "denkoregroup/barzini-publishing", error: "GitHub didn't answer in time" }],
      notShared: [],
    });
  });

  it("lists a repo the token wasn't given apart from errors, and leaves it out of the count", async () => {
    process.env.GITHUB_READ_TOKEN = "tok";
    listOpenPulls.mockResolvedValueOnce([
      { repo: "denkoregroup/honeybees", error: null, notShared: false, pulls: [] },
      { repo: "denkoregroup/barzini-publishing", error: "GitHub answered 404: the token can't see this repository", notShared: true, pulls: [] },
    ]);
    expect(await getWaiting()).toEqual({
      configured: true,
      projectCount: 1,
      pulls: [],
      unreadable: [],
      notShared: [{ project: "barzini-publishing", repo: "denkoregroup/barzini-publishing" }],
    });
  });
});
