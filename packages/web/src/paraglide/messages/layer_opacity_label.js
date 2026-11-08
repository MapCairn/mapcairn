/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ label: NonNullable<unknown> }} Layer_Opacity_LabelInputs */



/**
* | output |
* | --- |
* | "Opacity for {label}" |
*
* @param {Layer_Opacity_LabelInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const layer_opacity_label = /** @type {((inputs: Layer_Opacity_LabelInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Layer_Opacity_LabelInputs, { locale?: "en" | "af" }, {}>} */ ((i, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ (`Ondeursigtigheid vir ${i?.label}`)
	return /** @type {LocalizedString} */ (`Opacity for ${i?.label}`)
});