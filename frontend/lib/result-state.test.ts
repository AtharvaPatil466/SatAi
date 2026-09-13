import { describe, expect, it } from "vitest";
import { resultStateFromExecution, resultStateLabel } from "./result-state";

describe("truthful result states", () => {
  it("does not call an unproven result real", () => {
    expect(resultStateFromExecution("live", null)).toBe("real_live");
    expect(resultStateFromExecution("cached_result", "results/run.json")).toBe("cached_real");
    expect(resultStateFromExecution("cached_result", null)).toBe("unverified");
    expect(resultStateLabel("prototype")).toBe("PROTOTYPE");
  });
});
