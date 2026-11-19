// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Stand-in for React Router's virtual server build module
 * (`virtual:react-router/server-build`) in unit tests, so `workers/app.ts`
 * resolves where the React Router plugin is not running. The tests replace
 * `createRequestHandler`, so this is never run.
 */
export {};
