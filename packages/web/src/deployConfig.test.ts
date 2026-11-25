// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { REDIRECTED_HOSTNAMES, SITE_URL } from "./constants/siteConfig";

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/** The default export of `cloudflare.config.ts`, which is a function of the context. */
type ConfigExport<Config> = (context: Context) => Config;

interface Context {
  readonly isPreview: boolean;
  readonly mode: string | undefined;
}

interface WorkerSettings {
  readonly name?: string;
  readonly compatibilityDate?: string;
  readonly compatibilityFlags?: readonly string[];
  readonly entrypoint?: string;
  readonly workersDev?: boolean;
  readonly previewUrls?: boolean;
  readonly placement?: unknown;
  readonly observability?: unknown;
  readonly domains?: readonly string[];
  readonly env?: Record<string, unknown>;
}

interface CloudflareConfig {
  readonly worker: WorkerSettings;
}

async function evaluate<Config>(
  file: string,
  context: Context,
): Promise<Config> {
  const module = (await import(
    pathToFileURL(join(repositoryRoot, file)).href
  )) as { default: ConfigExport<Config> };
  return module.default(context);
}

const production: Context = { isPreview: false, mode: undefined };
const preview: Context = { isPreview: true, mode: undefined };
const e2e: Context = { isPreview: false, mode: "e2e" };

const cloudflareConfig = (context: Context) =>
  evaluate<CloudflareConfig>("packages/web/cloudflare.config.ts", context);

/** The settings the production Worker has to keep. */
const PRODUCTION_OBSERVABILITY = {
  enabled: true,
  headSamplingRate: 1,
  redactQueryString: true,
  logs: {
    enabled: true,
    headSamplingRate: 1,
    invocationLogs: true,
    persist: true,
  },
  traces: { enabled: true, headSamplingRate: 1, persist: true },
  issues: { enabled: true },
};

const E2E_OBSERVABILITY = {
  enabled: true,
  headSamplingRate: 1,
  logs: { enabled: true, invocationLogs: true, headSamplingRate: 1 },
  traces: { enabled: true, headSamplingRate: 1 },
};

describe("cloudflare.config.ts", () => {
  it("keeps the production Worker's entry point, runtime and placement", async () => {
    const { worker } = await cloudflareConfig(production);
    expect(worker).toMatchObject({
      name: "mapcairn",
      compatibilityDate: "2026-09-08",
      compatibilityFlags: ["nodejs_compat"],
      entrypoint: "./workers/app.ts",
      workersDev: false,
      previewUrls: true,
      placement: { mode: "smart" },
    });
  });

  it("keeps the static assets binding", async () => {
    for (const context of [production, preview, e2e]) {
      const { worker } = await cloudflareConfig(context);
      expect(Object.keys(worker.env ?? {})).toEqual(["ASSETS"]);
    }
  });

  it("keeps the production observability settings", async () => {
    const { worker } = await cloudflareConfig(production);
    expect(worker.observability).toEqual(PRODUCTION_OBSERVABILITY);
  });

  it("serves the site and every hostname that redirects to it as a custom domain", async () => {
    const { worker } = await cloudflareConfig(production);
    expect(worker.domains).toEqual([
      new URL(SITE_URL).hostname,
      ...REDIRECTED_HOSTNAMES,
    ]);
  });

  it("gives a preview the production settings", async () => {
    expect(await cloudflareConfig(preview)).toEqual(
      await cloudflareConfig(production),
    );
  });

  it("gives the end-to-end server no routes and a workers.dev address", async () => {
    const { worker } = await cloudflareConfig(e2e);
    expect(worker).toMatchObject({
      name: "mapcairn",
      compatibilityDate: "2026-09-08",
      compatibilityFlags: ["nodejs_compat"],
      entrypoint: "./workers/app.ts",
      workersDev: true,
    });
    expect(worker.domains).toBeUndefined();
    expect(worker.placement).toBeUndefined();
    expect(worker.previewUrls).toBeUndefined();
    expect(worker.observability).toEqual(E2E_OBSERVABILITY);
  });
});

/**
 * What the host's scripts run first, so `dist` exists for everything that
 * resolves the SDK packages outside Vite. `npm --prefix` works in every shell,
 * where an environment variable or a `cd` would not.
 */
const BUILD_SDK_FIRST = "npm --prefix ../.. run build:sdk && ";

