/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ label: NonNullable<unknown> }} Layer_Download_Menu_LabelInputs */



/**
* | output |
* | --- |
* | "Download options for {label}" |
*
* @param {Layer_Download_Menu_LabelInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const layer_download_menu_label = /** @type {((inputs: Layer_Download_Menu_LabelInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Layer_Download_Menu_LabelInputs, { locale?: "en" | "af" }, {}>} */ ((i, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ (`Aflaaiopsies vir ${i?.label}`)
	return /** @type {LocalizedString} */ (`Download options for ${i?.label}`)
});