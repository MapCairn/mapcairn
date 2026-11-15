// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * A key into the shipped message catalogue. One flat, hand-maintained union,
 * grouped by area with a dotted prefix. A component never writes a literal
 * string; it looks up a key through {@link MessageCatalogue.t} or
 * {@link MessageCatalogue.plural} instead, so the text can be replaced or
 * translated without touching the component.
 *
 * @remarks Only the keys the Settings panel needs are here so far; later
 *   steps add a key as each further component moves off inline copy.
 *   `common.itemCount` is the exception: it carries no user-facing text yet
 *   and exists only so the contract suite can prove {@link
 *   MessageCatalogue.plural} picks the right English form, until a real
 *   plural key is needed.
 */
export type MessageKey =
  | "settings.title"
  | "settings.theme.label"
  | "settings.theme.system"
  | "settings.theme.light"
  | "settings.theme.dark"
  | "settings.units.label"
  | "settings.units.metric"
  | "settings.units.imperial"
  | "settings.mapShape.label"
  | "settings.mapShape.flat"
  | "settings.mapShape.globe"
  | "settings.zoomButtons.label"
  | "settings.zoomButtons.description"
  | "settings.saveData.label"
  | "settings.saveData.description"
  | "settings.notSaved"
  | "settings.privacy.heading"
  | "settings.privacy.link"
  | "common.itemCount";

/**
 * The parameters a key's placeholders need. A key with no placeholders maps
 * to an empty object, so it still takes a `params` argument (for a
 * consistent call shape), but an empty one.
 */
interface MessageParamOverrides {
  /** `{count}`, consumed by {@link MessageCatalogue.plural}. */
  readonly "common.itemCount": { readonly count: number };
}

/** The parameters every {@link MessageKey} takes, keyed by the key itself. */
export type MessageParams = {
  readonly [K in MessageKey]: K extends keyof MessageParamOverrides
    ? MessageParamOverrides[K]
    : Record<string, never>;
};

/**
 * Formats text for one language. The SDK's dependency-free default is
 * `createMessageCatalogue`; a host may wire a message-format library of its
 * own behind this same shape.
 */
export interface MessageCatalogue {
  /** BCP 47 tag of the language this instance speaks, for example "en-GB" or "af". */
  readonly language: string;
  /**
   * Looks up a key, substitutes its parameters (written `{name}` in the
   * string), and falls back to the English value with a single
   * `console.warn` per missing key when the active catalogue lacks it.
   */
  t<K extends MessageKey>(key: K, params: MessageParams[K]): string;
  /**
   * As {@link t}, but first picks the plural form with `Intl.PluralRules`.
   * `params` carries `count` plus the key's other parameters.
   */
  plural<K extends MessageKey>(
    key: K,
    params: MessageParams[K] & { readonly count: number },
  ): string;
  /**
   * Joins items with `Intl.ListFormat`, for example "Topographic, Satellite
   * and Dark". `type` defaults to "conjunction".
   */
  list(items: readonly string[], type?: "conjunction" | "disjunction"): string;
}
