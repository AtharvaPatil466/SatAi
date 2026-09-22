import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/workspace" }));

afterEach(cleanup);

it("links the entire brand to the landing page without claiming runtime health", () => {
  render(<Sidebar />);

  const home = screen.getByRole("link", { name: "SatQuery AI home" });
  expect(home.getAttribute("href")).toBe("/");
  expect(home.textContent).toContain("SATQUERY AI");
  expect(home.textContent).toContain("Geospatial intelligence");
  for (const label of ["Workspace", "Resolution Lab", "Multi-Sensor", "Executions", "System"]) {
    expect(screen.getByRole("link", { name: label })).toBeTruthy();
  }
  expect(screen.queryByText("Online")).toBeNull();
});
