// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  API_FILE,
  MACHINE_DATA_SCHEMA_VERSION,
  PAGES_FILE,
} from "./machineData";
import type { DocPage } from "./markdownCopies";

/** The parsed file, or `null` when it is missing or is not JSON. */
function readJson(build: string, name: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(readFileSync(join(build, name), "utf8"));
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The list a file holds under a key, empty when it holds none. */
function listOf(data: Record<string, unknown>, key: string): unknown[] {
  const value = data[key];
  return Array.isArray(value) ? value : [];
}

/** What is wrong with one data file: missing, without the schema version, or empty. */
function fileFindings(
  build: string,
  name: string,
  listKey: string,
  noun: string,
): { findings: string[]; list: unknown[] } {
  const data = readJson(build, name);
  if (data === null) {
    return {
      findings: [`${name} is missing or is not valid JSON.`],
      list: [],
    };
  }
  const findings: string[] = [];
  if (data.schemaVersion !== MACHINE_DATA_SCHEMA_VERSION) {
    findings.push(
      `${name} does not carry schemaVersion ${MACHINE_DATA_SCHEMA_VERSION}.`,
    );
  }
  const list = listOf(data, listKey);
  if (list.length === 0) {
    findings.push(`${name} holds no ${noun}.`);
  }
  return { findings, list };
}

/**
 * What is wrong with the machine-readable files of a build: `pages.json` or
 * `api.json` missing, empty or without the current `schemaVersion`, and a page
 * of the sidebar that `pages.json` does not list.
 * @param build - The build folder.
 * @param pages - Every page of the sidebar.
 * @param origin - The site's origin.
 * @param baseUrl - The base path, with both slashes.
 */
export function machineDataFindings(
  build: string,
  pages: readonly DocPage[],
  origin: string,
  baseUrl: string,
): string[] {
  const manifest = fileFindings(build, PAGES_FILE, "pages", "pages");
  const api = fileFindings(build, API_FILE, "entries", "entries");
  const listed = new Set(
    manifest.list.map((page) => (page as { url?: unknown }).url),
  );
  const unlisted = manifest.list.length === 0 ? [] : pages;
  return [
    ...manifest.findings,
    ...api.findings,
    ...unlisted
      .filter(
        (page) =>
          !listed.has(`${origin}${baseUrl.slice(0, -1)}${page.permalink}`),
      )
      .map(
        (page) =>
          `The page "${page.id}" is in the sidebar but not in ${PAGES_FILE}.`,
      ),
  ];
}
