// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { remarkSdkVersion } from "./remarkSdkVersion";

describe("remarkSdkVersion", () => {
  it("replaces the token in text and inline code, at any depth", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: "Checked against %sdkVersion% and %sdkVersion%.",
            },
            { type: "inlineCode", value: "@mapcairn/sdk@%sdkVersion%" },
          ],
        },
      ],
    };
    remarkSdkVersion("0.1.0")()(tree);
    expect(JSON.stringify(tree)).toContain("Checked against 0.1.0 and 0.1.0.");
    expect(JSON.stringify(tree)).toContain("@mapcairn/sdk@0.1.0");
  });

  it("leaves code blocks alone, because their text is an example", () => {
    const tree = {
      type: "root",
      children: [{ type: "code", value: "%sdkVersion%" }],
    };
    remarkSdkVersion("0.1.0")()(tree);
    expect(tree.children[0]?.value).toBe("%sdkVersion%");
  });
});
