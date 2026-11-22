// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { posix } from "node:path";
import type { SidebarEntry } from "../docChecks";
import { GROUPS, type GroupContext, groupOf, portNames } from "./classify";
import type { ApiExport } from "./extract";
import { codeSpan } from "./markdown";
import {
  firstSentence,
  type OverviewSection,
  type PageLink,
  renderExportPage,
  renderOverview,
} from "./render";
import { allocateSlugs } from "./slugs";
import type { SourceLocation } from "./sourceLinks";

/** The folder under `docs/` that holds the catalogue. */
export const API_FOLDER = "api";

/** The text a link to an export starts with until its page is known. */
export const LINK_MARKER = "api-link:";

/** One entry point of a package: what a host imports from, and what it exports. */
export interface ModuleInput {
  /** The import specifier, such as `@mapcairn/core/contracts`. */
  readonly specifier: string;
  readonly exports: readonly ApiExport[];
  /** The specifiers this entry point re-exports with `export *`, for a package that holds no code of its own. */
  readonly reExports: readonly string[];
  /** Where each export is declared, by name. */
  readonly sources: ReadonlyMap<string, SourceLocation>;
}

/** One package of the catalogue. */
export interface PackageInput {
  /** The folder name under `packages/`, such as `core`. */
  readonly dirName: string;
  /** The package name, such as `@mapcairn/core`. */
  readonly name: string;
  readonly version: string;
  readonly description: string;
  /** The entry points, the first being the package's main one. */
  readonly modules: readonly ModuleInput[];
}

/** One export as data, for `api.json`: the facts its page shows, with no markup. */
export interface ApiEntry {
  /** The package name, such as `@mapcairn/core`. */
  readonly package: string;
  /** The import specifier of the entry point, such as `@mapcairn/core/contracts`. */
  readonly entryPoint: string;
  readonly name: string;
  readonly kind: ApiExport["kind"];
  /** The id of the group the reference puts it in, such as `hooks`. */
  readonly group: string;
  readonly signature: string;
  /** The first sentence of the description, as plain text. */
  readonly summary: string;
  /** The version the comment says it was added in, or an empty string. */
  readonly since: string;
  /** The deprecation notice, or an empty string. */
  readonly deprecated: string;
  /** The page's path under the reference folder, without an extension, such as `core/useThing`. */
  readonly page: string;
  /** Where the declaration is in the repository, or `null` when it is not known. */
  readonly sourceUrl: string | null;
}

/** What building the catalogue gives. */
export interface Catalogue {
  /** Every export as data, in the order of the packages and their entry points. */
  readonly entries: readonly ApiEntry[];
  /** The pages, by path relative to the catalogue folder, such as `core/parseCoordinates.md`. */
  readonly files: ReadonlyMap<string, string>;
  /** The sidebar entry for the whole reference. */
  readonly sidebar: SidebarEntry;
  /** An export with no description, as `name (specifier)`. */
  readonly undocumented: readonly string[];
}

/**
 * Stops the build, naming each export, when any has no description: a page
 * that says nothing about its export is a gap in the reference, and the fix is
 * a TSDoc summary above the export.
 * @param catalogue - The built catalogue.
 */
export function requireDescriptions(catalogue: Catalogue): void {
  if (catalogue.undocumented.length === 0) {
    return;
  }
  const names = catalogue.undocumented.map((name) => `  ${name}`).join("\n");
  throw new Error(
    `These exports have no description. Add a TSDoc summary above each:\n${names}`,
  );
}

interface PlacedExport {
  readonly item: ApiExport;
  readonly module: ModuleInput;
  readonly path: string;
  readonly group: string;
  readonly summary: string;
}

interface PlacedModule {
  readonly pkg: PackageInput;
  readonly module: ModuleInput;
  readonly folder: string;
  readonly overviewPath: string;
  readonly placed: readonly PlacedExport[];
  /** Whether the entry point has an overview page of its own. */
  readonly hasPage: boolean;
}

/** The first line of a source comment, used when the API model has none. */
function describedAt(item: ApiExport, module: ModuleInput): string {
  return item.summary !== ""
    ? item.summary
    : (module.sources.get(item.name)?.comment ?? "");
}

function folderOf(pkg: PackageInput, module: ModuleInput): string {
  return `${pkg.dirName}${module.specifier.slice(pkg.name.length)}`;
}

