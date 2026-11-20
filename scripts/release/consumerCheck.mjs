// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Proves the four packed tarballs work for an app outside this repository:
 * they install, a plain Vite build resolves them and both stylesheets with no
 * vanilla-extract plugin, TypeScript resolves their types under `bundler`,
 * `node16` and `nodenext`, and the map chrome renders on a server.
 *
 *   npm run consumer:check
 *
 * Everything happens in a temporary folder outside the repository, which is
 * removed at the end. It installs from the registry, so it needs a network;
 * the repository's `.npmrc` (the seven-day minimum age) is copied there, and
 * the versions of third-party tools come from the root lockfile, which this
 * repository has already installed and tested.
 *
 * It starts no server: the page is rendered by calling the built render
 * function in Node.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { isolatedEnvironment, runNpm } from "./npm.mjs";
import { PACKAGES } from "./packCheck.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
/** Output a child may print before it is cut off, in bytes. */
const MAX_OUTPUT = 64 * 1024 * 1024;
const FIXTURE = path.join(REPO, "scripts", "release", "consumer");

/** What the fixture needs from the registry besides the four tarballs. */
export const LOCKED_TOOLS = [
  "react",
  "react-dom",
  "vite",
  "typescript",
  "@types/react",
  "@types/react-dom",
];

/**
 * How TypeScript is told to resolve the packages, one run each. `bundler` is
 * what Vite uses; the other two are what a Node-targeted project uses.
 */
export const TYPE_CHECKS = [
  {
    name: "bundler",
    flags: ["--module", "esnext", "--moduleResolution", "bundler"],
  },
  {
    name: "node16",
    flags: ["--module", "node16", "--moduleResolution", "node16"],
  },
  {
    name: "nodenext",
    flags: ["--module", "nodenext", "--moduleResolution", "nodenext"],
  },
];

/**
 * What the server-rendered chrome must hold: the map's landmark, the search
 * box, and the controls the end stack renders. Each is a name and a pattern.
 */
export const LANDMARKS = [
  { name: "the main landmark", pattern: /<main\b/ },
  { name: "the map region", pattern: /data-map-host=""/ },
  {
    name: "the search field",
    pattern: /<input\b[^>]*type="search"|role="combobox"/,
  },
  { name: "the zoom in button", pattern: /aria-label="Zoom in"/ },
  { name: "the attribution", pattern: /OpenStreetMap|Attribution/i },
];

/** Seven days, in the minutes pnpm counts a release age in. */
const PNPM_MINIMUM_RELEASE_AGE = 7 * 24 * 60;

/** The characters of a page a failure message shows. */
const EXCERPT = 1500;

/**
 * What the bare `MapChrome` and the providers around it render with every
 * slot empty: the landmark and the two live regions the announcer holds.
 */
export const CHROME_LANDMARKS = [
  LANDMARKS[0],
  {
    name: "the polite live region",
    pattern: /role="status"[^>]*aria-live="polite"/,
  },
  {
    name: "the assertive live region",
    pattern: /role="alert"[^>]*aria-live="assertive"/,
  },
];

/**
 * The locked version of a package in a root `package-lock.json`.
 *
 * @param {Record<string, any>} lock The parsed lockfile.
 * @param {string} name The package name.
 * @returns {string}
 */
export function lockedVersion(lock, name) {
  const version = lock.packages?.[`node_modules/${name}`]?.version;
  if (typeof version !== "string") {
    throw new Error(`${name} is not in the root lockfile.`);
  }
  return version;
}

/**
 * The consumer's `package.json`: the tarballs and the locked tools, and an
 * `overrides` entry for each SDK package, so a package that depends on
 * another one (none is on the registry yet) takes the tarball.
 *
 * @param {{ tarballs: Record<string, string>, versions: Record<string, string> }} input
 *   `tarballs` maps `core` to the tarball's file name in `../tarballs`.
 * @returns {Record<string, unknown>}
 */
