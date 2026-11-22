---

title: Get started with the MapCairn SDK
sidebar_label: Get started
description: Install the MapCairn SDK and find the whole example app that draws a map.
slug: /
---

# Get started

This page gets the SDK installed and points you at the app that draws a map with it. By the end you will have `@mapcairn/sdk` in a React project and know where the three-file example lives.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository.

## Install

```bash
npm install @mapcairn/sdk react react-dom maplibre-gl
```

The SDK needs React 19, `maplibre-gl` 6.18 or later, an ESM bundler that handles CSS imports (tested with Vite) and a TypeScript `moduleResolution` of `bundler`, `node16` or `nodenext`.

`@mapcairn/sdk` is the one package most apps need. The interface comes from its root, and the MapLibre adapter that draws the map comes from `@mapcairn/sdk/adapter-maplibre`. An app that never imports that subpath carries no map engine. `maplibre-gl` is a required peer, so a strict package manager wants it listed.

## Draw a map

A map that shows is three files in a Vite and React project: the page, a style sheet that gives the map a height, and the entry file. The whole app, file by file, is in the [Embed a map](guides/embed-a-map.md) guide.

## Status

The SDK is pre-1.0. While the version starts with `0.`, a minor release can contain a breaking change to the public API, and a patch release is not meant to. A `^0.1.0` range takes patch releases but not the next minor release.
