// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** MapLibre tags errors from a tile or a source with these fields; style and worker failures carry neither. */
export function isTileOrSourceError(event: object): boolean {
  const { tile, sourceId } = event as { tile?: unknown; sourceId?: unknown };
  return tile !== undefined || sourceId !== undefined;
}

/**
 * The message maplibre-gl (6.17) gives the `error` event it fires for any
 * `error` event of a web worker (`createActors` in `src/util/actor.ts`): a
 * worker script that never loaded, but also an uncaught exception inside a
 * running worker. The event has no type, tile or source of its own, so the
 * message is the only way to tell it from other source-less errors.
 */
const WORKER_FAILED_MESSAGE = "Worker failed to load.";

/** Whether an engine `error` event came from a web worker. */
export function isWorkerFailure(event: object): boolean {
  const { error } = event as { error?: unknown };
  return (
    !isTileOrSourceError(event) &&
    error instanceof Error &&
    error.message.startsWith(WORKER_FAILED_MESSAGE)
  );
}

/** The id of the source a tile event is about, or undefined when the event is not about a tile. */
export function tileEventSource(event: object): string | undefined {
  const { tile, sourceId } = event as { tile?: unknown; sourceId?: unknown };
  return tile !== undefined && typeof sourceId === "string"
    ? sourceId
    : undefined;
}

/** Whether a camera event came from the person (a gesture), not from code. */
export function isUserEvent(event: object): boolean {
  return (event as { originalEvent?: unknown }).originalEvent !== undefined;
}
