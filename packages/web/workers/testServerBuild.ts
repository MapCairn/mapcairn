// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Stand-in for the built server bundle (`build/server/index.js`) in unit
 * tests, so `workers/app.ts` resolves on a fresh checkout where nothing has
 * been built. The tests replace `createRequestHandler`, so this is never run.
 */
export {};
