/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Feature_Details_TitleInputs */



/**
* | output |
* | --- |
* | "Feature details" |
*
* @param {Feature_Details_TitleInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const feature_details_title = /** @type {((inputs?: Feature_Details_TitleInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Feature_Details_TitleInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Kenmerkbesonderhede")
	return /** @type {LocalizedString} */ ("Feature details")
});