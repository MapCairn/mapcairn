// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { VisuallyHidden } from "@mapcairn/map";
import { useId } from "react";
import { CopyCodeButton } from "./CopyCodeButton";
import * as styles from "./ProductPage.css";
import {
  copyMessages,
  type InstallOption,
  installCommandLabel,
  installCopyLabel,
} from "./productContent";

/** Props for {@link InstallBlock}. */
export interface InstallBlockProps {
  /** The group's accessible name. */
  readonly label: string;
  /** One command for each package manager, the first chosen. */
  readonly options: readonly InstallOption[];
}

/**
 * The install command for each package manager, as a native radio group with
 * a copy button. It needs no script: the server renders every command and the
 * first radio chosen, plain CSS shows the command of the chosen radio
 * (`:has(:checked)`), and the radios choose natively, with the arrow keys
 * following the reading direction. The copy button is the only part that needs
 * a script, so it is `hidden` until `COPY_CODE_SCRIPT` shows it, in the corner
 * of the command, which already leaves it room. The script copies the command
 * of the radio chosen at the time of the click, so a choice made before it ran
 * counts. Nothing is stored: the choice lasts until the page is left.
 */
export function InstallBlock({ label, options }: InstallBlockProps) {
  const name = useId();

  return (
    <fieldset className={styles.install} data-copy-scope="">
      <VisuallyHidden as="legend">{label}</VisuallyHidden>
      <div className={styles.installRow}>
        {options.map(({ manager, command: text }, index) => (
          <div
            key={manager}
            className={styles.installOption}
            data-copy-option=""
          >
            <label className={styles.installChoice}>
              <span className={styles.installName}>{manager}</span>
              <input
                type="radio"
                className={styles.installRadio}
                name={name}
                value={manager}
                defaultChecked={index === 0}
              />
            </label>
            {/* biome-ignore lint/a11y/useSemanticElements: a pre keeps the code's whitespace; a section would not */}
            <pre
              className={styles.installCommand}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must take focus to be scrolled from the keyboard
              tabIndex={0}
              role="region"
              aria-label={installCommandLabel(manager)}
              data-copy={copyMessages(installCopyLabel(manager))}
            >
              <code>{text}</code>
            </pre>
          </div>
        ))}
        <div className={styles.installCopy} data-testid="install-copy">
          <CopyCodeButton />
        </div>
      </div>
    </fieldset>
  );
}
