// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Proves the packed tarballs work for an app outside this repository: they
 * install, a plain Vite build resolves them and both stylesheets with no
 * vanilla-extract plugin, TypeScript resolves their types under `bundler`,
 * `node16` and `nodenext`, and the map chrome renders on a server. It does so
 * for an app that lists the four packages the umbrella re-exports, and again
 * for an app that lists only the umbrella (`@mapcairn/sdk`), with its
 * declaration-merging case and a strict pnpm install, and for an app that
 * lists the umbrella and some of the four at one version, which must render
 * with one copy of each.
 *
 *   npm run consumer:check
 *
 * With `{ published: <version> }` (`verifyPublished.mjs`) it installs that
 * version of the packages from the registry instead, exempting only the SDK
 * packages from the minimum release age, and audits the signatures.
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
  existsSync,
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
import { SDK_PACKAGES, UMBRELLA_PACKAGE } from "../sdkPackages.mjs";
import {
  bunSettings,
  bunSkipped,
  bunVersionProblem,
  corepackCliPath,
  INSTALL_TIMEOUT,
  miniflareAvailable,
  publishedLegSkip,
  WORKERD_TIMEOUT,
  workerdSkipped,
  yarnManifest,
  yarnSettings,
  yarnSkipped,
} from "./consumerLegs.mjs";
import { isolatedEnvironment, runNpm } from "./npm.mjs";
import { findTarballs, PACKAGES } from "./packCheck.mjs";
import { SDK_NAMES } from "./workspaces.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
/** Output a child may print before it is cut off, in bytes. */
const MAX_OUTPUT = 64 * 1024 * 1024;
const FIXTURE = path.join(REPO, "scripts", "release", "consumer");

/** The folder of the files the app that mixes the umbrella with direct dependencies adds. */
const MIXED_FIXTURE = path.join(REPO, "scripts", "release", "consumer-mixed");

/** What the fixture needs from the registry besides the SDK tarballs. */
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
 * @param {{ tarballs: Record<string, string>, versions: Record<string, string>, direct?: string[] }} input
 *   `tarballs` maps `core` to the tarball's file name in `../tarballs`.
 *   `direct` names the packages the app lists as dependencies, by folder name;
 *   without it every package with a tarball is listed. Every package is
 *   overridden either way.
 * @returns {Record<string, unknown>}
 */
export function consumerManifest({ tarballs, versions, direct }) {
  /** @type {Record<string, string>} */
  const sdk = {};
  for (const [name, file] of Object.entries(tarballs)) {
    sdk[`@mapcairn/${name}`] = `file:../tarballs/${file}`;
  }
  for (const name of direct ?? []) {
    if (!(`@mapcairn/${name}` in sdk)) {
      throw new Error(
        `There is no tarball for ${name}, so the app cannot list it.`,
      );
    }
  }
  const listed = Object.fromEntries(
    Object.entries(sdk).filter(
      ([name]) =>
        direct === undefined ||
        direct.includes(name.slice("@mapcairn/".length)),
    ),
  );
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
    dependencies: { ...listed, ...dependencies },
    devDependencies: { ...types, typescript, vite },
    overrides: sdk,
  };
}

/**
 * npm's options that exempt the four SDK packages, and nothing else, from the
 * repository's minimum release age, so a version published a moment ago can be
 * installed to check it. Third-party packages keep the rule.
 */
export const RELEASE_AGE_EXCLUSIONS = SDK_NAMES.map(
  (name) => `--min-release-age-exclude=${name}`,
);

/**
 * The npm options for an install: the minimum release age is lifted for the
 * four SDK packages only when a published version is installed, so every
 * other install keeps the repository's rule.
 *
 * @param {{ published: string | null, extra?: string[] }} input `extra` are options that apply either way.
 * @returns {string[]}
 */
export function installFlags({ published, extra = [] }) {
  return [...extra, ...(published === null ? [] : RELEASE_AGE_EXCLUSIONS)];
}

/**
 * The consumer's `package.json` for the published packages: the exact
 * version of each SDK package from the registry, and the locked tools. There
 * is no tarball and no override, so the registry copy is what gets installed.
 *
 * @param {{ version: string, versions: Record<string, string>, direct?: string[] }} input
 *   `direct` names the packages the app lists, by folder name; without it every SDK package.
 * @returns {Record<string, unknown>}
 */
