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
  readonly key: MessageKey;
  readonly params: unknown;
}

/** Options for {@link FakeMessageCatalogue}. */
export interface FakeMessageCatalogueOptions {
  /** Defaults to "en-GB". */
  readonly language?: string;
  /**
   * Replaces specific keys' catalogue values. Scripting a value whose
   * placeholders do not match the key's real `MessageParams` entry (a
   * placeholder mismatch) is how a test exercises a translation that has
   * drifted: the mismatched placeholder is left in the returned text, as it
   * would be with any catalogue implementation.
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
  readonly calls: MessageCatalogueCall[] = [];

  readonly #inner: MessageCatalogue;

  constructor(options: FakeMessageCatalogueOptions = {}) {
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
    );
  }

  get language(): string {
    return this.#inner.language;
  }

  // Arrow properties, not methods: a component that destructures `const {
  // t } = useMessages()` (as it would with the real catalogue's object
  // literal) keeps a callable function with no `this` to lose.
  t = <K extends MessageKey>(key: K, params: MessageParams[K]): string => {
    this.calls.push({ key, params });
    return this.#inner.t(key, params);
  };

  plural = <K extends MessageKey>(
    key: K,
    params: MessageParams[K] & { readonly count: number },
  ): string => {
    this.calls.push({ key, params });
    return this.#inner.plural(key, params);
  };

  list = (
    items: readonly string[],
    type?: "conjunction" | "disjunction",
  ): string => {
    return this.#inner.list(items, type);
  };
}
