// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/** How urgently a message is read out. */
export type AnnouncePriority = "polite" | "assertive";

/** Options for a single announcement. */
export interface AnnounceOptions {
  /** `polite` waits for the screen reader to finish; `assertive` interrupts. Defaults to `polite`. */
  readonly priority?: AnnouncePriority;
  /**
   * Speak this message even when others follow it closely. A message that is
   * not kept is replaced by a later one that arrives before the throttle
   * window ends, which suits a stream of updates. Set `keep` on a message that
   * reports the outcome of something the person did, so a later message does
   * not replace it. Kept messages wait their turn, one per window, in order.
   */
  readonly keep?: boolean;
}

/** Sends a message to the one app-wide announcer. */
export type Announce = (message: string, options?: AnnounceOptions) => void;

/**
 * At most one message per priority is spoken in each window of this length.
 * Messages that are not kept and arrive inside it are coalesced to the latest;
 * kept messages queue.
 */
export const THROTTLE_MS = 600;
/** An identical message arriving within this window of the last is dropped. */
export const DEDUPE_MS = 2000;
/** How long a region stays empty before a repeated message is set again. */
export const CLEAR_MS = 50;

/** A message waiting for the throttle window to end. */
interface Waiting {
  readonly message: string;
  readonly keep: boolean;
}

/** The mutable bookkeeping for one live region. */
interface Channel {
  /** What the region currently contains. */
  text: string;
  /** The last message accepted, for de-duplication. */
  lastMessage: string | null;
  lastAcceptedAt: number;
  lastFlushedAt: number;
  /** The messages waiting for the throttle window to end, oldest first. */
  queue: Waiting[];
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
    queue: [],
    throttleTimer: null,
    clearTimer: null,
  };
}

/**
 * Builds the announcer behind `LiveRegionProvider`. Each priority has its own
 * channel with three rules:
 *
 * - Throttle: at most one message per {@link THROTTLE_MS}. The first message
 *   after an idle window goes out at once. Messages that arrive inside the
 *   window wait for it to end, and a waiting message is replaced by a later one
 *   unless either is kept (`keep`). So a burst of updates is coalesced to the
 *   latest, and a kept message is never lost: it is spoken in its turn, one
 *   per window, in the order it arrived.
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

  /** Speaks the oldest waiting message when the window allows, else waits for it to end. */
  const schedule = (priority: AnnouncePriority) => {
    const channel = channels[priority];
    const [head] = channel.queue;
    if (head === undefined || channel.throttleTimer !== null) {
      return;
    }
    const wait = channel.lastFlushedAt + THROTTLE_MS - now();
    if (wait > 0) {
      channel.throttleTimer = setTimeout(() => {
        channel.throttleTimer = null;
        schedule(priority);
      }, wait);
      return;
    }
    channel.queue.shift();
    channel.lastFlushedAt = now();
    show(priority, head.message);
    schedule(priority);
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
    const keep = options?.keep ?? false;
    const tail = channel.queue.at(-1);
    if (tail !== undefined && !tail.keep && !keep) {
      channel.queue[channel.queue.length - 1] = { message, keep };
    } else {
      channel.queue.push({ message, keep });
    }
    schedule(priority);
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
      channel.queue = [];
    }
  };

  return { announce, dispose };
}
