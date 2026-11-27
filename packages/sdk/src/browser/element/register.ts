// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * Registers `<mapcairn-map>` when it is imported, for a page that only wants
 * the tag: `<script type="module" src="browser-element.js">`. It exports
 * nothing. A page that imports `defineMapElement` from `browser.js` chooses
 * when to register the element, or the name, itself.
 * @packageDocumentation
 */
import { defineMapElement } from "../index";

defineMapElement();
