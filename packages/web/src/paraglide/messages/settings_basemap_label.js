/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Basemap_LabelInputs */



/**
* | output |
* | --- |
* | "Basemap" |
*
* @param {Settings_Basemap_LabelInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const settings_basemap_label = /** @type {((inputs?: Settings_Basemap_LabelInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Basemap_LabelInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Basiskaart")
	return /** @type {LocalizedString} */ ("Basemap")
});