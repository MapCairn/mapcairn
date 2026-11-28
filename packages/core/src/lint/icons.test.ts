// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeNotices } from "../../../../scripts/bundleLicences.mjs";
import {
  buildIcons,
  ICON_MODULE,
  iconModuleSource,
  iconStep,
  parseIconSvg,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/icons.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const MAP = path.join(REPO, "packages/map");

const allowlist = JSON.parse(
  readFileSync(path.join(REPO, "scripts/sdkLicences.allowlist.json"), "utf8"),
);

const svg = (inside: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor">${inside}</svg>`;

describe("parseIconSvg", () => {
  it("reads the view box and the path", () => {
    expect(parseIconSvg(svg('<path d="M1,2L3,4Z"/>'), "check")).toEqual({
      viewBox: "0 0 256 256",
      path: "M1,2L3,4Z",
    });
  });

  it.each([
    ["a second path", '<path d="M1"/><path d="M2"/>'],
    ["another element", '<circle r="4"/>'],
    ["an attribute besides d", '<path d="M1" opacity="0.2"/>'],
    ["a path with nothing in it", '<path d=""/>'],
    ["a quote that could end the generated string", "<path d='M1\"'/>"],
  ])("refuses %s, which it would otherwise drop or mangle", (_case, inside) => {
    expect(() => parseIconSvg(svg(inside), "heart")).toThrow(/heart/);
  });
});

describe("iconModuleSource", () => {
  it("writes one constant for each icon, named from the file's name", () => {
    const source = iconModuleSource(["arrow-up"], () =>
      svg('<path d="M1,2Z"/>'),
    );

    expect(source).toContain("export const ARROW_UP_ICON = {");
    expect(source).toContain('viewBox: "0 0 256 256",');
    expect(source).toContain('path: "M1,2Z",');
    expect(source.startsWith("// SPDX-License-Identifier: AGPL-3.0-only")).toBe(
      true,
    );
  });
});

describe("the map package's icons", () => {
  it("are the ones the development dependency draws", () => {
    // `npm run icons:write` writes the module again.
    expect(readFileSync(path.join(MAP, ICON_MODULE), "utf8")).toBe(
      iconStep(MAP, allowlist).module,
    );
  });

  it("come with the icon package's licence in a notices file the tarball holds", () => {
    const { notices } = iconStep(MAP, allowlist);

    expect(notices).toContain("## @phosphor-icons/core 2.");
    expect(notices).toContain("Licence: MIT");
    expect(notices).toContain("Phosphor Icons");
    expect(notices).toContain("Permission is hereby granted");
    expect(
      JSON.parse(readFileSync(path.join(MAP, "package.json"), "utf8")).files,
    ).toContain("THIRD-PARTY-NOTICES.md");
    expect(readFileSync(path.join(REPO, ".gitignore"), "utf8")).toContain(
      "packages/map/THIRD-PARTY-NOTICES.md",
    );
  });

  it("are copied from a development dependency only", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(MAP, "package.json"), "utf8"),
    );

    expect(manifest.devDependencies).toHaveProperty(["@phosphor-icons/core"]);
    expect(manifest.dependencies).not.toHaveProperty(["@phosphor-icons/core"]);
  });
});

describe("the icon step in a package build", () => {
  let folder = "";

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), "icon-build-"));
    mkdirSync(path.join(folder, "node_modules/icon-set/assets/regular"), {
      recursive: true,
    });
    mkdirSync(path.join(folder, "src/lit"), { recursive: true });
    writeFileSync(
      path.join(folder, "node_modules/icon-set/package.json"),
      JSON.stringify({ name: "icon-set", version: "1.0.0", license: "MIT" }),
    );
    writeFileSync(
      path.join(folder, "node_modules/icon-set/LICENSE"),
      "ICON LICENCE",
    );
    writeFileSync(
      path.join(folder, "node_modules/icon-set/assets/regular/check.svg"),
      svg('<path d="M1,2Z"/>'),
    );
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  const manifest = (mapcairn: unknown) =>
    writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify({ name: "@mapcairn/example", mapcairn }),
    );
  const icons = { icons: { from: "icon-set", names: ["check"] } };
  const notices = () => path.join(folder, "NOTICES.md");

  it("writes the notices when the committed module is what the dependency draws", () => {
    manifest(icons);
    writeFileSync(
      path.join(folder, ICON_MODULE),
      iconStep(folder, allowlist).module,
    );

    buildIcons(folder, "NOTICES.md");

    expect(readFileSync(notices(), "utf8")).toContain("ICON LICENCE");
  });

  it.each([
    ["there is no module", undefined],
    ["the module has fallen behind", "// an older drawing\n"],
  ])("fails, and writes no notices, when %s", (_case, committed) => {
    manifest(icons);
    if (committed !== undefined) {
      writeFileSync(path.join(folder, ICON_MODULE), committed);
    }

    expect(() => buildIcons(folder, "NOTICES.md")).toThrow(
      "Run npm run icons:write",
    );
    expect(existsSync(notices())).toBe(false);
  });

  it("leaves a package that copies no icon alone", () => {
    manifest(undefined);

    buildIcons(folder, "NOTICES.md");

    expect(existsSync(notices())).toBe(false);
    expect(() => iconStep(folder, allowlist)).toThrow("names no icons");
  });

  it("fails naming a dependency that is not installed", () => {
    manifest({ icons: { from: "no-such-icons", names: ["check"] } });

    expect(() => iconStep(folder, allowlist)).toThrow(
      "no-such-icons, which draws the icons, is not installed.",
    );
  });
});

describe("a bundle that holds a package's copied icons", () => {
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "icon-notices-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function put(file: string, text: string): string {
    const full = path.join(root, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
    return full;
  }

  it("names the icon package, which no module of the bundle comes from", () => {
    put(
      "node_modules/icon-set/package.json",
      JSON.stringify({ name: "icon-set", version: "1.0.0", license: "MIT" }),
    );
    put("node_modules/icon-set/LICENSE", "ICON LICENCE");
    put(
      "packages/map/package.json",
      JSON.stringify({
        name: "@mapcairn/map",
        mapcairn: { icons: { from: "icon-set", names: ["check"] } },
      }),
    );
    const module = put(`packages/map/dist/lit/icons.generated.js`, "");

    writeNotices({
      moduleIds: [module],
      embeddedFolders: [],
      allowlist,
      file: path.join(root, "NOTICES.md"),
    });

    expect(readFileSync(path.join(root, "NOTICES.md"), "utf8")).toContain(
      "ICON LICENCE",
    );
  });
});
