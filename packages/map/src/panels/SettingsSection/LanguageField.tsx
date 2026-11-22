// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type LanguageOption,
  type MessageCatalogue,
  message,
} from "@mapcairn/core";
import { ArrowClockwise, Warning } from "@phosphor-icons/react";
import { type FocusEvent, useEffect, useRef } from "react";
import {
  useLanguageLoad,
  useLanguages,
  useMessages,
  useSettings,
} from "../../services";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { useAnnounce } from "../../ui/LiveRegion";
import { SegmentedControl } from "../../ui/SegmentedControl";
import {
  field,
  fieldLabel,
  languageStatus,
  languageStatusError,
} from "./SettingsSection.css";

/** The value of the "follow the browser" choice, which no language tag can equal. */
const AUTOMATIC = "auto";

function languageOptions(
  t: MessageCatalogue["t"],
  languages: readonly LanguageOption[],
): readonly { value: string; label: string; lang?: string }[] {
  return [
    { value: AUTOMATIC, label: t("settings.language.auto", {}) },
    ...languages.map(({ tag, label }) => ({ value: tag, label, lang: tag })),
  ];
}

/**
 * Hands focus on when the status (and Try again with it) goes because the
 * language loaded. It acts only if Try again had focus when it went and focus
 * has been left with nothing, so someone who moved on is left alone. The
 * returned handlers go on the button.
 */
function useFocusHandoff(shown: boolean, onGone: () => void) {
  const wasShown = useRef(false);
  const hadFocus = useRef(false);
  useEffect(() => {
    const gone = wasShown.current && !shown;
    wasShown.current = shown;
    if (!gone) {
      return;
    }
    const mine = hadFocus.current;
    hadFocus.current = false;
    const focused = document.activeElement;
    if (mine && (focused === null || focused === document.body)) {
      onGone();
    }
  }, [shown, onGone]);
  return {
    onFocus: () => {
      hadFocus.current = true;
    },
    // A blur from a button still on the page is a person moving on. One from a
    // button that has gone is the focused button leaving, which the handoff follows.
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.isConnected) {
        hadFocus.current = false;
      }
    },
  };
}

/**
 * The Language control of the Settings panel: Automatic and each language the
 * host offers, and, when the messages for the chosen language failed to load,
 * a status in the language still on screen with Try again.
 * @remarks While the failure stands the control shows the language the
 *   interface is in as selected, not the one that failed, and choosing the
 *   failed language again retries it. The failure is announced once, politely,
 *   when it first appears. The status is plain text, so nothing is read twice.
 *   Try again stays in place while it retries, busy, so focus stays on it; when
 *   the language loads it goes and focus moves to the selected language.
 */
export function LanguageField() {
  const { settings, update } = useSettings();
  const messages = useMessages();
  const { t } = messages;
  const announce = useAnnounce();
  const offered = useLanguages()?.languages ?? [];
  const languageLoad = useLanguageLoad();
  const fieldRef = useRef<HTMLDivElement>(null);
  const failedTag = languageLoad?.failed ?? null;
  const failedLabel = offered.find(({ tag }) => tag === failedTag)?.label;
  const isOffered = (tag: string | null) =>
    offered.some((option) => option.tag === tag);
  const chosen = isOffered(settings.language) ? settings.language : null;
  const shown = isOffered(messages.language) ? messages.language : null;
  const selected = failedTag !== null && chosen === failedTag ? shown : chosen;
  const label = t("settings.language.label", {});
  const focusHandoff = useFocusHandoff(failedLabel !== undefined, () =>
    fieldRef.current
      ?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
      ?.focus(),
  );

  useEffect(() => {
    if (failedLabel === undefined) {
      return;
    }
    announce(
      message("settings.language.loadFailed", { language: failedLabel }),
      { keep: true },
    );
  }, [failedLabel, announce]);

  const choose = (next: string) => {
    if (next === failedTag && settings.language === next) {
      languageLoad?.retry();
      return;
    }
    update({ language: next === AUTOMATIC ? null : next });
  };

  return (
    <div className={field} ref={fieldRef}>
      <p className={fieldLabel} aria-hidden="true">
        {label}
      </p>
      <SegmentedControl
        label={label}
        options={languageOptions(t, offered)}
        value={selected ?? AUTOMATIC}
        onValueChange={choose}
        data-testid="language-option"
      />
      {failedLabel === undefined ? null : (
        <div className={languageStatus} data-testid="language-status">
          <span className={languageStatusError}>
            <Icon icon={Warning} />
            {t("settings.language.loadFailed", { language: failedLabel })}
          </span>
          <Button
            variant="secondary"
            icon={ArrowClockwise}
            busy={languageLoad?.retrying}
            data-testid="language-retry"
            onClick={() => languageLoad?.retry()}
            {...focusHandoff}
          >
            {t("settings.language.tryAgain", {})}
          </Button>
        </div>
      )}
    </div>
  );
}
