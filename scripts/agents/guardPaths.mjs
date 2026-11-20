// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Reads file paths in the forms of macOS, Linux and Windows and says whether
 * one is inside the worktree folder of the project (`.claude/worktrees/`).
 * `guardWrites.mjs` uses it; it holds no rule about agents or commands.
 *
 * Paths are compared as text after `.` and `..` are applied, in lower case
 * where the file system ignores case, and after symbolic links in the part of
 * the path that exists are followed. A path that depends on the shell
 * (`$HOME`, `~`, a glob such as `.*`, a brace list) cannot be known from its
 * text, so it counts as outside.
 */
import { realpathSync } from "node:fs";

/** A path longer than this is refused, so a hostile one cannot make the check slow. */
const MAX_PATH_LENGTH = 4096;

/** A path with more segments than this is refused, for the same reason. */
const MAX_SEGMENTS = 256;

/** The folder, under the project, that holds a reviewer's own worktrees. */
export const ZONE = [".claude", "worktrees"];

/**
 * @typedef {"linux" | "darwin" | "win32"} Platform
 */

/**
 * An absolute path: its root (`/`, `//`, or a lower-case drive such as `c:`)
 * and its segments with `.` and `..` already applied.
 *
 * @typedef {{ root: string, segments: string[] }} Resolved
 */

/**
 * What a check needs to know about the system and the project.
 *
 * @typedef {object} Context
 * @property {Platform} platform
 * @property {(p: string) => string} realpath Follows symbolic links.
 * @property {Resolved} zone The worktrees folder of the project.
 * @property {string[]} [zoneKey] The zone with links followed, remembered by
 *   the first check so that later ones do not ask the file system again.
 * @property {string[]} [tempDirs] The system's temporary folders, which can
 *   hold a session scratchpad (none on Windows, where its place is not known).
 * @property {string[][]} [tempKeys] `tempDirs` with links followed, remembered.
 */

/**
 * Splits an absolute path into its root and the rest, in any system's form.
 * Gives no root for a relative path.
 *
 * @param {string} raw
 * @param {Platform} platform
 * @returns {{ root: string | null, rest: string }}
 */
export function splitRoot(raw, platform) {
  if (platform !== "win32") {
    if (raw.startsWith("//")) {
      return { root: "//", rest: raw.slice(2) };
    }
    return raw.startsWith("/")
      ? { root: "/", rest: raw.slice(1) }
      : { root: null, rest: raw };
  }
  const extended = /^[\\/]{2}[?.][\\/]/.test(raw);
  let text = raw.replaceAll("\\", "/");
  text = extended ? text.slice(4) : text;
  if (extended && /^unc\//i.test(text)) {
    return { root: "//", rest: text.slice(4) };
  }
  text = text
    .replace(/^\/cygdrive\/([a-z])(?=\/|$)/i, "$1:")
    .replace(/^\/([a-z])(?=\/|$)/i, "$1:");
  const drive = /^([a-z]):(\/|$)/i.exec(text);
  if (drive) {
    const letter = (drive[1] ?? "").toLowerCase();
    return { root: `${letter}:`, rest: text.slice(drive[0].length) };
  }
  if (extended || text.startsWith("//")) {
    return { root: "//", rest: extended ? text : text.slice(2) };
  }
  return text.startsWith("/")
    ? { root: "/", rest: text.slice(1) }
    : { root: null, rest: text };
}

/**
 * Applies `.` and `..` to a list of segments. A `..` at the root stays there.
 *
 * @param {string[]} parts
 * @returns {string[]}
 */
function collapse(parts) {
  /** @type {string[]} */
  const out = [];
  for (const part of parts) {
    if (part === "..") {
      out.pop();
    } else if (part !== "" && part !== ".") {
      out.push(part);
    }
  }
  return out;
}

/**
 * Whether a word of a shell command still has to be expanded by the shell, so
 * its path cannot be known from the text: a variable, a command substitution,
 * `~`, a brace list, or a glob in a segment that starts with a dot (which can
 * match `..`).
 *
 * @param {string} raw
 * @returns {boolean}
 */