describe("the web package's scripts", () => {
  const scripts = (
    JSON.parse(
      readFileSync(join(repositoryRoot, "packages/web/package.json"), "utf8"),
    ) as { scripts: Record<string, string> }
  ).scripts;

  it("build and develop through cf, after the SDK packages are built", () => {
    expect(scripts.dev).toBe(`${BUILD_SDK_FIRST}cf dev`);
    expect(scripts.build).toBe(
      `${BUILD_SDK_FIRST}cf build && node scripts/verifyNoTestSeam.mjs`,
    );
  });

  it.each([
    "dev",
    "build",
    "build:e2e",
    "test",
    "typecheck",
    "test:e2e",
    "e2e",
    "a11y",
    "catalogue:check",
  ])("run %s only after the SDK packages are built", (name) => {
    expect(scripts[name]).toMatch(/^npm --prefix \.\.\/\.\. run build:sdk && /);
  });

  it("deploy through cf, only after the output is built or checked to hold no test seam", () => {
    const guards = ["node scripts/verifyNoTestSeam.mjs", "npm run build"];
    const deployScripts = Object.entries(scripts).filter(([name]) =>
      name.startsWith("deploy"),
    );
    expect(deployScripts.map(([name]) => name)).toEqual([
      "deploy",
      "deploy:preview",
    ]);
    for (const [name, command] of deployScripts) {
      const deployAt = command.indexOf("cf ");
      expect(deployAt, name).toBeGreaterThan(0);
      expect(
        guards.some((guard) => command.slice(0, deployAt).includes(guard)),
        `${name} must build or verify before it deploys`,
      ).toBe(true);
    }
    expect(scripts.deploy).toBe(
      "node scripts/verifyNoTestSeam.mjs && cf deploy --prebuilt --mode production",
    );
    expect(scripts["deploy:preview"]).toBe(
      "npm run build && cf previews deploy",
    );
  });

  it("build the end-to-end bundle in its own mode and check that it keeps the test seam", () => {
    expect(scripts["build:e2e"]).toBe(
      `${BUILD_SDK_FIRST}react-router build --mode e2e && node scripts/verifyNoTestSeam.mjs --expect-present`,
    );
  });
});

/**
 * The Worker settings `cf build` recorded, which are what `cf deploy` uploads.
 * They come from `cloudflare.config.ts` through the Cloudflare Vite plugin, so
 * this catches a plugin that drops or changes one. It reads a production
 * build, and is skipped where there is none (a plain `npm test` on a fresh
 * checkout, or after `npm run build:e2e`).
 */
const outputRoot = join(repositoryRoot, "packages/web/.cloudflare/output");

function recordedBuild(): { worker: WorkerSettings } | undefined {
  if (!existsSync(outputRoot)) {
    return undefined;
  }
  const files = readdirSync(outputRoot, { recursive: true }).map(String);
  const mode = files.find((path) => /^[^/\\]+[/\\]config\.json$/.test(path));
  const worker = files.find((path) => /worker\.config\.json$/.test(path));
  if (!mode || !worker) {
    return undefined;
  }
  const { buildContext } = JSON.parse(
    readFileSync(join(outputRoot, mode), "utf8"),
  ) as { buildContext: Context };
  if (buildContext.mode !== "production") {
    return undefined;
  }
  return {
    worker: JSON.parse(readFileSync(join(outputRoot, worker), "utf8")),
  };
}

const recorded = recordedBuild();

describe.skipIf(!recorded)(
  "the Worker settings in the production build output (needs `npm run build`)",
  () => {
    it("are the ones cloudflare.config.ts declares", async () => {
      const { worker: declared } = await cloudflareConfig(production);
      const built = recorded?.worker as WorkerSettings;
      expect(built).toMatchObject({
        name: "mapcairn",
        workersDev: false,
        compatibilityFlags: ["nodejs_compat"],
        env: { ASSETS: { type: "assets" } },
      });
      expect(built).toMatchObject({
        name: declared.name,
        compatibilityDate: declared.compatibilityDate,
        compatibilityFlags: declared.compatibilityFlags,
        domains: declared.domains,
        workersDev: declared.workersDev,
        previewUrls: declared.previewUrls,
        placement: { mode: "smart" },
        observability: declared.observability,
      });
    });
  },
);
