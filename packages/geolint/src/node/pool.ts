// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { Worker } from "node:worker_threads";

/** What a worker sends back for the input at `index`. */
type Reply<Output> =
  | { readonly index: number; readonly output: Output }
  | { readonly index: number; readonly failure: string };

/**
 * Runs `inputs` through a pool of worker threads and returns the outputs in the
 * order of the inputs, whichever worker finished first, so the result never
 * depends on the number of threads.
 *
 * The worker script receives `{ index, input }` messages and answers each with
 * `{ index, output }` or `{ index, failure }` (an error message). Inputs and
 * outputs must be structured-clone safe. At most `jobs` threads run, and never
 * more than there are inputs. A worker that fails, or exits early, rejects the
 * call and stops the others.
 */
export function mapInThreads<Input, Output>(
  workerUrl: URL,
  inputs: readonly Input[],
  jobs: number,
): Promise<Output[]> {
  const outputs = new Array<Output>(inputs.length);
  if (inputs.length === 0) {
    return Promise.resolve(outputs);
  }
  return new Promise<Output[]>((resolve, reject) => {
    const workers: Worker[] = [];
    let next = 0;
    let finished = 0;
    let settled = false;

    const stopAll = (): void => {
      for (const worker of workers) {
        void worker.terminate();
      }
    };
    const fail = (error: Error): void => {
      if (!settled) {
        settled = true;
        stopAll();
        reject(error);
      }
    };
    const dispatch = (worker: Worker): void => {
      if (next >= inputs.length) {
        // Idle until the last result arrives; `stopAll` ends every thread then.
        return;
      }
      const index = next;
      next += 1;
      worker.postMessage({ index, input: inputs[index] });
    };

    const threads = Math.max(1, Math.min(jobs, inputs.length));
    for (let i = 0; i < threads; i++) {
      const worker = new Worker(workerUrl);
      workers.push(worker);
      worker.on("message", (reply: Reply<Output>) => {
        if ("failure" in reply) {
          fail(new Error(reply.failure));
          return;
        }
        outputs[reply.index] = reply.output;
        finished += 1;
        if (finished === inputs.length && !settled) {
          settled = true;
          stopAll();
          resolve(outputs);
          return;
        }
        dispatch(worker);
      });
      worker.on("error", fail);
      worker.on("exit", (code) => {
        if (code !== 0 && !settled) {
          fail(new Error(`A worker thread stopped with exit code ${code}.`));
        }
      });
      dispatch(worker);
    }
  });
}
