/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Layer_Search_EmptyInputs */



/**
* | output |
* | --- |
* | "No layers match this search." |
*
* @param {Layer_Search_EmptyInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const layer_search_empty = /** @type {((inputs?: Layer_Search_EmptyInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Layer_Search_EmptyInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Geen lae pas by hierdie soektog nie.")
	return /** @type {LocalizedString} */ ("No layers match this search.")
});