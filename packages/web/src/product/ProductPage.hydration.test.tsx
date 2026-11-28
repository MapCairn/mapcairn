// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { act, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProductPage } from "./ProductPage";

const RELEASE = { version: "0.1.0", date: "2026-11-21" } as const;

/**
 * The page's copy script announces into the live regions the server sends. The
 * page runs no framework script in production, so this is what holds a
 * hydration of it, as a client render of the route would do, to the server's
 * markup.
 */
describe("the product page's server render", () => {
  it("holds both live regions empty and hydrates them as they are", async () => {
    const page = <ProductPage release={RELEASE} />;
    const container = document.body.appendChild(document.createElement("div"));
    container.innerHTML = renderToString(page);
    const regions = () => [
      screen.getByTestId("live-region-polite"),
      screen.getByTestId("live-region-assertive"),
    ];
    const served = regions();
    for (const region of served) {
      expect(region.childNodes).toHaveLength(0);
    }
    const mismatch = vi.fn();

    const root = await act(async () =>
      hydrateRoot(container, page, { onRecoverableError: mismatch }),
    );

    expect(mismatch).not.toHaveBeenCalled();
    expect(regions()).toEqual(served);
    for (const region of served) {
      expect(region.childNodes).toHaveLength(0);
    }
    act(() => root.unmount());
    container.remove();
  });
});
