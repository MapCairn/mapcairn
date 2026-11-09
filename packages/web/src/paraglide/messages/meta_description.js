/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Meta_DescriptionInputs */



/**
* | output |
* | --- |
* | "Explore an interactive map. Search places, compare basemaps and measure distances or areas." |
*
* @param {Meta_DescriptionInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const meta_description = /** @type {((inputs?: Meta_DescriptionInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Meta_DescriptionInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Verken 'n interaktiewe kaart. Soek plekke, vergelyk basiskaarte en meet afstande of oppervlaktes.")
	return /** @type {LocalizedString} */ ("Explore an interactive map. Search places, compare basemaps and measure distances or areas.")
});