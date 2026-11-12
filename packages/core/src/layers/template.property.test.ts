// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fieldValue } from "../propertyTesting/layerArbitraries";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import {
  hostileText,
  textFromFragments,
} from "../propertyTesting/textArbitraries";
import { createFormatterRegistry } from "./formatters";
import {
  ENGINE_PLACEHOLDERS,
  fillUrlTemplate,
  formatTemplate,
  parseTemplate,
} from "./template";

const TEMPLATE_FRAGMENTS = [
  "{",
  "}",
  "|",
  "{title}",
  "{value|number}",
  "{time|relative}",
  "{time|date}",
  "{depth|km}",
  "{missing|unknown-formatter}",
  "{z}",
  "{bbox-epsg-3857}",
  "{}",
  "{{title}}",
  " ",
  "https://example.test/",
];

const PLACEHOLDER_NAME = /^[a-zA-Z0-9_-]+$/;

/** Names a template may ask for that the engine does not fill itself. */
const placeholderNames = fc
  .stringMatching(PLACEHOLDER_NAME)
  .filter((name) => !ENGINE_PLACEHOLDERS.includes(name));

const formatters = createFormatterRegistry();

const fields = fc.dictionary(
  fc.constantFrom("title", "value", "time", "depth", "id"),
  fieldValue,
);

const templates = fc.oneof(hostileText, textFromFragments(TEMPLATE_FRAGMENTS));

describe("parseTemplate", () => {
  it("lists placeholders with plain names for any text", () => {
    fc.assert(
      fc.property(templates, (template) => {
        const words = parseTemplate(template).flatMap(({ name, formatter }) =>
          formatter === undefined ? [name] : [name, formatter],
        );
        expect(words.every((word) => PLACEHOLDER_NAME.test(word))).toBe(true);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("fillUrlTemplate", () => {
  it("fills any template when every placeholder has a value", () => {
    fc.assert(
      fc.property(
        templates,
        fc.string({ unit: "grapheme" }),
        (template, value) => {
          const values = Object.fromEntries(
            parseTemplate(template).map(({ name }) => [name, value]),
          );
          expect(fillUrlTemplate(template, values)).toBeTypeOf("string");
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });

  it("names the placeholder that has no value", () => {
    fc.assert(
      fc.property(placeholderNames, (name) => {
        expect(() => fillUrlTemplate(`{${name}}`, {})).toThrow(`{${name}}`);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("formatTemplate", () => {
  it("fills any template from any fields without throwing", () => {
    fc.assert(
      fc.property(templates, fields, fc.integer(), (template, values, now) => {
        const text = formatTemplate(template, values, formatters, { now });
        expect(text === null || typeof text === "string").toBe(true);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
