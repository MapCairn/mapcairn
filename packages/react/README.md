# `@mapcairn/react`

[![npm version](https://img.shields.io/npm/v/@mapcairn/react)](https://www.npmjs.com/package/@mapcairn/react)
[![GitHub Release](https://img.shields.io/github/v/release/MapCairn/mapcairn)](https://github.com/MapCairn/mapcairn/releases)

Generic React hooks for MapCairn apps. Use it when you want these hooks without the map interface; `@mapcairn/map` uses them too. It has no map engine, domain-data or theme dependency and imports no other MapCairn package.

Most apps should install [`@mapcairn/sdk`](https://github.com/MapCairn/mapcairn/tree/main/packages/sdk) instead: one install, one import and one stylesheet for the whole SDK, which re-exports this package. Install `@mapcairn/react` on its own as the advanced option, for a host that wants fewer dependencies.

**Status:** pre-1.0. While the version starts with `0.`, a minor release (the middle number) can contain a breaking change to the public API and a patch release (the last number) is not meant to, so a caret range takes patch releases but not the next minor release. The [changelog](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md) names each breaking change the release finds, and [what counts as the public API](https://docs.mapcairn.com/guides/public-api/) says what is covered.

## Install

```bash
npm install @mapcairn/react
pnpm add @mapcairn/react
yarn add @mapcairn/react
```

React 19 is a peer dependency, and your app already has it. The package is ESM only: it has no `main` field and no CommonJS build. A TypeScript project needs `moduleResolution` set to `node16`, `nodenext` or `bundler`; `node10` is not supported.

## Usage

Register a [WebMCP](https://webmachinelearning.github.io/webmcp/) tool for as long as a component is mounted:

```tsx
import { useModelContextTool } from "@mapcairn/react";

export function ShowCairnsTool({ onShow }: { readonly onShow: () => void }) {
  useModelContextTool({
    name: "show-cairns",
    description: "Turns on the Cairns layer.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: () => {
      onShow();
      return { content: [{ type: "text", text: "The Cairns layer is on." }] };
    },
  });
  return null;
}
```

## What it exports

| Hook or export                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useModelContextTool(definition)`, `isModelContextSupported()` | Registers a [WebMCP](https://webmachinelearning.github.io/webmcp/) tool with `document.modelContext.registerTool()` and unregisters it on unmount or when `definition` becomes `null`. Types: `ModelContextToolDefinition`, `ModelContextToolResult`, `ModelContextToolContentBlock`, `ModelContextProvider`. The package does not add `modelContext` to the global `Document` type, so type a stub or a read of `document.modelContext` with `ModelContextProvider`. |
| `useLatestRef(value)`                                          | A ref that always holds the latest committed render's value, for listeners bound once by outside code.                                                                                                                                                                                                                                                                                                                                                                |
| `useReadingDirection()`                                        | The page's reading direction (`"ltr"` or `"rtl"`) from `dir` on `<html>`, for a component that must hand a direction to a library. It is `"ltr"` on the server and follows a change made while the page is open.                                                                                                                                                                                                                                                      |

Notes:

- `useModelContextTool` re-registers only when `definition.name` changes. `description` and `inputSchema` are read once at registration, and `execute` is read from a ref, so a new closure on each render does not cause churn. It does nothing where `document.modelContext` is missing or blocked by Permissions-Policy.
- `useLatestRef` sets `ref.current` in a layout effect, not during render, so a render React throws away never leaves an uncommitted value in it. An event handler, a timer, a library listener and a passive effect read the current value, and so does a layout effect of the same component declared after the hook. In the commit that changes the value, two readers still see the previous one: a layout effect of the same component declared before the hook, and anything a child's layout effect runs (a callback it invokes, an event it fires). While a Suspense boundary hides an already mounted tree, React tears down that tree's layout effects, so the ref keeps its last committed value while the tree's passive effects and engine listeners stay live.

Theme and system-preference handling is not here. The theme choice is a `SettingsStore` and `ThemeSource` port in `@mapcairn/core`, read in the interface through `useTheme` in `@mapcairn/map`.

## Licence

`@mapcairn/react` is licensed under AGPL-3.0-only, an open-source licence that allows commercial use, and the [licence text](https://github.com/MapCairn/mapcairn/blob/main/packages/react/LICENSE) comes with the package. If you distribute an app that includes the SDK, including by serving it to people's browsers, you must offer them the corresponding source of the code you combine with the SDK and serve with it, under the same licence. If you modify the SDK and let people interact with your modified version over a network, you must offer them its corresponding source. [What the licence means for your project](https://docs.mapcairn.com/guides/licence/) says it in plain words and is not legal advice. The SDK packages depend only on permissively licensed packages. The [licence section of the repository README](https://github.com/MapCairn/mapcairn#licence) says more.

## Contributing and changes

The source and the issue tracker are in the [repository](https://github.com/MapCairn/mapcairn); file a bug in the [issue tracker](https://github.com/MapCairn/mapcairn/issues). Ask a question in [Discussions](https://github.com/MapCairn/mapcairn/discussions). Report a security problem privately, as [`SECURITY.md`](https://github.com/MapCairn/mapcairn/blob/main/.github/SECURITY.md) explains, not in an issue. Read [`CONTRIBUTING.md`](https://github.com/MapCairn/mapcairn/blob/main/.github/CONTRIBUTING.md) before you send a pull request. Changes between releases are listed in [`CHANGELOG.md`](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md).
