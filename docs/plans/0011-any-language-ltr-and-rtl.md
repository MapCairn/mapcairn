# 0011: Any language, left to right and right to left

Status: in progress. Tracking issue: #316.

## Goal

A host can build its interface with the SDK in any language it chooses, written left to right or right to left, by supplying a catalogue and, for fonts, a font stack. The SDK adds no language of its own: the reference site stays English and Afrikaans, and any other catalogue used in tests is test data. Once the work below is done, the README, the guide and the product page can say what the SDK supports.

## Ground rules

- No new runtime dependency in an SDK package (`AGENTS.md`, "Dependencies and lockfiles"). `Intl` first; a message-format library stays the host's choice behind `MessageCatalogue`.
- The SDK ships no non-Latin font. A font or locale data an SDK package carried would have to allow commercial use, and a host knows its audience's fonts better; the SDK provides the token hook and a tested override path.
- Build on plan 0009, which is built: this plan changes its plural format and adds direction, and does not redo the port. Layer card templates are #268 and stay there.
- Each gap is its own issue, pull request and tests, test first. Place-name language sent to the geocoder (`PhotonSuggestionProvider.ts` sends `"en"`) needs a `PRIVACY.md` decision by the maintainer and is not in scope.

## Design

The audit of `main` (summarised in #316) found the structure sound: no physical CSS properties anywhere (the harmony scanner already fails them), every transform paired with a right-to-left rule, one truncating rule (the search input's ellipsis in `SearchPill.css.ts`, checked by #341), formatting through the catalogue's language. The gaps are:

1. **Direction from language (#334).** `LanguageOption` gains an optional `direction`, defaulting to what `Intl.Locale(tag).getTextInfo()` (or `textInfo`) reports, falling back to `ltr` where neither exists; if the TypeScript lib lacks the member, the call is cast in one helper in core. The pre-paint script cannot call `Intl` reliably, so a `tag → dir` map for the offered languages is built into it at build time (new CSP hash); the server renders `<html lang dir>` for the default language, so a right-to-left default has no flash. `dir` is set wherever `lang` is set: the script, `root.tsx`, `routes/app.tsx`, the error page and the product page. Rejected: a host-only `dir`, because a catalogue swap at runtime would then leave the direction wrong.
2. **Fit padding (#335).** A bug: padding assumes the panel is on the left and the end stack on the right. `coveredPadding`, `fitPadding` (including `FIT_CLEARANCE_END_PX` and `FIT_CLEARANCE_PX`) and `revealOffset` take the reading direction and mirror the whole padding. Call sites: `useFreeCentre`, `LayersSection`, `MapDirections` and `ShapesSection`.
3. **Plural categories (#336).** Keep `a|b` for the common two-form case and allow category-keyed forms, `one{…} few{…} other{…}`, for any key; the categories a catalogue must supply are `Intl.PluralRules(language).resolvedOptions().pluralCategories`. The port changes: `plural` falls back to `t` when the active value has no forms, and `formatMessage` always calls `plural` for a key whose English value has forms, so it no longer reads `EN_GB_CATALOGUE` to decide. Keys English writes as one form but another language needs forms for take an optional `count` in `MessageParams`. `FakeMessageCatalogue`, the contract suite, `packages/core/src/lint/messages.test.ts` and the guide change with it. Rejected: positional forms for every language (a translator cannot see which form is which), and a library.
4. **Bidi isolation and `lang` markup (#337).** Coordinates, scale labels and numbers with units are isolated left to right; provider, geocoder and feature names go in a `bdi` (which is `dir="auto"` by default) with `lang` where known.
5. **Coordinate input (#338).** Normalise digits (`\p{Nd}`), minus signs, Arabic separators and bidi marks. Decimal comma: accepted only when the pair is separated by `;`, or by whitespace with every number carrying a comma; otherwise the search hint's rule (use a point) stands. This is the simplest rule that does not misread `26,5 28,3`.
6. **Unit symbols and coordinate words (#339).** Symbols and the number-and-symbol pattern become catalogue keys; coordinate words are optional keys the parser adds to its English words, as it does for hemisphere letters.
7. **Script-aware type (#340).** Zero tracking and a larger line height for non-Latin scripts through tokens and `:lang()` rules, and a tested font-stack override.
8. **Proof in CI (#341).** Generated accented-and-expanded and right-to-left pseudo-catalogues, one small Arabic sample as test data (Arabic is the hardest case: six plural categories, shaping, digits), collision and accessibility specs in them, a per-icon mirroring check.
9. **Translator checks (#342).** The Afrikaans checks become a helper a host runs on its own catalogue, plus a missing-keys command.
10. **Collation, numbering and calendars (#343).** Sort with `Intl.Collator(catalogue.language)`; numbers and dates follow the language's `Intl` defaults, coordinates stay ASCII, and a host can force Latin digits through a `numberingSystem` option on `createMessageCatalogue` (a catalogue-level field, so the port and `FakeMessageCatalogue` carry it).

## Tests

Each issue lists its failing test first. The shared proof is #341: its projects fail on `main` where a screen collides, then the fixes land. Plural and parser work are table tests; direction and padding are one unit test and one Playwright spec each.

## Order of work

1. #335, the padding bug (`packages/map/src/layers/reveal.ts` and its four call sites), and #343's collation fix (`useDataLayers.ts`): small, independent.
2. #334, direction from language (the port, `themeBootstrap.ts`, `root.tsx`, `routes/app.tsx`, `useErrorPageMessages.ts`, headers), which unblocks right-to-left proof.
3. #336, plural categories (`createMessageCatalogue.ts`, `formatMessage.ts`, the port, the fake, the contract suite, `lint/messages.test.ts`), then #339 and #338 (`units/measurement.ts`, `scale/scale.ts`, `parseCoordinates.ts`).
4. #343's numbering option (the catalogue factory), #337 (`MapReadout`, `PinCard`, `DirectionsPanel`, search results) and #340 (`packages/theme`).
5. #341, with the sample catalogue (`e2e/support/language.ts`, `playwright.config.ts`), then fix what it finds.
6. #342 (a core helper and a script), then update the README, the guide and the product page to match what is proven (task in #316).

Each step is one pull request with the build green.

## Documents to update

The guide `sites/docs/docs/guides/translate-the-sdk.md`: direction in step 2, plurals in step 3, numbering and the font override in step 4, translator checks in step 6. `ARCHITECTURE.md` ("The message catalogue", "The language setting"): steps 2 and 3. `DESIGN.md` ("Tokens", "Components and accessibility contracts"): step 4. The README and the product page: step 6. `PRIVACY.md` is unchanged.

## Risks

- Changing the plural format could break a host's existing catalogue: two-form values keep working unchanged, and a test pins that.
- The pre-paint script's CSP hash must be recomputed with #334, or the script is blocked.
- Native digits in `ar` or `fa` next to ASCII coordinates can look mixed: the policy in #343 states it and offers the Latin-digit option.
- Font fallback metrics: #340 checks them.

## Decided and open

Decided on 2026-11-18, to keep the SDK small and the host in control: the SDK adds no language and no font; direction follows the language tag; coordinates stay ASCII.

Open, each with a recommendation (decide before the step that needs it):

- Plural format: recommend the category-keyed form beside `|`, as above.
- Decimal comma: recommend the narrow rule above, not a locale-driven one.
- Numbering: recommend language defaults with a Latin-digit option.
- Place-name language sent to the geocoder: maintainer's decision, not planned here.
