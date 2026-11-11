import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** How long a basemap stays marked unavailable before it is offered normally again. */
export const UNAVAILABLE_FOR_MS = 5 * 60 * 1000;

/** What {@link useBasemapAvailability} returns. */
export interface BasemapAvailability {
  /** The ids of the basemaps that are not working right now. Held in memory, never stored. */
  readonly unavailable: ReadonlySet<string>;
  /**
   * Marks a basemap unavailable. The mark lapses after
   * {@link UNAVAILABLE_FOR_MS}, so a provider that recovers returns without a
   * reload, and marking it again restarts that time.
   */
  readonly markUnavailable: (id: string) => void;
  /** Marks one basemap, or every basemap when no id is given, available again. */
  readonly clear: (id?: string) => void;
}

const BasemapAvailabilityContext = createContext<BasemapAvailability | null>(
  null,
);

/**
 * Keeps which basemaps are not working, for the picker (which disables their
 * tiles) and for the app (which marks a basemap whose tiles all failed).
 * {@link ServicesProvider} mounts it, so every component below can read it.
 */
export function BasemapAvailabilityProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const forget = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const markUnavailable = useCallback(
    (id: string) => {
      forget(id);
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          setUnavailable((current) => withoutId(current, id));
        }, UNAVAILABLE_FOR_MS),
      );
      setUnavailable((current) =>
        current.has(id) ? current : new Set(current).add(id),
      );
    },
    [forget],
  );

  const clear = useCallback(
    (id?: string) => {
      if (id === undefined) {
        for (const pending of [...timers.current.keys()]) {
          forget(pending);
        }
        setUnavailable((current) => (current.size === 0 ? current : new Set()));
        return;
      }
      forget(id);
      setUnavailable((current) => withoutId(current, id));
    },
    [forget],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ unavailable, markUnavailable, clear }),
    [unavailable, markUnavailable, clear],
  );
  return (
    <BasemapAvailabilityContext.Provider value={value}>
      {children}
    </BasemapAvailabilityContext.Provider>
  );
}

function withoutId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!set.has(id)) {
    return set;
  }
  const next = new Set(set);
  next.delete(id);
  return next;
}

/**
 * Which basemaps are not working right now, and how to mark one. Throws
 * outside a {@link ServicesProvider}, because a missing provider is a wiring bug.
 */
export function useBasemapAvailability(): BasemapAvailability {
  const value = useContext(BasemapAvailabilityContext);
  if (!value) {
    throw new Error(
      "useBasemapAvailability must be used inside a ServicesProvider.",
    );
  }
  return value;
}
