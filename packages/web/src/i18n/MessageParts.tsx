// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  MessageCatalogue,
  MessageKey,
  MessageParams,
} from "@mapcairn/core";
import { Fragment, type ReactNode } from "react";

/** Matches a `{name}` placeholder in a catalogue string, keeping the name. */
const PLACEHOLDER = /\{(\w+)\}/g;

/** The name of a placeholder found while splitting a catalogue string. */
export interface PlaceholderPiece {
  readonly placeholder: string;
}

/**
 * Splits a catalogue string around its `{name}` placeholders into the text
 * between them and the placeholders themselves, in order. Text that is empty
 * is left out.
 */
export function splitAroundPlaceholders(
  text: string,
): ReadonlyArray<string | PlaceholderPiece> {
  const pieces: Array<string | PlaceholderPiece> = [];
  let from = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match.index > from) {
      pieces.push(text.slice(from, match.index));
    }
    pieces.push({ placeholder: match[1] ?? "" });
    from = match.index + match[0].length;
  }
  if (from < text.length) {
    pieces.push(text.slice(from));
  }
  return pieces;
}

/** Props of {@link MessageParts}. */
export interface MessagePartsProps {
  /** The active catalogue to look the message up in. */
  readonly messages: MessageCatalogue;
  /** The catalogue key of the text, whose placeholders name the `parts`. */
  readonly messageKey: MessageKey;
  /** What to put in place of each `{name}` placeholder: a link, a `<code>` span. */
  readonly parts: Readonly<Record<string, ReactNode>>;
}

/**
 * Renders a catalogue string whose placeholders stand for elements rather
 * than text, such as a link or a `<code>` span, so the surrounding words are
 * translated as one sentence and the markup stays in the component. The
 * catalogue string holds only `{name}` placeholders, never markup. A
 * placeholder with no entry in `parts` stays as written.
 *
 * @remarks Each name in `parts` is looked up as its own `{name}`, so the
 *   catalogue returns the string with those placeholders untouched and this
 *   component splits it around them.
 */
export function MessageParts({
  messages,
  messageKey,
  parts,
}: MessagePartsProps) {
  const untouched = Object.fromEntries(
    Object.keys(parts).map((name) => [name, `{${name}}`]),
  ) as unknown as MessageParams[typeof messageKey];
  const pieces = splitAroundPlaceholders(messages.t(messageKey, untouched));
  return (
    <>
      {pieces.map((piece, index) => {
        const key = `${index}`;
        if (typeof piece === "string") {
          return <Fragment key={key}>{piece}</Fragment>;
        }
        const written = `{${piece.placeholder}}`;
        return (
          <Fragment key={key}>{parts[piece.placeholder] ?? written}</Fragment>
        );
      })}
    </>
  );
}
