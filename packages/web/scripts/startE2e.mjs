// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";

/**
 * Builds the e2e bundle and serves it with `vite preview` on
 * `MAPCAIRN_E2E_PORT` (default 4173), so parallel runs in separate working
 * copies cannot collide. `playwright.config.ts` reads the same variable. A
 * script rather than an npm one-liner because `${VAR:-default}` is not
 * portable to Windows.
 *
 * `vite preview` runs the built Worker in the Cloudflare plugin's local
 * runtime, from the Build Output and the settings recorded in it for the
 * `e2e` mode (`cloudflare.config.ts`). `cf dev` runs the dev server, not the
 * build, and `cf` has no command that serves a build, so this is the one
 * place the project calls Vite's own command. `--strictPort` makes a busy
 * port an error rather than a quiet move to another one.
 *
 * `--print` writes the two commands as JSON and runs neither, which is how
 * the unit test reads them.
 */
const port = process.env.MAPCAIRN_E2E_PORT || "4173";
if (!/^\d+$/.test(port)) {
  console.error(`MAPCAIRN_E2E_PORT must be a port number, got "${port}".`);
  process.exit(1);
}

const build = ["npm", "run", "build:e2e"];
const serve = [
  "npx",
  "--no-install",
  "vite",
  "preview",
  "--mode",
  "e2e",
  "--port",
  port,
  "--strictPort",
];

if (process.argv.includes("--print")) {
  console.log(JSON.stringify({ build, serve }));
  process.exit(0);
}

const run = (command) =>
  spawnSync(command.join(" "), { stdio: "inherit", shell: true });

const built = run(build);
if (built.status !== 0) {
  process.exit(built.status ?? 1);
}
const served = run(serve);
process.exit(served.status ?? 0);
