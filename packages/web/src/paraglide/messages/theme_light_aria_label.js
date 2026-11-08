/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Theme_Light_Aria_LabelInputs */



/**
* | output |
* | --- |
* | "Light theme" |
*
* @param {Theme_Light_Aria_LabelInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const theme_light_aria_label = /** @type {((inputs?: Theme_Light_Aria_LabelInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Theme_Light_Aria_LabelInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Ligte tema")
	return /** @type {LocalizedString} */ ("Light theme")
});