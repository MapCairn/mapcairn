// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defineConfig } from "vite";

// An outside app's whole build setup for a real map: no plugin at all. The
// worker comes from a `?worker&url` import and the engine's stylesheet from a
// CSS import inside the adapter, both of which plain Vite handles.
export default defineConfig({});
