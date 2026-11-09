import type { MetaFunction } from "react-router";
import { DesignGuide } from "../designGuide/DesignGuide";
import { checkDocumentFont } from "../designGuide/FontSection";

/**
 * React Router route module export: the style guide's title, kept out of
 * search engines. The route exists only in development and e2e builds.
 */
export const meta: MetaFunction = () => [
  { title: "Design system | Karta" },
  { name: "robots", content: "noindex" },
];

/**
 * React Router route module export: the `/design` living style guide. Never
 * bundled in production; see `designGuideRoutes.ts`.
 */
export default function DesignRoute() {
  return <DesignGuide checkFont={checkDocumentFont} />;
}
