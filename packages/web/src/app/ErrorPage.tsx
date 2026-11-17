// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageKey } from "@mapcairn/core";
import { Button } from "@mapcairn/map";
import { RotateCw } from "lucide-react";
import { useNavigate } from "react-router";
import { PLAYGROUND_PATH } from "../constants/siteConfig";
import * as styles from "./ErrorPage.css";
import { useErrorPageMessages } from "./useErrorPageMessages";

/** What went wrong, in the words the page shows. */
export type ErrorPageKind = "not-found" | "unexpected";

const COPY: Readonly<
  Record<
    ErrorPageKind,
    { readonly title: MessageKey; readonly message: MessageKey }
  >
> = {
  "not-found": {
    title: "app.error.notFound.title",
    message: "app.error.notFound.message",
  },
  unexpected: {
    title: "app.error.unexpected.title",
    message: "app.error.unexpected.message",
  },
};

/**
 * Returns a function that reloads the page. React Router's `navigate(0)` is
 * `history.go(0)`, a full reload, without reaching for `location` here.
 */
export function useReloadPage(): () => void {
  const navigate = useNavigate();
  return () => {
    void navigate(0);
  };
}

/** Props for {@link ErrorPage}. */
export interface ErrorPageProps {
  readonly kind: ErrorPageKind;
}

/**
 * The page shown by the root error boundary: plain words about what
 * happened and what to do, never the raw error. "Page not found" links back
 * to the map; anything else offers a Reload button.
 *
 * @remarks The boundary replaces the root route that supplies the services,
 *   so the page never reads them. It speaks the visitor's stored language
 *   (else the browser's), English until that has loaded and whenever it
 *   cannot, as {@link useErrorPageMessages} describes.
 */
export function ErrorPage({ kind }: ErrorPageProps) {
  const reload = useReloadPage();
  const { t } = useErrorPageMessages();
  const { title, message } = COPY[kind];
  return (
    <main className={styles.page} data-testid="error-page">
      <div className={styles.card}>
        <h1 className={styles.title}>{t(title, {})}</h1>
        <p className={styles.message}>{t(message, {})}</p>
        {kind === "not-found" ? (
          <a href={PLAYGROUND_PATH} className={styles.link}>
            {t("app.error.notFound.link", {})}
          </a>
        ) : (
          <Button icon={RotateCw} onClick={reload}>
            {t("app.reload", {})}
          </Button>
        )}
      </div>
    </main>
  );
}
