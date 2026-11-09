/**
* | output |
* | --- |
* | "Distance along {locations}: {result}" |
*
*/
export const webmcp_measure_distance_result: ((inputs: Webmcp_Measure_Distance_ResultInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Webmcp_Measure_Distance_ResultInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Webmcp_Measure_Distance_ResultInputs = { locations: NonNullable<unknown>, result: NonNullable<unknown> };
