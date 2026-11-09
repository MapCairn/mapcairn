import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scripts/verifyNoTestSeam.mjs",
);

const roots: string[] = [];

/** Makes a fake package whose build output holds the given files. */
function fakeBuild(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "karta-seam-"));
  roots.push(root);
  mkdirSync(join(root, "build/client/assets"), { recursive: true });
  mkdirSync(join(root, "build/server"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(root, "build", path), content);
  }
  return root;
}

function run(root: string, ...flags: string[]) {
  return spawnSync(process.execPath, [script, "--root", root, ...flags], {
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("verifyNoTestSeam", () => {
  it("passes for a build without the seam", () => {
    const root = fakeBuild({
      "client/assets/app.js": "console.log('hello')",
      "server/index.js": "export default {}",
    });
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("absent");
  });

  it("fails and names the file when the marker is in the client build", () => {
    const root = fakeBuild({
      "client/assets/app.js": 'console.info("KARTA_TEST_SEAM_MARKER")',
      "server/index.js": "export default {}",
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("KARTA_TEST_SEAM_MARKER");
    expect(result.stderr).toContain("app.js");
  });

  it("fails when the window property is in the server build", () => {
    const root = fakeBuild({
      "client/assets/app.js": "",
      "server/index.js": "window.__KARTA_TEST_SERVICES__",
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("__KARTA_TEST_SERVICES__");
  });

  it("cannot verify, and says so, when there is no build", () => {
    const root = mkdtempSync(join(tmpdir(), "karta-seam-"));
    roots.push(root);
    const result = run(root);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Run the build first");
  });

  it("fails when the design guide marker is in the server build", () => {
    const root = fakeBuild({
      "client/assets/app.js": "",
      "server/index.js": '"data-design-guide":"KARTA_DESIGN_GUIDE_MARKER"',
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("KARTA_DESIGN_GUIDE_MARKER");
    expect(result.stderr).toContain("index.js");
  });

  it("with --expect-present, passes when the seam and the design guide are both there", () => {
    const root = fakeBuild({
      "client/assets/app.js": "window.__KARTA_TEST_SERVICES__",
      "client/assets/design.js": '"KARTA_DESIGN_GUIDE_MARKER"',
    });
    const result = run(root, "--expect-present");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("test seam");
    expect(result.stdout).toContain("design guide");
  });

  it("with --expect-present, fails when the seam is missing", () => {
    const root = fakeBuild({
      "client/assets/design.js": '"KARTA_DESIGN_GUIDE_MARKER"',
    });
    const result = run(root, "--expect-present");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("test seam");
  });

  it("with --expect-present, fails when the design guide is missing", () => {
    const root = fakeBuild({
      "client/assets/app.js": "window.__KARTA_TEST_SERVICES__",
    });
    const result = run(root, "--expect-present");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("design guide");
  });
});
