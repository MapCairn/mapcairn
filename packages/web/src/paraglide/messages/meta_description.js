/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Meta_DescriptionInputs */



/**
* | output |
* | --- |
* | "Explore geographic data on an interactive map. Choose layers, inspect features and compare map styles." |
*
* @param {Meta_DescriptionInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const meta_description = /** @type {((inputs?: Meta_DescriptionInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Meta_DescriptionInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Verken geografiese data op 'n interaktiewe kaart. Kies lae, ondersoek kenmerke en vergelyk kaartstyle.")
	return /** @type {LocalizedString} */ ("Explore geographic data on an interactive map. Choose layers, inspect features and compare map styles.")
});