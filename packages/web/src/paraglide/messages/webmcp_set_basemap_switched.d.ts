/**
* | output |
* | --- |
* | "Basemap switched to \"{basemap}\"." |
*
*/
export const webmcp_set_basemap_switched: ((inputs: Webmcp_Set_Basemap_SwitchedInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Webmcp_Set_Basemap_SwitchedInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Webmcp_Set_Basemap_SwitchedInputs = { basemap: NonNullable<unknown> };
