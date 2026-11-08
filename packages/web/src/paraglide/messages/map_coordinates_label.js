/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Map_Coordinates_LabelInputs */



/**
* | output |
* | --- |
* | "Map coordinates" |
*
* @param {Map_Coordinates_LabelInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const map_coordinates_label = /** @type {((inputs?: Map_Coordinates_LabelInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Map_Coordinates_LabelInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Kaartkoördinate")
	return /** @type {LocalizedString} */ ("Map coordinates")
});