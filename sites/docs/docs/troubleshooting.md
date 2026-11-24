---

title: Troubleshooting
sidebar_label: Troubleshooting
description: The error messages the SDK throws and reports, what causes each, and how to fix it.
---

# Troubleshooting

This page is for a developer whose map does not show, or whose app stops with an error from the SDK. By the end you will be able to find your message below, know what causes it and know what to change. Each message is quoted as the code writes it, so search the page for the words you see. Where a part of the message depends on your app, it is shown as `...` or in angle brackets. Each entry says how the message reaches you: _thrown_ is an exception or a rejected promise, _reported_ is a callback on `MapView`, and _logged_ is a line in the browser console. A test keeps the quoted messages equal to the strings in the packages' source.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository. The messages come from `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/adapter-maplibre`, which the umbrella package re-exports.

## The map does not start

`MapView` tells your app when the engine cannot start or stops later through its `onEngineError` prop, which receives a [`MapEngineError`](api/core/MapEngineError.md). The error's `reason` is one of `webgl-unavailable`, `load-failed`, `stopped` and `export-failed` ([`MapEngineErrorReason`](api/core/MapEngineErrorReason.md)). An engine that cannot start rejects the adapter's `mount`, and `MapView` turns that into the `onEngineError` call. The SDK decides nothing about what the visitor sees: your app shows its own message. The English catalogue has `app.banner.engineFailed` ("The map could not start. Reload the page to try again.") and `app.banner.engineStopped` ("The map stopped working. Reload the page to try again.") if you want words to start from.

### `MapLibre could not start: ...`

Thrown by the adapter's `mount`, and reported through `onEngineError`. The reason is `webgl-unavailable` when MapLibre says it could not create a WebGL 2 context, and `load-failed` for any other failure when the map was created.

Cause: the browser cannot give the page a WebGL 2 context. Hardware acceleration may be off, or the browser may run without a graphics device, as some headless and remote sessions do.

Fix: nothing in the page can create a graphics context the browser refuses. Show a message that names the cause, and keep the rest of the page usable. Turning on hardware acceleration in the browser's settings usually fixes it for one person.

### `MapLibre could not be loaded: ...`

Thrown by `mount`, and reported through `onEngineError`. Reason `load-failed`. The adapter could not load the engine or its worker file, and the text after the colon is the underlying error.

Cause: `loadWorkerUrl` returned an address that does not serve the worker file, a Content Security Policy refused the engine's worker or a request for it, or the engine's chunk is missing after a deploy.

Fix: serve `maplibre-gl/dist/maplibre-gl-worker.mjs` as a file from your own origin and return its address from `loadWorkerUrl`, as in [Get started](get-started.md). Allow it with `worker-src 'self' blob:`; [Content Security Policy](guides/content-security-policy.md) explains the directive. A map that stays blank with no message at all can mean that no worker address was given.

A failed load can be retried. The adapter does not keep a rejected load, so the next mount, for example after the visitor comes back online, asks for the engine and the worker address again. The engine and its worker address are shared by every adapter on the page, and the first adapter's `loadWorkerUrl` is the one used.

### `The basemap style could not be loaded: ...`

Thrown by `mount` when the first basemap fails, and reported through `onEngineError`; when a later change of `basemap` fails, it is reported through `onBasemapError` and the map keeps the basemap it had. Reason `load-failed`. When the engine's worker is blocked while the map is starting, the text after the colon is `Error: Worker failed to load.`, which is MapLibre's own message for a worker that never started. The basemap's style file could not be fetched or was not a style.

Cause: the visitor is offline, the style address is wrong, the provider is down, or `connect-src` in your policy does not list the provider's origin.

Fix: open the style address from the basemap's definition in a browser. If it loads there, the policy is the cause: add the origin to `connect-src` and `img-src`. `MapView` tells your app too. `onBasemapError` is called when a change of `basemap` could not load, with the basemap the map kept drawing, and `onBasemapUnavailable` when every tile of the basemap failed, so your app can offer another one. The catalogue has `panels.basemap.unavailable` ("Not available right now") for a tile that cannot be chosen.

