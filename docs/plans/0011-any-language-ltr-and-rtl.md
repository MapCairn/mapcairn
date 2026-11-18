# 0011: Any language, left to right and right to left

Status: proposed. Tracking issue: #316.

## Goal

A host can build its interface with the SDK in any language it chooses, written left to right or right to left, by supplying a catalogue and, for fonts, a font stack. The SDK adds no language of its own: the reference site stays English and Afrikaans, and any other catalogue used in tests is test data. Once the work below is done, the README, the guide and the product page can say what the SDK supports.

## Ground rules

- No new runtime dependency in an SDK package (`AGENTS.md`, "Dependencies and lockfiles"). `Intl` first; a message-format library stays the host's choice behind `MessageCatalogue`.
- The SDK ships no non-Latin font. A font or locale data an SDK package carried would have to allow commercial use, and a host knows its audience's fonts better; the SDK provides the token hook and a tested override path.
- Build on plan 0009, which is built: this plan changes its plural format and adds direction, and does not redo the port. Layer card templates are #268 and stay there.
- Each gap is its own issue, pull request and tests, test first. Place-name language sent to the geocoder (`PhotonSuggestionProvider.ts` sends `"en"`) needs a `PRIVACY.md` decision by the maintainer and is not in scope.

## Design

The audit of `main` (summarised in #316) found the structure sound: no physical CSS properties anywhere (the harmony scanner already fails them), every transform paired with a right-to-left rule, no truncating CSS, formatting through the catalogue's language. The gaps are:

1. **Direction from language (#334).** Derive `dir` from the tag with `Intl.Locale` text info, overridable by a direction field on `LanguageOption`, and set it wherever `lang` is set, including the pre-paint script (new CSP hash). Rejected: a host-only `dir`, because a catalogue swap at runtime would then leave the direction wrong.
2. **Fit padding (#335).** A bug: coverage padding assumes the panel is on the left. Pass the reading direction in.
3. **Plural categories (#336).** Keep `a|b` for the common two-form case and allow category-keyed forms, `one{…} few{…} other{…}`, for any key; the categories a catalogue must supply are `Intl.PluralRules(language).resolvedOptions().pluralCategories`. `formatMessage` chooses `plural` by whether the active value has forms, not by English. Rejected: positional forms for every language (a translator cannot see which form is which), and a library.
4. **Bidi isolation and `lang` markup (#337).** Coordinates, scale labels and numbers with units are isolated left to right; provider, geocoder and feature names get `dir="auto"` in a `bdi`, and `lang` where known.
5. **Coordinate input (#338).** Normalise digits (`\p{Nd}`), minus signs, Arabic separators and bidi marks. Decimal comma: accepted only when pairs are separated by `;`, or when it is unambiguous; otherwise the search hint's rule (use a point) stands. This is the simplest rule that does not misread `26,5 28,3`.
6. **Unit symbols and coordinate words (#339).** Symbols and the number-and-symbol pattern become catalogue keys; coordinate words are optional keys the parser adds to its English words, as it does for hemisphere letters.
7. **Script-aware type (#340).** Zero tracking and a larger line height for non-Latin scripts through tokens and `:lang()` rules, and a tested font-stack override.
8. **Proof in CI (#341).** Generated accented-and-expanded and right-to-left pseudo-catalogues, one small Arabic sample as test data (Arabic is the hardest case: six plural categories, shaping, digits), collision and accessibility specs in them, a per-icon mirroring check.
9. **Translator checks (#342).** The Afrikaans checks become a helper a host runs on its own catalogue, plus a missing-keys command.
10. **Collation, numbering and calendars (#343).** Sort with `Intl.Collator(catalogue.language)`; numbers and dates follow the language's `Intl` defaults, coordinates stay ASCII, and a host can force Latin digits.

## Tests

Each issue lists its failing test first. The shared proof is #341: its projects fail on `main` where a screen collides, then the fixes land. Plural and parser work are table tests; direction and padding are one unit test and one Playwright spec each.

## Order of work

1. #335, the padding bug, and #343's collation fix: small, independent.
2. #334, direction from language, which unblocks right-to-left proof.
3. #336, plural categories, then #339 and #338.
4. #337 and #340.
5. #341, with the sample catalogue, then fix what it finds.
6. #342, then update the README, the guide and the product page to match what is proven (task in #316).

Each step is one pull request with the build green.

## Documents to update

`docs/guides/translate-the-sdk.md` (plurals, direction, translator checks, font override, numbering), `ARCHITECTURE.md` ("The message catalogue", "The language setting"), `DESIGN.md` ("Tokens", "Components and accessibility contracts"), and, at the end, the README and the product page. `PRIVACY.md` is unchanged.

## Risks

- Changing the plural format could break a host's existing catalogue: two-form values keep working unchanged, and a test pins that.
- The pre-paint script's CSP hash must be recomputed with #334, or the script is blocked.
- Native digits in `ar` or `fa` next to ASCII coordinates can look mixed: the policy in #343 states it and offers the Latin-digit option.
- Font fallback metrics: #340 checks them.

## Decided and open

Decided: the SDK adds no language and no font; direction follows the language tag; coordinates stay ASCII.

Open, each with a recommendation:

- Plural format: recommend the category-keyed form beside `|`, as above.
- Decimal comma: recommend the narrow rule above, not a locale-driven one.
- Numbering: recommend language defaults with a Latin-digit option.
- Place-name language sent to the geocoder: maintainer's decision, not planned here.
