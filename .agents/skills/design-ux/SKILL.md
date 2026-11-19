---
name: design-ux
description: "Design how a MapCairn interface change works for people, before and beside the code: task flows for pointer, touch, keyboard and screen reader, every state (loading, slow, empty, partial, failed, offline), what is announced, and the copy as catalogue keys in English and Afrikaans. Use when an issue or plan changes what someone sees or does on the map, or when someone asks for flows, states, error or empty messages, or interaction design. Reviewing interface code against DESIGN.md is review-ui; looking at the screen is visual-check."
---

# Design the experience

UX engineering for MapCairn. `review-ui` reads code against `DESIGN.md` and `visual-check` looks at the running app; both come after the code. This skill comes before it: what a person can do, what they see and hear in every state, and the words. Its output is text for the issue or the plan, and the tests that will prove it.

Example: an issue asks for one announcement when the device goes offline. Walking its states finds that the core message already exists with no caller, that the tile-error banner is a live region of its own and would speak beside it, and that sighted people get no once-only notice, because only the announcement was specified.

## Inputs

- The shaped issue or plan (`shape-work`), and the surfaces it changes.
- The people and jobs it names. If it names none, ask, or run `shape-work` first.

## 1. Read

1. `DESIGN.md`: "Principles", "Layout and slots", the "Components and accessibility contracts" row of every component involved, and the `LiveRegion` row.
2. The current flow in code: the components and hooks, the existing words in `packages/core/src/messages/en-GB.ts` and `packages/web/src/i18n/af.ts`, the message builders in `packages/core/src/announce`, and the Playwright specs for the area. Reuse a component, a key or a builder before adding one; search for an unused one too.
3. Walk the current flow in the running app where the change is visible (`visual-check` section 1 says how to start it on a free port, section 4 how to stop it and check the port is free).

## 2. Flows

One flow per task, from where the person starts to where they end, for each route:

- **Pointer and touch.** Every gesture (drag, long press, pinch, two-finger rotate) has a keyboard or single-tap route.
- **Keyboard only.** Tab order, the keys, where focus lands after each step and after closing, what Escape does. The map region's own keys (arrows pan, `I` identifies) keep working.
- **Screen reader.** The accessible name of each control, and what is announced at each step.

Then place it on the map:

- The `MapChrome` slot that owns it, what it covers on a phone, and where it sits in the side panel from 768px wide and on short screens.
- The sheet detent it opens at, and what the bottom slots do above it. Which surface it is: one tool is open at a time.
- Camera moves that fit content clear of the sheet, the side panel and the key, and stop when reduced motion is on.
- Targets of at least 44px and controls of 48px, with 8px between neighbours. Pinch zoom is never blocked.

## 3. States

One table per surface. Write "n/a" with the reason rather than drop a state.

| State | Trigger | What shows | What is said (priority, `keep`) | What the person can do |
| ----- | ------- | ---------- | ------------------------------- | ---------------------- |

- First use and empty; loading; slow (with the threshold the code already uses, or "to be measured"); loaded; partial (some layers or tiles failed, results capped).
- Failed, one row per error kind the port defines (network, offline, invalid answer, rate limited, not found); an aborted request says nothing.
- Offline when the page opens, going offline mid-task, coming back, online with no route (the browser's signal is a hint), and a connection that drops and returns repeatedly.
- The server render, where no browser signal exists, and the first render after hydration, which must match it.
- The optional service absent in a host, so the control is not offered.
- Save data on, reduced motion, both themes, right to left, Afrikaans (longer words), long place names (isolated text), the largest count the code allows.

For announcements:

- List every message that can fire at the same moment from elsewhere, including `StatusMessage` banners, which are live regions themselves. One outcome is said once.
- Apply the `LiveRegion` rules: a waiting message is replaced unless sent with `keep`, and `keep` is only for the outcome of something the person did or a state they would otherwise miss.
- Whatever is said is also visible somewhere, and whatever appears that matters is said.

Recovery: what is kept after a failure, how the person retries (only when they ask; nothing polls), and an undo for anything that removes their work.

## 4. Copy

A table: key, English (en-GB), Afrikaans (af), where it shows, placeholders. A new key goes into the `MessageKey` union, `en-GB.ts` and `af.ts` in the same pull request; a test fails on an Afrikaans value left as English. Note any Afrikaans you are unsure of in the pull request description, not in the code.

- British English, sentence case, plain. Say what happened, then what to do: "Could not load. Check your connection." No blame, no jokes, no exclamation marks.
- Buttons are verbs, and a visible label is contained in the accessible name.
- Numbers, units, dates and lists through the catalogue's formatters, never joined by hand; counts through `plural`.
- SDK copy names no provider; a host's own note says what is sent and to whom, before it is sent.
- Status that changes on its own (a slow layer, a lost connection) is words, never colour alone.

## 5. Check the design

One line per problem found, with the state or step it affects:

- Is the system's state visible and current, on screen and to a screen reader?
- Can the person cancel, undo and leave with Escape, and is focus returned?
- Does it match how the map's existing controls behave, and reuse their components?
- Does it prevent the error (a control disabled with a reason, not hidden, as `DESIGN.md` does) rather than report it?
- Is anything needed only on hover, only by gesture, or only in colour?
- What does it cost in requests and data, and does Save data change it?

## 6. Output and hand-over

Into the issue or plan: the flows, the state tables, the announcements, the copy table, and acceptance criteria for any state the issue lacked. Then:

- `playwright-tests` for the keyboard route, the failure states (the test seam scripts them) and the `@a11y` test.
- After the code: `review-ui` on the files, `visual-check` on the screens.
- A changed component contract updates its `DESIGN.md` row in the same pull request.

## Do not

- Add a component, a colour or a size where a token or component exists, or a gesture without its keyboard route.
- Write copy inline in a component, or invent a threshold or a figure.
- Review code (`review-ui`) or screenshots (`visual-check`) here.
- Post on GitHub unless the person asked; put it in your report.

## Report

The report in `AGENTS.md` ("Definition of done"): **PR** is the issue, plan or pull request; **Checks** "none, no code" unless you ran the app (say which port, and that it was stopped); **Seen** holds the flows, states, copy and findings; **Deviations**; **Issues to file**.
