// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FileReport } from "./report.js";
import { formatSarif, SARIF_SCHEMA, toUri } from "./sarif.js";
import type { Finding, Rule } from "./types.js";
import { VERSION } from "./version.js";

const rule = (id: string, severity: Rule["severity"]): Rule => ({
  id,
  severity,
  confidence: "high",
  summary: `${id} summary`,
  fixable: id === "a",
  needsRegion: false,
  check: () => [],
});
const rules = [rule("a", "warning"), rule("b", "error")];

const finding = (
  ruleId: string,
  severity: Finding["severity"],
  at: string,
  data?: Finding["data"],
): Finding => ({
  ruleId,
  severity,
  confidence: "medium",
  path: at,
  message: "Message.",
  fixable: false,
  data,
});

function sarif(reports: FileReport[]) {
  return JSON.parse(formatSarif(reports, rules));
}

describe("formatSarif", () => {
  const reports: FileReport[] = [
    {
      file: "dir/my file.geojson",
      report: {
        findings: [
          finding("b", "error", "/features/1"),
          finding("a", "info", "", { n: 2 }),
        ],
        featureCount: 2,
        inputError: undefined,
      },
    },
  ];

  it("is a SARIF 2.1.0 log with one run for this tool", () => {
    const log = sarif(reports);
    expect(log.$schema).toBe(SARIF_SCHEMA);
    expect(log.version).toBe("2.1.0");
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0].tool.driver).toMatchObject({
      name: "geolint",
      version: VERSION,
    });
  });

  it("describes every rule with its default level and properties", () => {
    const described = sarif(reports).runs[0].tool.driver.rules;
    expect(described.map((entry: { id: string }) => entry.id)).toEqual([
      "a",
      "b",
    ]);
    expect(described[0]).toMatchObject({
      shortDescription: { text: "a summary" },
      defaultConfiguration: { level: "warning" },
      properties: { confidence: "high", fixable: true, needsRegion: false },
    });
  });

  it("maps findings to results with a logical location and the confidence", () => {
    const [first, second] = sarif(reports).runs[0].results;
    expect(first).toMatchObject({
      ruleId: "b",
      ruleIndex: 1,
      level: "error",
      message: { text: "Message." },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: "dir/my%20file.geojson" },
          },
          logicalLocations: [
            { fullyQualifiedName: "/features/1", kind: "member" },
          ],
        },
      ],
      properties: { confidence: "medium", fixable: false },
    });
    expect(second).toMatchObject({
      level: "note",
      locations: [{ logicalLocations: [{ fullyQualifiedName: "/" }] }],
      properties: { data: { n: 2 } },
    });
  });

  it("reports an unreadable input as a failed invocation", () => {
    const log = sarif([
      {
        file: "bad.geojson",
        report: {
          findings: [],
          featureCount: 0,
          inputError: { message: "Unexpected end", offset: 9 },
        },
      },
    ]);
    const invocation = log.runs[0].invocations[0];
    expect(invocation.executionSuccessful).toBe(false);
    expect(invocation.toolExecutionNotifications[0]).toMatchObject({
      level: "error",
    });
    expect(invocation.toolExecutionNotifications[0].message.text).toContain(
      "byte 9",
    );
  });

  it("reports success when every input was read", () => {
    expect(sarif(reports).runs[0].invocations[0].executionSuccessful).toBe(
      true,
    );
  });

  it("lists the artifacts", () => {
    expect(sarif(reports).runs[0].artifacts).toEqual([
      { location: { uri: "dir/my%20file.geojson" } },
    ]);
  });
});

describe("toUri", () => {
  it("uses forward slashes and encodes unsafe characters", () => {
    expect(toUri("a b/c#d.geojson")).toBe("a%20b/c%23d.geojson");
    expect(toUri(["win", "file.geojson"].join(String.fromCharCode(92)))).toBe(
      "win/file.geojson",
    );
  });

  it("names standard input", () => {
    expect(toUri("<stdin>")).toBe("stdin");
  });
});

describe("VERSION", () => {
  it("equals the version in package.json", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../package.json",
        ),
        "utf8",
      ),
    ) as { version: string };
    expect(VERSION).toBe(manifest.version);
  });
});
