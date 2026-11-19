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
  /**
   * A fresh instance with a scripted language and active values, and
   * optionally an `Intl` numbering system for numbers and days.
   */
  readonly createWith: (
    language: string,
    values: Partial<Record<MessageKey, string>>,
    numberingSystem?: string,
  ) => MessageCatalogue;
  /**
   * A fresh instance with its reading direction and, optionally, an explicit
   * parameter isolation setting, as `createMessageCatalogue`'s options.
   */
  readonly createIsolating: (
    language: string,
    options: {
      readonly direction?: "ltr" | "rtl";
      readonly isolateParameters?: boolean;
    },
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

    describe("numbering system", () => {
      const values = { "announce.searchResults": "{count} on {date}" };
      const params = {
        count: 1234.5,
        date: new Date(Date.UTC(2026, 10, 11)),
      } as never;
      const nativeDigits = /[\u06F0-\u06F9]/u;

      it("writes numbers and days in the language's own digits when none is set", () => {
        const catalogue = fixture.createWith("fa", values);
        expect(catalogue.numberingSystem).toBeUndefined();
        expect(catalogue.t("announce.searchResults", params)).toMatch(
          nativeDigits,
        );
      });

      it("writes numbers and days in the numbering system when one is set", () => {
        const catalogue = fixture.createWith("fa", values, "latn");
        expect(catalogue.numberingSystem).toBe("latn");
        expect(catalogue.language).toBe("fa");
        const text = catalogue.t("announce.searchResults", params);
        expect(text).toContain("1,234.5");
        expect(text).not.toMatch(nativeDigits);
        expect(
          catalogue.plural("announce.searchResults", {
            ...(params as object),
            count: 2,
          } as never),
        ).not.toMatch(nativeDigits);
      });

      it("ignores a malformed numbering system and warns once", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
          const catalogue = fixture.createWith("fa", values, "x");
          expect(catalogue.numberingSystem).toBeUndefined();
          expect(catalogue.t("announce.searchResults", params)).toMatch(
            nativeDigits,
          );
          expect(warn).toHaveBeenCalledTimes(1);
        } finally {
          warn.mockRestore();
        }
      });
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

    describe("parameter isolation", () => {
      const FSI = "\u2068";
      const PDI = "\u2069";
      const position = { position: "-26.2, 28.0" };
      const sentence = (catalogue: MessageCatalogue) =>
        catalogue.t("announce.pinDropped", position);

      it("keeps a left-to-right language plain", () => {
        const catalogue = fixture.createIsolating("en-GB", {});
        expect(sentence(catalogue)).toBe("Pin dropped at -26.2, 28.0");
        expect(catalogue.list(["a", "b"])).not.toContain(FSI);
      });

      it("isolates text parameters and list items in a right-to-left language", () => {
        const catalogue = fixture.createIsolating("ar", {});
        expect(sentence(catalogue)).toBe(
          `Pin dropped at ${FSI}-26.2, 28.0${PDI}`,
        );
        expect(catalogue.list(["a", "b"]).split(FSI)).toHaveLength(3);
      });

      it("takes the direction a host gives over the tag's", () => {
        expect(
          sentence(fixture.createIsolating("en-GB", { direction: "rtl" })),
        ).toContain(FSI);
        expect(
          sentence(fixture.createIsolating("ar", { direction: "ltr" })),
        ).not.toContain(FSI);
      });

      it("lets isolateParameters override the direction, both ways", () => {
        expect(
          sentence(
            fixture.createIsolating("en-GB", { isolateParameters: true }),
          ),
        ).toContain(FSI);
        expect(
          sentence(
            fixture.createIsolating("ar", {
              direction: "rtl",
              isolateParameters: false,
            }),
          ),
        ).not.toContain(FSI);
      });

      it("does not let a value end its own isolation", () => {
        const text = fixture
          .createIsolating("ar", {})
          .t("announce.pinDropped", { position: `x${PDI} y` });
        expect(text).toBe(`Pin dropped at ${FSI}x y${PDI}`);
      });
    });
  });
}