function placeModules(packages: readonly PackageInput[]): PlacedModule[] {
  const allExports = packages.flatMap((pkg) =>
    pkg.modules.flatMap((module) => module.exports),
  );
  const ports = portNames(allExports);
  return packages.flatMap((pkg) =>
    pkg.modules.map((module, index) => {
      const folder = folderOf(pkg, module);
      const hasPage = index === 0 || module.exports.length > 0;
      const subfolders = new Set(
        pkg.modules.map(
          (other) =>
            folderOf(pkg, other)
              .slice(pkg.dirName.length + 1)
              .split("/")[0] ?? "",
        ),
      );
      const slugs = allocateSlugs(
        module.exports.map((item) => ({ name: item.name, kind: item.kind })),
        new Set(["index", ...subfolders]),
      );
      const placed = module.exports.map((item, position) => {
        const context: GroupContext = {
          file: module.sources.get(item.name)?.file ?? "",
          ports,
        };
        return {
          item,
          module,
          path: `${folder}/${slugs[position]}.md`,
          group: groupOf(item, context).id,
          summary: describedAt(item, module),
        };
      });
      return {
        pkg,
        module,
        folder,
        overviewPath: `${folder}/index.md`,
        placed,
        hasPage,
      };
    }),
  );
}

function hrefFrom(fromPath: string, toPath: string): string {
  const relative = posix.relative(posix.dirname(fromPath), toPath);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function sourceLink(
  location: SourceLocation | undefined,
  repositoryUrl: string,
): PageLink | undefined {
  if (!location) {
    return undefined;
  }
  return {
    label: `${location.file}:${location.line}`,
    href: `${repositoryUrl}/blob/main/${location.file}#L${location.line}`,
  };
}

/** Replaces the link markers in a page with addresses relative to it. */
function resolveMarkers(
  markdown: string,
  fromPath: string,
  find: (name: string) => string | undefined,
): string {
  return markdown.replace(
    /\[([^\]]*)\]\(api-link:([^)\s]+)\)/g,
    (_all, label: string, name: string) => {
      const target = find(name);
      if (target === undefined) {
        return label.startsWith("`") ? label : codeSpan(label);
      }
      return `[${label}](${hrefFrom(fromPath, target)})`;
    },
  );
}

function entryOf(
  pkg: PackageInput,
  module: ModuleInput,
  entry: PlacedExport,
  source: PageLink | undefined,
): ApiEntry {
  return {
    package: pkg.name,
    entryPoint: module.specifier,
    name: entry.item.name,
    kind: entry.item.kind,
    group: entry.group,
    signature: entry.item.signature,
    summary: firstSentence(entry.summary),
    since: entry.item.since,
    deprecated: entry.item.deprecated,
    page: entry.path.slice(0, -".md".length),
    sourceUrl: source?.href ?? null,
  };
}

function sidebarGroups(placed: readonly PlacedExport[]): SidebarEntry[] {
  return GROUPS.flatMap((group) => {
    const ids = placed
      .filter((entry) => entry.group === group.id)
      .map((entry) => `${API_FOLDER}/${entry.path.slice(0, -".md".length)}`);
    return ids.length === 0
      ? []
      : [{ type: "category" as const, label: group.title, items: ids }];
  });
}

function overviewSections(
  placed: readonly PlacedExport[],
  overviewPath: string,
): OverviewSection[] {
  return GROUPS.flatMap((group) => {
    const entries = placed
      .filter((entry) => entry.group === group.id)
      .map((entry) => ({
        name: entry.item.name,
        href: hrefFrom(overviewPath, entry.path),
        summary: firstSentence(entry.summary),
      }));
    return entries.length === 0 ? [] : [{ title: group.title, entries }];
  });
}

/**
 * Builds the API catalogue from what was extracted: a page for every export, an
 * overview for every package and entry point, one for the whole reference, and
 * the sidebar, grouped by what each export is (components, hooks, ports,
 * adapters, tokens, functions, classes, constants and types). Nothing is listed
 * by hand: the groups come from `GROUPS`, the pages from the data.
 * @param packages - The packages, in the order the reference lists them.
 * @param repositoryUrl - The repository's address, for links to the source.
 */
