/**
* | output |
* | --- |
* | "No layer with id \"{layerId}\". Call list-map-layers to see valid ids." |
*
*/
export const webmcp_toggle_layer_unknown: ((inputs: Webmcp_Toggle_Layer_UnknownInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Webmcp_Toggle_Layer_UnknownInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Webmcp_Toggle_Layer_UnknownInputs = { layerId: NonNullable<unknown> };
