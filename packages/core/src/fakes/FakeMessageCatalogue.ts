// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createMessageCatalogue } from "../messages/createMessageCatalogue";
import { EN_GB_CATALOGUE } from "../messages/en-GB";
import type {
  MessageCatalogue,
  MessageKey,
  MessageParams,
} from "../ports/messages";

/** One recorded call to {@link FakeMessageCatalogue.t} or `.plural`. */
export interface MessageCatalogueCall {
  /** The key that was asked for. */
  readonly key: MessageKey;
  /** The parameters that were passed with it. */
  readonly params: unknown;
}

/** Options for {@link FakeMessageCatalogue}. */
export interface FakeMessageCatalogueOptions {
  /** Defaults to "en-GB". */
  readonly language?: string;
  /** An `Intl` numbering system for numbers and days, such as "latn". */
  readonly numberingSystem?: string;
  /**
   * The language's reading direction, as `createMessageCatalogue`'s
   * `direction` option: it decides whether text parameters are isolated.
   */
  readonly direction?: "ltr" | "rtl";
  /** Forces parameter isolation on or off, as `createMessageCatalogue`'s option does. */
  readonly isolateParameters?: boolean;
  /** Host-defined layer template, unit and label translations. */
  readonly layerTemplates?: Readonly<Record<string, string>>;
  /** Host-defined definition text translations, by `HostText` key. */
  readonly definitionTexts?: Readonly<Record<string, string>>;
  /**
   * Replaces specific keys' catalogue values. Scripting a value whose
   * placeholders do not match the key's real `MessageParams` entry (a
   * placeholder mismatch) is how a test exercises a translation that has
   * drifted: the mismatched placeholder is left in the returned text.
   * Overrides may use category-keyed, two-form or plain values.
   */
  readonly overrides?: Partial<Record<MessageKey, string>>;
  /**
   * Keys to treat as missing from the active catalogue, so `t`/`plural` fall
   * back to the English value and warn, as a real catalogue would for a
   * translation that has not caught up with a new key.
   */
  readonly missingKeys?: readonly MessageKey[];
}

/**
 * A scripted {@link MessageCatalogue}.
 *
 * How to script it: pass `overrides` to change what a key resolves to, or
 * `missingKeys` to simulate a translation that lacks a key (falls back to
 * English and warns, like the real catalogue). `calls` records every `t`/
 * `plural` call in order, so a component test can assert on the key and
 * parameters a component asked for, rather than only on rendered text.
 * `list` is not scripted: it formats with `Intl.ListFormat`, the same as the
 * real catalogue, because it needs no catalogue lookup to fake.
 */
export class FakeMessageCatalogue implements MessageCatalogue {
  /** Every `t` and `plural` call, in order, with its key and parameters. */
  readonly calls: MessageCatalogueCall[] = [];

  /** The host's layer template translations the fake was given, if any. */
  readonly layerTemplates?: Readonly<Record<string, string>>;

  /** The host's definition text translations the fake was given, if any. */
  readonly definitionTexts?: Readonly<Record<string, string>>;

  readonly #inner: MessageCatalogue;

  constructor(options: FakeMessageCatalogueOptions = {}) {
    this.layerTemplates = options.layerTemplates;
    this.definitionTexts = options.definitionTexts;
    const language = options.language ?? "en-GB";
    const active: Partial<Record<MessageKey, string>> = {
      ...EN_GB_CATALOGUE,
      ...options.overrides,
    };
    for (const key of options.missingKeys ?? []) {
      delete active[key];
    }
    this.#inner = createMessageCatalogue(
      language,
      active as Record<MessageKey, string>,
      EN_GB_CATALOGUE,
      {
        ...(options.numberingSystem === undefined
          ? {}
          : { numberingSystem: options.numberingSystem }),
        ...(options.direction === undefined
          ? {}
          : { direction: options.direction }),
        ...(options.isolateParameters === undefined
          ? {}
          : { isolateParameters: options.isolateParameters }),
      },
    );
  }

  /** The `Intl` numbering system the fake was given, or `undefined`. */
  get numberingSystem(): string | undefined {
    return this.#inner.numberingSystem;
  }

  /** The language tag, `en-GB` unless the options say otherwise. */
  get language(): string {
    return this.#inner.language;
  }

  // Arrow properties, not methods: a component that destructures `const {
  // t } = useMessages()` (as it would with the real catalogue's object
  // literal) keeps a callable function with no `this` to lose.
  /** Records the call, then returns the catalogue text for the key with its parameters filled in. */
  t = <K extends MessageKey>(key: K, params: MessageParams[K]): string => {
    this.calls.push({ key, params });
    return this.#inner.t(key, params);
  };

  /** Records the call, then returns the form of the text that the count selects. */
  plural = <K extends MessageKey>(
    key: K,
    params: MessageParams[K] & { readonly count: number },
  ): string => {
    this.calls.push({ key, params });
    return this.#inner.plural(key, params);
  };

  /** Joins the items with `Intl.ListFormat`. It is not recorded or scripted. */
  list = (
    items: readonly string[],
    type?: "conjunction" | "disjunction",
  ): string => {
    return this.#inner.list(items, type);
  };
}
