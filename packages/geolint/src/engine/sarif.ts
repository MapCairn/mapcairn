// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import type { FileReport } from "./report.js";
import type { Finding, Rule, Severity } from "./types.js";
import { INFORMATION_URI, VERSION } from "./version.js";

/** The SARIF schema this output follows. */
export const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";

type SarifLevel = "error" | "warning" | "note";

const LEVELS: Readonly<Record<Severity, SarifLevel>> = {
  error: "error",
  warning: "warning",
  info: "note",
};

/** The name SARIF shows for standard input. */
const STDIN_URI = "stdin";

/** A Windows drive path after its slashes are normalised, such as `C:/data/x.geojson`. */
const DRIVE_PATH = /^[A-Za-z]:\//;

/**
 * A file name as a URI reference: forward slashes, with unsafe characters
 * percent-encoded. A Windows drive path becomes a `file:///C:/...` URI, because
 * a bare `C:` would read as a URI scheme and encoding the colon would lose the drive.
 */
export function toUri(file: string): string {
  if (file === "<stdin>") {
    return STDIN_URI;
  }
  const slashed = file.replaceAll("\\", "/");
  const encode = (path: string) =>
    path
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
  if (DRIVE_PATH.test(slashed)) {
    return `file:///${slashed.slice(0, 2)}${encode(slashed.slice(2))}`;
  }
  return encode(slashed);
}

/**
 * Findings have no line numbers, but code-scanning tools want a region, so every
 * result points at the first line; the real place is the logical location.
 */
const FIRST_LINE = 1;

function ruleDescriptor(rule: Rule) {
  return {
    id: rule.id,
    name: rule.id,
    shortDescription: { text: rule.summary },
    defaultConfiguration: { level: LEVELS[rule.severity] },
    properties: {
      confidence: rule.confidence,
      fixable: rule.fixable,
      needsRegion: rule.needsRegion,
    },
  };
}

function result(
  file: string,
  finding: Finding,
  ruleIndex: Map<string, number>,
) {
  return {
    ruleId: finding.ruleId,
    ruleIndex: ruleIndex.get(finding.ruleId),
    level: LEVELS[finding.severity],
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: toUri(file) },
          region: { startLine: FIRST_LINE },
        },
        logicalLocations: [
          {
            fullyQualifiedName: finding.path === "" ? "/" : finding.path,
            kind: "member",
          },
        ],
      },
    ],
    properties: {
      confidence: finding.confidence,
      fixable: finding.fixable,
      ...(finding.data === undefined ? {} : { data: finding.data }),
    },
  };
}

function notification({ file, report }: FileReport) {
  const error = report.inputError;
  if (error === undefined) {
    return [];
  }
  return [
    {
      level: "error" as const,
      message: {
        text: `Could not read past byte ${error.offset}: ${error.message}`,
      },
      locations: [
        { physicalLocation: { artifactLocation: { uri: toUri(file) } } },
      ],
    },
  ];
}

/**
 * SARIF 2.1.0 for the reports: one run, with the rules as the tool's rule
 * metadata, a result for each finding (the JSON pointer as a logical location,
 * the confidence as a property) and an error notification for each input that
 * could not be read. Severity `info` becomes the SARIF level `note`.
 */
export function formatSarif(
  reports: readonly FileReport[],
  rules: readonly Rule[],
): string {
  const ruleIndex = new Map(rules.map((rule, index) => [rule.id, index]));
  const notifications = reports.flatMap(notification);
  const log = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "geolint",
            version: VERSION,
            informationUri: INFORMATION_URI,
            rules: rules.map(ruleDescriptor),
          },
        },
        artifacts: reports.map(({ file }) => ({
          location: { uri: toUri(file) },
        })),
        results: reports.flatMap(({ file, report }) =>
          report.findings.map((finding) => result(file, finding, ruleIndex)),
        ),
        invocations: [
          {
            executionSuccessful: notifications.length === 0,
            toolExecutionNotifications: notifications,
          },
        ],
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
