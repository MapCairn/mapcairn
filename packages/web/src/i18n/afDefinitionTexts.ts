// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The Afrikaans wording of the reference host's own definition text: the
 * `{ key, text }` names and descriptions in `layers/definitions`, loaded
 * together with `AF_CATALOGUE`. The key is the host's, not a `MessageKey`.
 *
 * @remarks These words follow the register of `af.ts`.
 *   `afDefinitionTexts.test.ts` checks the keys against the definitions.
 */
export const AF_DEFINITION_TEXTS: Readonly<Record<string, string>> = {
  "layer.earth-at-night.name": "Die aarde snags",
  "layer.earth-at-night.description":
    "Die ligte van stede, paaie en skepe soos uit die ruimte gesien, as 'n wolkvrye prent van 2016. Die fynste detail is sowat 500 m.",
};
