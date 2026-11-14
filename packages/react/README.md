# `@mapcairn/react`

Generic React hooks for MapCairn apps. No map-engine, domain-data or theme dependency, and no import of another MapCairn package.

## Exports

| Hook or export | Purpose |
|---|---|
| `useModelContextTool(definition)`, `isModelContextSupported()` | Registers a [WebMCP](https://webmachinelearning.github.io/webmcp/) tool with `document.modelContext.registerTool()` and unregisters it on unmount or when `definition` becomes `null`. Types: `ModelContextToolDefinition`, `ModelContextToolResult`, `ModelContextToolContentBlock`. |
| `useLatestRef(value)` | A ref that always holds the latest committed render's value, for listeners bound once by outside code. |

Notes:

- `useModelContextTool` re-registers only when `definition.name` changes. `description` and `inputSchema` are read once at registration, and `execute` is read from a ref, so a new closure on each render does not cause churn. It does nothing where `document.modelContext` is missing or blocked by Permissions-Policy.
- `useLatestRef` sets `ref.current` in a layout effect, not during render, so a render React throws away never leaves an uncommitted value in it. A listener, callback or passive effect reads the current value. A layout effect of a child that reads the ref in the commit that changes it still sees the previous value.

Theme and system-preference handling is not here. The theme choice is a `SettingsStore` and `ThemeSource` port in `@mapcairn/core`, read in the interface through `useTheme` in `@mapcairn/map`.

## What doesn't belong here

- A map engine, map rendering, or any dependency on `@mapcairn/map`, `@mapcairn/core` or `@mapcairn/theme`.
- Domain data or app-specific values such as colours and storage keys.
