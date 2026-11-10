# Brand mark

The mark is a cairn: a stack of rough stones, each resting on the one below. It marks the way, which is what the project is for.

- `logo-mark.svg` is the master: four stones, no tile. The icon files in `packages/web/public` (`favicon.svg` and the PNGs and `.ico` made from it) use three stones on the app's blue tile, so they hold up at 16 px.
- Colours: stones `#0d70d4` and a white halo on light, `#94c1fa` and a dark halo on dark. On the tile, white stones on `#0d70d4`, or `#062d59` stones on `#94c1fa` in dark mode. The halo is a stroke in the surface colour that draws the thin line between stones, so it must match whatever the mark sits on.
- Keep the stones uneven, flat-sided and offset, and let them touch. Smooth ellipses or a tapering swirl read as something else (soft-serve, spa stones), and a tidy symmetrical stack reads as a pagoda or a layers icon. Do not add gaps that make the stones float.
- The PNG sizes are renders of `favicon.svg` geometry: rounded tile for the favicons and Android icons, a square tile for the Apple icon, a full-bleed tile with the stones at 90% for the maskable icon, and white stones on transparent for the Windows tile. Check each render by eye at its real size.
- The name in the files' `<title>` and in `og-image.png`, `site.webmanifest` and the page copy still says Karta until the rename (#170).
