import { parseThemeChoice, resolveTheme } from "./theme";
import {
  MAP_SHAPE_ATTRIBUTE,
  PROJECTION_STORAGE_KEY,
  THEME_ATTRIBUTE,
  THEME_COLOR_META,
  THEME_COLOR_META_NAME,
  THEME_STORAGE_KEY,
} from "./themeConstants";

/**
 * Builds the inline script that sets the theme before first paint, so a dark
 * theme never flashes light. It also marks a stored globe map shape on the
 * root element ({@link MAP_SHAPE_ATTRIBUTE}), so the map placeholder starts in
 * the colour of the space around a globe rather than the flat map's.
 *
 * @remarks The script embeds the real `parseThemeChoice` and `resolveTheme`
 *   through `Function.prototype.toString`, so it cannot drift from them, and
 *   interpolates the shared constants. Storage, `matchMedia` and the document
 *   are each guarded on their own, so a blocked one never stops the others
 *   and the script never throws. It rewrites every `theme-color` tag, because
 *   a page may carry one per `prefers-color-scheme` media query and the
 *   browser uses the tag whose media matches the OS, not the chosen theme.
 *   The output is deterministic: the host hashes
 *   it for its content security policy. Whitespace is collapsed, nothing else.
 */
export function buildThemeBootstrapScript(): string {
  const source = `(function(){
var parse=${parseThemeChoice.toString()};
var resolve=${resolveTheme.toString()};
var colors=${JSON.stringify(THEME_COLOR_META)};
var stored,dark;
try{stored=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}
try{dark=matchMedia("(prefers-color-scheme: dark)").matches}catch(e){}
var theme=resolve(parse(stored),dark?"dark":"light");
try{
var root=document.documentElement;
root.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},theme);
root.style.colorScheme=theme;
var metas=document.querySelectorAll('meta[name="${THEME_COLOR_META_NAME}"]');
if(!metas.length){var made=document.createElement("meta");made.name=${JSON.stringify(THEME_COLOR_META_NAME)};document.head.appendChild(made);metas=[made]}
for(var i=0;i<metas.length;i++){metas[i].setAttribute("content",colors[theme])}
}catch(e){}
try{if(localStorage.getItem(${JSON.stringify(PROJECTION_STORAGE_KEY)})===${JSON.stringify(JSON.stringify("globe"))})root.setAttribute(${JSON.stringify(MAP_SHAPE_ATTRIBUTE)},"globe")}catch(e){}
})()`;
  return source.replace(/\s+/g, " ");
}
