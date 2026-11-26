// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatMessage } from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useOptionalMessages } from "../../services/hooks";
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

let warnedMissingProvider = false;

/** Does nothing. Returned outside a provider so callers need no null check. */
const ignore: Announce = () => undefined;

/** Props for {@link LiveRegionProvider}. */
export interface LiveRegionProviderProps {
  /** The app, whose components announce through `useAnnounce`. */
  readonly children?: ReactNode;
}

/**
 * Mounts the announcer for one React tree: a visually hidden polite `status`
 * region and a visually hidden assertive `alert` region. Nothing else in the
 * app may create a live region except `StatusMessage`, which is a visible
 * message.
 * @remarks Mount one near the root of each React tree. Separate React roots
 *   each need their own provider and have their own announcer and throttle. A
 *   provider nested inside another shadows the outer one for the components
 *   below it and logs a warning in development, because both would read the
 *   same message.
 */
export function LiveRegionProvider({ children }: LiveRegionProviderProps) {
  const [texts, setTexts] = useState<Record<AnnouncePriority, string>>({
    polite: "",
    assertive: "",
  });
  const nested = useContext(LiveRegionContext) !== null;
  const catalogueRef = useLatestRef(useOptionalMessages());
  const [announcer] = useState(() =>
    createAnnouncer({
      setText: (priority, text) =>
        setTexts((current) => ({ ...current, [priority]: text })),
    }),
  );

  useEffect(() => {
    if (nested && isDevelopment()) {
      console.warn(
        "LiveRegionProvider is nested inside another LiveRegionProvider. Mount one provider for each React tree so messages are announced once.",
      );
    }
  }, [nested]);

  useEffect(() => () => announcer.dispose(), [announcer]);

  const announce = useCallback<Announce>(
    (message, options) =>
      announcer.announce(
        typeof message === "string"
          ? message
          : formatMessage(catalogueRef.current, message),
        options,
      ),
    [announcer, catalogueRef],
  );

  return (
    <LiveRegionContext.Provider value={announce}>
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

/** Props for {@link LiveRegionScope}. */
export interface LiveRegionScopeProps {
  /**
   * Rewrites the text of every announcement made below, after a `Message` is
   * formatted. Leave it out and announcements pass through unchanged.
   */
  readonly format?: (text: string) => string;
  /** The part of the app whose announcements `format` applies to. */
  readonly children?: ReactNode;
}

/**
 * Narrows the app-wide announcer for the part of the app below it: each
 * announcement is formatted with `format`, then goes to the same live
 * regions. `MapView` uses it to say which map a message came from. Without
 * `format`, or outside a `LiveRegionProvider`, the announcer is unchanged.
 */
export function LiveRegionScope({ format, children }: LiveRegionScopeProps) {
  const parent = useContext(LiveRegionContext);
  const catalogueRef = useLatestRef(useOptionalMessages());
  const formatRef = useLatestRef(format);
  const scoping = format !== undefined;
  const scoped = useMemo<Announce | null>(() => {
    if (parent === null || !scoping) {
      return parent;
    }
    return (message, options) => {
      const text =
        typeof message === "string"
          ? message
          : formatMessage(catalogueRef.current, message);
      parent(formatRef.current?.(text) ?? text, options);
    };
  }, [parent, scoping, catalogueRef, formatRef]);
  return (
    <LiveRegionContext.Provider value={scoped}>
      {children}
    </LiveRegionContext.Provider>
  );
}

/**
 * Returns `announce(message, { priority?, keep? })`, which reads a message out
 * through the app-wide live regions. The message is text or a `Message` from
 * core, which is formatted with the active catalogue. Pass `keep` for the outcome of something
 * the person did, so a later message cannot replace it while it waits for the
 * throttle window. The function is stable between renders.
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
