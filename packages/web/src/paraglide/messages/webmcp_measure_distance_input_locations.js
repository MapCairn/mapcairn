/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Webmcp_Measure_Distance_Input_LocationsInputs */



/**
* | output |
* | --- |
* | "Place names in path order, with at least two locations." |
*
* @param {Webmcp_Measure_Distance_Input_LocationsInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const webmcp_measure_distance_input_locations = /** @type {((inputs?: Webmcp_Measure_Distance_Input_LocationsInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Webmcp_Measure_Distance_Input_LocationsInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Plekname in roetevolgorde, met minstens twee liggings.")
	return /** @type {LocalizedString} */ ("Place names in path order, with at least two locations.")
});