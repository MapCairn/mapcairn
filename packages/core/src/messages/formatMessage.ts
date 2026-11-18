// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  Message,
  MessageArgs,
  MessageCatalogue,
  MessageKey,
  MessageParams,
} from "../ports/messages";

/** Builds a {@link Message}: a key and the parameters its placeholders need. */
export function message<K extends MessageKey>(
  key: K,
  params: MessageArgs<MessageParams[K]>,
): Message<K> {
  return { key, params } as Message<K>;
}

function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Date) &&
    !Array.isArray(value) &&
    "key" in value &&
    "params" in value
  );
}

/**
 * Turns a {@link Message} into text with `catalogue`. A placeholder that holds
 * another message, or a list with messages among its items, is formatted
 * first, so a sentence can carry a distance, a travel mode or a layer's name
 * and the whole thing is in one language. A message with a count goes
 * through `plural`, so the active catalogue chooses whether it has forms.
 */
export function formatMessage(
  catalogue: MessageCatalogue,
  { key, params }: Message,
): string {
  const text = (value: unknown): unknown =>
    isMessage(value) ? formatMessage(catalogue, value) : value;
  const resolved = Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.map(text) : text(value),
    ]),
  ) as MessageParams[MessageKey];
  if ("count" in resolved && typeof resolved.count === "number") {
    return catalogue.plural(
      key,
      resolved as MessageParams[MessageKey] & { readonly count: number },
    );
  }
  return catalogue.t(key, resolved);
}

/** The keys that place two messages one after the other, each with `{first}` and `{second}`. */
export type MessageJoiner =
  | "common.followedBy"
  | "common.commaJoined"
  | "common.dotJoined";

/**
 * `lead` followed by each of `rest` that is not null, nested in `joiner`
 * (such as `common.followedBy`, which puts a space between them). The message
 * is `lead` itself when there is nothing to add.
 */
export function appendMessages(
  lead: Message,
  rest: readonly (Message | null)[],
  joiner: MessageJoiner = "common.followedBy",
): Message {
  return rest.reduce<Message>(
    (joined, next) =>
      next === null ? joined : message(joiner, { first: joined, second: next }),
    lead,
  );
}

/**
 * Joins messages into one, in order, by nesting them in `joiner`. Null for no
 * parts, and the part itself for one.
 */
export function joinMessages(
  parts: readonly Message[],
  joiner: MessageJoiner = "common.followedBy",
): Message | null {
  const [head, ...rest] = parts;
  return head === undefined ? null : appendMessages(head, rest, joiner);
}
