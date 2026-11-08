/**
* | output |
* | --- |
* | "Unknown theme \"{theme}\"." |
*
*/
export const webmcp_set_theme_unknown: ((inputs: Webmcp_Set_Theme_UnknownInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Webmcp_Set_Theme_UnknownInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Webmcp_Set_Theme_UnknownInputs = { theme: NonNullable<unknown> };
