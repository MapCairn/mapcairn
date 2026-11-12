// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { installErrorReporting } from "./composition/errorReporting";

// Reporting starts before hydration, so an error while hydrating is caught.
// The theme needs nothing here: the inline script in the head applied it
// before first paint, and the ThemeSource service takes over in the app.
installErrorReporting();
hydrateRoot(document, <HydratedRouter />);