export function consumerManifest({ tarballs, versions }) {
  /** @type {Record<string, string>} */
  const sdk = {};
  for (const [name, file] of Object.entries(tarballs)) {
    sdk[`@mapcairn/${name}`] = `file:../tarballs/${file}`;
  }
  const { typescript, vite, ...runtime } = versions;
  const types = Object.fromEntries(
    Object.entries(runtime).filter(([name]) => name.startsWith("@types/")),
  );
  const dependencies = Object.fromEntries(
    Object.entries(runtime).filter(([name]) => !name.startsWith("@types/")),
  );
  return {
    name: "mapcairn-throwaway-consumer",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: { ...sdk, ...dependencies },
    devDependencies: { ...types, typescript, vite },
    overrides: sdk,
  };
}

/**
 * The landmarks a rendered page lacks.
 *
 * @param {string} html The server-rendered markup.
 * @param {{ name: string, pattern: RegExp }[]} [landmarks] What it must hold.
 * @returns {string[]} The name of each missing landmark.
 */
export function missingLandmarks(html, landmarks = LANDMARKS) {
  return landmarks
    .filter(({ pattern }) => !pattern.test(html))
    .map(({ name }) => name);
}

/**
 * The custom properties `styles.css` reads that a component sets from script
 * (the sheet's offset, the chrome's measured boxes), so no stylesheet defines
 * them. They were read from the built `styles.css`; a new one is added here
 * when a component starts setting it. Every other name it reads is a generated
 * token, which `tokens.css` must define.
 */
export const SCRIPT_SET_PROPERTIES = [
  "--basemap-swatch",
  "--chrome-bearing",
  "--chrome-bottom-end-beside-room",
  "--chrome-bottom-end-centre-beside-room",
  "--chrome-bottom-end-centre-rise",
  "--chrome-bottom-end-centre-room",
  "--chrome-bottom-end-raise",
  "--chrome-bottom-end-rise",
  "--chrome-bottom-end-room",
  "--chrome-bottom-lift",
  "--chrome-bottom-start-raise",
  "--chrome-bottom-start-x",
  "--chrome-end-stack-max-height",
  "--chrome-end-stack-width",
  "--chrome-map-key-lift",
  "--chrome-map-key-raise",
  "--chrome-map-key-room",
  "--chrome-top-start-bottom",
  "--chrome-width",
  "--scale-max",
  "--scale-ratio",
  "--sheet-full-height",
  "--sheet-offset",
  "--slider-fill",
];

/**
 * The problems in the stylesheet a client build made from the two imports:
 * the dark theme of `tokens.css` is in it, `styles.css` reads custom
 * properties, and every generated property `styles.css` reads is one
 * `tokens.css` defines (the two sheets are built against the same names).
 *
 * @param {string} css The built stylesheet text, all files joined.
 * @returns {string[]}
 */
