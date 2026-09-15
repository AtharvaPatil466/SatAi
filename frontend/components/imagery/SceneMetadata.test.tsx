import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SceneMetadata } from "./SceneMetadata";

afterEach(cleanup);

describe("SceneMetadata", () => {
  it("keeps unreported scene metadata Unknown", () => {
    render(<SceneMetadata sceneId="scene-1" upload={null} />);
    expect(screen.getAllByText("Unknown").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/sentinel|worldview|landsat/i)).toBeNull();
  });
});
