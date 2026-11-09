import { spawnSync } from "node:child_process";

/**
 * Builds the e2e bundle and serves it with `wrangler dev` on `KARTA_E2E_PORT`
 * (default 4173), so parallel runs in separate working copies cannot collide.
 * `playwright.config.ts` reads the same variable. A script rather than an
 * npm one-liner because `${VAR:-default}` is not portable to Windows.
 */
const port = process.env.KARTA_E2E_PORT || "4173";
if (!/^\d+$/.test(port)) {
  console.error(`KARTA_E2E_PORT must be a port number, got "${port}".`);
  process.exit(1);
}

const run = (command, args) =>
  spawnSync(command, args, { stdio: "inherit", shell: true });

const build = run("npm", ["run", "build:e2e"]);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}
const serve = run("npx", [
  "--no-install",
  "wrangler",
  "dev",
  "--config",
  "../../wrangler.e2e.jsonc",
  "--port",
  port,
]);
process.exit(serve.status ?? 0);
