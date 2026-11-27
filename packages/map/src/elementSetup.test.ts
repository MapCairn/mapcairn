// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { screen } from "@testing-library/react";
import { html, LitElement } from "lit";
import { afterEach, describe, expect, it } from "vitest";
import { mountElement, unmountElements } from "./elementTestUtils";

/** An element written as the private elements are: no decorators, light DOM. */
class ProbeElement extends LitElement {
  static override properties = { label: {} };

  declare label: string;

  constructor() {
    super();
    this.label = "First";
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): unknown {
    return html`<button type="button">${this.label}</button>`;
  }
}

customElements.define("mapcairn-test-probe", ProbeElement);

describe("the element test setup", () => {
  afterEach(unmountElements);

  it("mounts an element in the page and waits for its first render", async () => {
    const probe = await mountElement(new ProbeElement());

    expect(probe.isConnected).toBe(true);
    expect(probe.shadowRoot).toBeNull();
    expect(screen.getByRole("button", { name: "First" }).parentElement).toBe(
      probe,
    );
  });

  it("renders again when a property is set after construction", async () => {
    const probe = await mountElement(new ProbeElement());

    probe.label = "Second";
    await probe.updateComplete;

    expect(screen.getByRole("button", { name: "Second" })).toBeInTheDocument();
  });

  it("removes what it mounted", async () => {
    const probe = await mountElement(new ProbeElement());

    unmountElements();

    expect(probe.isConnected).toBe(false);
  });
});
