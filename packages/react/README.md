# `@mapcairn/react`

Generic React hooks for MapCairn apps. Use it when you want these hooks without the map interface; `@mapcairn/map` uses them too. It has no map engine, domain-data or theme dependency and imports no other MapCairn package.

**Status:** not published to npm yet. The install commands below work from the first release; until then, use the packages from a clone of the [repository](https://github.com/MapCairn/mapcairn).

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

`@mapcairn/react` is licensed under AGPL-3.0-only, and the [licence text](https://github.com/MapCairn/mapcairn/blob/main/packages/react/LICENSE) comes with the package. If you ship it in a product, or let people use a modified version over a network, you must publish the corresponding source under the same licence. The SDK packages depend only on permissively licensed packages. The [licence section of the repository README](https://github.com/MapCairn/mapcairn#licence) says more, including how to talk about other terms for closed-source use.

## Contributing and changes

The source and the issue tracker are in the [repository](https://github.com/MapCairn/mapcairn); file a bug in the [issue tracker](https://github.com/MapCairn/mapcairn/issues). Read [`CONTRIBUTING.md`](https://github.com/MapCairn/mapcairn/blob/main/CONTRIBUTING.md) before you send a pull request. Changes between releases are listed in [`CHANGELOG.md`](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md).
