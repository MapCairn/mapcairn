/**
 * Keeps SDK packages independent of the web host and enforces the foundational
 * packages' separation. Run through `npm run depcruise`, part of `npm run lint`.
 */
module.exports = {
  forbidden: [
    {
      name: "core-is-dependency-free",
      severity: "error",
      comment:
        "The layer model must not depend on rendering, hooks or the host.",
      from: { path: "^packages/core/src" },
      to: { path: "^packages/(map|react|theme|web)/src" },
    },
    {
      name: "react-is-dependency-free",
      severity: "error",
      comment: "Generic React hooks must not depend on map or host concerns.",
      from: { path: "^packages/react/src" },
      to: { path: "^packages/(core|map|theme|web)/src" },
    },
    {
      name: "theme-is-dependency-free",
      severity: "error",
      comment: "The token contract must remain independent of its consumers.",
      from: { path: "^packages/theme/src" },
      to: { path: "^packages/(core|map|react|web)/src" },
    },
    {
      name: "map-has-no-web-dependency",
      severity: "error",
      comment:
        "Map components receive configuration rather than import the host.",
      from: { path: "^packages/map/src" },
      to: { path: "^packages/web/src" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.test\\.(ts|tsx)$" },
  },
};
