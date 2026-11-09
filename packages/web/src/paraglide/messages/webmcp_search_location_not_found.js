/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ query: NonNullable<unknown> }} Webmcp_Search_Location_Not_FoundInputs */



/**
* | output |
* | --- |
* | "No place found for \"{query}\"." |
*
* @param {Webmcp_Search_Location_Not_FoundInputs} inputs
* @param {{ locale?: "en" | "af" }} options
* @returns {LocalizedString}
*/
export const webmcp_search_location_not_found = /** @type {((inputs: Webmcp_Search_Location_Not_FoundInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Webmcp_Search_Location_Not_FoundInputs, { locale?: "en" | "af" }, {}>} */ ((i, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "af") return /** @type {LocalizedString} */ (`Geen plek gevind vir "${i?.query}" nie.`)
	return /** @type {LocalizedString} */ (`No place found for "${i?.query}".`)
});