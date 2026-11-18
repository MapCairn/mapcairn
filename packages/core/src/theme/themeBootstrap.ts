// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LanguageOption } from "../messages/languageCatalogue";
import { languageDirection } from "../messages/languageDirection";
import { parseThemeChoice, resolveTheme } from "./theme";
import {
  LANGUAGE_STORAGE_KEY,
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
 * the colour of the space around a globe rather than the flat map's. When
 * given the languages the host offers, it also sets `lang` and `dir` on the
 * root element to the stored language if (and only if) it is one of them and
 * the current page does not declare a fixed language.
 *
 * @param offeredLanguages - The host's tags or language options. Without
 *   them the script leaves `lang` and `dir` as the server rendered them.
 *
 * @remarks The script embeds the real `parseThemeChoice` and `resolveTheme`
 *   through `Function.prototype.toString`, so it cannot drift from them, and
 *   interpolates the shared constants. Storage, `matchMedia` and the document
 *   are each guarded on their own, so a blocked one never stops the others
 *   and the script never throws. It rewrites every `theme-color` tag, because
 *   a page may carry one per `prefers-color-scheme` media query and the
 *   browser uses the tag whose media matches the OS, not the chosen theme.
 *   `data-fixed-language` on `<html>` tells it to leave `lang` and `dir` alone.
 *   The output is deterministic: the host hashes
 *   it for its content security policy. Whitespace is collapsed, nothing else.
 */
export function buildThemeBootstrapScript(
  offeredLanguages: readonly (string | LanguageOption)[] = [],
): string {
  const options = offeredLanguages.map((entry) =>
    typeof entry === "string" ? { tag: entry, label: entry } : entry,
  );
  const inlineData = (value: readonly string[]) =>
    JSON.stringify(value).replace(
      /[\s<\u2028\u2029]/g,
      (character) =>
        `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
  const tags = inlineData(options.map(({ tag }) => tag));
  const directions = inlineData(
    options.map(({ tag }) => languageDirection(tag, options)),
  );
  const language =
    offeredLanguages.length === 0
      ? ""
      : `
try{if(!root.dataset.fixedLanguage){var tag=JSON.parse(localStorage.getItem(${JSON.stringify(LANGUAGE_STORAGE_KEY)}));var i=${tags}.indexOf(tag);if(i>-1){root.lang=tag;root.dir=${directions}[i]}}}catch(e){}`;
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
try{if(localStorage.getItem(${JSON.stringify(PROJECTION_STORAGE_KEY)})===${JSON.stringify(JSON.stringify("globe"))})root.setAttribute(${JSON.stringify(MAP_SHAPE_ATTRIBUTE)},"globe")}catch(e){}${language}
})()`;
  return source.replace(/\s+/g, " ");
}