### `The map engine stopped working: its worker failed.`

Also `Worker failed to load.`, the text of the engine's own error that starts this check.

Reported through `onEngineError` with reason `stopped`, never thrown, and only after the map has loaded. When the engine reports a worker error on a loaded map, which is MapLibre's `Worker failed to load.` and is also logged as `MapLibre basemap error`, the adapter waits 5 seconds for signs that the engine still draws. If there are none, it reports this message. An error the engine recovers from reports nothing.

Cause: the engine's worker stopped after the map had loaded. The browser console may say why, for example a policy violation.

Fix: if the console names a policy violation, allow what it names under `worker-src`. Reloading the page starts a new worker.

### `This map adapter has already been mounted or destroyed.`

Thrown by `mount`. Reason `load-failed`. An adapter object can mount one map in its life.

Cause: your `createMapAdapter` returns the same adapter every time it is called, or one adapter was given to two `MapView`s.

Fix: make `createMapAdapter` build a new adapter on every call, as `() => createMapLibreMapAdapter({ ... })` does in [Get started](get-started.md).

### `The map host is not an HTML element.`

Thrown by `mount`. Reason `load-failed`. The adapter was asked to draw into something that is not an element.

Cause: `mount` was called by hand with a value that is not an element.

Fix: let `MapView` mount the map. On a server-rendered page, render `MapView` only after the page has hydrated.

### `MapLibre basemap error`

This one is a `console.error` line, not an exception. The adapter prints it with the engine's own error after it, such as `AJAXError: Failed to fetch (0): https://tiles.example.org/9/281/308.png`.

Cause: a tile or style request failed. A status of `0` means the browser never got an answer: the address does not resolve, the visitor is offline, a policy refused it, or the server sent no CORS header.

Fix: open the address in the error. The adapter prints this line for every error the engine reports. A failure your app should react to reaches it separately, through `onBasemapError` and `onBasemapUnavailable` on `MapView`.

## Saving the map as an image

These are thrown by `toImage`, as a rejected promise, and by the sheet's image export. All have the reason `export-failed`, and the ones about size are a [`MapImageExportError`](api/core/MapImageExportError.md) whose `kind` is `too-large`, `invalid` or `timed-out`.

### `The basemap is still loading, so the map cannot be saved yet.`

Cause: an image was requested while a new basemap was loading. Fix: ask again when the basemap has applied, which `MapView` reports through `onBasemapApplied`.

### `The map changed while the image was waiting.`

Cause: the view, the basemap or the layers changed between asking for the image and the tiles arriving. Fix: ask again once the map is still.

### `This device could not draw the image at <width> by <height> pixels.`

Kind `too-large`. Cause: the device's graphics limit is smaller than the image you asked for. Fix: ask for a smaller size or a lower pixel ratio.

### `The browser could not make a canvas to draw the image on.`

Cause: the browser would not create a 2D canvas. Fix: ask for a smaller image and try again.

## Set-up errors

These are thrown while your app starts. Each says what is missing, so the fix is the sentence itself.

### `useServices must be used inside a ServicesProvider.`

Also `useBasemapAvailability must be used inside a ServicesProvider.`. A component that reads the services, or a hook such as `useBasemaps`, rendered outside [`ServicesProvider`](api/map/ServicesProvider.md). Wrap the tree in it, as Get started does.

### `useMap must be used inside a MapView.`

[`useMap`](api/map/useMap.md) reads the map's context, which exists only inside `MapView`: in its children, or in what its `chrome` prop returns. A component that calls it above `MapView` fails. Call it in `chrome`, as the Get started `Chrome` does, or pass what you need down from a component that renders `MapView`.

### `Focus registry hooks must be used inside a FocusRegistryProvider.`

A control from the SDK's chrome was rendered outside [`FocusRegistryProvider`](api/map/FocusRegistryProvider.md). Wrap `MapChrome` in it and give it `focusMap` from `useMap()`, as Get started does.

### `Invalid layer definitions:`

