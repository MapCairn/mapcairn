// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  FakeMessageCatalogue,
  formatMessage,
  type Message,
} from "@mapcairn/core";
import type { Announce, AnnounceOptions } from "./announcer";

/**
 * For tests that replace `useAnnounce` with a spy: an `announce` that hands
 * the spy a `Message` as its English text, as the live region would
 * say it, and every message to `onMessage` as it was given, so a test can
 * assert on the key and parameters as well as on the words.
 */
export function englishAnnounce(
  spy: (text: string, options?: AnnounceOptions) => void,
  onMessage: (message: Message) => void = () => undefined,
): Announce {
  const catalogue = new FakeMessageCatalogue();
  return (message, options) => {
    if (typeof message === "string") {
      spy(message, options);
      return;
    }
    onMessage(message);
    spy(formatMessage(catalogue, message), options);
  };
}

function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    "key" in value &&
    "params" in value &&
    Object.keys(value).length === 2
  );
}

/**
 * For tests of pure helpers that return messages: `value` with every message
 * inside it, at any depth, replaced by its English text, so an expectation
 * can still be written in words.
 */
export function inEnglish(value: unknown): unknown {
  if (isMessage(value)) {
    return formatMessage(new FakeMessageCatalogue(), value);
  }
  if (Array.isArray(value)) {
    return value.map(inEnglish);
  }
  if (typeof value === "object" && value !== null && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([name, inner]) => [name, inEnglish(inner)]),
    );
  }
  return value;
}
