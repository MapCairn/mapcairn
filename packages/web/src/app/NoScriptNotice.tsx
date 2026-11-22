// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useMessages } from "@mapcairn/map";
import { PRODUCT_PATH, SOURCE_REPOSITORY_URL } from "../constants/siteConfig";
import * as styles from "./NoScriptNotice.css";

/**
 * What `/map` shows a browser that runs no scripts: that the map needs them,
 * and links to the pages that do not. Render it inside `<noscript>`, so a
 * browser that runs scripts never has it in the page.
 *
 * @remarks The server renders it in English, because without scripts the
 *   page cannot read the visitor's stored language. Its words are still
 *   catalogue keys, so they are translated like the rest.
 */
export function NoScriptNotice() {
  const { t } = useMessages();
  return (
    <div className={styles.cell}>
      <div className={styles.card} data-testid="no-script-notice">
        <p className={styles.message}>{t("host.map.noScript", {})}</p>
        <ul className={styles.links}>
          <li>
            <a className={styles.link} href={PRODUCT_PATH}>
              {t("host.about.product", {})}
            </a>
          </li>
          <li>
            <a className={styles.link} href={SOURCE_REPOSITORY_URL}>
              {t("host.about.link", {})}
            </a>
          </li>
          <li>
            <a className={styles.link} href="/privacy">
              {t("settings.privacy.link", {})}
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
