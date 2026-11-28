// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { LitElement } from "lit";

/**
 * What every private element shares: it draws in the page's own DOM, with no
 * shadow root, so the one stylesheet, the tokens and the page's focus handling
 * reach it, and its parent can have it render at once.
 *
 * Importing this module evaluates Lit, which needs a browser. Only `elements`
 * imports the element modules, and only a dynamic `import()` reaches it.
 */
export class PrivateElement extends LitElement {
  /**
   * Renders now when a property has changed, not in a later microtask. A React
   * part calls it as it commits, so a parent's effect that moves focus finds
   * what the element draws.
   */
  flush(): void {
    this.performUpdate();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }
}

/**
 * Defines a private element under the first free numbered name. Element names
 * are global to a page, so a second copy of the package takes the next one and
 * neither ever runs the other's class.
 *
 * @param stem What the element is, such as `segmented`.
 * @returns The tag name it was defined under.
 */
export function defineUnderFreeName(
  stem: string,
  element: CustomElementConstructor,
): string {
  let copy = 1;
  while (customElements.get(`mapcairn-${stem}-${copy}`) !== undefined) {
    copy += 1;
  }
  const tag = `mapcairn-${stem}-${copy}`;
  customElements.define(tag, element);
  return tag;
}
