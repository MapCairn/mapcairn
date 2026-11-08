/**
* | output |
* | --- |
* | "{hours}h {minutes}min" |
*
*/
export const commute_hours_minutes: ((inputs: Commute_Hours_MinutesInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Commute_Hours_MinutesInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Commute_Hours_MinutesInputs = { hours: NonNullable<unknown>, minutes: NonNullable<unknown> };
