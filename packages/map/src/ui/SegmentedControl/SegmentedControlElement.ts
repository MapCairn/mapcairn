// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { html, nothing, type PropertyDeclarations } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { drawIcon } from "../../lit/drawIcon";
import { CHECK_ICON } from "../../lit/icons.generated";
import { defineUnderFreeName, PrivateElement } from "../../lit/PrivateElement";
import { focusFirst, focusMove, moveCandidates } from "./rovingFocus";
import * as styles from "./SegmentedControl.css";

/** One choice, as the element draws it. */
export interface SegmentedItem {
  readonly value: string;
  readonly label: string;
  readonly lang?: string;
  /** A node the parent filled, placed before the label. */
  readonly icon?: Node;
}

/**
 * The segmented control: a `radiogroup` of `radio` buttons with one tab stop.
 * Arrow keys, Home, End, Page Up and Page Down move focus without choosing, and
 * a click, which Space and Enter send to a button, chooses. Native radio inputs
 * would choose on each arrow press. The element never changes its own value:
 * it asks its parent through `choose`.
 */
export class SegmentedControlElement extends PrivateElement {
  static override properties: PropertyDeclarations = {
    label: { attribute: false },
    options: { attribute: false },
    value: { attribute: false },
    disabled: { attribute: false },
    direction: { attribute: false },
    itemTestId: { attribute: false },
  };

  /** The group's accessible name. */
  declare label: string;
  declare options: readonly SegmentedItem[];
  /** The chosen value. */
  declare value: string;
  declare disabled: boolean;
  /** The page's reading direction, which Left and Right follow. */
  declare direction: "ltr" | "rtl";
  /** When set, each item's test id is this, a hyphen and its value. */
  declare itemTestId: string | undefined;
  /** Called with a value other than the chosen one that the person picked. */
  choose: (value: string) => void = () => undefined;

  /** The item that holds the tab stop: the one that had focus last. */
  #tabStop: string | undefined;
  /** Set while Shift+Tab leaves, so focus does not stop at the group. */
  #leaving = false;
  /** Set by a pointer press, whose focus must stay where it landed. */
  #pressed = false;

  constructor() {
    super();
    this.label = "";
    this.options = [];
    this.value = "";
    this.disabled = false;
    this.direction = "ltr";
    this.itemTestId = undefined;
    this.addEventListener("mousedown", () => {
      this.#pressed = true;
    });
    this.addEventListener("focusin", (event) => this.#enter(event));
    this.addEventListener("focusout", () => this.#setLeaving(false));
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("role", "radiogroup");
    // Focus passes straight on to an item, so the group never shows a ring.
    this.style.setProperty("outline", "none");
  }

  protected override willUpdate(): void {
    this.setAttribute("aria-label", this.label);
    this.setAttribute("dir", this.direction);
    this.#setGroupTabStop();
  }

  protected override render(): unknown {
    return repeat(
      this.options,
      (option) => option.value,
      (option) => this.#item(option),
    );
  }

  #item(option: SegmentedItem): unknown {
    const checked = option.value === this.value;
    return html`<button
      type="button"
      role="radio"
      class=${styles.item}
      value=${option.value}
      aria-checked=${checked ? "true" : "false"}
      data-state=${checked ? "on" : "off"}
      ?data-disabled=${this.disabled}
      ?disabled=${this.disabled}
      tabindex=${this.#tabStop === option.value ? "0" : "-1"}
      lang=${option.lang ?? nothing}
      data-testid=${this.itemTestId ? `${this.itemTestId}-${option.value}` : nothing}
      @click=${() => this.#pick(option.value)}
      @focus=${() => this.#setTabStop(option.value)}
      @mousedown=${() => this.#setTabStop(option.value)}
      @keydown=${(event: KeyboardEvent) => this.#keyDown(event)}
    >${option.icon ?? nothing}${option.label}${checked ? drawIcon(CHECK_ICON, styles.check) : nothing}</button>`;
  }

  #pick(value: string): void {
    if (value !== this.value) {
      this.choose(value);
    }
  }

  #setTabStop(value: string): void {
    if (this.#tabStop !== value) {
      this.#tabStop = value;
      this.requestUpdate();
      this.flush();
    }
  }

  #setGroupTabStop(): void {
    const skipped = this.#leaving || this.disabled || this.options.length === 0;
    this.setAttribute("tabindex", skipped ? "-1" : "0");
  }

  #setLeaving(leaving: boolean): void {
    this.#leaving = leaving;
    this.#setGroupTabStop();
  }

  /** The buttons that can take focus, in order. */
  #buttons(): HTMLButtonElement[] {
    return [...this.querySelectorAll("button")].filter(
      (button) => !button.disabled,
    );
  }

  /** Focus that reaches the group by keyboard or script goes on to an item. */
  #enter(event: FocusEvent): void {
    const fromKeyboard = !this.#pressed;
    this.#pressed = false;
    if (event.target !== this || !fromKeyboard || this.#leaving) {
      return;
    }
    const buttons = this.#buttons();
    const withValue = (value: string | undefined) =>
      buttons.filter((button) => button.value === value);
    focusFirst([
      ...withValue(this.value),
      ...withValue(this.#tabStop),
      ...buttons,
    ]);
  }

  #keyDown(event: KeyboardEvent): void {
    if (event.key === "Tab" && event.shiftKey) {
      // Before the browser moves focus, so it does not stop at the group.
      this.#setLeaving(true);
      return;
    }
    const move = focusMove(event, this.direction);
    if (move === undefined) {
      return;
    }
    event.preventDefault();
    const buttons = this.#buttons();
    const from = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    focusFirst(moveCandidates(buttons, from, move));
  }
}

let tag: string | undefined;

/** Defines the element once for this copy of the package, and names it. */
export function defineSegmentedControl(): string {
  tag ??= defineUnderFreeName("segmented", SegmentedControlElement);
  return tag;
}