export function publishedManifest({ version, versions, direct }) {
  const manifest = consumerManifest({ tarballs: {}, versions });
  const sdk = Object.fromEntries(
    SDK_NAMES.filter(
      (name) =>
        direct === undefined ||
        direct.includes(name.slice("@mapcairn/".length)),
    ).map((name) => [name, version]),
  );
  return {
    ...manifest,
    dependencies: { ...sdk, ...(manifest.dependencies ?? {}) },
    overrides: undefined,
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
 * The app's source as an app that lists only the umbrella would write it:
 * every import of the other SDK packages names the umbrella, the contracts
 * entry point is its subpath, the two stylesheets are the one it ships, and a
 * declaration merged into `core` is merged into the umbrella.
 *
 * @param {string} source The text of a `.ts`, `.tsx` or `.mjs` file of the app.
 * @returns {string}
 */
export function umbrellaSource(source) {
  const others = SDK_PACKAGES.filter((name) => name !== UMBRELLA_PACKAGE).join(
    "|",
  );
  return source
    .replace(/^import "@mapcairn\/map\/styles\.css";\n/gm, "")
    .replace(
      /"@mapcairn\/theme\/tokens\.css"/g,
      `"@mapcairn/${UMBRELLA_PACKAGE}/styles.css"`,
    )
    .replace(
      /"@mapcairn\/core\/contracts"/g,
      `"@mapcairn/${UMBRELLA_PACKAGE}/core/contracts"`,
    )
    .replace(
      new RegExp(`"@mapcairn/(?:${others})"`, "g"),
      `"@mapcairn/${UMBRELLA_PACKAGE}"`,
    );
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
  "--chrome-popover-centre-rise",
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

/** The layer the fixture's `reset.css` puts an app's base styles in. */
export const RESET_LAYER = "reset";

/**
 * The text of a CSS block, from just after its opening brace to the matching
 * closing one.
 *
 * @param {string} css The stylesheet text.
 * @param {number} start The index just after the opening brace.
 * @returns {string}
 */
function blockBody(css, start) {
  let depth = 1;
  let end = start;
  while (end < css.length && depth > 0) {
    if (css[end] === "{") {
      depth += 1;
    } else if (css[end] === "}") {
      depth -= 1;
    }
    end += 1;
  }
  return css.slice(start, end);
}

/**
 * The problems with how a client build layers an app's reset against the
 * SDK's primitives. The app declares `@layer reset` before it imports the
 * SDK's stylesheet; the built CSS must keep the reset layer ahead of the
 * primitives' layer (a layer declared earlier ranks lower), and the
 * primitives' layer must hold the padding, border and background rules the
 * reset would otherwise clobber. A browser would settle which rule wins; this
 * checks the order and the content that decide it, without one.
 *
 * @param {string} css The built stylesheet text, all files joined.
 * @returns {string[]}
 */
export function layerProblems(css) {
  const blocks = [...css.matchAll(/@layer\s+([\w-]+)\s*\{/g)];
  const names = new Set(blocks.map((match) => match[1]));
  const sdk = [...names].filter((name) => name !== RESET_LAYER);
  if (!names.has(RESET_LAYER)) {
    return [`the built CSS has no @layer ${RESET_LAYER} block from the app`];
  }
  if (sdk.length !== 1) {
    return [
      `the SDK's stylesheet should add one cascade layer, found ${sdk.length}`,
    ];
  }
  const [primitives] = sdk;
  const problems = [];
  const firstUse = (name) => css.search(new RegExp(`@layer\\s+${name}\\b`));
  if (firstUse(RESET_LAYER) > firstUse(primitives)) {
    problems.push(
      "the app's reset layer is declared after the primitives' layer",
    );
  }
  const inLayer = blocks
    .filter((match) => match[1] === primitives)
    .map((match) => blockBody(css, match.index + match[0].length))
    .join("\n");
  for (const property of ["padding", "border", "background"]) {
    if (!inLayer.includes(property)) {
      problems.push(`the primitives' layer holds no ${property} rule`);
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
 * @param {number} [timeout] Milliseconds before it is cut off; none by default.
 * @returns {string} Its standard output.
 */
function runNode(label, args, cwd, timeout) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    timeout,
    encoding: "utf8",
    env: isolatedEnvironment(),
    maxBuffer: MAX_OUTPUT,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

/** Packs the SDK packages into `destination` and names each tarball. */
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
 * `.npmrc` (so the same minimum release age applies there). With `umbrella`
 * the app's source imports the umbrella alone (`umbrellaSource`).
 */
function prepareApp(app, manifest, { umbrella = false } = {}) {
  cpSync(FIXTURE, app, {
    recursive: true,
    filter: (source) => !source.split(path.sep).includes("node_modules"),
  });
  if (umbrella) {
    for (const file of readdirSync(app, { recursive: true }).map(String)) {
      if (/\.(?:tsx?|mjs)$/.test(file)) {
        const target = path.join(app, file);
        writeFileSync(target, umbrellaSource(readFileSync(target, "utf8")));
      }
    }
  }
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
 * Builds the app as a Worker with plain Vite, runs it on workerd (the
 * Workers runtime the host is published on, through the Miniflare the
 * repository already installs) and checks the page it answers with. Node never
 * renders it. The Worker conditions pick the third-party builds a Worker
 * takes (React's stream renderer); the SDK packages' own exports have no such
 * condition, so what this shows is that their `default` build runs on Workers.
 * If workerd cannot be run here (no Miniflare, as in a job that installs
 * nothing), the leg is skipped with a warning.
 *
 * @param {string} app The installed app.
 * @returns {string} The line for the report.
 */
function checkWorkerd(app) {
  if (!miniflareAvailable(REPO)) {
    return workerdSkipped();
  }
  const vite = path.join(app, "node_modules", "vite", "bin", "vite.js");
  runNode(
    "vite build (Worker)",
    [
      vite,
      "build",
      "--config",
      "vite.worker.config.ts",
      "--ssr",
      "src/entryWorker.tsx",
      "--outDir",
      "dist/worker",
    ],
    app,
  );
  const answer = runNode(
    "run the Worker on workerd",
    [
      path.join(REPO, "scripts", "release", "workerdRun.mjs"),
      path.join(app, "dist", "worker", "entryWorker.js"),
    ],
    app,
    WORKERD_TIMEOUT,
  );
  const page = JSON.parse(answer);
  if (page.runtime !== "Cloudflare-Workers") {
    throw new Error(`The Worker did not run on workerd: ${page.runtime}`);
  }
  const absent = missingLandmarks(page.html);
  if (absent.length > 0) {
    throw new Error(
      `The Worker's page lacks: ${absent.join(", ")}\n${page.html.slice(0, EXCERPT)}`,
    );
  }
  return "server render of the chrome on workerd, from a Worker bundle built with no plugins: ok";
}

/**
 * Installs with Yarn Berry (the `node-modules` linker) through corepack,
 * pinned to one version, then renders in plain Node and builds with plain
 * Vite. corepack fetches Yarn once into its own cache; nothing is installed
 * on the machine.
 *
 * @param {string} app The folder to install into.
 * @param {Record<string, unknown>} manifest The consumer manifest.
 * @returns {string} The line for the report.
 */
function checkYarn(app, manifest) {
  const corepack = corepackCliPath();
  if (corepack === undefined) {
    return yarnSkipped();
  }
  writeFileSync(
    path.join(app, "package.json"),
    `${JSON.stringify(yarnManifest(manifest), null, 2)}\n`,
  );
  writeFileSync(path.join(app, ".yarnrc.yml"), yarnSettings());
  const result = spawnSync(process.execPath, [corepack, "yarn", "install"], {
    cwd: app,
    timeout: INSTALL_TIMEOUT,
    encoding: "utf8",
    env: {
      ...isolatedEnvironment(),
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      COREPACK_ENABLE_AUTO_PIN: "0",
    },
    maxBuffer: MAX_OUTPUT,
  });
  if (result.status !== 0) {
    throw new Error(`yarn install failed:\n${result.stdout}\n${result.stderr}`);
  }
  const missing = missingLandmarks(renderPlain(app).html, CHROME_LANDMARKS);
  if (missing.length > 0) {
    throw new Error(`yarn render lacks: ${missing.join(", ")}`);
  }
  const vite = path.join(app, "node_modules", "vite", "bin", "vite.js");
  runNode(
    "vite build after yarn",
    [vite, "build", "--outDir", "dist/client"],
    app,
  );
  const problems = stylesheetProblems(
    builtCss(path.join(app, "dist", "client")),
  );
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return `Yarn (pinned with its digest, node-modules linker) install, plain Node render and Vite build: ok`;
}

/**
 * Installs with Bun, when Bun is already on the path, and renders with it:
 * `bun` runs the same script that Node runs. Bun is never installed for this,
 * and a missing Bun is the only thing that skips the leg. This leg has not
 * been run yet.
 *
 * @param {string} app The folder to install into.
 * @returns {string} The line for the report.
 */
function checkBun(app) {
  const version = spawnSync("bun", ["--version"], {
    encoding: "utf8",
    timeout: INSTALL_TIMEOUT,
  });
  if (version.error?.code === "ENOENT") {
    return bunSkipped();
  }
  if (version.error !== undefined || version.status !== 0) {
    throw new Error(
      `bun --version failed:\n${version.error ?? ""}\n${version.stdout}\n${version.stderr}`,
    );
  }
  const tooOld = bunVersionProblem(version.stdout);
  if (tooOld !== undefined) {
    throw new Error(tooOld);
  }
  writeFileSync(path.join(app, "bunfig.toml"), bunSettings());
  const run = (args) =>
    spawnSync("bun", args, {
      cwd: app,
      encoding: "utf8",
      env: isolatedEnvironment(),
      maxBuffer: MAX_OUTPUT,
      timeout: INSTALL_TIMEOUT,
    });
  const installed = run(["install", "--ignore-scripts"]);
  if (installed.status !== 0) {
    throw new Error(
      `bun install failed:\n${installed.stdout}\n${installed.stderr}`,
    );
  }
  const rendered = run(["plain.mjs"]);
  if (rendered.status !== 0) {
    throw new Error(
      `bun render failed:\n${rendered.stdout}\n${rendered.stderr}`,
    );
  }
  const missing = missingLandmarks(
    JSON.parse(rendered.stdout).html,
    CHROME_LANDMARKS,
  );
  if (missing.length > 0) {
    throw new Error(`bun render lacks: ${missing.join(", ")}`);
  }
  return `Bun ${version.stdout.trim()} install and render: ok`;
}

/**
 * What is wrong with the result of `npm audit signatures`. An audit that
 * checked nothing is a problem too, so an empty install cannot pass it.
 *
 * @param {{ status: number | null, stdout: string, stderr: string }} result
 * @returns {string[]}
 */
export function auditProblems(result) {
  if (result.status !== 0) {
    return [
      `npm audit signatures failed:\n${result.stdout}${result.stderr}`.trimEnd(),
    ];
  }
  if (
    !/\d+ packages? ha(?:s|ve) verified registry signatures?/.test(
      result.stdout,
    )
  ) {
    return ["npm audit signatures verified no registry signatures"];
  }
  return [];
}

/**
 * Verifies the registry signatures and provenance attestations of what an app
 * installed.
 *
 * @param {string} app The installed app.
 * @returns {string} The audit's own summary.
 */
function auditSignatures(app) {
  const result = runNpm(["audit", "signatures"], { cwd: app });
  const problems = auditProblems({
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  });
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return `npm audit signatures: ${(result.stdout ?? "").trim().replace(/\s*\n+\s*/g, "; ")}`;
}

/**
 * Everything an installed app is checked for once: a plain Node render, the
 * types under each resolution, the Vite builds and their stylesheets, the
 * server bundle and the Worker on workerd.
 *
 * @param {string} app The installed app.
 * @param {string} [prefix] Put before each line of the report, to say which app it was.
 * @returns {string[]} One line for each check.
 */
function checkApp(app, prefix = "") {
  /** @type {string[]} */
  const lines = [];
  const plain = renderPlain(app);
  const missing = missingLandmarks(plain.html, CHROME_LANDMARKS);
  if (missing.length > 0) {
    throw new Error(
      `Plain Node render lacks: ${missing.join(", ")}\n${plain.html.slice(0, EXCERPT)}`,
    );
  }
  lines.push("plain Node render of the chrome (no bundler): ok");

  const tsc = path.join(app, "node_modules", "typescript", "bin", "tsc");
  for (const { name, flags } of TYPE_CHECKS) {
    runNode(`tsc (${name})`, [tsc, "-p", "tsconfig.json", ...flags], app);
    lines.push(`tsc moduleResolution ${name}: ok`);
  }

  const vite = path.join(app, "node_modules", "vite", "bin", "vite.js");
  runNode(
    "vite build (client)",
    [vite, "build", "--outDir", "dist/client"],
    app,
  );
  runNode(
    "vite build (server)",
    [vite, "build", "--ssr", "src/entryServer.tsx", "--outDir", "dist/server"],
    app,
  );
  const cssProblems = stylesheetProblems(
    builtCss(path.join(app, "dist", "client")),
  );
  if (cssProblems.length > 0) {
    throw new Error(cssProblems.join("\n"));
  }
  const clientCss = builtCss(path.join(app, "dist", "client"));
  const layering = layerProblems(clientCss);
  if (layering.length > 0) {
    throw new Error(layering.join("\n"));
  }
  lines.push(
    "vite build with no plugins, both stylesheets built in: ok",
    "the SDK's primitives sit in one layer, ranked above an app reset layer declared first: ok",
  );

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
  lines.push("server render of the chrome from the bundle: ok");

  lines.push(checkWorkerd(app));
  return lines.map((line) => `${prefix}${line}`);
}

/**
 * The manifest of an app that lists the given packages, from the tarballs or
 * from the registry.
 *
 * @param {{ packed: Record<string, string>, published: string | null, versions: Record<string, string>, direct: string[] }} input
 * @returns {Record<string, unknown>}
 */
function manifestListing({ packed, published, versions, direct }) {
  return published === null
    ? consumerManifest({ tarballs: packed, versions, direct })
    : publishedManifest({ version: published, versions, direct });
}

/**
 * The checks for an app that lists only the umbrella: the four packages come
 * in through it alone, so this is what a reader of the README does. Its source
 * imports the umbrella (`umbrellaSource`), and the declaration merged into the
 * app's types is merged through it. It also installs with pnpm as strictly as
 * pnpm goes, where nothing but the umbrella is reachable from the app.
 *
 * @param {{ root: string, packed: Record<string, string>, published: string | null, versions: Record<string, string> }} input
 * @returns {string[]} One line for each check.
 */
function checkUmbrella({ root, packed, published, versions }) {
  const prefix = `umbrella only (@mapcairn/${UMBRELLA_PACKAGE}): `;
  const manifest = manifestListing({
    packed,
    published,
    versions,
    direct: [UMBRELLA_PACKAGE],
  });
  const app = path.join(root, "umbrella");
  prepareApp(app, manifest, { umbrella: true });
  install(app, installFlags({ published }));
  const lines = [`${prefix}npm install: ok`, ...checkApp(app, prefix)];
  if (published !== null) {
    return [
      ...lines,
      `${prefix}the pnpm strict-peer install is not repeated for the published packages`,
    ];
  }
  if (!pnpmAvailable(app)) {
    return [...lines, pnpmSkipped()];
  }
  const strict = path.join(root, "umbrella-strict");
  prepareApp(strict, manifest, { umbrella: true });
  return [
    ...lines,
    `${prefix}${checkPnpmStrict(strict, /** @type {Record<string, string>} */ (manifest.overrides))}`,
  ];
}

/**
 * The check for an app that lists the umbrella and also `core` and `map`
 * directly, at the umbrella's version, as the documents tell a host that
 * merges a declaration. It must install one copy of each package, so the
 * umbrella's `MapChrome` is the one from `@mapcairn/map` and a provider from
 * one renders a component from the other, and a service merged into `core`
 * must be visible through the umbrella's types.
 *
 * @param {{ root: string, packed: Record<string, string>, published: string | null, versions: Record<string, string> }} input
 * @returns {string[]} One line for each check.
 */
function checkMixed({ root, packed, published, versions }) {
  const prefix = `umbrella with core and map listed too: `;
  const app = path.join(root, "mixed");
  mkdirSync(path.join(app, "src"), { recursive: true });
  cpSync(MIXED_FIXTURE, app, { recursive: true });
  copyFileSync(
    path.join(FIXTURE, "src", "merging.ts"),
    path.join(app, "src", "merging.ts"),
  );
  copyFileSync(
    path.join(FIXTURE, "tsconfig.json"),
    path.join(app, "tsconfig.json"),
  );
  const manifest = manifestListing({
    packed,
    published,
    versions,
    direct: [UMBRELLA_PACKAGE, "core", "map"],
  });
  writeFileSync(
    path.join(app, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  copyFileSync(path.join(REPO, ".npmrc"), path.join(app, ".npmrc"));
  install(app, installFlags({ published }));
  const nested = path.join(
    app,
    "node_modules",
    "@mapcairn",
    UMBRELLA_PACKAGE,
    "node_modules",
  );
  if (existsSync(nested)) {
    throw new Error(
      `The umbrella installed its own copies of ${readdirSync(nested).join(", ")}, so a host gets two of each.`,
    );
  }
  const answer = JSON.parse(runNode("mixed render", ["mixed.mjs"], app));
  const absent = missingLandmarks(answer.html, CHROME_LANDMARKS);
  if (absent.length > 0) {
    throw new Error(`The mixed render lacks: ${absent.join(", ")}`);
  }
  if (!(answer.sameChrome && answer.sameServices)) {
    throw new Error(
      "The umbrella and the package it re-exports are two copies, not one.",
    );
  }
  const tsc = path.join(app, "node_modules", "typescript", "bin", "tsc");
  runNode(
    "tsc (mixed)",
    [
      tsc,
      "-p",
      "tsconfig.json",
      "--module",
      "esnext",
      "--moduleResolution",
      "bundler",
    ],
    app,
  );
  return [
    `${prefix}one copy of each package, and a render across the two: ok`,
    `${prefix}a service merged into core is visible through the umbrella's types: ok`,
  ];
}

/**
 * Runs every check and returns one line for each. With `published`, it
 * installs that version of the four packages from the registry instead of
 * packing the repository's, skips the pnpm install, and audits the
 * signatures of what it installed. The Yarn and Bun installs are skipped
 * for the published packages too, because their seven-day release age would
 * refuse a release made today; with `tarballs` they run on the tarballs.
 *
 * @param {{ published?: string | null, tarballs?: string | null }} [options] `tarballs` is a folder of the four packed tarballs to check, copied so the originals are untouched; without it the packages are packed here.
 * @returns {string[]} What was checked, and what was skipped and why.
 */
export function runConsumerCheck({ published = null, tarballs = null } = {}) {
  const report = [];
  const root = mkdtempSync(path.join(tmpdir(), "mapcairn-consumer-"));
  if (realpathSync(root).startsWith(realpathSync(REPO) + path.sep)) {
    throw new Error("The temporary folder is inside the repository.");
  }
  try {
    const lock = JSON.parse(
      readFileSync(path.join(REPO, "package-lock.json"), "utf8"),
    );
    const versions = Object.fromEntries(
      LOCKED_TOOLS.map((name) => [name, lockedVersion(lock, name)]),
    );
    /** @type {Record<string, unknown>} */
    let manifest;
    /** @type {Record<string, string>} */
    let packed = {};
    if (published === null) {
      const copies = path.join(root, "tarballs");
      mkdirSync(copies);
      if (tarballs === null) {
        packed = packTarballs(copies);
        report.push(`packed ${Object.keys(packed).length} tarballs`);
      } else {
        packed = findTarballs(readdirSync(tarballs));
        for (const file of Object.values(packed)) {
          copyFileSync(path.join(tarballs, file), path.join(copies, file));
        }
        report.push(
          `using the ${Object.keys(packed).length} tarballs in the release folder`,
        );
      }
      manifest = consumerManifest({ tarballs: packed, versions });
    } else {
      manifest = publishedManifest({ version: published, versions });
    }

    const app = path.join(root, "app");
    prepareApp(app, manifest);
    install(app, installFlags({ published }));
    report.push(
      published === null
        ? "npm install: ok"
        : `npm install of the published ${published}: ok`,
    );
    if (published !== null) {
      report.push(auditSignatures(app));
    }

    report.push(...checkApp(app));

    const legacy = path.join(root, "legacy");
    prepareApp(legacy, manifest);
    install(legacy, installFlags({ published, extra: ["--legacy-peer-deps"] }));
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

    if (published !== null) {
      report.push(
        "the pnpm strict-peer install is not repeated for the published packages; the pull request's own check did it",
      );
    } else if (pnpmAvailable(app)) {
      const strict = path.join(root, "strict");
      prepareApp(strict, manifest);
      report.push(
        checkPnpmStrict(
          strict,
          /** @type {Record<string, string>} */ (manifest.overrides),
        ),
      );
    } else {
      report.push(pnpmSkipped());
    }

    const yarn = path.join(root, "yarn");
    prepareApp(yarn, manifest);
    report.push(
      publishedLegSkip("Yarn", published) ?? checkYarn(yarn, manifest),
    );

    const bun = path.join(root, "bun");
    prepareApp(bun, manifest);
    report.push(publishedLegSkip("Bun", published) ?? checkBun(bun));

    report.push(
      ...checkUmbrella({ root, packed, published, versions }),
      ...checkMixed({ root, packed, published, versions }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return report;
}

if (isEntryPoint(import.meta.url)) {
  try {
    const flag = process.argv.indexOf("--tarballs");
    const folder = flag === -1 ? null : (process.argv[flag + 1] ?? null);
    for (const line of runConsumerCheck({
      tarballs: folder === null ? null : path.resolve(folder),
    })) {
      console.log(line);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
