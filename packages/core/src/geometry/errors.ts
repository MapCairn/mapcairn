// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createMessageCatalogue } from "../messages/createMessageCatalogue";
import { EN_GB_CATALOGUE } from "../messages/en-GB";
import { formatMessage } from "../messages/formatMessage";
import type { Message } from "../ports/messages";

/**
 * Why a geometry operation refused its input: the input is not valid GeoJSON
 * or WKT (`invalid`), it holds no coordinates where the operation needs some
 * (`empty`), or it is a kind of shape the operation does not handle
 * (`unsupported`).
 */
export type GeometryErrorKind = "invalid" | "empty" | "unsupported";

const ENGLISH = createMessageCatalogue(
  "en-GB",
  EN_GB_CATALOGUE,
  EN_GB_CATALOGUE,
);

/** The only error the geometry helpers throw. */
export class GeometryError extends Error {
  readonly kind: GeometryErrorKind;

  /**
   * What went wrong as a message to format with the active catalogue, when the
   * fault is one a person can act on (a fault in WKT text they typed or
   * opened). `message` carries the same words in English, for logs.
   */
  readonly description: Message | undefined;

  constructor(kind: GeometryErrorKind, message?: string | Message) {
    super(
      typeof message === "object"
        ? formatMessage(ENGLISH, message)
        : (message ?? `The geometry was refused: ${kind}.`),
    );
    this.name = "GeometryError";
    this.kind = kind;
    this.description = typeof message === "object" ? message : undefined;
  }
}
