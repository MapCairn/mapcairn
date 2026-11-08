/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Layer_Search_LabelInputs */



/**
* | output |
* | --- |
* | "Filter layers" |
*
* @param {Layer_Search_LabelInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const layer_search_label = /** @type {((inputs?: Layer_Search_LabelInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Layer_Search_LabelInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Filtreer lae")
	return /** @type {LocalizedString} */ ("Filter layers")
});