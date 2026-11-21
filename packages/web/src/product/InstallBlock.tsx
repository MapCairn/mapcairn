// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ClipboardPort } from "@mapcairn/core";
import { VisuallyHidden } from "@mapcairn/map";
import { useEffect, useId, useRef, useState } from "react";
import { CopyCodeButton } from "./CopyCodeButton";
import * as styles from "./ProductPage.css";
import { type InstallOption, installCommandLabel } from "./productContent";

/** Props for {@link InstallBlock}. */
export interface InstallBlockProps {
  /** The group's accessible name. */
  readonly label: string;
  /** One command for each package manager, the first chosen. */
  readonly options: readonly InstallOption[];
  readonly clipboard: ClipboardPort;
}

/**
 * The install command for each package manager, as a native radio group with
 * a copy button. It works without a script: the server renders every command
 * and the first radio chosen, plain CSS shows the command of the chosen radio
 * (`:has(:checked)`), and the radios choose natively, with the arrow keys
 * following the reading direction. The copy button is the only part that needs
 * a script, so it appears once the page runs, in a row that is already
 * reserved. Which manager was chosen is read back from the radios when the
 * page starts, so a choice made before then is the one copied. Nothing is
 * stored: the choice lasts until the page is left.
 */
export function InstallBlock({ label, options, clipboard }: InstallBlockProps) {
  const name = useId();
  const group = useRef<HTMLFieldSetElement>(null);
  const [chosen, setChosen] = useState(options[0]?.manager);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const checked = group.current?.querySelector<HTMLInputElement>(
      "input[type=radio]:checked",
    );
    if (checked) {
      setChosen(checked.value);
    }
    setRunning(true);
  }, []);

  const command = options.find((option) => option.manager === chosen)?.command;

  return (
    <fieldset ref={group} className={styles.install}>
      <VisuallyHidden as="legend">{label}</VisuallyHidden>
      <div className={styles.installRow}>
        {options.map(({ manager, command: text }, index) => (
          <div key={manager} className={styles.installOption}>
            <label className={styles.installChoice}>
              <span className={styles.installName}>{manager}</span>
              <input
                type="radio"
                className={styles.installRadio}
                name={name}
                value={manager}
                defaultChecked={index === 0}
                onChange={() => setChosen(manager)}
              />
            </label>
            {/* biome-ignore lint/a11y/useSemanticElements: a pre keeps the code's whitespace; a section would not */}
            <pre
              className={styles.installCommand}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must take focus to be scrolled from the keyboard
              tabIndex={0}
              role="region"
              aria-label={installCommandLabel(manager)}
            >
              <code>{text}</code>
            </pre>
          </div>
        ))}
        <div className={styles.installCopy}>
          {running && command !== undefined && (
            <CopyCodeButton
              code={command}
              label={command}
              clipboard={clipboard}
            />
          )}
        </div>
      </div>
    </fieldset>
  );
}
