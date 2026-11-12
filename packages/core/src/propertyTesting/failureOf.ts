// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/** A class that makes an error of type `E`, abstract or not. */
type ErrorClass<E extends Error> = abstract new (...args: never[]) => E;

/**
 * Runs `action` and reports how it failed, so a property can say "this may
 * only fail in the typed way".
 *
 * @returns The error when `action` throws an instance of `errorType`, or
 *   undefined when it returns normally.
 * @throws Whatever `action` throws that is not an instance of `errorType`.
 *   That is the stray exception a property is looking for.
 */
export function failureOf<E extends Error>(
  errorType: ErrorClass<E>,
  action: () => unknown,
): E | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    if (error instanceof errorType) {
      return error;
    }
    throw error;
  }
}
