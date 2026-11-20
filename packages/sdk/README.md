# `@mapcairn/sdk`

The whole MapCairn SDK from one import: it re-exports `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme`, so an app learns one package name instead of four. It holds no code of its own. Use the four packages directly when you want less: `core` has no React or browser dependency, and `theme` installs without the interface.

**Status:** a release candidate, for early adopters. The API is still settling, so a breaking change can land before `0.1.0`; the [changelog](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md) lists each one. Until `0.1.0`, add `@next` to the package name in the install commands below.

## Install

```bash
npm install @mapcairn/sdk@next
pnpm add @mapcairn/sdk@next
yarn add @mapcairn/sdk@next
```

React and React DOM 19 are peer dependencies, and your app already has them. The package is ESM only: it has no `main` field and no CommonJS build. A TypeScript project needs `moduleResolution` set to `node16`, `nodenext` or `bundler`; `node10` is not supported. `vitest` is an optional peer, needed only for `@mapcairn/sdk/core/contracts`.

## Usage

Import the stylesheet once, then import what you need from the one package:

```tsx
import "@mapcairn/sdk/styles.css";
import { MapChrome, ServicesProvider } from "@mapcairn/sdk";
```

`@mapcairn/sdk/styles.css` is two `@import` lines: the tokens from `@mapcairn/theme`, then the styles of `@mapcairn/map`. A host that links stylesheets without a bundler keeps using `@mapcairn/theme/tokens.css` and `@mapcairn/map/styles.css`. [`@mapcairn/map`](https://github.com/MapCairn/mapcairn/tree/main/packages/map) shows a whole app, which works the same with these imports.

## What it exports

| Entry point                    | Same as                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `@mapcairn/sdk`                | every export of the four packages below, from one flat list |
| `@mapcairn/sdk/core`           | `@mapcairn/core`                                            |
| `@mapcairn/sdk/core/contracts` | `@mapcairn/core/contracts`                                  |
| `@mapcairn/sdk/map`            | `@mapcairn/map`                                             |
| `@mapcairn/sdk/react`          | `@mapcairn/react`                                           |
| `@mapcairn/sdk/theme`          | `@mapcairn/theme`                                           |
| `@mapcairn/sdk/styles.css`     | the two stylesheets, in order                               |

Each entry point is an `export * from` the package, never a copy, so a type from the umbrella is the same type as the package's own. The contract suites are not in the root, because they import a test runner.

Two names are declared by more than one of the four packages, and the root settles them:

- `ScaleBar` is the component from `@mapcairn/map`. `@mapcairn/core` declares the measurement as a type of the same name, which stays reachable at `@mapcairn/sdk/core`.
- `ReadingDirection` is the type from `@mapcairn/core`. `@mapcairn/react` declares the same `"ltr" | "rtl"` type again.

A new name that two packages declare fails the type check until the umbrella settles it.

## Dependencies and declaration merging

The umbrella depends on the four packages at one exact version, and the five packages are released together. If your app also imports one of the four directly, keep it at the umbrella's version, or you get two copies of it. Two copies each have their own React context, so a component from one copy does not see a `ServicesProvider` from the other.

A host that adds a service of its own by declaration merging augments `@mapcairn/core` directly (`declare module "@mapcairn/core"`), and lists `@mapcairn/core` as a dependency at the umbrella's version.

## Licence

`@mapcairn/sdk` is licensed under AGPL-3.0-only, and the [licence text](https://github.com/MapCairn/mapcairn/blob/main/packages/sdk/LICENSE) comes with the package. If you ship it in a product, or let people use a modified version over a network, you must publish the corresponding source under the same licence. The SDK packages depend only on permissively licensed packages. The [licence section of the repository README](https://github.com/MapCairn/mapcairn#licence) says more, including how to talk about other terms for closed-source use.

## Contributing and changes

The source and the issue tracker are in the [repository](https://github.com/MapCairn/mapcairn); file a bug in the [issue tracker](https://github.com/MapCairn/mapcairn/issues). Read [`CONTRIBUTING.md`](https://github.com/MapCairn/mapcairn/blob/main/CONTRIBUTING.md) before you send a pull request. Changes between releases are listed in [`CHANGELOG.md`](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md).
