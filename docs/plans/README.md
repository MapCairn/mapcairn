# Plans and specs

Most work needs only a GitHub issue with its design notes and task list. A plan is for a large change that crosses several packages or decides a public API, where the record should live with the code. Plans and specs for such changes live here, one file each, numbered in the order they were written (`0001-short-name.md`). A plan states the goal, the ground rules, the design, the tests and the order of work, and it is short enough to read in a few minutes. Every plan has a tracking issue on GitHub, linked from its file and, while the plan is open, listed at the end of this page; the issue holds the task list and the plan file holds the design. Move its status from "proposed" to "in progress" as the work moves. The pull request that finishes the last step deletes the plan, its entry here and any references to it, or folds what still governs the code into the guides, so no later cleanup is needed.

A plan gets its own pull request, reviewed before any code is written, only when the work will not start straight away. When it starts immediately, the plan file and its first step of implementation land in one pull request instead, and the plan is "in progress" from the moment it merges.

Playwright test plans (see the `playwright-tests` skill) go in `specs/` at the repository root, not here.

Open plans:

- [0007: Multi-feature selection](0007-multi-feature-selection.md), tracking issue [#49](https://github.com/MapCairn/mapcairn/issues/49).
- [0014: Release the SDK packages on GitHub and npm](0014-sdk-release.md), tracking issue [#1](https://github.com/MapCairn/mapcairn/issues/1).
- [0017: A documentation site on its own hostname](0017-documentation-site.md), tracking issue [#199](https://github.com/MapCairn/mapcairn/issues/199).