export function buildCatalogue(
  packages: readonly PackageInput[],
  repositoryUrl: string,
): Catalogue {
  const modules = placeModules(packages);
  const files = new Map<string, string>();
  const byName = new Map<string, string>();
  const byQualifiedName = new Map<string, string>();
  const overviewBySpecifier = new Map<string, string>();
  for (const { module, overviewPath, hasPage, placed } of modules) {
    if (hasPage) {
      overviewBySpecifier.set(module.specifier, overviewPath);
    }
    for (const entry of placed) {
      byName.set(entry.item.name, byName.get(entry.item.name) ?? entry.path);
      const key = `${entry.item.packageName}!${entry.item.name}`;
      byQualifiedName.set(key, byQualifiedName.get(key) ?? entry.path);
    }
  }
  const undocumented: string[] = [];
  const entries: ApiEntry[] = [];

  for (const { pkg, module, placed } of modules) {
    for (const entry of placed) {
      if (entry.summary === "") {
        undocumented.push(`${entry.item.name} (${module.specifier})`);
      }
      const related = [...entry.item.bases, ...entry.item.references]
        .filter(
          (ref, index, all) =>
            all.findIndex((other) => other.name === ref.name) === index,
        )
        .filter((ref) => ref.name !== entry.item.name)
        .flatMap((ref) => {
          const target = byQualifiedName.get(`${ref.packageName}!${ref.name}`);
          return target === undefined
            ? []
            : [{ label: ref.name, href: hrefFrom(entry.path, target) }];
        });
      const source = sourceLink(
        module.sources.get(entry.item.name),
        repositoryUrl,
      );
      entries.push(entryOf(pkg, module, entry, source));
      const page = renderExportPage({
        item: { ...entry.item, summary: entry.summary },
        specifier: module.specifier,
        version: pkg.version,
        source,
        related,
      });
      files.set(
        entry.path,
        resolveMarkers(page, entry.path, (name) => byName.get(name)),
      );
    }
  }

  const sidebarPackages: SidebarEntry[] = [];
  const packageOverviews: {
    name: string;
    description: string;
    path: string;
  }[] = [];
  for (const pkg of packages) {
    const own = modules.filter((entry) => entry.pkg === pkg);
    const [main, ...others] = own;
    if (main === undefined) {
      continue;
    }
    const entryPoints = own.map((entry) => {
      const target = overviewBySpecifier.get(entry.module.specifier);
      const reExported = entry.module.reExports.map((specifier) => {
        const path = overviewBySpecifier.get(specifier);
        return path === undefined
          ? codeSpan(specifier)
          : `[${codeSpan(specifier)}](${hrefFrom(main.overviewPath, path)})`;
      });
      const label =
        target === undefined || entry === main
          ? codeSpan(entry.module.specifier)
          : `[${codeSpan(entry.module.specifier)}](${hrefFrom(main.overviewPath, target)})`;
      return reExported.length === 0
        ? `- ${label}`
        : `- ${label} re-exports ${reExported.join(", ")}`;
    });
    const intro =
      own.length > 1 || main.module.reExports.length > 0
        ? ["## Entry points", entryPoints.join("\n")]
        : [];
    files.set(
      main.overviewPath,
      resolveMarkers(
        renderOverview({
          title: pkg.name,
          description: `${pkg.description}.`.replace(/\.\.$/, "."),
          facts: `Checked against version ${pkg.version}. Install it with ${codeSpan(`npm install ${pkg.name}`)}; ${main.module.exports.length === 0 ? "its entry points are listed below" : `import from ${codeSpan(main.module.specifier)}`}.`,
          intro,
          sections: overviewSections(main.placed, main.overviewPath),
        }),
        main.overviewPath,
        (name) => byName.get(name),
      ),
    );
    packageOverviews.push({
      name: pkg.name,
      description: pkg.description,
      path: main.overviewPath,
    });
    const items: SidebarEntry[] = [...sidebarGroups(main.placed)];
    for (const entry of others.filter((other) => other.hasPage)) {
      files.set(
        entry.overviewPath,
        renderOverview({
          title: entry.module.specifier,
          description: `The ${codeSpan(entry.module.specifier)} entry point of ${pkg.name}.`,
          facts: `Checked against version ${pkg.version}. Import from ${codeSpan(entry.module.specifier)}.`,
          intro: [],
          sections: overviewSections(entry.placed, entry.overviewPath),
        }),
      );
      items.push({
        type: "category",
        label: entry.module.specifier,
        link: { type: "doc", id: `${API_FOLDER}/${entry.folder}/index` },
        items: sidebarGroups(entry.placed),
      });
    }
    const id = `${API_FOLDER}/${main.folder}/index`;
    sidebarPackages.push(
      items.length === 0
        ? { type: "doc", id }
        : {
            type: "category",
            label: pkg.name,
            link: { type: "doc", id },
            items,
          },
    );
  }

  files.set(
    "index.md",
    renderOverview({
      title: "API reference",
      description:
        "Every export of the MapCairn SDK packages, one page each, generated from the packages' TSDoc comments.",
      facts:
        "The pages are generated at build time from the same API Extractor model that checks the public API, so they describe what is published.",
      intro: [],
      sections: [
        {
          title: "Packages",
          entries: packageOverviews.map((entry) => ({
            name: entry.name,
            href: hrefFrom("index.md", entry.path),
            summary: firstSentence(entry.description),
          })),
        },
      ],
    }),
  );
  return {
    entries,
    files,
    sidebar: {
      type: "category",
      label: "API reference",
      link: { type: "doc", id: `${API_FOLDER}/index` },
      items: sidebarPackages,
    },
    undocumented,
  };
}
