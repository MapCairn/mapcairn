/**
* | output |
* | --- |
* | "{location} is outside the current map coverage." |
*
*/
export const location_out_of_coverage: ((inputs: Location_Out_Of_CoverageInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Location_Out_Of_CoverageInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Location_Out_Of_CoverageInputs = { location: NonNullable<unknown> };
