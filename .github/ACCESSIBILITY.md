# Accessibility statement

MapCairn targets WCAG 2.2 AA for the reference site, the documentation site and the SDK's interface components. This is a target, not a claim of conformance.

## What the project aims for

The design rules in [`DESIGN.md`](../DESIGN.md) say that every gesture has a keyboard or single-tap equivalent, focus is always visible, nothing is conveyed by colour alone, and contrast meets AA in both themes. Controls aim at a 44 px target, and the interface follows `prefers-reduced-motion`, `prefers-contrast` and the browser's text size.

## How it is checked today

- Playwright specs tagged `@a11y` run axe with the WCAG 2.0, 2.1 and 2.2 A and AA rules and the best-practice rules, in the light and dark themes, at six viewports from 320 px to 1920 px wide (`npm run a11y`). The required `e2e` check in CI runs them.
- The documentation site's audited pages are checked the same way at 320, 390 and 1280 px, in both themes.
- Other specs measure target sizes and text resizing, and check reduced motion and the more-contrast and forced-colours settings.
- `@mapcairn/theme` calculates colour contrast, and `createThemeStylesheet` refuses a host theme that falls below AA.
- The harmony scanner, part of `npm run lint`, fails on a positive `tabindex`, an icon-only button with no name, a removed focus outline and a page that blocks pinch zoom.
- The `review-ui` skill reads interface changes against the design rules.

Automated checks cannot prove conformance.

## What is not done

- No screen reader has been used to check the announcements yet ([#146](https://github.com/MapCairn/mapcairn/issues/146)). They are checked through their live-region text only.
- The map is drawn on a canvas, so its contents are not available to a screen reader as text. The interface offers search by name or coordinates, a readout of the cursor's coordinates and zoom, lists of the features of each layer that is on, and announcements.
- A page with two maps cannot yet name each one ([#887](https://github.com/MapCairn/mapcairn/issues/887)).
- Basemaps and open data layers come from third parties, and the project does not control their accessibility.

## Supported environments

The specs run in Chromium on desktop and in Pixel 7 emulation. Some also run in iPhone 15 emulation in WebKit. Firefox is not tested, and no browser and screen reader pairing has been tested.

## Report a barrier

[Open an issue](https://github.com/MapCairn/mapcairn/issues/new/choose) and say in the title that it is an accessibility barrier. Helpful details are the page or the address, the browser and its version, any assistive technology, what you tried to do and what stopped you. The project has no accessibility response time. Do not report a security problem this way: see [`SECURITY.md`](./SECURITY.md).

## For contributors

[`AGENTS.md`](../AGENTS.md) ("Treat accessibility as part of implementation") and [`DESIGN.md`](../DESIGN.md) set the rules. Run the specs that cover a change with `npm run test:e2e -w @mapcairn/web -- <spec name>`, and the whole set with `npm run a11y`.
