// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  API_FILE,
  MACHINE_DATA_SCHEMA_VERSION,
  PAGES_FILE,
} from "./machineData";
import { machineDataFindings } from "./machineDataChecks";
import { parseDocSource } from "./markdownCopies";

const PAGES = [
  parseDocSource("a", "---\ntitle: A\ndescription: One.\n---\n\n# A\n"),
  parseDocSource("b", "---\ntitle: B\ndescription: Two.\n---\n\n# B\n"),
];

const URL_OF = (id: string): string => `https://x.test/docs/${id}/`;

function pagesFile(ids: string[], schemaVersion = MACHINE_DATA_SCHEMA_VERSION) {
  return {
    schemaVersion,
    packages: [],
    pages: ids.map((id) => ({ url: URL_OF(id) })),
  };
}

const API = {
  schemaVersion: MACHINE_DATA_SCHEMA_VERSION,
  packages: [],
  entries: [{ name: "go" }],
};

/** A build folder holding the given files, as JSON. */
function build(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "docs-machine-checks-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, name), JSON.stringify(content));
  }
  return root;
}

const ORIGIN = "https://x.test";
const BASE = "/docs/";

describe("machineDataFindings", () => {
  it("passes when both files are there and every page is in the manifest", () => {
    const root = build({
      [PAGES_FILE]: pagesFile(["a", "b"]),
      [API_FILE]: API,
    });
    expect(machineDataFindings(root, PAGES, ORIGIN, BASE)).toEqual([]);
  });

  it("reports a missing file", () => {
    const root = build({ [API_FILE]: API });
    expect(machineDataFindings(root, PAGES, ORIGIN, BASE)).toEqual([
      "pages.json is missing or is not valid JSON.",
    ]);
  });

  it("reports a file with nothing in it", () => {
    const root = build({
      [PAGES_FILE]: pagesFile([]),
      [API_FILE]: { ...API, entries: [] },
    });
    const findings = machineDataFindings(root, PAGES, ORIGIN, BASE);
    expect(findings).toContain("pages.json holds no pages.");
    expect(findings).toContain("api.json holds no entries.");
  });

  it("reports a file without the current schema version", () => {
    const root = build({
      [PAGES_FILE]: pagesFile(["a", "b"], 99),
      [API_FILE]: { ...API, schemaVersion: undefined },
    });
    const findings = machineDataFindings(root, PAGES, ORIGIN, BASE);
    expect(findings).toContain(
      `pages.json does not carry schemaVersion ${MACHINE_DATA_SCHEMA_VERSION}.`,
    );
    expect(findings).toContain(
      `api.json does not carry schemaVersion ${MACHINE_DATA_SCHEMA_VERSION}.`,
    );
  });

  it("reports a sidebar page that is not in the manifest", () => {
    const root = build({
      [PAGES_FILE]: pagesFile(["a"]),
      [API_FILE]: API,
    });
    expect(machineDataFindings(root, PAGES, ORIGIN, BASE)).toEqual([
      'The page "b" is in the sidebar but not in pages.json.',
    ]);
  });
});
