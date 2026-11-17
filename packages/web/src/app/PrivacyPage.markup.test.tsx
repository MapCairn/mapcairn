// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyPage } from "./PrivacyPage";

/** The rendered markup with the build's class names removed, so only text, elements and attributes remain. */
function markup(container: HTMLElement): string {
  return container.innerHTML
    .replace(/ class="[^"]*"/g, "")
    .replace(/></g, ">\n<");
}

describe("PrivacyPage English markup", () => {
  it("renders the same text, headings, lists and links as before the text moved into the catalogue", async () => {
    const { container } = render(<PrivacyPage />);

    await expect(markup(container)).toMatchFileSnapshot(
      "./PrivacyPage.english.snap.html",
    );
  });
});
