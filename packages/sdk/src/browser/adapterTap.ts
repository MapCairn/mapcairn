// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  MapAdapter,
  MapAdapterFactory,
  MapHostElement,
  MapMountOptions,
  ViewState,
} from "@mapcairn/core";
import { MountMapError } from "./MountMapError";

/** What the handle needs from the adapter the interface builds. */
export interface AdapterTap {
  /** Wraps a factory, so the adapter the interface builds is the one the tap reads. */
  readonly wrap: (factory: MapAdapterFactory) => MapAdapterFactory;
  /** Resolves when the first mount succeeds, rejects with its error, or with a `destroyed` error from {@link AdapterTap.release}. */
  readonly ready: Promise<void>;
  /** The view the map shows, or the last it showed. */
  getView(): ViewState;
  /** Records a view the interface reported while the engine was not asked. */
  rememberView(view: ViewState): void;
  /** The mounted adapter, or undefined before it is drawing and after it is gone. */
  mountedAdapter(): MapAdapter | undefined;
  /** Rejects `ready` if it is still pending and forgets the adapter. */
  release(): void;
}

/**
 * Taps the adapter a map interface builds from a factory, with no change to
 * what the interface sees: every call goes to the real adapter, and only
 * `mount` and `destroy` are noticed.
 *
 * @param initialView - What `getView` answers until the engine is drawing.
 */
export function createAdapterTap(initialView: ViewState): AdapterTap {
  let adapter: MapAdapter | undefined;
  let mounted = false;
  let view = initialView;
  let settle: { resolve: () => void; reject: (error: unknown) => void } = {
    resolve: () => {},
    reject: () => {},
  };
  const ready = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // The page may never look at `ready`; this keeps a rejection it ignores from
  // being reported as unhandled, while a page that awaits it still sees it.
  ready.catch(() => {});

  const forget = (target: MapAdapter) => {
    if (adapter !== target) {
      return;
    }
    if (mounted) {
      view = target.getView();
    }
    adapter = undefined;
    mounted = false;
  };

  const wrap =
    (factory: MapAdapterFactory): MapAdapterFactory =>
    () => {
      const target = factory();
      adapter = target;
      return new Proxy(target, {
        get(real, property) {
          if (property === "mount") {
            return async (host: MapHostElement, options: MapMountOptions) => {
              try {
                await real.mount(host, options);
              } catch (error) {
                settle.reject(error);
                throw error;
              }
              if (adapter === real) {
                mounted = true;
              }
              settle.resolve();
            };
          }
          if (property === "destroy") {
            return () => {
              forget(real);
              real.destroy();
            };
          }
          const value: unknown = Reflect.get(real, property, real);
          return typeof value === "function" ? value.bind(real) : value;
        },
      });
    };

  return {
    wrap,
    ready,
    getView: () => (mounted && adapter ? adapter.getView() : view),
    rememberView: (next) => {
      view = next;
    },
    mountedAdapter: () => (mounted ? adapter : undefined),
    release: () => {
      settle.reject(
        new MountMapError(
          "destroyed",
          "The map was destroyed before it was ready. Call mountMap again if you still need a map.",
        ),
      );
      if (adapter !== undefined) {
        forget(adapter);
      }
    },
  };
}
