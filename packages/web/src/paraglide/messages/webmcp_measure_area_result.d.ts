/**
* | output |
* | --- |
* | "Area enclosed by {locations}: {result}" |
*
*/
export const webmcp_measure_area_result: ((inputs: Webmcp_Measure_Area_ResultInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Webmcp_Measure_Area_ResultInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Webmcp_Measure_Area_ResultInputs = { locations: NonNullable<unknown>, result: NonNullable<unknown> };
