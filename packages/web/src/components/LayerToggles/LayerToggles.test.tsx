import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../layers/registry", () => ({
  getLayerGroups: () => [
    {
      id: "group",
      title: "Test layers",
      description: "Configured layers",
      layerIds: ["one", "later", "missing"],
    },
  ],
  getLayer: (id: string) =>
    id === "missing"
      ? undefined
      : {
          id,
          label: id === "one" ? "Example" : "Later",
          description: id === "one" ? "Example description" : undefined,
          available: id === "one",
        },
}));

import { LayerToggles } from "./LayerToggles";

describe("configured layer controls", () => {
  it("keeps toggles, descriptions and opacity without download controls", () => {
    const toggle = vi.fn();
    const opacity = vi.fn();
    render(
      <LayerToggles
        visibleLayerIds={["one"]}
        onToggle={toggle}
        onOpacityChange={opacity}
        failedLayerIds={["one"]}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: "Example" });
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAccessibleDescription("Example description");
    fireEvent.click(checkbox);
    expect(toggle).toHaveBeenCalledWith("one");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.5" } });
    expect(opacity).toHaveBeenCalledWith("one", 0.5);
    expect(screen.getByRole("checkbox", { name: /Later/ })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Failed to load");
    expect(
      screen.queryByRole("button", { name: /download/i }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "absent" },
    });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("supports default optional controls", () => {
    render(<LayerToggles visibleLayerIds={[]} onToggle={vi.fn()} />);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
