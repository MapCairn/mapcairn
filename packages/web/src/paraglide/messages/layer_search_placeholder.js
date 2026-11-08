/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Layer_Search_PlaceholderInputs */



/**
* | output |
* | --- |
* | "Search layers" |
*
* @param {Layer_Search_PlaceholderInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const layer_search_placeholder = /** @type {((inputs?: Layer_Search_PlaceholderInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Layer_Search_PlaceholderInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Soek lae")
	return /** @type {LocalizedString} */ ("Search layers")
});