export function stylesheetProblems(css) {
  const problems = [];
  if (!/\[data-theme=["']?dark["']?\]/.test(css)) {
    problems.push("the built CSS has no dark theme block from tokens.css");
  }
  const defined = new Set(
    [...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
  );
  const used = [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(
    (match) => match[1],
  );
  if (used.length === 0) {
    problems.push("the built CSS has no component rule from styles.css");
  }
  for (const name of new Set(used)) {
    if (!(defined.has(name) || SCRIPT_SET_PROPERTIES.includes(name))) {
      problems.push(`the built CSS reads ${name}, which no sheet defines`);
    }
  }
  return problems;
}

/**
 * Runs a program with an argument array and no shell, and throws with its
 * output when it fails.
 *
 * @param {string} label What is being done, for the message.
 * @param {string[]} args The arguments for `node`.
 * @param {string} cwd Where to run it.
 * @returns {string} Its standard output.
 */
function runNode(label, args, cwd) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: isolatedEnvironment(),
    maxBuffer: MAX_OUTPUT,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

/** Packs the four packages into `destination` and names each tarball. */
function packTarballs(destination) {
  /** @type {Record<string, string>} */
  const tarballs = {};
  for (const name of PACKAGES) {
    const result = runNpm(
      ["pack", "--ignore-scripts", "--json", "--pack-destination", destination],
      { cwd: path.join(REPO, "packages", name) },
    );
    if (result.status !== 0) {
      throw new Error(`npm pack failed for ${name}:\n${result.stderr}`);
    }
    tarballs[name] = JSON.parse(result.stdout)[0].filename;
  }
  return tarballs;
}

/**
 * Copies the fixture to `app`, with the manifest and the repository's
 * `.npmrc` (so the same minimum release age applies there).
 */
function prepareApp(app, manifest) {
  cpSync(FIXTURE, app, {
    recursive: true,
    filter: (source) => !source.split(path.sep).includes("node_modules"),
  });
  writeFileSync(
    path.join(app, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  copyFileSync(path.join(REPO, ".npmrc"), path.join(app, ".npmrc"));
}

/** Installs with npm. `extra` adds flags, such as `--legacy-peer-deps`. */
function install(app, extra) {
  const result = runNpm(
    ["install", "--no-audit", "--no-fund", "--ignore-scripts", ...extra],
    { cwd: app },
  );
  if (result.status !== 0) {
    throw new Error(
      `npm install ${extra.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
}

/** Renders the chrome in plain Node, through the installed packages alone. */
function renderPlain(app) {
  const out = runNode("plain Node render", ["plain.mjs"], app);
  return JSON.parse(out);
}

/** All the CSS files below a folder, joined. */
function builtCss(folder) {
  return readdirSync(folder, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".css"))
    .map((file) => readFileSync(path.join(folder, file), "utf8"))
    .join("\n");
}

/**
 * The settings pnpm reads from `pnpm-workspace.yaml`: a missing peer
 * dependency fails the install, none is added automatically, a release must
 * be seven days old (pnpm counts the age in minutes), and an SDK package
 * resolves to its tarball, since none is on the registry yet.
 *
 * @param {Record<string, string>} overrides Package name to `file:` spec.
 * @returns {string}
 */
export function pnpmSettings(overrides) {
  const lines = Object.entries(overrides).map(
    ([name, spec]) => `  "${name}": "${spec}"`,
  );
  return [
    "strictPeerDependencies: true",
    "autoInstallPeers: false",
    `minimumReleaseAge: ${PNPM_MINIMUM_RELEASE_AGE}`,
    "overrides:",
    ...lines,
    "",
  ].join("\n");
}

/**
 * Installs with pnpm as strictly as pnpm goes (a missing peer fails it) and
 * renders with the result.
 *
 * @param {string} app The folder to install into.
 * @param {Record<string, string>} overrides The tarballs.
 * @returns {string} The line for the report.
 */
function checkPnpmStrict(app, overrides) {
  writeFileSync(path.join(app, "pnpm-workspace.yaml"), pnpmSettings(overrides));
  const result = runNpm(
    ["exec", "--no-install", "--", "pnpm", "install", "--ignore-scripts"],
    { cwd: app },
  );
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0) {
    throw new Error(`pnpm install failed:\n${output}`);
  }
  const missing = missingLandmarks(renderPlain(app).html, CHROME_LANDMARKS);
  if (missing.length > 0) {
    throw new Error(`pnpm render lacks: ${missing.join(", ")}`);
  }
  return "pnpm with strict peer dependencies and no automatic peers, and plain Node render: ok";
}

/**
 * The line for a skipped pnpm install. On GitHub Actions it is a warning
 * annotation, so a runner without pnpm shows up on the run's page; pnpm is
 * not installed here, because an unpinned install would bypass the release age.
 *
 * @param {NodeJS.ProcessEnv} [env] The environment to read.
 * @returns {string}
 */
export function pnpmSkipped(env = process.env) {
  const message =
    "the pnpm strict-peer install was skipped: pnpm is not available through `npm exec --no-install`";
  return env.GITHUB_ACTIONS === "true" ? `::warning::${message}` : message;
}

/**
 * Whether `npm exec --no-install pnpm` finds a pnpm that is already there.
 */
function pnpmAvailable(app) {
  return (
    runNpm(["exec", "--no-install", "--", "pnpm", "--version"], { cwd: app })
      .status === 0
  );
}

/**
 * Runs every check and returns one line for each.
 *
 * @returns {string[]} What was checked, and what was skipped and why.
 */
export function runConsumerCheck() {
  const report = [];
  const root = mkdtempSync(path.join(tmpdir(), "mapcairn-consumer-"));
  if (realpathSync(root).startsWith(realpathSync(REPO) + path.sep)) {
    throw new Error("The temporary folder is inside the repository.");
  }
  try {
    const tarballs = path.join(root, "tarballs");
    mkdirSync(tarballs);
    const packed = packTarballs(tarballs);
    report.push(`packed ${Object.keys(packed).length} tarballs`);

    const lock = JSON.parse(
      readFileSync(path.join(REPO, "package-lock.json"), "utf8"),
    );
    const versions = Object.fromEntries(
      LOCKED_TOOLS.map((name) => [name, lockedVersion(lock, name)]),
    );
    const manifest = consumerManifest({ tarballs: packed, versions });

    const app = path.join(root, "app");
    prepareApp(app, manifest);
    install(app, []);
    report.push("npm install: ok");

    const plain = renderPlain(app);
    const missing = missingLandmarks(plain.html, CHROME_LANDMARKS);
    if (missing.length > 0) {
      throw new Error(
        `Plain Node render lacks: ${missing.join(", ")}\n${plain.html.slice(0, EXCERPT)}`,
      );
    }
    report.push("plain Node render of the chrome (no bundler): ok");

    const tsc = path.join(app, "node_modules", "typescript", "bin", "tsc");
    for (const { name, flags } of TYPE_CHECKS) {
      runNode(`tsc (${name})`, [tsc, "-p", "tsconfig.json", ...flags], app);
      report.push(`tsc moduleResolution ${name}: ok`);
    }

    const vite = path.join(app, "node_modules", "vite", "bin", "vite.js");
    runNode(
      "vite build (client)",
      [vite, "build", "--outDir", "dist/client"],
      app,
    );
    runNode(
      "vite build (server)",
      [
        vite,
        "build",
        "--ssr",
        "src/entryServer.tsx",
        "--outDir",
        "dist/server",
      ],
      app,
    );
    const cssProblems = stylesheetProblems(
      builtCss(path.join(app, "dist", "client")),
    );
    if (cssProblems.length > 0) {
      throw new Error(cssProblems.join("\n"));
    }
    report.push("vite build with no plugins, both stylesheets built in: ok");

    const bundled = runNode(
      "render the built server bundle",
      [
        "--input-type=module",
        "--eval",
        'const { render } = await import("./dist/server/entryServer.js"); process.stdout.write(JSON.stringify(render()));',
      ],
      app,
    );
    const rendered = JSON.parse(bundled);
    const absent = missingLandmarks(rendered.html);
    if (absent.length > 0) {
      throw new Error(
        `The server bundle's page lacks: ${absent.join(", ")}\n${rendered.html.slice(0, EXCERPT)}`,
      );
    }
    report.push("server render of the chrome from the bundle: ok");

    const legacy = path.join(root, "legacy");
    prepareApp(legacy, manifest);
    install(legacy, ["--legacy-peer-deps"]);
    const legacyMissing = missingLandmarks(
      renderPlain(legacy).html,
      CHROME_LANDMARKS,
    );
    if (legacyMissing.length > 0) {
      throw new Error(
        `--legacy-peer-deps render lacks: ${legacyMissing.join(", ")}`,
      );
    }
    report.push("npm install --legacy-peer-deps and plain Node render: ok");

    if (pnpmAvailable(app)) {
      const strict = path.join(root, "strict");
      prepareApp(strict, manifest);
      report.push(checkPnpmStrict(strict, manifest.overrides));
    } else {
      report.push(pnpmSkipped());
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return report;
}

if (isEntryPoint(import.meta.url)) {
  try {
    for (const line of runConsumerCheck()) {
      console.log(line);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
