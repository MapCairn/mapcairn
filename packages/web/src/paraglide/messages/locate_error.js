/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Locate_ErrorInputs */



/**
* | output |
* | --- |
* | "Your location could not be determined." |
*
* @param {Locate_ErrorInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const locate_error = /** @type {((inputs?: Locate_ErrorInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Locate_ErrorInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Jou ligging kon nie bepaal word nie.")
	return /** @type {LocalizedString} */ ("Your location could not be determined.")
});