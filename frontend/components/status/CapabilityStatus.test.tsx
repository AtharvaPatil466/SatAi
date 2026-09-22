import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CapabilityStatus } from "./CapabilityStatus";
import { RuntimeStatus } from "./RuntimeStatus";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const response = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

describe("System status", () => {
  it("keeps registration, runtime, cache, and prototype states distinct", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.endsWith("/api/capabilities")) return response({ capabilities: [
        { name: "single_image_vqa", registered: true, available: false, state: "UNAVAILABLE", provider: "qwen2.5vl-3b", reason_code: "CUDA_UNAVAILABLE", detail: "A CUDA GPU is required." },
        { name: "grounding", registered: true, available: true, state: "AVAILABLE", provider: "grounding-dino-swint", reason_code: null, detail: null },
        { name: "change_vqa", registered: false, available: false, state: "NOT_IMPLEMENTED", provider: null, reason_code: "NO_PROVIDER", detail: "No real provider is registered." },
        { name: "optical_sar", registered: false, available: false, state: "NOT_IMPLEMENTED", provider: null, reason_code: "NO_PROVIDER", detail: "No real provider is registered." },
      ] });
      if (url.endsWith("/api/scenes")) return response({ version: "1.0", scenes: [
        { capability: "single_image_vqa", result_state: "cached_real", available: true },
        { capability: "grounding", result_state: "cached_real", available: false, unavailable_reason: "Exact input is missing." },
      ] });
      return response({ human_validation: true });
    }));

    render(<CapabilityStatus />);
    const cards = await screen.findAllByRole("article");
    expect(within(cards[0]).getAllByText("UNAVAILABLE")).toHaveLength(2);
    expect(within(cards[0]).getByText("CACHED REAL")).toBeTruthy();
    expect(within(cards[0]).getByText("A CUDA GPU is required.")).toBeTruthy();
    expect(within(cards[1]).getAllByText("AVAILABLE")).toHaveLength(2);
    expect(within(cards[1]).getByText("Exact input is missing.")).toBeTruthy();
    expect(within(cards[2]).getAllByText("NOT_IMPLEMENTED")).toHaveLength(2);
    expect(within(cards[3]).getAllByText("NOT_IMPLEMENTED")).toHaveLength(2);
    expect(within(cards[3]).getByText(/not AI model output/i)).toBeTruthy();
  });

  it("keeps failed reads unknown", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<CapabilityStatus />);
    expect((await screen.findAllByText("UNKNOWN")).length).toBeGreaterThan(0);
    expect(screen.getByRole("alert").textContent).toContain("UNKNOWN");
  });

  it("reports API health and verified trace integrity independently", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("/api/health")
      ? response({ status: "ready", mode: "offline-first" })
      : response({ verified: true, message: "Trace chain verified." })));
    render(<RuntimeStatus />);
    expect(await screen.findByText("READY")).toBeTruthy();
    expect(screen.getByText("VERIFIED")).toBeTruthy();
    expect(screen.getByText("Mode: offline-first")).toBeTruthy();
  });

  it("keeps unreachable runtime facts unknown", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<RuntimeStatus />);
    expect(await screen.findAllByText("UNKNOWN")).toHaveLength(2);
  });
});
