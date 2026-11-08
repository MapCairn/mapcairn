/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Theme_Dark_Aria_LabelInputs */



/**
* | output |
* | --- |
* | "Dark theme" |
*
* @param {Theme_Dark_Aria_LabelInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const theme_dark_aria_label = /** @type {((inputs?: Theme_Dark_Aria_LabelInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Theme_Dark_Aria_LabelInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Donker tema")
	return /** @type {LocalizedString} */ ("Dark theme")
});