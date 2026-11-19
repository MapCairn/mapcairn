// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The Afrikaans wording of the reference host's keyed layer templates (card
 * lines, list secondary lines), loaded together with `AF_CATALOGUE`. Each
 * entry keeps the fields and formatters of its English source in
 * `layers/definitions`; provider-supplied values such as a place name or an
 * alert level are filled in as published.
 *
 * @remarks These words follow the register of `af.ts`.
 *   `afLayerTemplates.test.ts` checks the keys and placeholders against the
 *   definitions.
 */
export const AF_LAYER_TEMPLATES: Readonly<Record<string, string>> = {
  "earthquakes.card.magnitude": "Sterkte {magnitude|number}",
  "earthquakes.card.depth": "{depth|km} diep",
  "earthquakes.list.secondary": "Sterkte {magnitude|number}, {time|relative}",
  "world-countries.card.population": "Bevolking: ongeveer {population|number}",
  "world-countries.list.secondary": "Ongeveer {population|number} inwoners",
  "gdacs.card.from": "Vanaf {from|date}",
  "gdacs.card.lastUpdated": "Laas opgedateer: {to|date}",
  "gdacs.list.secondary": "Waarskuwingsvlak {level}, {from|relative}",
};
