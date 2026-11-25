// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The inline script that makes the product page's copy buttons work. The page
 * ships no framework script (see `scriptlessPage.ts`), so a copy button is
 * server-rendered `hidden` and this script, run once after the content, shows
 * it and wires it up. A button sits in a `[data-copy-scope]` and copies the
 * text of the `[data-copy]` element in that scope: the one inside the checked
 * radio's `[data-copy-option]` when the scope holds radios, otherwise the one
 * the scope holds. That element's `data-copy` holds the words as JSON: the
 * button's name in each state (`idle`, `copied`, `failed`) and what is
 * announced (`said`, `failedSaid`).
 *
 * The button's `data-state` says what the last copy did, its name says it in
 * words, and the outcome goes to the page's own status region (copied) or
 * alert region (failed), which it finds by the test ids `LiveRegionProvider`
 * gives them (a script cannot reach the announcer's hook, and the scanner
 * keeps live regions to `packages/map`). Renaming those ids would silence the
 * announcements, and `copyCodeScript.test.ts` fails first because it renders
 * the real page. Only the latest click's outcome counts, a copy that
 * worked goes back to `idle` after `RESET_MS`, and choosing another radio
 * starts over. It copies with the asynchronous clipboard API and falls back to
 * `execCommand("copy")`, which iOS needs when the first is refused, restoring
 * the focus it moved. It never throws.
 *
 * @remarks Its SHA-256 is allowed by the content security policy in
 *   `public/_headers` and `constants/securityHeaders.ts`; `inlineScripts.test.ts`
 *   hashes this exact string and checks both files. It is a fixed string with
 *   nothing built into it.
 */
export const COPY_CODE_SCRIPT = `(function(){
var RESET_MS=4000,REGION_CLEAR_MS=50;
var polite=document.querySelector('[data-testid="live-region-polite"]'),assertive=document.querySelector('[data-testid="live-region-assertive"]');
function say(region,text){
if(!region)return;
if(region.textContent!==text){region.textContent=text;return}
region.textContent="";
setTimeout(function(){region.textContent=text},REGION_CLEAR_MS)
}
function sourceOf(scope){
var radio=scope.querySelector("input[type=radio]:checked");
var holder=radio?radio.closest("[data-copy-option]"):scope;
return holder&&holder.querySelector("[data-copy]")
}
function wordsOf(source){return JSON.parse(source.getAttribute("data-copy"))}
function copyByHand(text){
var field=document.createElement("textarea"),previous=document.activeElement;
field.value=text;
field.setAttribute("readonly","");
field.setAttribute("aria-hidden","true");
field.style.cssText="position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px";
try{
document.body.appendChild(field);
field.focus({preventScroll:true});
field.select();
field.setSelectionRange(0,text.length);
return document.execCommand("copy")
}catch(error){return false}finally{
field.remove();
if(previous&&previous.focus)previous.focus({preventScroll:true})
}
}
function write(text){
try{
if(navigator.clipboard&&navigator.clipboard.writeText){
return navigator.clipboard.writeText(text).then(function(){return true},function(){return copyByHand(text)})
}
}catch(error){}
return Promise.resolve(copyByHand(text))
}
function wire(button){
var scope=button.closest("[data-copy-scope]");
if(!scope)return;
var latest=0,timer=0;
function show(state){
var source=sourceOf(scope);
button.setAttribute("data-state",state);
if(source)button.setAttribute("aria-label",wordsOf(source)[state])
}
function reset(){latest+=1;clearTimeout(timer);show("idle")}
scope.addEventListener("change",reset);
button.addEventListener("click",function(){
var source=sourceOf(scope);
if(!source)return;
var words=wordsOf(source),click=latest+=1;
clearTimeout(timer);
write(source.textContent).then(function(copied){
if(click!==latest)return;
show(copied?"copied":"failed");
if(copied){
say(polite,words.said);
timer=setTimeout(function(){if(click===latest)show("idle")},RESET_MS)
}else say(assertive,words.failedSaid)
})
});
show("idle");
button.hidden=false
}
try{
Array.prototype.forEach.call(document.querySelectorAll("[data-copy-button]"),wire)
}catch(error){}
})()`;