function expandsInShell(raw) {
  const dotGlob = raw
    .split(/[\\/]/)
    .some((segment) => segment.startsWith(".") && /[*?[]/.test(segment));
  return raw.startsWith("~") || /[`${}]/.test(raw) || dotGlob;
}

/**
 * Writes a resolved path as text.
 *
 * @param {Resolved} resolved
 * @returns {string}
 */
export function show({ root, segments }) {
  const prefix = root === "/" || root === "//" ? root : `${root}/`;
  return prefix + segments.join("/");
}

/**
 * Reads a path as an absolute location, against a working directory when it is
 * relative. Gives nothing for a path that cannot be known from its text.
 *
 * @param {unknown} raw
 * @param {string | null} cwd
 * @param {Platform} platform
 * @param {boolean} [shell] Whether the text is a word of a shell command.
 * @returns {Resolved | undefined}
 */
export function resolvePath(raw, cwd, platform, shell = false) {
  if (typeof raw !== "string" || raw === "" || raw.length > MAX_PATH_LENGTH) {
    return undefined;
  }
  const variable = /%[^%]+%/.test(raw);
  const unknown = shell
    ? expandsInShell(raw) || variable
    : /^~|\$/.test(raw) || variable;
  if (unknown || raw.includes("\0") || isUnreadableWindowsPath(raw, platform)) {
    return undefined;
  }
  const { root, rest } = splitRoot(raw, platform);
  const parts = rest.split("/");
  if (parts.length > MAX_SEGMENTS) {
    return undefined;
  }
  if (root !== null) {
    return { root, segments: collapse(parts) };
  }
  const base = cwd === null ? undefined : splitRoot(cwd, platform);
  if (base === undefined || base.root === null) {
    return undefined;
  }
  return {
    root: base.root,
    segments: collapse([...base.rest.split("/"), ...parts]),
  };
}

/**
 * Whether a Windows path has a form this check does not read: a drive without
 * a slash (`D:file` is relative to that drive's current folder), a short
 * 8.3 name (`MAPCAI~1`), or a segment Windows reads differently from the text
 * (a trailing dot or space, or a character a name cannot hold, such as a
 * stream name after a colon).
 *
 * @param {string} raw
 * @param {Platform} platform
 * @returns {boolean}
 */
function isUnreadableWindowsPath(raw, platform) {
  if (platform !== "win32") {
    return false;
  }
  if (/^[a-z]:(?![\\/]|$)/i.test(raw)) {
    return true;
  }
  const body = raw.replace(/^[\\/]{2}[?.][\\/]/, "").replace(/^[a-z]:/i, "");
  return body
    .split(/[\\/]/)
    .some(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        (/[<>:"|?*]|~\d/.test(segment) || /[. ]$/.test(segment)),
    );
}

/**
 * Makes a path comparable: lower case where the file system ignores case.
 *
 * @param {Resolved} resolved
 * @param {Platform} platform
 * @returns {string[]}
 */
function comparable({ root, segments }, platform) {
  const fold = (/** @type {string} */ text) =>
    platform === "linux" ? text : text.toLowerCase();
  return [fold(root), ...segments.map(fold)];
}

/**
 * Follows symbolic links in the part of a path that exists, and leaves the
 * rest as it is.
 *
 * @param {string} text
 * @returns {string}
 */
export function realpathOfExisting(text) {
  let current = text;
  let rest = "";
  for (;;) {
    try {
      return realpathSync(current) + rest;
    } catch {
      const index = current.lastIndexOf("/");
      const next = current.slice(0, index + (index < 3 ? 1 : 0));
      if (index < 0 || next === current) {
        return text;
      }
      rest = current.slice(index) + rest;
      current = next;
    }
  }
}

/**
 * The same location with symbolic links followed.
 *
 * @param {Resolved} place
 * @param {Context} context
 * @returns {Resolved}
 */
function followLinks(place, context) {
  const parsed = splitRoot(context.realpath(show(place)), context.platform);
  return parsed.root === null
    ? place
    : { root: parsed.root, segments: collapse(parsed.rest.split("/")) };
}

/**
 * Whether a path is inside the project's worktree folder, at least `depth`
 * segments below `.claude/worktrees` (1 is a worktree itself, 2 a file in it).
 *
 * @param {Resolved | undefined} resolved
 * @param {Context} context
 * @param {number} depth
 * @returns {boolean}
 */
export function isInside(resolved, context, depth) {
  return (
    resolved !== undefined &&
    insideKey(keyOf(resolved, context), context, depth)
  );
}

/**
 * Whether a path is the project folder itself (the folder that holds
 * `.claude/worktrees`), with symbolic links followed.
 *
 * @param {Resolved | undefined} resolved
 * @param {Context} context
 * @returns {boolean}
 */
export function isProjectRoot(resolved, context) {
  if (resolved === undefined) {
    return false;
  }
  context.zoneKey ??= keyOf(context.zone, context);
  const root = context.zoneKey.slice(0, -ZONE.length);
  const key = keyOf(resolved, context);
  return (
    key.length === root.length &&
    root.every((segment, index) => key[index] === segment)
  );
}

/**
 * The comparable form of a path, with symbolic links followed.
 *
 * @param {Resolved} resolved
 * @param {Context} context
 * @returns {string[]}
 */
function keyOf(resolved, context) {
  return comparable(followLinks(resolved, context), context.platform);
}

/**
 * @param {string[]} key
 * @param {Context} context
 * @param {number} depth
 * @returns {boolean}
 */
function insideKey(key, context, depth) {
  context.zoneKey ??= keyOf(context.zone, context);
  const wanted = context.zoneKey;
  return (
    key.length >= wanted.length + depth &&
    wanted.every((segment, index) => key[index] === segment)
  );
}

/**
 * Whether a path is a file inside a session scratchpad: a folder named
 * `scratchpad` below a `claude-<digits>` folder that sits directly in the
 * system's temporary folder. Not on Windows, where that place is not known.
 *
 * @param {string[]} key
 * @param {Context} context
 * @returns {boolean}
 */
function inScratchpad(key, context) {
  if (context.platform === "win32") {
    return false;
  }
  context.tempKeys ??= (context.tempDirs ?? []).flatMap((dir) => {
    const place = resolvePath(dir, null, context.platform);
    return place === undefined ? [] : [keyOf(place, context)];
  });
  return context.tempKeys.some((temp) => {
    const claude = key[temp.length] ?? "";
    const pad = key.indexOf("scratchpad", temp.length + 1);
    return (
      temp.every((segment, index) => key[index] === segment) &&
      /^claude-\d+$/.test(claude) &&
      pad !== -1 &&
      key.length > pad + 1
    );
  });
}

/**
 * Whether a reviewer may write the path: a file inside a worktree under
 * `.claude/worktrees/` or inside the session scratchpad, and never inside a
 * `.git` folder or file, which could point git at a configuration of its own.
 *
 * @param {Resolved | undefined} resolved
 * @param {Context} context
 * @returns {boolean}
 */
export function canWrite(resolved, context) {
  if (resolved === undefined) {
    return false;
  }
  const key = keyOf(resolved, context);
  if (key.includes(".git")) {
    return false;
  }
  return insideKey(key, context, 2) || inScratchpad(key, context);
}

/**
 * Finds the project folder: the one the hook says, or the working directory
 * with any `.claude/worktrees/...` ending taken off.
 *
 * @param {string | undefined} projectDir
 * @param {string} cwd
 * @param {Platform} platform
 * @returns {Resolved | undefined}
 */
export function projectOf(projectDir, cwd, platform) {
  const given = resolvePath(projectDir ?? cwd, cwd, platform);
  if (given === undefined) {
    return undefined;
  }
  const folded = comparable(given, platform);
  const at = folded.findIndex(
    (segment, index) =>
      index > 0 && segment === ZONE[0] && folded[index + 1] === ZONE[1],
  );
  return at === -1
    ? given
    : { root: given.root, segments: given.segments.slice(0, at - 1) };
}
