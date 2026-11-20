// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { renderToReadableStream } from "react-dom/server";
import { App } from "./App.js";

/**
 * A Worker that renders the app with the stream renderer Workers use, and
 * answers with the markup, a token, and the runtime's own name, so the check
 * can tell it ran on workerd and not in Node.
 */
export default {
  async fetch(): Promise<Response> {
    const stream = await renderToReadableStream(<App />);
    await stream.allReady;
    return Response.json({
      html: await new Response(stream).text(),
      fontFamily: tokens.type.family,
      runtime: navigator.userAgent,
    });
  },
};
