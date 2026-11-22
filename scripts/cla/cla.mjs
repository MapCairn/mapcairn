// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Decision logic for the contributor licence agreement check
 * (`.github/workflows/cla.yml`).
 *
 * Everything here is pure: it takes plain data (the shapes GitHub's REST API
 * returns) and gives plain data back, with no network, clock, file or
 * environment access. `run.mjs` does the API calls. Every input comes from a
 * pull request, so it is untrusted: nothing here evaluates it, and text that
 * ends up in a comment is cleaned first.
 *
 * The sentence below must stay equal to the one in `CLA.md` ("How to agree"),
 * and `CLA_VERSION` to its version line. A unit test checks both.
 */

/** The sentence a person comments to agree, as written in `CLA.md`. */
export const AGREEMENT_SENTENCE =
  "I have read the contributor licence agreement in CLA.md at the time of this pull request and I agree to it for this and all my future contributions to MapCairn.";

/**
 * The version of `CLA.md` that new signatures record. A signature recorded for
 * an earlier version stays valid and is never rewritten, because accounts are
 * matched by id whatever version they signed. Versions after 1.0 only changed
 * the project name in the agreement sentence, added or removed one section and,
 * in 1.4, reworded the introduction, section 1 and section 5;
 * the agreement sentence and the grants never changed.
 */
export const CLA_VERSION = "1.4";

/** Hidden marker that identifies the one explanatory comment the check owns. */
export const COMMENT_MARKER = "<!-- cla-bot -->";

/** The commit status context a branch ruleset can require. */
export const STATUS_CONTEXT = "CLA";

/** The branch that holds the signatures file. */
export const SIGNATURES_BRANCH = "cla-signatures";

/** The signatures file's path on that branch. */
export const SIGNATURES_PATH = "signatures.json";

/** The heading of the explanatory comment, which no agreement may contain. */
export const BOT_HEADING = "## Contributor licence agreement";

/** The login `GITHUB_TOKEN` comments as. Only its comments are ever updated. */
export const BOT_LOGIN = "github-actions[bot]";

/**
 * The bot accounts that never have to agree, matched by account id only. An
 * account's type is not enough: anyone can register a GitHub App, and its
 * `<app>[bot]` account has the type `Bot` too. A login is not enough either,
 * because it can be renamed and taken by another account. Only bots that
 * really open pull requests here are listed; GitHub Actions is not, because no
 * workflow here commits or opens pull requests. The id is the one GitHub
 * reports for the account (`GET /users/dependabot%5Bbot%5D`); the login is
 * only for people reading this list.
 *
 * A commit is linked to an account by the email address in the commit, which
 * whoever makes the commit chooses, so a listed bot's commit is exempt on any
 * pull request. That gives nobody a way round the agreement: the pull request
 * author always has to agree, unless they are a listed bot or an administrator.
 */
export const EXEMPT_BOTS = Object.freeze([
  Object.freeze({ login: "dependabot[bot]", id: 49699333 }),
]);

/**
 * @param {Account | null | undefined} account
 * @returns {boolean} Whether the account's id is one of `EXEMPT_BOTS`.
 */
export function isExemptBot(account) {
  return EXEMPT_BOTS.some((bot) => bot.id === account?.id);
}

/** GitHub rejects a commit status description longer than this. */
const MAX_DESCRIPTION_LENGTH = 140;

/** The most unlinked commits the comment lists before summarising the rest. */
const MAX_LISTED_COMMITS = 10;

/**
 * A GitHub account as the REST API describes it.
 * @typedef {{ login?: string, id?: number, type?: string }} Account
 */

/**
 * A signature as stored in `signatures.json`.
 * @typedef {{
 *   login: string,
 *   id: number,
 *   signedAt: string,
 *   pullRequest: number,
 *   commentUrl: string,
 *   claVersion: string,
 * }} Signature
 */

