// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defineConfig } from "vite";

// An outside app's whole build setup for the SDK: no plugin at all. The
// stylesheets are plain CSS imports, and the server build bundles the SDK
// packages the way a Worker build does.
export default defineConfig({
  ssr: { noExternal: [/^@mapcairn\//] },
});
