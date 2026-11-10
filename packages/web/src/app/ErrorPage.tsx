import { Button } from "@mapcairn/map";
import { RotateCw } from "lucide-react";
import { useNavigate } from "react-router";
import * as styles from "./ErrorPage.css";

/** What went wrong, in the words the page shows. */
export type ErrorPageKind = "not-found" | "unexpected";

const COPY: Readonly<
  Record<ErrorPageKind, { readonly title: string; readonly message: string }>
> = {
  "not-found": {
    title: "Page not found",
    message:
      "There is nothing at this address. Check the link, or go back to the map.",
  },
  unexpected: {
    title: "Something went wrong",
    message:
      "MapCairn stopped because of an unexpected problem. Reload the page to start again. Your settings are kept.",
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
 * The page shown by the root error boundary: plain English about what
 * happened and what to do, never the raw error. "Page not found" links back
 * to the map; anything else offers a Reload button.
 */
export function ErrorPage({ kind }: ErrorPageProps) {
  const reload = useReloadPage();
  const { title, message } = COPY[kind];
  return (
    <main className={styles.page} data-testid="error-page">
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{message}</p>
        {kind === "not-found" ? (
          <a href="/" className={styles.link}>
            Go to the map
          </a>
        ) : (
          <Button icon={RotateCw} onClick={reload}>
            Reload
          </Button>
        )}
      </div>
    </main>
  );
}
