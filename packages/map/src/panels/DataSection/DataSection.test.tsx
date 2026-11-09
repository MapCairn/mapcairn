import {
  createFakeServices,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
  StaticLayerRegistry,
} from "@karta/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../../services";
import { DataSection } from "./DataSection";

function renderData(
  layers: ConstructorParameters<typeof StaticLayerRegistry>[0],
  headingLevel?: 3 | 4,
) {
  const services = createFakeServices({
    layers: new StaticLayerRegistry(layers),
  });
  return render(
    <ServicesProvider services={services}>
      <DataSection headingLevel={headingLevel} />
    </ServicesProvider>,
  );
}

describe("DataSection", () => {
  it("renders nothing when there are no layers", () => {
    const { container } = renderData([]);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("renders nothing with the default registry", () => {
    const services = createFakeServices();
    const { container } = render(
      <ServicesProvider services={services}>
        <DataSection />
      </ServicesProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  describe("with layers", () => {
    const layers = [SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER];

    it("is a region named Data with an h3", () => {
      renderData(layers);
      expect(screen.getByRole("region", { name: "Data" })).toBe(
        screen.getByTestId("sheet-section-data"),
      );
      expect(
        screen.getByRole("heading", { name: "Data", level: 3 }),
      ).toBeInTheDocument();
    });

    it("follows the heading level it is given", () => {
      renderData(layers, 4);
      expect(
        screen.getByRole("heading", { name: "Data", level: 4 }),
      ).toBeInTheDocument();
    });

    it("lists each layer name as a list item, in order", () => {
      renderData(layers);
      const list = screen.getByRole("list");
      const items = within(list).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual([
        "Sample points",
        "Sample imagery",
      ]);
    });
  });
});
