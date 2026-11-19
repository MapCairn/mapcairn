// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ICONS } from "./appIcons";
import { ICON_MIRRORING } from "./iconMirroring";
import { mirroringFaults } from "./mirroringFaults";

/** The source files whose icons the decisions cover: the SDK's UI and the host, less the style guide's own list and tests. */
function sources(): { file: string; source: string }[] {
  const roots = [
    path.join(__dirname, "../../../map/src"),
    path.join(__dirname, ".."),
  ];
  return roots.flatMap((root) =>
    readdirSync(root, { recursive: true })
      .map(String)
      .filter(
        (file) =>
          /\.tsx$/.test(file) &&
          !/\.(test|spec)\.tsx$/.test(file) &&
          !file.endsWith("appIcons.ts"),
      )
      .map((file) => ({
        file: path.join(root, file),
        source: readFileSync(path.join(root, file), "utf8"),
      })),
  );
}

describe("ICON_MIRRORING", () => {
  it("decides every icon the app imports, and nothing else", () => {
    expect(Object.keys(ICON_MIRRORING).sort()).toEqual(
      Object.keys(APP_ICONS).sort(),
    );
  });

  it("gives a reason for each decision", () => {
    for (const [name, { reason }] of Object.entries(ICON_MIRRORING)) {
      expect(reason.trim(), name).not.toBe("");
    }
  });

  it("mirrors the icons that point along the reading direction", () => {
    const mirrored = Object.entries(ICON_MIRRORING)
      .filter(([, { decision }]) => decision === "mirrors")
      .map(([name]) => name);
    expect(mirrored.sort()).toEqual([
      "ArrowLeft",
      "ChevronLeft",
      "ChevronRight",
      "Redo2",
      "Undo2",
    ]);
  });

  it("is followed everywhere the code draws an icon", () => {
    const faults = sources().flatMap(({ file, source }) =>
      mirroringFaults(source, ICON_MIRRORING).map(
        (fault) => `${path.basename(file)}: ${fault}`,
      ),
    );
    expect(faults).toEqual([]);
  });
});

describe("mirroringFaults", () => {
  const table = {
    ChevronRight: { decision: "mirrors", reason: "Next." },
    Search: { decision: "fixed", reason: "Pictogram." },
  } as const;

  it("accepts an icon drawn as decided", () => {
    const source = `
      import { ChevronRight, Search } from "lucide-react";
      <Icon icon={ChevronRight} mirrorInRtl />;
      <IconButton label={t("x", {})} icon={Search} onClick={() => go(a > b)} />;`;
    expect(mirroringFaults(source, table)).toEqual([]);
  });

  it("reports a mirroring icon drawn without mirrorInRtl", () => {
    expect(
      mirroringFaults("<IconButton label={x} icon={ChevronRight} />", table),
    ).toEqual([expect.stringContaining("ChevronRight is drawn without")]);
  });

  it("reports a fixed icon drawn with mirrorInRtl", () => {
    expect(
      mirroringFaults("<Icon icon={Search} mirrorInRtl />", table),
    ).toEqual(["Search is fixed but drawn with mirrorInRtl"]);
  });

  it("reports a mirroring icon used where the check cannot see its props", () => {
    expect(
      mirroringFaults("const NEXT = ChevronRight; <Icon icon={NEXT} />", table),
    ).toEqual(["ChevronRight is used outside an icon component's props"]);
    expect(mirroringFaults("<ChevronRight />", table)).toEqual([
      "ChevronRight is used outside an icon component's props",
    ]);
  });

  it("lets a wrapper pass mirrorInRtl on without deciding", () => {
    expect(
      mirroringFaults(
        "<Icon icon={busy ? Search : ChevronRight} mirrorInRtl={flip} />",
        table,
      ),
    ).toEqual([]);
  });

  it("ignores an icon named only in an import or a comment", () => {
    const source = `import { ChevronRight } from "lucide-react";\n// ChevronRight\n/** ChevronRight */`;
    expect(mirroringFaults(source, table)).toEqual([]);
  });
});
