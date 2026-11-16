// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { parentPort } from "node:worker_threads";
import { type FileTask, lintFile } from "../node/lintFile.js";

/** A message from the pool: the position of the file in the run, and the file to lint. */
export interface WorkerRequest {
  readonly index: number;
  readonly input: FileTask;
}

/**
 * Handles one request from the pool and returns the reply: the report, or the
 * message of whatever stopped the lint. Kept apart from the port wiring below so
 * a test can call it directly.
 */
export async function handle(request: WorkerRequest) {
  try {
    return { index: request.index, output: await lintFile(request.input) };
  } catch (error) {
    return {
      index: request.index,
      failure: error instanceof Error ? error.message : String(error),
    };
  }
}

parentPort?.on("message", (request: WorkerRequest) => {
  void handle(request).then((reply) => parentPort?.postMessage(reply));
});
