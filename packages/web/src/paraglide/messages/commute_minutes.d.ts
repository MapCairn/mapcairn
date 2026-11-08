/**
* | output |
* | --- |
* | "{minutes} min" |
*
*/
export const commute_minutes: ((inputs: Commute_MinutesInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Commute_MinutesInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Commute_MinutesInputs = { minutes: NonNullable<unknown> };
