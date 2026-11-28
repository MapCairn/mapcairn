// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** Where a lazy definition stands. `ready` and `failed` are final. */
export type DefinitionState<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "failed" };

/** Something that is loaded and defined once, on demand, and can be watched. */
export interface LazyDefinition<T> {
  /** Starts the load the first time. Never rejects. */
  readonly define: () => Promise<void>;
  /** The same object until the state changes. */
  readonly state: () => DefinitionState<T>;
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * Defines something whose module must not be evaluated until a browser asks for
 * it. Lit's browser build extends `HTMLElement` as it is evaluated, which
 * breaks a server bundle, so `load` holds the dynamic `import()` that reaches
 * Lit and nothing outside it imports Lit.
 *
 * A load that fails stays failed until the page is loaded again: a browser may
 * answer a repeated module request with the same failure, and the page has by
 * then told the person to reload. A load that has not settled is waited for as
 * long as it takes; a caller that cannot wait sets its own limit.
 *
 * @param load Imports the module and defines what it holds. It is not called
 *   until the first `define`.
 */
export function createLazyDefinition<T>(
  load: () => Promise<T>,
): LazyDefinition<T> {
  let state: DefinitionState<T> = { status: "loading" };
  let pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const settle = (next: DefinitionState<T>) => {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  };
  const define = () => {
    pending ??= load().then(
      (value) => settle({ status: "ready", value }),
      (reason: unknown) => {
        console.error("MapCairn could not load part of its interface.", reason);
        settle({ status: "failed" });
      },
    );
    return pending;
  };
  return {
    define,
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
