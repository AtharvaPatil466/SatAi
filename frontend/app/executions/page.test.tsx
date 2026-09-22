import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import type { TraceRecord } from "@/lib/types";
import { shortHash } from "@/lib/utils";
import ExecutionsPage from "./page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const records: TraceRecord[] = [1, 0].map(index => ({
  model_name: `provider-${index}`,
  model_version: "test",
  params: { execution_mode: "live", capability: `capability-${index}`, planner_rule: `rule-${index}` },
  input_summary: { image_paths: [], question: `Recorded request ${index}`, n_images: 1 },
  timestamp_iso: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
  record_hash: (index ? "b" : "a").repeat(64),
  prev_hash: index ? "a".repeat(64) : "",
}));

describe("Audit timeline recorded provenance", () => {
  it("shows each recorded request with its hash relationship and verifies the chain", async () => {
    const history = { records, count: records.length };
    vi.spyOn(api, "getTraces").mockResolvedValue(history);
    const verify = vi.spyOn(api, "verifyTraces").mockResolvedValue({ verified: true, message: "Chain verified (2 records)" });

    render(<ExecutionsPage />);
    await screen.findByText("2 persisted records");
    const cards = screen.getAllByRole("article");
    expect(within(cards[0]).getByText("Recorded request 0")).toBeTruthy();
    expect(within(cards[1]).getByText("Recorded request 1")).toBeTruthy();
    expect(screen.queryByText("Representative request")).toBeNull();
    expect(screen.queryByText("Locate a yellow ship.")).toBeNull();
    expect(within(cards[0]).getByText("GENESIS")).toBeTruthy();
    expect(within(cards[1]).getByText(shortHash(records[0].prev_hash))).toBeTruthy();
    expect(within(cards[1]).getAllByText(shortHash(records[0].record_hash))).toHaveLength(2);
    fireEvent.click(within(cards[1]).getByText("Inspect recorded provenance"));
    expect(within(cards[1]).getByRole("button", { name: /view execution/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Verify chain" }));
    await waitFor(() => expect(verify).toHaveBeenCalledOnce());
    expect(await screen.findByText("VERIFIED: Chain verified (2 records)")).toBeTruthy();
  });

  it("shows a neutral fallback when a historical request is blank", async () => {
    vi.spyOn(api, "getTraces").mockResolvedValue({
      records: [{ ...records[1], input_summary: { ...records[1].input_summary, question: "   " } }],
      count: 1,
    });

    render(<ExecutionsPage />);
    await screen.findByText("1 persisted records");
    expect(screen.getByText("Request not recorded")).toBeTruthy();
    expect(screen.queryByText("Recorded request 0")).toBeNull();
  });
});
