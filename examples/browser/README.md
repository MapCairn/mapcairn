# `@mapcairn/example-browser`

A plain HTML page that draws a map with `mountMap` from `@mapcairn/sdk/browser`. There is no build step and no React written by the page: `index.html` links a stylesheet and a module script, and `main.js` is one call. `element.html` does the same with a tag: it loads `browser-element.js`, which registers `<mapcairn-map>`, and has no script of its own.

```bash
npm run dev -w @mapcairn/example-browser
```

`copyFiles.mjs` copies the files a page serves out of the installed `@mapcairn/sdk` into `mapcairn/`: `browser.css`, `browser.js` and every `browser-*.js` beside it, `browser-element.js` included. Serve all of them from one folder. The map's engine is loaded on demand from that folder. Its worker is made from a script inside the bundle, so the page's policy needs `worker-src` to include `blob:`, and there is no worker file to serve. That needs Safari 15.5 or later, the first to support `worker-src`; a page that must support an older Safari adds `child-src blob:`. A page that enforces Trusted Types (`require-trusted-types-for 'script'`) cannot run the engine's worker either way:

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; font-src 'self'; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
```

The map, or the element, needs a height in CSS (`page.css`). The release's consumer check serves a copy of this page under that policy in Chromium and WebKit (`docs/guides/releasing.md`). [A map on a server-rendered page](https://docs.mapcairn.com/guides/browser-route/) is the guide for a site of your own.
