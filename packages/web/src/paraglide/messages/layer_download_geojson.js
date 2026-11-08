/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Layer_Download_GeojsonInputs */



/**
* | output |
* | --- |
* | "GeoJSON" |
*
* @param {Layer_Download_GeojsonInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const layer_download_geojson = /** @type {((inputs?: Layer_Download_GeojsonInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Layer_Download_GeojsonInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("GeoJSON")
	return /** @type {LocalizedString} */ ("GeoJSON")
});