/**
 * The outcome of checking one pull request.
 * @typedef {{
 *   required: Array<{ login: string, id: number }>,
 *   missing: Array<{ login: string, id: number }>,
 *   unresolved: Array<{ sha: string, name: string }>,
 *   incomplete: boolean,
 *   authorLogin: string | undefined,
 *   authorMissing: boolean,
 *   authorUnresolved: boolean,
 *   newSignatures: Signature[],
 *   agreed: boolean,
 * }} Evaluation
 */

/**
 * Reduces one line to the form two agreements are compared in: at most one
 * leading quote marker removed (people copy `CLA.md`'s blockquote as it is, but
 * a quote reply nests a second one), whitespace collapsed, case folded and
 * trailing full stops dropped.
 * @param {string} line
 * @returns {string}
 */
function normaliseLine(line) {
  return line
    .replace(/^[ \t]*(?:>[ \t]?)?/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .trim()
    .toLowerCase();
}

const TARGET = normaliseLine(AGREEMENT_SENTENCE);

/**
 * Removes HTML comments, which GitHub hides when it shows the comment. One that
 * is never closed hides the rest of the text, so it is removed too.
 * @param {string} text
 * @returns {string}
 */
function removeHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, " ").replace(/<!--[\s\S]*$/, " ");
}

/**
 * Removes fenced code blocks (backticks or tildes), including one that is never
 * closed. A fence is recognised through any quote markers, so a fence inside a
 * quote hides what is in it too.
 * @param {string} text
 * @returns {string}
 */
