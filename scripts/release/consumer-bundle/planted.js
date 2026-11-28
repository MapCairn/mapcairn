// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
// A style attribute binding in a Lit template, which the strict policy must
// refuse and report. The consumer check fails when it does not, because the
// other pages' empty lists of violations would then prove nothing. The file
// beside it is Lit's own, copied by the check.
import { html, render } from "./lit-html.js";

render(html`<p style=${"color: red"}>Planted</p>`, document.body);
