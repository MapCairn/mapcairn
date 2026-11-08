/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Theme_System_Aria_LabelInputs */



/**
* | output |
* | --- |
* | "System theme" |
*
* @param {Theme_System_Aria_LabelInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const theme_system_aria_label = /** @type {((inputs?: Theme_System_Aria_LabelInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Theme_System_Aria_LabelInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Stelseltema")
	return /** @type {LocalizedString} */ ("System theme")
});