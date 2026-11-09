/** How urgently a message is read out. */
export type AnnouncePriority = "polite" | "assertive";

/** Options for a single announcement. */
export interface AnnounceOptions {
  /** `polite` waits for the screen reader to finish; `assertive` interrupts. Defaults to `polite`. */
  readonly priority?: AnnouncePriority;
}

/** Sends a message to the one app-wide announcer. */
export type Announce = (message: string, options?: AnnounceOptions) => void;

/** Messages arriving within this window are coalesced to the latest. */
export const THROTTLE_MS = 600;
/** An identical message arriving within this window of the last is dropped. */
export const DEDUPE_MS = 2000;
/** How long a region stays empty before a repeated message is set again. */
export const CLEAR_MS = 50;

/** The mutable bookkeeping for one live region. */
interface Channel {
  /** What the region currently contains. */
  text: string;
  /** The last message accepted, for de-duplication. */
  lastMessage: string | null;
  lastAcceptedAt: number;
  lastFlushedAt: number;
  /** The latest message waiting for the throttle window to end, or empty. Blank messages are never accepted, so empty means none. */
  pending: string;
  throttleTimer: ReturnType<typeof setTimeout> | null;
  clearTimer: ReturnType<typeof setTimeout> | null;
}

/** Callbacks `createAnnouncer` needs from its host. */
export interface AnnouncerHost {
  /** Writes the text of one live region. */
  readonly setText: (priority: AnnouncePriority, text: string) => void;
  /** The current time in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** The announcer: send messages, and stop its timers when the host unmounts. */
export interface Announcer {
  readonly announce: Announce;
  /** Cancels timers. Safe to call more than once; the announcer still works afterwards. */
  readonly dispose: () => void;
}

function emptyChannel(): Channel {
  return {
    text: "",
    lastMessage: null,
    lastAcceptedAt: Number.NEGATIVE_INFINITY,
    lastFlushedAt: Number.NEGATIVE_INFINITY,
    pending: "",
    throttleTimer: null,
    clearTimer: null,
  };
}

/**
 * Builds the announcer behind `LiveRegionProvider`. Each priority has its own
 * channel with three rules:
 *
 * - Throttle: at most one message per {@link THROTTLE_MS}. A burst is
 *   coalesced to the latest message, which goes out when the window ends.
 * - De-duplicate: the same message twice within {@link DEDUPE_MS} is read once.
 * - Clear then set: a region whose text would not change is emptied first, so
 *   a message repeated later is read again.
 */
export function createAnnouncer({
  setText,
  now = Date.now,
}: AnnouncerHost): Announcer {
  const channels: Record<AnnouncePriority, Channel> = {
    polite: emptyChannel(),
    assertive: emptyChannel(),
  };

  const show = (priority: AnnouncePriority, message: string) => {
    const channel = channels[priority];
    if (channel.text !== message) {
      channel.text = message;
      setText(priority, message);
      return;
    }
    channel.text = "";
    setText(priority, "");
    channel.clearTimer = setTimeout(() => {
      channel.clearTimer = null;
      channel.text = message;
      setText(priority, message);
    }, CLEAR_MS);
  };

  const flush = (priority: AnnouncePriority) => {
    const channel = channels[priority];
    channel.throttleTimer = null;
    const message = channel.pending;
    channel.pending = "";
    channel.lastFlushedAt = now();
    show(priority, message);
  };

  const announce: Announce = (message, options) => {
    if (message.trim() === "") {
      return;
    }
    const priority = options?.priority ?? "polite";
    const channel = channels[priority];
    const time = now();
    if (
      message === channel.lastMessage &&
      time - channel.lastAcceptedAt < DEDUPE_MS
    ) {
      return;
    }
    channel.lastMessage = message;
    channel.lastAcceptedAt = time;
    channel.pending = message;
    if (channel.throttleTimer !== null) {
      return;
    }
    const wait = channel.lastFlushedAt + THROTTLE_MS - time;
    if (wait <= 0) {
      flush(priority);
      return;
    }
    channel.throttleTimer = setTimeout(() => flush(priority), wait);
  };

  const dispose = () => {
    for (const channel of Object.values(channels)) {
      if (channel.throttleTimer !== null) {
        clearTimeout(channel.throttleTimer);
        channel.throttleTimer = null;
      }
      if (channel.clearTimer !== null) {
        clearTimeout(channel.clearTimer);
        channel.clearTimer = null;
      }
      channel.pending = "";
    }
  };

  return { announce, dispose };
}
