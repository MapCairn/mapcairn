// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ReactNode } from "react";
import { DEFAULT_LANGUAGE } from "../i18n/hostLanguages";

/** Props for {@link SourceLanguage}. */
export interface SourceLanguageProps {
  readonly children: ReactNode;
}

/**
 * Marks host copy that is written only in the source language, British
 * English, such as the provider notes, so a screen reader reads it as English
 * when the interface speaks another language.
 */
export function SourceLanguage({ children }: SourceLanguageProps) {
  return <span lang={DEFAULT_LANGUAGE}>{children}</span>;
}
