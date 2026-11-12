// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { act, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientOnly } from "./ClientOnly";

const tree = (
  <ClientOnly fallback={<p>placeholder</p>}>
    <p>browser only</p>
  </ClientOnly>
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClientOnly", () => {
  it("renders the fallback on the server", () => {
    const html = renderToString(tree);
    expect(html).toContain("placeholder");
    expect(html).not.toContain("browser only");
  });

  it("renders the children when mounted on the client", () => {
    render(tree);
    expect(screen.getByText("browser only")).toBeInTheDocument();
    expect(screen.queryByText("placeholder")).toBeNull();
  });

  it("hydrates the server markup without a mismatch, then swaps in the children", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    const recoverable = vi.fn();

    await act(async () => {
      hydrateRoot(container, tree, { onRecoverableError: recoverable });
    });

    expect(container.textContent).toBe("browser only");
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    container.remove();
  });
});