function removeFencedCode(text) {
  /** @type {string[]} */
  const kept = [];
  /** @type {{ char: string, length: number } | null} */
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const plain = line.replace(/^(?:[ \t]*>)*[ \t]*/, "");
    if (fence) {
      const close = /^(([`~])\2{2,})[ \t]*$/.exec(plain);
      if (close && close[2] === fence.char && close[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    const open = /^(([`~])\2{2,})/.exec(plain);
    if (open) {
      fence = { char: open[2], length: open[1].length };
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

/**
 * Removes inline code spans, which may run over several lines.
 * @param {string} text
 * @returns {string}
 */
function removeInlineCode(text) {
  return text.replace(/(`+)[\s\S]*?\1/g, " ");
}

/**
 * Whether a comment body holds the agreement sentence on a line of its own, so
 * the person can add an organisation on another line. The line may carry one
 * leading `>`. A paraphrase, part of the sentence, a wrapped sentence, the
 * sentence with extra words on its line or quoted twice does not count. Text in
 * a code block, a code span or an HTML comment does not count, and nor does
 * anything that holds this check's own comment marker or heading, which is what
 * a quote reply to its comment contains.
 * @param {string | null | undefined} body
 * @returns {boolean}
 */
export function isAgreementComment(body) {
  if (typeof body !== "string") {
    return false;
  }
  const lower = body.toLowerCase();
  if (
    lower.includes(COMMENT_MARKER.toLowerCase()) ||
    lower.includes(BOT_HEADING.toLowerCase())
  ) {
    return false;
  }
  const visible = removeInlineCode(removeFencedCode(removeHtmlComments(body)));
  return visible.split(/\r?\n/).some((line) => normaliseLine(line) === TARGET);
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean} Whether two logins are the same account name.
 */
function sameLogin(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Works out who has to agree: the pull request author and every distinct
 * commit author with a GitHub account, minus the repository owner (matched by
 * account id, so an account that later takes the owner's login is not exempt),
 * the bots in `EXEMPT_BOTS` and any login in `exemptLogins` (repository
 * administrators, which the caller asks GitHub about in the same run).
 * A commit whose author matches no account is reported in `unresolved`, and a
 * pull request author with no login or id in `authorUnresolved`, so neither is
 * ever dropped silently.
 * @param {{
 *   ownerId: number | undefined,
 *   exemptLogins?: string[],
 *   pullAuthor: Account | null | undefined,
 *   commits: Array<{
 *     sha: string,
 *     author?: Account | null,
 *     commit?: { author?: { name?: string } | null },
 *   }>,
 * }} input
 * @returns {{
 *   required: Array<{ login: string, id: number }>,
 *   unresolved: Array<{ sha: string, name: string }>,
 *   authorUnresolved: boolean,
 * }}
 */
export function requiredContributors({
  ownerId,
  exemptLogins = [],
  pullAuthor,
  commits,
}) {
  const exempt = new Set(exemptLogins.map((login) => login.toLowerCase()));
  /** @type {Map<string, { login: string, id: number }>} */
  const byLogin = new Map();
  /** @type {Array<{ sha: string, name: string }>} */
  const unresolved = [];

  /** @param {Account | null | undefined} account */
  const consider = (account) => {
    if (!account?.login || typeof account.id !== "number") {
      return false;
    }
    const key = account.login.toLowerCase();
    if (isExemptBot(account) || account.id === ownerId || exempt.has(key)) {
      return true;
    }
    if (!byLogin.has(key)) {
      byLogin.set(key, { login: account.login, id: account.id });
    }
    return true;
  };

  const authorUnresolved = !consider(pullAuthor);
  for (const item of commits) {
    if (!consider(item.author)) {
      unresolved.push({
        sha: String(item.sha).slice(0, 7),
        name: item.commit?.author?.name ?? "unknown",
      });
    }
  }

  const required = [...byLogin.values()].sort((a, b) =>
    a.login.toLowerCase().localeCompare(b.login.toLowerCase()),
  );
  return { required, unresolved, authorUnresolved };
}

/**
 * Checks a pull request against the signatures file and its own comments.
 * Accounts are matched by id, so a login that someone else later takes over
 * does not inherit an agreement. A person agrees only through a comment they
 * wrote themselves.
 * @param {{
 *   ownerId: number | undefined,
 *   exemptLogins?: string[],
 *   pullAuthor: Account | null | undefined,
 *   commits: Parameters<typeof requiredContributors>[0]["commits"],
 *   commitTotal: number,
 *   comments: Array<{
 *     id: number,
 *     html_url: string,
 *     created_at: string,
 *     user?: Account | null,
 *     body?: string | null,
 *   }>,
 *   signatures: Signature[],
 *   pullRequest: number,
 * }} input `commitTotal` is the pull request's own commit count, to detect a
 *   commit list that GitHub cut short. A count that is missing or not a whole
 *   number counts as cut short.
 * @returns {Evaluation}
 */
export function evaluate({
  ownerId,
  exemptLogins,
  pullAuthor,
  commits,
  commitTotal,
  comments,
  signatures,
  pullRequest,
}) {
  const { required, unresolved, authorUnresolved } = requiredContributors({
    ownerId,
    exemptLogins,
    pullAuthor,
    commits,
  });
  const signedIds = new Set(signatures.map((signature) => signature.id));
  const ordered = [...comments].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      a.id - b.id,
  );

  /** @type {Signature[]} */
  const newSignatures = [];
  const missing = [];
  for (const person of required) {
    if (signedIds.has(person.id)) {
      continue;
    }
    const found = ordered.find(
      (item) => item.user?.id === person.id && isAgreementComment(item.body),
    );
    if (found) {
      newSignatures.push({
        login: person.login,
        id: person.id,
        signedAt: new Date(found.created_at).toISOString(),
        pullRequest,
        commentUrl: found.html_url,
        claVersion: CLA_VERSION,
      });
    } else {
      missing.push(person);
    }
  }

  const incomplete =
    !Number.isInteger(commitTotal) || commitTotal > commits.length;
  const authorLogin = pullAuthor?.login;
  const authorMissing =
    authorLogin !== undefined &&
    missing.some((person) => sameLogin(person.login, authorLogin));
  return {
    required,
    missing,
    unresolved,
    incomplete,
    authorLogin,
    authorMissing,
    authorUnresolved,
    newSignatures,
    agreed:
      missing.length === 0 &&
      unresolved.length === 0 &&
      !incomplete &&
      !authorUnresolved,
  };
}

/**
 * Reads the signatures file. An empty file is an empty list.
 * @param {string} text
 * @returns {Signature[]}
 * @throws {Error} When the text is not a list of signatures, so a damaged file
 *   is never treated as "nobody has agreed" and overwritten.
 */
export function parseSignatures(text) {
  if (text.trim() === "") {
    return [];
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("The signatures file is not valid JSON.");
  }
  const valid =
    Array.isArray(value) &&
    value.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof item.login === "string" &&
        Number.isInteger(item.id),
    );
  if (!valid) {
    throw new Error("The signatures file must be a list of signatures.");
  }
  return value;
}

/**
 * Appends signatures to a list, keeping one entry for each account id and
 * leaving the existing entries as they are.
 * @param {Signature[]} existing
 * @param {Signature[]} added
 * @returns {Signature[]}
 */
export function addSignatures(existing, added) {
  const seen = new Set(existing.map((signature) => signature.id));
  const merged = [...existing];
  for (const signature of added) {
    if (!seen.has(signature.id)) {
      seen.add(signature.id);
      merged.push(signature);
    }
  }
  return merged;
}

/**
 * Writes the signatures file text: indented JSON with a trailing newline.
 * @param {Signature[]} signatures
 * @returns {string}
 */
export function serialiseSignatures(signatures) {
  return `${JSON.stringify(signatures, null, 2)}\n`;
}

/**
 * Builds the `CLA` commit status for an evaluation.
 * @param {Evaluation} evaluation
 * @returns {{ state: "success" | "failure", description: string }}
 */
export function buildStatus(evaluation) {
  if (evaluation.agreed) {
    return {
      state: "success",
      description: "All contributors have agreed to the CLA",
    };
  }
  const parts = [];
  if (evaluation.missing.length > 0) {
    const names = evaluation.missing.map((person) => person.login).join(", ");
    parts.push(`Waiting for the CLA from: ${names}`);
  }
  if (evaluation.authorUnresolved) {
    parts.push("The pull request author could not be identified");
  }
  if (evaluation.unresolved.length > 0) {
    parts.push("A commit author is not linked to a GitHub account");
  }
  if (evaluation.incomplete) {
    parts.push("Too many commits to check");
  }
  return { state: "failure", description: shorten(parts.join("; ")) };
}

/**
 * @param {string} description
 * @returns {string} The description cut to GitHub's limit, with an ellipsis.
 */
function shorten(description) {
  if (description.length <= MAX_DESCRIPTION_LENGTH) {
    return description;
  }
  return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 3)}...`;
}

/**
 * @param {number[]} numbers
 * @returns {string} The pull request numbers as `#12, #15`.
 */
function pullList(numbers) {
  return numbers.map((number) => `#${number}`).join(", ");
}

/**
 * Builds the `CLA` status for a commit. A commit status belongs to the commit,
 * not to a pull request, so every open pull request whose head is that commit
 * shows it. It passes only when this pull request and every other one listed
 * in `waitingPulls` (the open pull requests with the same head that have not
 * passed) are clear.
 * @param {Evaluation} evaluation This pull request's evaluation.
 * @param {number[]} [waitingPulls] The numbers of the other pull requests.
 * @returns {{ state: "success" | "failure", description: string }}
 */
export function buildCommitStatus(evaluation, waitingPulls = []) {
  const own = buildStatus(evaluation);
  if (own.state === "failure" || waitingPulls.length === 0) {
    return own;
  }
  const description =
    waitingPulls.length === 1
      ? `Waiting for the CLA on pull request ${pullList(waitingPulls)}, which has the same head commit`
      : `Waiting for the CLA on pull requests ${pullList(waitingPulls)}, which have the same head commit`;
  return { state: "failure", description: shorten(description) };
}

/**
 * Makes a commit author's name safe to show in a comment: letters, digits,
 * spaces and a little punctuation only, so it cannot add markup, mentions or
 * the comment marker. It is still shown in a code span, because a bare
 * `www.example.com` would become a link.
 * @param {string} name
 * @returns {string}
 */
function safeName(name) {
  const cleaned = String(name)
    .replace(/[^\p{L}\p{N} .,'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned === "" ? "unknown" : cleaned;
}

/**
 * @param {string} text
 * @returns {string} The text in a code span, so it renders as written: no
 *   mention, no link and no markup.
 */
function code(text) {
  return `\`${String(text).replace(/`/g, "")}\``;
}

/** What a GitHub login looks like, so a mention is only written for one. */
const MENTIONABLE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

/**
 * Builds the text of the one explanatory pull request comment. The same
 * evaluation always gives the same text, so the comment is only edited when
 * something changed.
 * @param {Evaluation} evaluation
 * @param {{ claUrl: string, waitingPulls?: number[] }} options `claUrl` links
 *   to `CLA.md`. `waitingPulls` are the other open pull requests with the same
 *   head commit that have not passed, which keep the shared status red.
 * @returns {string}
 */
export function buildComment(evaluation, { claUrl, waitingPulls = [] }) {
  const heading = `${COMMENT_MARKER}\n## Contributor licence agreement\n`;
  const link = `[contributor licence agreement](${claUrl})`;

  if (evaluation.agreed) {
    const sharedHead =
      waitingPulls.length === 0
        ? ""
        : ` The \`CLA\` status belongs to the head commit, which is also the head of ${pullList(waitingPulls)}, so it stays red until everyone there has agreed too.`;
    if (evaluation.required.length === 0) {
      return `${heading}\nNo agreement is needed for this pull request, because it comes only from repository administrators or from bots.${sharedHead}\n`;
    }
    const names = evaluation.required
      .map((person) => code(person.login))
      .join(", ");
    const outcome =
      sharedHead === "" ? " The `CLA` check is green." : sharedHead;
    return `${heading}\nAll contributors on this pull request have agreed to the ${link}: ${names}.${outcome}\n`;
  }

  const sections = [
    `Everyone who contributed to this pull request needs to agree to the ${link} before it can be merged.`,
  ];

  if (evaluation.missing.length > 0) {
    const { authorLogin, authorMissing } = evaluation;
    // Only the pull request author is mentioned. A commit author's login can
    // come from a spoofed email address, and a mention would notify them.
    const others = evaluation.missing.filter(
      (person) =>
        !(
          authorMissing &&
          authorLogin !== undefined &&
          sameLogin(person.login, authorLogin)
        ),
    );
    const waiting = [];
    if (authorMissing && authorLogin !== undefined) {
      const who = MENTIONABLE.test(authorLogin)
        ? `@${authorLogin}`
        : code(authorLogin);
      waiting.push(`${who}, your agreement is needed.`);
    }
    if (others.length > 0) {
      const names = others.map((person) => code(person.login)).join(", ");
      waiting.push(
        `${waiting.length > 0 ? "Also waiting" : "Waiting"} for the agreement from ${names}.`,
      );
    }
    sections.push(
      waiting.join(" "),
      `To agree, add a comment to this pull request with this sentence on a line of its own. It must be written by the person who is agreeing, from their own account:\n\n> ${AGREEMENT_SENTENCE}\n\nIf you contribute for an organisation, put its name on another line of the same comment. You only need to do this once, because the agreement covers all your future contributions. The \`CLA\` check turns green shortly after the comment is added.`,
    );
  }

  if (evaluation.unresolved.length > 0) {
    const listed = evaluation.unresolved
      .slice(0, MAX_LISTED_COMMITS)
      .map((item) => `- ${code(item.sha)} by ${code(safeName(item.name))}`);
    const extra = evaluation.unresolved.length - MAX_LISTED_COMMITS;
    if (extra > 0) {
      listed.push(`- and ${extra} more`);
    }
    sections.push(
      `These commits were made with an email address that is not linked to a GitHub account, so their author cannot agree:\n\n${listed.join("\n")}\n\nAdd that email address to your GitHub account, or commit again with an email address linked to your GitHub account.`,
    );
  }

  if (evaluation.authorUnresolved) {
    sections.push(
      "The author of this pull request could not be identified, so the `CLA` check cannot pass.",
    );
  }

  if (evaluation.incomplete) {
    sections.push(
      "This pull request has too many commits to check, so the `CLA` check cannot pass. Please split it into smaller pull requests.",
    );
  }

  return `${heading}\n${sections.join("\n\n")}\n`;
}
