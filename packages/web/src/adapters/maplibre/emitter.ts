// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * A tiny typed event emitter shared by the map adapters. Handlers that throw
 * never stop other handlers from running.
 */
export class Emitter<Events extends object> {
  private readonly handlers = new Map<
    keyof Events,
    Set<(payload: never) => void>
  >();

  /** Subscribes to an event. Returns the unsubscribe function. */
  on<K extends keyof Events>(
    event: K,
    handler: (payload: Events[K]) => void,
  ): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const stored = handler as (payload: never) => void;
    set.add(stored);
    return () => {
      set?.delete(stored);
    };
  }

  /** Calls every handler subscribed to `event`. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) {
      return;
    }
    for (const handler of [...set]) {
      try {
        (handler as (value: Events[K]) => void)(payload);
      } catch (error) {
        console.error(error);
      }
    }
  }

  /** Removes every handler. */
  clear(): void {
    this.handlers.clear();
  }
}
