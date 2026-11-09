/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Webmcp_Set_Theme_Input_ThemeInputs */



/**
* | output |
* | --- |
* | "One of system, light or dark." |
*
* @param {Webmcp_Set_Theme_Input_ThemeInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const webmcp_set_theme_input_theme = /** @type {((inputs?: Webmcp_Set_Theme_Input_ThemeInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Webmcp_Set_Theme_Input_ThemeInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("Een van system, light of dark.")
	return /** @type {LocalizedString} */ ("One of system, light or dark.")
});