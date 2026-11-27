// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

let address: Promise<string> | undefined;

/**
 * The address of a `blob:` made from the engine's worker script, which the
 * bundle carries, so no file has to be served and no bundler has to find one.
 * The script is loaded and the address made once for the page, as the engine's
 * worker pool keeps the first address it is given, and it is never revoked.
 * The page's policy needs `blob:` in `worker-src`.
 */
export function embeddedWorkerUrl(): Promise<string> {
  address ??= import("./engineWorkerSource")
    .then(({ default: source }) =>
      URL.createObjectURL(new Blob([source], { type: "text/javascript" })),
    )
    .catch((error: unknown) => {
      address = undefined;
      throw error;
    });
  return address;
}
