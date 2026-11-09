/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Webmcp_Set_Theme_DescriptionInputs */



/**
* | output |
* | --- |
* | "Set the app's colour theme: system, light or dark." |
*
* @param {Webmcp_Set_Theme_DescriptionInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const webmcp_set_theme_description = /** @type {((inputs?: Webmcp_Set_Theme_DescriptionInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Webmcp_Set_Theme_DescriptionInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Stel die toepassing se kleurtema: system, light of dark.")
	return /** @type {LocalizedString} */ ("Set the app's colour theme: system, light or dark.")
});