#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { main } from "./main.js";

/** The process wiring: the real streams and directory, and the exit code. */
process.exitCode = await main(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: () => process.stdin,
  cwd: process.cwd(),
});
