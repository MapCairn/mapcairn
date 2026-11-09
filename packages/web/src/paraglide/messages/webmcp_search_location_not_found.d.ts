/**
* | output |
* | --- |
* | "No place found for \"{query}\"." |
*
*/
export const webmcp_search_location_not_found: ((inputs: Webmcp_Search_Location_Not_FoundInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Webmcp_Search_Location_Not_FoundInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Webmcp_Search_Location_Not_FoundInputs = { query: NonNullable<unknown> };
