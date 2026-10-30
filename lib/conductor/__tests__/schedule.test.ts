/**
 * @jest-environment node
 */
const callbacks: Array<() => Promise<void>> = [];
jest.mock("next/server", () => ({ after: (cb: () => Promise<void>) => callbacks.push(cb) }));
const advanceRun = jest.fn();
jest.mock("../advance", () => ({ advanceRun: (id: string) => advanceRun(id) }));

import { scheduleAdvance } from "../schedule";

beforeEach(() => {
  callbacks.length = 0;
  advanceRun.mockReset();
});

describe("scheduleAdvance", () => {
  it("defers advanceRun to after the response", async () => {
    advanceRun.mockResolvedValue({ stopped: "waiting" });
    scheduleAdvance("run-1");
    expect(advanceRun).not.toHaveBeenCalled();
    await callbacks[0]();
    expect(advanceRun).toHaveBeenCalledWith("run-1");
  });

  it("logs a failure instead of throwing", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    advanceRun.mockRejectedValue(new Error("database down"));
    scheduleAdvance("run-1");
    await expect(callbacks[0]()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
