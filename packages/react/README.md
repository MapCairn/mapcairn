# `@mapcairn/react`

Generic React hooks for MapCairn apps. No map-engine, domain-data or theme dependency, and no import of another MapCairn package.

## Exports

| Hook or export | Purpose |
|---|---|
| `useModelContextTool(definition)`, `isModelContextSupported()` | Registers a [WebMCP](https://webmachinelearning.github.io/webmcp/) tool with `document.modelContext.registerTool()` and unregisters it on unmount or when `definition` becomes `null`. Types: `ModelContextToolDefinition`, `ModelContextToolResult`, `ModelContextToolContentBlock`. |
| `useLatestRef(value)` | A ref that always holds the latest render's value, for listeners bound once by outside code. |
| `useDeferredReadyAttribute(attribute)` | Returns `ref`, `markNotReady` and `markReadyAfterPaint` for a DOM attribute that a CSS rule uses to pause and resume an animation. Type: `DeferredReadyAttribute`. |

Notes:

- `useModelContextTool` re-registers only when `definition.name` changes. `description` and `inputSchema` are read once at registration, and `execute` is read from a ref, so a new closure on each render does not cause churn. It does nothing where `document.modelContext` is missing or blocked by Permissions-Policy.
- `useLatestRef` assigns `ref.current` during render rather than in an effect, so a listener never reads a stale value.
- `markReadyAfterPaint()` waits two animation frames before setting `attribute="true"`. A CSS animation's clock starts when it is attached to the element, not when it is first painted, so without the wait an animation can look as if it has already run ahead. It writes to the DOM directly because the CSS rule is the only consumer.

Theme and system-preference handling is not here. The theme choice is a `SettingsStore` and `ThemeSource` port in `@mapcairn/core`, read in the interface through `useTheme` in `@mapcairn/map`.

## What doesn't belong here

- A map engine, map rendering, or any dependency on `@mapcairn/map`, `@mapcairn/core` or `@mapcairn/theme`.
- Domain data or app-specific values such as colours and storage keys.
