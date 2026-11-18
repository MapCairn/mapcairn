// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { EN_GB_CATALOGUE } from "../messages/en-GB";
import type { MessageCatalogue, MessageKey } from "../ports/messages";

/**
 * How the message catalogue contract scripts a subject.
 * `createMissingKey(key)` must return an instance whose active catalogue
 * lacks `key`, so `t`/`plural` fall back to its English value and warn.
 */
export interface MessageCatalogueFixture {
  /** A fresh, fully resolved instance, in English. */
  readonly create: () => MessageCatalogue;
  /** A fresh instance missing `key`, so it falls back to English and warns. */
  readonly createMissingKey: (key: MessageKey) => MessageCatalogue;
  /** A fresh instance with a scripted language and active values. */
  readonly createWith: (
    language: string,
    values: Partial<Record<MessageKey, string>>,
  ) => MessageCatalogue;
}

const [PLURAL_ONE, PLURAL_OTHER] =
  EN_GB_CATALOGUE["common.itemCount"].split("|");

/**
 * Runs the shared behavioural suite for a {@link MessageCatalogue}. Proves a
 * key resolves with its parameters substituted, a missing key falls back to
 * the English value and warns exactly once per instance, `plural` picks the
 * right English form for 0, 1 and many, and `list` matches what
 * `Intl.ListFormat` itself produces.
 */
export function runMessageCatalogueContract(
  name: string,
  fixture: MessageCatalogueFixture,
): void {
  describe(`MessageCatalogue contract: ${name}`, () => {
    it("has a non-empty language tag", () => {
      expect(fixture.create().language.length).toBeGreaterThan(0);
    });

    it("resolves a key with its parameters substituted", () => {
      const catalogue = fixture.create();
      expect(catalogue.t("settings.title", {})).toBe(
        EN_GB_CATALOGUE["settings.title"],
      );
      expect(catalogue.plural("common.itemCount", { count: 3 })).toBe(
        PLURAL_OTHER?.replace("{count}", "3"),
      );
    });

    it("falls back to the English value, and warns once per missing key per instance", () => {
      const catalogue = fixture.createMissingKey("common.itemCount");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(catalogue.plural("common.itemCount", { count: 1 })).toBe(
        PLURAL_ONE?.replace("{count}", "1"),
      );
      expect(warn).toHaveBeenCalledTimes(1);
      catalogue.plural("common.itemCount", { count: 2 });
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it("picks the English plural form for 0, 1 and many", () => {
      const catalogue = fixture.create();
      expect(catalogue.plural("common.itemCount", { count: 1 })).toBe(
        PLURAL_ONE?.replace("{count}", "1"),
      );
      expect(catalogue.plural("common.itemCount", { count: 0 })).toBe(
        PLURAL_OTHER?.replace("{count}", "0"),
      );
      expect(catalogue.plural("common.itemCount", { count: 5 })).toBe(
        PLURAL_OTHER?.replace("{count}", "5"),
      );
    });

    it("selects all Arabic plural categories and allows a plain active value", () => {
      const catalogue = fixture.createWith("ar", {
        "common.itemCount":
          "zero{zero} one{one} two{two} few{few} many{many} other{other}",
        "announce.searchResults": "single {count}",
      });
      for (const [count, form] of [
        [0, "zero"],
        [1, "one"],
        [2, "two"],
        [3, "few"],
        [11, "many"],
        [100, "other"],
      ] as const) {
        expect(catalogue.plural("common.itemCount", { count })).toBe(form);
      }
      expect(catalogue.plural("announce.searchResults", { count: 2 })).toBe(
        `single ${new Intl.NumberFormat("ar").format(2)}`,
      );
    });

    it("joins a list the same way Intl.ListFormat does, for the instance's language", () => {
      const catalogue = fixture.create();
      const items = ["Topographic", "Satellite", "Dark"];
      expect(catalogue.list(items)).toBe(
        new Intl.ListFormat(catalogue.language, { type: "conjunction" }).format(
          items,
        ),
      );
      expect(catalogue.list(items, "disjunction")).toBe(
        new Intl.ListFormat(catalogue.language, { type: "disjunction" }).format(
          items,
        ),
      );
    });
  });
}