[`createStaticLayerCatalogue`](api/core/createStaticLayerCatalogue.md) checks every definition when the app starts and lists each problem under this heading, one for each line, starting with the layer's id. For example:

```text
Invalid layer definitions:
x: attribution: must be a non-empty list
x: source.tiles: must be an https URL template
```

Fix each line. The path after the id (`attribution`, `source.tiles`) is the field. [Extending MapCairn](guides/extending.md#add-a-data-layer) has a definition that passes. A host whose layers can be wrong without stopping the app uses `createRuntimeLayerCatalogue`, which leaves out a failing layer and reports why.

### `The basemap id "<id>" is used twice.`

[`createBasemapCatalogue`](api/core/createBasemapCatalogue.md) needs unique ids. Remove the repeat, or give your own basemap an id the built-in ones do not use.

### `A basemap catalogue needs at least one basemap.`

The list you gave `createBasemapCatalogue` is empty. A filter such as `BASEMAPS.filter(...)` that matches nothing causes it.

### `The default basemap "<id>" is not in the catalogue.`

The default id, or one of the per-theme defaults, names a basemap that the list does not hold. Check the spelling and that your filter keeps it. [Extending MapCairn](guides/extending.md#add-a-basemap) says how a catalogue is built.

### `A language catalogue needs at least one language.`

Also `The language tag "<tag>" is used twice.` and `The default language "<tag>" is not in the catalogue.`. [`createLanguageCatalogue`](api/core/createLanguageCatalogue.md) needs at least one language, unique tags, and a default tag that is in the list. [Translate the SDK](guides/translate-the-sdk.md) has an example.

## Warnings in the console

These are logged, never thrown.

### `MessageCatalogue: "<language>" has no value for "<key>"; falling back to "<language>".`

Printed once for each missing key. Your translation does not hold the key, so the English value is shown. This is how a partial translation works, and it is not an error. Add the key, or compare the catalogue with English using `checkMessageCatalogue` in a test. See [Translate the SDK](guides/translate-the-sdk.md).

### `MessageCatalogue: "<value>" is not a valid numbering system for "<language>"; using the language's own digits.`

The `numberingSystem` option of `createMessageCatalogue` is not three to eight letters or digits, such as `latn`. The option is ignored. Correct the value.

## Install and build errors

### `npm install` stops with ENOVERSIONS

`npm error code ENOVERSIONS` and `No versions available for @mapcairn/sdk` right after a release mean your npm has `min-release-age` set (in `.npmrc` or on the command line) and every published version is younger than it. Wait until the newest release is old enough, or run that one install with `--min-release-age=0`. The setting is a protection you chose, so keep it for your other installs.

### TS2307 on the worker import, TS2882 on a CSS import

`tsc` cannot find `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` (TS2307) or reports a plain `import "./page.css"` (TS2882). Both are types that Vite provides. Add `/// <reference types="vite/client" />` as the first line of the file, as in [Get started](get-started.md), or list `vite/client` under `types` in your `tsconfig`.

### TS2307 on `@mapcairn/sdk/adapter-maplibre`

Your `tsconfig` uses a `moduleResolution` that ignores a package's `exports`. Set `moduleResolution` to `bundler`, `node16` or `nodenext`.

### Warnings that say `MODULE_LEVEL_DIRECTIVE` and `"use client"`

A Vite 8 build prints a warning for each of 18 `"use client"` directives in the Radix UI packages that `@mapcairn/map` depends on. They are expected and harmless.

## The map is blank, with no message

- **Zero height.** The SDK ships no base stylesheet, so a page must give the map's container a height. Set `height: 100%` on `html`, `body` and the element that holds the map, as the `page.css` in Get started does.
- **No styles.** Import `@mapcairn/sdk/styles.css` once, at the top of your entry file.
- **No worker address.** See `MapLibre could not be loaded` above.
- **A strict policy.** Open the browser console: a policy violation names the directive and the origin to add. [Content Security Policy](guides/content-security-policy.md) lists them.

## If your message is not here

Search the [API reference](api/index.md) for the name in the message, then open an issue in the repository with the message, the SDK version and the steps that cause it.
