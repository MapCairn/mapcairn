# `@mapcairn/example-browser`

A plain HTML page that draws a map with `mountMap` from `@mapcairn/sdk/browser`. There is no build step and no React written by the page: `index.html` links a stylesheet and a module script, and `main.js` is one call.

```bash
npm run dev -w @mapcairn/example-browser
```

`copyFiles.mjs` copies the files a page serves out of the installed `@mapcairn/sdk` into `mapcairn/`: `browser.css` and every `browser*.js` beside it. Serve all of them from one folder. The map's engine is loaded on demand from that folder. Its worker is made from a script inside the bundle, so the page's policy needs `worker-src` to include `blob:`, and there is no worker file to serve. That needs Safari 15.5 or later, the first to support `worker-src`; a page that must support an older Safari adds `child-src blob:`. A page that enforces Trusted Types (`require-trusted-types-for 'script'`) cannot run the engine's worker either way:

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; font-src 'self'; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:
```

The map needs a height in CSS (`page.css`). The release's consumer check serves a copy of this page under that policy in Chromium (`docs/guides/releasing.md`).
