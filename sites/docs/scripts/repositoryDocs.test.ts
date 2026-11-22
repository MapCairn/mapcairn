// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { sidebar } from "../sidebars";
import { sidebarDocIds } from "./docChecks";
import {
  REPOSITORY_DOCS,
  type RepositoryDoc,
  relinkRepositoryDoc,
  renderRepositoryDoc,
} from "./repositoryDocs";

const DOC: RepositoryDoc = {
  source: "ARCHITECTURE.md",
  output: "architecture.md",
  title: "Architecture",
  sidebarLabel: "Architecture",
  description: "The layers.",
  slug: "/architecture",
  intro: "This page is for a developer. By the end you will know the layers.",
};

const BLOB = "https://github.com/MapCairn/mapcairn/blob/main/";

describe("relinkRepositoryDoc", () => {
  it("points a link between the two documents at the other page", () => {
    expect(
      relinkRepositoryDoc("[a](DESIGN.md#tokens) [b](ARCHITECTURE.md)"),
    ).toBe("[a](design.md#tokens) [b](architecture.md)");
  });

  it("points a link to a file or folder of the repository at its page on the repository", () => {
    expect(
      relinkRepositoryDoc(
        "[a](packages/web/src/x.ts) [b](docs/plans/0017-documentation-site.md#top) [c](README.md)",
      ),
    ).toBe(
      `[a](${BLOB}packages/web/src/x.ts) [b](${BLOB}docs/plans/0017-documentation-site.md#top) [c](${BLOB}README.md)`,
    );
  });

  it("points a link to a guide on the site at the guide's page, whichever form it is written in", () => {
    expect(
      relinkRepositoryDoc(
        "[a](https://mapcairn.timothybrits.co.za/docs/guides/extending/#add-a-basemap)",
      ),
    ).toBe("[a](../guides/extending.md#add-a-basemap)");
  });

  it("leaves a link to another site, an anchor and code alone", () => {
    const text =
      "[a](https://example.org/x) [b](#top) `[c](packages/x.ts)` [d](mailto:x@example.org)";
    expect(relinkRepositoryDoc(text)).toBe(text);
  });

  it("leaves a link inside a fenced block alone", () => {
    const text = "```md\n[a](packages/x.ts)\n```\n";
    expect(relinkRepositoryDoc(text)).toBe(text);
  });
});

describe("renderRepositoryDoc", () => {
  const output = renderRepositoryDoc(
    "# Architecture\n\nBody [a](DESIGN.md).\n",
    DOC,
  );

  it("starts with the front matter the site needs", () => {
    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain("title: Architecture\n");
    expect(output).toContain("sidebar_label: Architecture\n");
    expect(output).toContain("description: The layers.\n");
    expect(output).toContain("slug: /architecture\n");
  });

  it("opens with what the page is for, where it is edited and the version line, under the document's own heading", () => {
    const afterHeading = output.slice(output.indexOf("# Architecture"));
    expect(afterHeading).toContain(DOC.intro);
    expect(afterHeading).toContain(`[ARCHITECTURE.md](${BLOB}ARCHITECTURE.md)`);
    expect(afterHeading).toContain("%sdkVersion%");
    expect(afterHeading.indexOf(DOC.intro)).toBeLessThan(
      afterHeading.indexOf("Body"),
    );
  });

  it("marks a ts block no-check, because it is repository documentation and not a site snippet", () => {
    const marked = renderRepositoryDoc(
      "# A\n\n```ts\nconst a = 1;\n```\n\n```tsx check\nconst b = 2;\n```\n\n```bash\nls\n```\n",
      DOC,
    );
    expect(marked).toContain("```ts no-check\nconst a = 1;");
    expect(marked).toContain("```tsx check\nconst b = 2;");
    expect(marked).toContain("```bash\nls");
  });

  it("relinks the body", () => {
    expect(output).toContain("Body [a](design.md).");
  });

  it("refuses a document that has no heading to put the opening under", () => {
    expect(() => renderRepositoryDoc("Body only.\n", DOC)).toThrow(
      /ARCHITECTURE\.md/,
    );
  });
});

describe("the documents rendered on the site", () => {
  it("name two files of the repository that exist and give each page a title and description", () => {
    expect(REPOSITORY_DOCS.map((doc) => doc.source)).toEqual([
      "ARCHITECTURE.md",
      "DESIGN.md",
    ]);
    for (const doc of REPOSITORY_DOCS) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.description.length).toBeGreaterThan(0);
      expect(doc.intro).toMatch(/^This page is for /);
    }
  });

  it("are in the sidebar, and no other generated page is", () => {
    const listed = sidebarDocIds(sidebar);
    for (const doc of REPOSITORY_DOCS) {
      expect(listed).toContain(`generated/${doc.output.replace(/\.md$/, "")}`);
    }
  });
});
