# Plans and specs

Most work needs only a GitHub issue with its design notes and task list. A plan is for a large change that crosses several packages or decides a public API, where the record should live with the code. Plans and specs for such changes live here, one file each, numbered in the order they were written (`0001-short-name.md`). A plan states the goal, the ground rules, the design, the tests and the order of work, and it is short enough to read in a few minutes. Every plan has a tracking issue on GitHub, linked from its file and, while the plan is open, listed at the end of this page; the issue holds the task list and the plan file holds the design. Move its status from "proposed" to "in progress" to "done" as the work moves, and delete or fold a plan into the guides once its work is complete.

A plan gets its own pull request, reviewed before any code is written, only when the work will not start straight away. When it starts immediately, the plan file and its first step of implementation land in one pull request instead, and the plan is "in progress" from the moment it merges.

Playwright test plans (see the `playwright-tests` skill) go in `specs/` at the repository root, not here.

Open plans:

- [0005: Runtime layer catalogue](0005-runtime-layer-catalogue.md), tracking issue [#46](https://github.com/MapCairn/mapcairn/issues/46).
- [0007: Multi-feature selection](0007-multi-feature-selection.md), tracking issue [#49](https://github.com/MapCairn/mapcairn/issues/49).
- [0008: Identify features on raster tile layers](0008-identify-raster-layers.md), tracking issue [#47](https://github.com/MapCairn/mapcairn/issues/47).
- [0009: A message catalogue port, and English plus Afrikaans on the reference host](0009-i18n-message-catalogue.md), tracking issue [#231](https://github.com/MapCairn/mapcairn/issues/231).
- [0011: Any language, left to right and right to left](0011-any-language-ltr-and-rtl.md), tracking issue [#316](https://github.com/MapCairn/mapcairn/issues/316).
- [0012: Layer template translation](0012-layer-template-translation.md), tracking issue [#268](https://github.com/MapCairn/mapcairn/issues/268).
