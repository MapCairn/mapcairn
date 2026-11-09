/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Webmcp_Measure_Distance_DescriptionInputs */



/**
* | output |
* | --- |
* | "Measure a straight-line distance along named places and plot it on the map." |
*
* @param {Webmcp_Measure_Distance_DescriptionInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const webmcp_measure_distance_description = /** @type {((inputs?: Webmcp_Measure_Distance_DescriptionInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Webmcp_Measure_Distance_DescriptionInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Meet 'n reguitlynafstand langs benoemde plekke en teken dit op die kaart.")
	return /** @type {LocalizedString} */ ("Measure a straight-line distance along named places and plot it on the map.")
});