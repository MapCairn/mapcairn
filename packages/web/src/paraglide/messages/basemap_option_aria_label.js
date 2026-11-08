/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ label: NonNullable<unknown> }} Basemap_Option_Aria_LabelInputs */



/**
* | output |
* | --- |
* | "Use {label} basemap" |
*
* @param {Basemap_Option_Aria_LabelInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const basemap_option_aria_label = /** @type {((inputs: Basemap_Option_Aria_LabelInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Basemap_Option_Aria_LabelInputs, { locale?: "en" | "af" }, {}>} */ ((i, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ (`Gebruik ${i?.label} as basiskaart`)
	return /** @type {LocalizedString} */ (`Use ${i?.label} basemap`)
});