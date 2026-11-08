/**
* | output |
* | --- |
* | "Layer \"{label}\" is now visible." |
*
*/
export const webmcp_toggle_layer_now_visible: ((inputs: Webmcp_Toggle_Layer_Now_VisibleInputs, options?: { locale?: "en" | "af" }) => LocalizedString) & import("../runtime.js").MessageMetadata<Webmcp_Toggle_Layer_Now_VisibleInputs, { locale?: "en" | "af" }, {}>;
export type LocalizedString = import("../runtime.js").LocalizedString;
export type Webmcp_Toggle_Layer_Now_VisibleInputs = { label: NonNullable<unknown> };
