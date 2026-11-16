#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { main } from "./main.js";

/** The process wiring: the real streams, directory and worker script, and the exit code. */
process.exitCode = await main(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: () => process.stdin,
  cwd: process.cwd(),
  workerUrl: new URL("./worker.js", import.meta.url),
});
