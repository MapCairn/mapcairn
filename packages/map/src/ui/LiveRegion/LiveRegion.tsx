import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { VisuallyHidden } from "../VisuallyHidden";
import {
  type Announce,
  type AnnouncePriority,
  createAnnouncer,
} from "./announcer";

export type { Announce, AnnounceOptions, AnnouncePriority } from "./announcer";

/**
 * Ambient and type-only: this package has no dependency on `@types/node`, and
 * bundlers replace the literal `process.env.NODE_ENV`, so production builds
 * drop the development warnings. Outside a bundler the guard keeps the check
 * from throwing.
 */
declare const process: { env?: { NODE_ENV?: string } } | undefined;

function isDevelopment(): boolean {
  return (
    typeof process !== "undefined" && process.env?.NODE_ENV !== "production"
  );
}

const LiveRegionContext = createContext<Announce | null>(null);

/** How many providers are mounted, to warn in development about a second. */
let mountedProviders = 0;
let warnedMissingProvider = false;

/** Does nothing. Returned outside a provider so callers need no null check. */
const ignore: Announce = () => undefined;

/** Props for {@link LiveRegionProvider}. */
export interface LiveRegionProviderProps {
  readonly children?: ReactNode;
}

/**
 * Mounts the one app-wide announcer: a visually hidden polite `status` region
 * and a visually hidden assertive `alert` region. Nothing else in the app may
 * create a live region except `StatusMessage`, which is a visible message.
 * @remarks Mount it once, near the root. A second provider logs a warning in
 *   development, because two announcers would read the same message twice.
 */
export function LiveRegionProvider({ children }: LiveRegionProviderProps) {
  const [texts, setTexts] = useState<Record<AnnouncePriority, string>>({
    polite: "",
    assertive: "",
  });
  const [announcer] = useState(() =>
    createAnnouncer({
      setText: (priority, text) =>
        setTexts((current) => ({ ...current, [priority]: text })),
    }),
  );

  useEffect(() => {
    mountedProviders += 1;
    if (isDevelopment() && mountedProviders > 1) {
      console.warn(
        "LiveRegionProvider is mounted more than once. Mount a single provider so messages are announced once.",
      );
    }
    return () => {
      mountedProviders -= 1;
      announcer.dispose();
    };
  }, [announcer]);

  return (
    <LiveRegionContext.Provider value={announcer.announce}>
      {children}
      <VisuallyHidden
        as="div"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="live-region-polite"
      >
        {texts.polite}
      </VisuallyHidden>
      <VisuallyHidden
        as="div"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="live-region-assertive"
      >
        {texts.assertive}
      </VisuallyHidden>
    </LiveRegionContext.Provider>
  );
}

/**
 * Returns `announce(message, { priority? })`, which reads a message out
 * through the app-wide live regions. The function is stable between renders.
 * Outside a `LiveRegionProvider` it does nothing, and warns once in development.
 */
export function useAnnounce(): Announce {
  const announce = useContext(LiveRegionContext);
  const missing = announce === null;
  useEffect(() => {
    if (missing && isDevelopment() && !warnedMissingProvider) {
      warnedMissingProvider = true;
      console.warn("useAnnounce was called outside a LiveRegionProvider.");
    }
  }, [missing]);
  return useCallback<Announce>(
    (message, options) => (announce ?? ignore)(message, options),
    [announce],
  );
}
