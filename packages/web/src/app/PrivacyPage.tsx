// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type MessageKey, THEME_STORAGE_KEY } from "@mapcairn/core";
import { useOptionalMessages, VisuallyHidden } from "@mapcairn/map";
import type { ReactNode } from "react";
import {
  PLAYGROUND_PATH,
  PRODUCT_PATH,
  SITE_URL,
} from "../constants/siteConfig";
import { MessageParts } from "../i18n/MessageParts";
import { DOCUMENT_SCROLL } from "./documentScroll";
import * as styles from "./PrivacyPage.css";

/**
 * ISO date this policy's content was last reviewed for accuracy. The root
 * `PRIVACY.md` states the same date, and a test keeps the two equal.
 */
export const LAST_UPDATED = "2026-11-16";

/** The browser storage the policy names, which no translation changes. */
const LOCAL_STORAGE = "localStorage";

/** The key the first-visit tour's answer is kept under. */
const TOUR_KEY = "mapcairn:tourSeen";

/** What every other setting's key starts with. */
const KEY_PREFIX = "mapcairn:";

/** The two hosts the analytics script and its reports use. */
const ANALYTICS_SCRIPT_HOST = "static.cloudflareinsights.com";
const ANALYTICS_BEACON_HOST = "cloudflareinsights.com";

/** The address of the site's public issue tracker. */
const ISSUES_URL = "https://github.com/MapCairn/mapcairn/issues";

/** Where the host's own privacy policy lives. */
const HOST_POLICY_URL = "https://www.cloudflare.com/privacypolicy/";

/** The address people write to about privacy. */
const CONTACT_EMAIL = "mapcairn@timothybrits.co.za";

/** A technical name or address, shown as code and never translated. */
function code(text: string): ReactNode {
  return <code>{text}</code>;
}

/** One section of the policy: a heading and a paragraph, both from the catalogue. */
function PolicySection({
  heading,
  body,
  parts = {},
}: {
  readonly heading: MessageKey;
  readonly body: MessageKey;
  readonly parts?: Readonly<Record<string, ReactNode>>;
}) {
  const messages = useOptionalMessages();
  return (
    <>
      <h2 className={styles.sectionTitle}>{messages.t(heading, {})}</h2>
      <p className={styles.body}>
        <MessageParts messages={messages} messageKey={body} parts={parts} />
      </p>
    </>
  );
}

/**
 * The site's privacy policy, in the language in use.
 * @remarks Every word comes from the message catalogue (`privacy.*` keys), in
 *   English and Afrikaans. A placeholder in a paragraph stands for a link or a
 *   `<code>` span the page supplies, so the markup stays here and a translator
 *   moves it with the sentence. Reads `THEME_STORAGE_KEY` from
 *   `@mapcairn/core`, which the settings store and the pre-paint theme script
 *   also use, so this copy cannot drift from the key the app really uses. The
 *   English text must stay in step with the root `PRIVACY.md`, which mirrors it
 *   for readers of the repository; that file is English only, and the
 *   Afrikaans page says the same in the visitor's language.
 */
export function PrivacyPage() {
  const messages = useOptionalMessages();
  const { t } = messages;
  const newTab = t("layers.card.opensInNewTab", {});
  return (
    <div className={styles.scroller} {...DOCUMENT_SCROLL}>
      <main className={styles.page} data-testid="privacy-page">
        <h1 className={styles.heading}>{t("privacy.title", {})}</h1>
        <p className={styles.updated}>
          {t("privacy.updated", { date: LAST_UPDATED })}
        </p>

        <p className={styles.body}>{t("privacy.intro", {})}</p>

        <PolicySection
          heading="privacy.cookies.heading"
          body="privacy.cookies.body"
        />

        <PolicySection
          heading="privacy.storage.heading"
          body="privacy.storage.body"
          parts={{
            localStorage: code(LOCAL_STORAGE),
            themeKey: code(THEME_STORAGE_KEY),
            tourKey: code(TOUR_KEY),
            keyPrefix: code(KEY_PREFIX),
          }}
        />

        <PolicySection
          heading="privacy.analytics.heading"
          body="privacy.analytics.body"
          parts={{
            scriptHost: code(ANALYTICS_SCRIPT_HOST),
            beaconHost: code(ANALYTICS_BEACON_HOST),
          }}
        />

        <PolicySection
          heading="privacy.errors.heading"
          body="privacy.errors.body"
          parts={{ exampleUrl: code(`${SITE_URL}/`) }}
        />

        <PolicySection
          heading="privacy.hosting.heading"
          body="privacy.hosting.body"
          parts={{
            link: (
              <a
                className={styles.link}
                href={HOST_POLICY_URL}
                target="_blank"
                rel="noreferrer"
              >
                {t("privacy.hosting.link", {})}
                <VisuallyHidden> {newTab}</VisuallyHidden>
              </a>
            ),
          }}
        />

        <PolicySection
          heading="privacy.tiles.heading"
          body="privacy.tiles.body"
        />

        <PolicySection
          heading="privacy.layers.heading"
          body="privacy.layers.body"
        />

        <PolicySection
          heading="privacy.pins.heading"
          body="privacy.pins.body"
        />

        <PolicySection
          heading="privacy.routes.heading"
          body="privacy.routes.body"
        />

        <PolicySection
          heading="privacy.location.heading"
          body="privacy.location.body"
        />

        <PolicySection
          heading="privacy.contact.heading"
          body="privacy.contact.body"
          parts={{
            email: (
              <a className={styles.link} href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            ),
            issues: (
              <a className={styles.link} href={ISSUES_URL}>
                {t("privacy.contact.issuesLink", {})}
              </a>
            ),
          }}
        />

        <a className={styles.link} href={PRODUCT_PATH}>
          {t("privacy.backToProduct", {})}
        </a>

        <a className={styles.link} href={PLAYGROUND_PATH}>
          {t("privacy.back", {})}
        </a>
      </main>
    </div>
  );
}
