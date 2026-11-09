/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Webmcp_Measure_Area_DescriptionInputs */



/**
* | output |
* | --- |
* | "Measure the area enclosed by named places and plot it on the map." |
*
* @param {Webmcp_Measure_Area_DescriptionInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const webmcp_measure_area_description = /** @type {((inputs?: Webmcp_Measure_Area_DescriptionInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Webmcp_Measure_Area_DescriptionInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Meet die oppervlakte wat deur benoemde plekke omsluit word en teken dit op die kaart.")
	return /** @type {LocalizedString} */ ("Measure the area enclosed by named places and plot it on the map.")
});