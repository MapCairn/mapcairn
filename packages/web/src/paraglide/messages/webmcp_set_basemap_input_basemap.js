/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Webmcp_Set_Basemap_Input_BasemapInputs */



/**
* | output |
* | --- |
* | "A registered basemap id." |
*
* @param {Webmcp_Set_Basemap_Input_BasemapInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const webmcp_set_basemap_input_basemap = /** @type {((inputs?: Webmcp_Set_Basemap_Input_BasemapInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Webmcp_Set_Basemap_Input_BasemapInputs, { locale?: "en" | "af" }, {}>} */ ((inputs = {}, options = {}) => {
	void inputs;
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ ("'n Geregistreerde basiskaart-id.")
	return /** @type {LocalizedString} */ ("A registered basemap id.")
});