// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ApiExport } from "./extract";

/** What the grouping rules may know about an export beyond its own data. */
export interface GroupContext {
  /** The file the export is declared in, relative to the repository; empty when unknown. */
  readonly file: string;
  /** The names of the interfaces that are ports. */
  readonly ports: ReadonlySet<string>;
}

/** One group of the sidebar and of a package's overview. */
export interface GroupRule {
  readonly id: string;
  readonly title: string;
  /** Whether an export belongs to the group; the first group in `GROUPS` that says yes wins. */
  readonly matches: (item: ApiExport, context: GroupContext) => boolean;
}

function wordsIn(text: string): string[] {
  return text.match(/[A-Za-z_$][\w$]*/g) ?? [];
}

/** Whether an interface is a port: named `...Port`, or implemented by an exported class. */
export function isPort(
  item: ApiExport,
  implemented: ReadonlySet<string>,
): boolean {
  return (
    item.kind === "interface" &&
    (item.name.endsWith("Port") || implemented.has(item.name))
  );
}

/**
 * The names of the interfaces that are ports across every export given: those
 * named `...Port` and those a class implements (the fakes and the in-memory
 * adapters show them), found from the data and not from a list.
 */
export function portNames(exportsOf: readonly ApiExport[]): Set<string> {
  const implemented = new Set(
    exportsOf
      .filter((item) => item.kind === "class")
      .flatMap((item) => item.bases.map((base) => base.name)),
  );
  return new Set(
    exportsOf
      .filter((item) => isPort(item, implemented))
      .map((item) => item.name),
  );
}

function returnsPort(item: ApiExport, ports: ReadonlySet<string>): boolean {
  return wordsIn(item.returnType).some((word) => ports.has(word));
}

function implementsPort(item: ApiExport, ports: ReadonlySet<string>): boolean {
  return item.bases.some((base) => ports.has(base.name));
}

function fileName(file: string): string {
  return file.split("/").pop() ?? "";
}

/** Interfaces, type aliases and enums, and anything no other group claims. */
const TYPES_GROUP: GroupRule = {
  id: "types",
  title: "Types",
  matches: () => true,
};

/**
 * The groups, in the order they show. Adding a group is adding a rule here;
 * no page, sidebar or test lists a name.
 */
export const GROUPS: readonly GroupRule[] = [
  {
    id: "components",
    title: "Components",
    matches: (item) => item.kind === "function" && /^[A-Z]/.test(item.name),
  },
  {
    id: "hooks",
    title: "Hooks",
    matches: (item) => item.kind === "function" && /^use[A-Z]/.test(item.name),
  },
  {
    id: "ports",
    title: "Ports",
    matches: (item, { ports }) =>
      item.kind === "interface" && ports.has(item.name),
  },
  {
    id: "adapters",
    title: "Adapters",
    matches: (item, { ports }) =>
      (item.kind === "class" && implementsPort(item, ports)) ||
      (item.kind === "function" && returnsPort(item, ports)),
  },
  {
    id: "tokens",
    title: "Tokens",
    matches: (item, { file }) =>
      (item.kind === "variable" || item.kind === "namespace") &&
      (/tokens?$/i.test(item.name) ||
        item.name.toLowerCase().startsWith("token") ||
        fileName(file).toLowerCase().startsWith("token")),
  },
  {
    id: "functions",
    title: "Functions",
    matches: (item) => item.kind === "function",
  },
  {
    id: "classes",
    title: "Classes",
    matches: (item) => item.kind === "class",
  },
  {
    id: "constants",
    title: "Constants",
    matches: (item) => item.kind === "variable" || item.kind === "namespace",
  },
  TYPES_GROUP,
];

/**
 * The group an export belongs to.
 * @param item - The export.
 * @param context - Where it is declared and which interfaces are ports.
 */
export function groupOf(item: ApiExport, context: GroupContext): GroupRule {
  return GROUPS.find((group) => group.matches(item, context)) ?? TYPES_GROUP;
}
