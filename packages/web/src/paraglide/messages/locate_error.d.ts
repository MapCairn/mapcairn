/**
* | output |
* | --- |
* | "Your location could not be determined." |
*
*/
export const locate_error: ((inputs?: Locate_ErrorInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Locate_ErrorInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Locate_ErrorInputs = {};
