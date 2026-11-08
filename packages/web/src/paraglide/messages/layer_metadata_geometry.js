/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Layer_Metadata_GeometryInputs */



/**
* | output |
* | --- |
* | "Geometry" |
*
* @param {Layer_Metadata_GeometryInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const layer_metadata_geometry = /** @type {((inputs?: Layer_Metadata_GeometryInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Layer_Metadata_GeometryInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Geometrie")
	return /** @type {LocalizedString} */ ("Geometry")
});