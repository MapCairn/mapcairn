/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Layer_Metadata_PropertyInputs */



/**
* | output |
* | --- |
* | "Styled by" |
*
* @param {Layer_Metadata_PropertyInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const layer_metadata_property = /** @type {((inputs?: Layer_Metadata_PropertyInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Layer_Metadata_PropertyInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Gestileer volgens")
	return /** @type {LocalizedString} */ ("Styled by")
});