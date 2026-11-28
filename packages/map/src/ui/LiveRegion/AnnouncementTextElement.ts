// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { PropertyDeclarations } from "lit";
import { defineUnderFreeName, PrivateElement } from "../../lit/PrivateElement";

/**
 * The announcer's writer: the text inside one live region, as text and never as
 * markup. The region itself is the parent's, so it is in the page, empty,
 * before this element is and before any message, and in a server's markup.
 */
export class AnnouncementTextElement extends PrivateElement {
  static override properties: PropertyDeclarations = {
    message: { attribute: false },
  };

  declare message: string;

  constructor() {
    super();
    this.message = "";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // No box of its own: the region around the text stays the one pixel that
    // hides it, as when the text sat in the region directly.
    this.style.setProperty("display", "contents");
  }

  protected override render(): unknown {
    return this.message;
  }
}

let tag: string | undefined;

/** Defines the element once for this copy of the package, and names it. */
export function defineAnnouncementText(): string {
  tag ??= defineUnderFreeName("announcement", AnnouncementTextElement);
  return tag;
}
