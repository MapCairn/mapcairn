---

title: Theme the interface
sidebar_label: Theme the interface
description: Give the interface your own colours, font and corners with a stylesheet that refuses colours too faint to read.
---

# Theme the interface

Give the interface from [Get started](../get-started.md) your brand with one generated stylesheet that uses [`createThemeStylesheet`](../api/theme/createThemeStylesheet.md).

## Brand the map

Run this in your build or a script and write the string it returns to a file your site serves:

```ts check
import { createThemeStylesheet } from "@mapcairn/sdk";

/** The brand stylesheet, or an error that says what was refused. */
export function brandStylesheet(): string {
  const result = createThemeStylesheet(
    {
      colour: {
        light: { accent: "#0b5c3a", accentTint: "#d9efe4" },
        dark: { accent: "#7fd9aa", accentTint: "#17382a" },
      },
    },
    { scope: ":root" },
  );
  if (!result.ok) {
    const failing = result.findings.filter((finding) => !finding.passes);
    throw new Error(
      `Theme refused: ${failing.length} colour pairs fail WCAG 2.2 AA, ${result.invalid.length} values cannot be used.`,
    );
  }
  return result.css;
}
```

Link the file after the SDK's own stylesheets, in the page's `<head>`:

```html no-check
<link rel="stylesheet" href="/brand.css" />
```

The interface now uses your accent in both themes, and colours you leave out keep the SDK's. `scope: ":root"` themes the whole page. A refused theme returns no CSS, so the SDK keeps its own colours, and the code above fails the build where you will see it: `result.findings` lists every pair checked (`passes: false` on those that fail) and `result.invalid` what could not be used. `invalid[].value` repeats what you passed in, so it is untrusted text: escape it before you print it into HTML. [Extending MapCairn](../guides/extending.md#theme-the-sdk-with-your-own-colours) lists the colour roles and the rules about scope.

## More you can change

Two more keys sit beside `colour`. `fontFamily` is a list of plain family names and generic families, and the SDK's own stack follows it: `fontFamily: '"Brand Sans", system-ui, sans-serif'`. `shape` is `"square"`, `"default"` or `"round"` and sets the corners of the pill, sheet, controls and inner shapes: `shape: "square"`. Any other value is refused and listed in `invalid`.

For two maps with different looks, make one stylesheet for each, with its own scope (`.brand-a`, `.brand-b` or `#id`), and put the class on an element around each map. The [Two themed maps](https://github.com/MapCairn/mapcairn/blob/main/examples/embed/README.md#two-themed-maps) section of the embed example shows it.

## What you can and cannot change

| What                                             | Can you?      | Why, or the way around                                                                                                                                    |
| ------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The accent and the other colour roles, per theme | Yes           | The 14 roles in [Extending MapCairn](../guides/extending.md#theme-the-sdk-with-your-own-colours), light and dark, each checked against WCAG 2.2 AA.       |
| The font family                                  | Yes           | `fontFamily`. You load the font file yourself (see the CSP note below).                                                                                   |
| The corners                                      | Yes           | `shape`. Circles stay circles and the search pill stays a pill.                                                                                           |
| Two maps with different looks                    | Yes, by scope | One stylesheet and one wrapper element for each.                                                                                                          |
| Light or dark for one map                        | No, per page  | The rules read `data-theme` on `<html>`, so every map on the page shares it.                                                                              |
| Spacing and density                              | No            | They stay the SDK's so the layout and the collision checks hold.                                                                                          |
| Slot positions and icons                         | No            | `MapChrome` owns the slots, and the icons are the SDK's own set ([DESIGN.md](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#layout-and-slots)). |
| The data palette and the map overlay colours     | No            | Layers and overlays have to read on any basemap, so they are not overridable. The page background is yours to set.                                        |
| Arbitrary CSS                                    | No            | The custom property names are generated and private, so a stylesheet of your own cannot name them.                                                        |

A tooltip renders outside your scope, so in a `#id` or `.class` scope it keeps the SDK's colours. In high-contrast and forced-colours modes the SDK keeps its own values and skips your theme.

## With a strict policy or your own reset

Under a strict Content Security Policy, link the stylesheet, because an inline `<style>` is blocked; a plain file passes `style-src 'self'`. A font file must be on your own origin or on one your `font-src` allows, and a font from another origin is blocked ([Content Security Policy](../guides/content-security-policy.md)).

The SDK's primitives sit in a cascade layer, so an unlayered reset of yours beats them. Declare your reset layer first, for example `@layer reset, base;`, and import the SDK's stylesheet after it ([Extending MapCairn](../guides/extending.md) says why).

## Light and dark

The theme follows the system's light or dark setting, or a choice the person makes, and it applies to the whole page. [Switch between light and dark](follow-the-system-theme.md) adds the buttons and the `ThemeSource` that make it work.

## Related

- [Troubleshooting](../troubleshooting.md) covers a blank or unstyled map.
