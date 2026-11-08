/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_OpenInputs */



/**
* | output |
* | --- |
* | "Map settings" |
*
* @param {Settings_OpenInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const settings_open = /** @type {((inputs?: Settings_OpenInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_OpenInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Kaartinstellings")
	return /** @type {LocalizedString} */ ("Map settings")
});