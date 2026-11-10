/**
 * The API side of the contributor licence agreement check
 * (`.github/workflows/cla.yml`). It reads the pull request, its commits and its
 * comments, asks `cla.mjs` for the decision, then records new signatures on the
 * `cla-signatures` branch, sets the `CLA` commit status and keeps one
 * explanatory comment up to date.
 *
 * The workflow runs it from the default branch only, never from the pull
 * request's code. Everything it reads from the pull request is data: it is
 * compared and printed, never evaluated or passed to a shell.
 */
import {
  addSignatures,
  BOT_LOGIN,
  buildComment,
  buildStatus,
  COMMENT_MARKER,
  evaluate,
  isAgreementComment,
  parseSignatures,
  SIGNATURES_BRANCH,
  SIGNATURES_PATH,
  STATUS_CONTEXT,
  serialiseSignatures,
} from "./cla.mjs";

/** How many times a signatures write is tried when another run writes first. */
const MAX_WRITE_ATTEMPTS = 3;

/**
 * The slice of the `actions/github-script` arguments this module uses.
 * @typedef {{
 *   github: any,
 *   context: {
 *     repo: { owner: string, repo: string },
 *     payload: any,
 *   },
 *   core: {
 *     info: (message: string) => void,
 *     notice: (message: string) => void,
 *     warning: (message: string) => void,
 *     setFailed: (message: string) => void,
 *   },
 * }} Environment
 */

/**
 * @param {unknown} error
 * @param {number[]} statuses
 * @returns {boolean} Whether a failed API call had one of the HTTP statuses.
 */
function hasStatus(error, statuses) {
  const status = /** @type {{ status?: number }} */ (error)?.status;
  return typeof status === "number" && statuses.includes(status);
}

/**
 * @param {Environment["context"]} context
 * @returns {number | undefined} The pull request number, or undefined when the
 *   event is a comment on a plain issue.
 */
function pullNumberOf({ payload }) {
  if (payload.pull_request) {
    return payload.pull_request.number;
  }
  if (payload.issue?.pull_request) {
    return payload.issue.number;
  }
  return undefined;
}

/**
 * Whether a comment event can change the result, judged from the event's own
 * payload. That text is untrusted and is used only to decide whether to skip:
 * the check itself always reads the comments from the API. A comment matters if
 * it holds the agreement sentence, or if the pull request author wrote it (they
 * may have fixed a commit email or asked for a re-check).
 * @param {any} payload
 * @returns {boolean}
 */
function commentCanMatter(payload) {
  if (isAgreementComment(payload.comment?.body)) {
    return true;
  }
  const commenter = payload.comment?.user?.id;
  return typeof commenter === "number" && commenter === payload.issue?.user?.id;
}

/**
 * @param {any} pull The pull request from the REST API.
 * @param {unknown} error
 * @returns {boolean} Whether this is a bot's pull request and the token was
 *   refused. GitHub gives Dependabot-triggered runs a read-only token even on
 *   `pull_request_target`, so there is nothing this run can write.
 */
function isReadOnlyBotRun(pull, error) {
  return pull.user?.type === "Bot" && hasStatus(error, [403]);
}

/**
 * Reads the signatures file from the signatures branch.
 * @param {any} github
 * @param {{ owner: string, repo: string }} repo
 * @returns {Promise<{ list: import("./cla.mjs").Signature[], sha: string | undefined }>}
 *   An empty list when the branch or the file does not exist yet.
 * @throws {Error} When the file exists but cannot be understood.
 */
async function readSignatures(github, { owner, repo }) {
  let data;
  try {
    ({ data } = await github.rest.repos.getContent({
      owner,
      repo,
      path: SIGNATURES_PATH,
      ref: SIGNATURES_BRANCH,
    }));
  } catch (error) {
    if (hasStatus(error, [404])) {
      return { list: [], sha: undefined };
    }
    throw error;
  }
  if (Array.isArray(data) || data.encoding !== "base64") {
    throw new Error(
      "The signatures file could not be read through the contents API.",
    );
  }
  const text = Buffer.from(data.content, "base64").toString("utf8");
  return { list: parseSignatures(text), sha: data.sha };
}

/**
 * Creates the signatures branch as a first commit holding only the file.
 * @param {any} github
 * @param {{ owner: string, repo: string }} repo
 * @param {string} text The file's text.
 * @param {string} message
 * @returns {Promise<void>}
 */
async function createSignaturesBranch(github, { owner, repo }, text, message) {
  const { data: tree } = await github.rest.git.createTree({
    owner,
    repo,
    tree: [
      { path: SIGNATURES_PATH, mode: "100644", type: "blob", content: text },
    ],
  });
  const { data: commit } = await github.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: [],
  });
  await github.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${SIGNATURES_BRANCH}`,
    sha: commit.sha,
  });
}

/**
 * Adds signatures to the file on the signatures branch, creating the branch
 * when it is missing. Another run writing at the same moment makes GitHub
 * refuse the write, so the file is read again, merged and rewritten, up to
 * three times.
 * @param {any} github
 * @param {{ owner: string, repo: string }} repo
 * @param {import("./cla.mjs").Signature[]} signatures
 * @returns {Promise<void>}
 */
async function recordSignatures(github, repo, signatures) {
  const message = `Record CLA agreement from ${signatures
    .map((signature) => signature.login)
    .join(", ")}`;
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const current = await readSignatures(github, repo);
      const merged = addSignatures(current.list, signatures);
      if (merged.length === current.list.length) {
        return;
      }
      const text = serialiseSignatures(merged);
      if (current.sha === undefined && !(await branchExists(github, repo))) {
        await createSignaturesBranch(github, repo, text, message);
        return;
      }
      await github.rest.repos.createOrUpdateFileContents({
        ...repo,
        path: SIGNATURES_PATH,
        branch: SIGNATURES_BRANCH,
        message,
        content: Buffer.from(text, "utf8").toString("base64"),
        sha: current.sha,
      });
      return;
    } catch (error) {
      if (attempt === MAX_WRITE_ATTEMPTS || !hasStatus(error, [409, 422])) {
        throw error;
      }
    }
  }
}

/**
 * @param {any} github
 * @param {{ owner: string, repo: string }} repo
 * @returns {Promise<boolean>} Whether the signatures branch exists.
 */
async function branchExists(github, { owner, repo }) {
  try {
    await github.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${SIGNATURES_BRANCH}`,
    });
    return true;
  } catch (error) {
    if (hasStatus(error, [404])) {
      return false;
    }
    throw error;
  }
}

/**
 * Checks one pull request: records new signatures, sets the `CLA` status on its
 * head commit and keeps the explanatory comment up to date. A comment on an
 * issue that is not a pull request is ignored.
 *
 * A failure that stops the check sets the status to `error` (never a pass) and
 * is thrown again, so the workflow run fails. A failure to store a signature
 * does not change this pull request's result, because the comment is there, but
 * it fails the run so the owner sees it. A failure to post the explanatory
 * comment is only a warning, because it does not change who has agreed.
 *
 * When a bot's pull request (Dependabot's) gets a read-only token, the run ends
 * with a notice instead of a failure, and no status is set.
 * @param {Environment} environment
 * @returns {Promise<import("./cla.mjs").Evaluation | { skipped: true }>}
 */
export async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pullNumber = pullNumberOf(context);
  if (pullNumber === undefined) {
    core.info(
      "This event is not about a pull request, so there is nothing to check.",
    );
    return { skipped: true };
  }
  if (
    context.eventName === "issue_comment" &&
    !commentCanMatter(context.payload)
  ) {
    core.info(
      "This comment is not an agreement and is not from the author, so the result cannot have changed.",
    );
    return { skipped: true };
  }

  const { data: pull } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  try {
    return await check({ github, context, core }, pull);
  } catch (error) {
    if (isReadOnlyBotRun(pull, error)) {
      core.notice(
        "The token is read-only for this bot's pull request, so the CLA status was not set.",
      );
      return { skipped: true };
    }
    try {
      await github.rest.repos.createCommitStatus({
        owner,
        repo,
        sha: pull.head.sha,
        state: "error",
        context: STATUS_CONTEXT,
        description: "The CLA check could not run. See the workflow log.",
      });
    } catch {
      core.warning("The error status could not be set either.");
    }
    throw error;
  }
}

/**
 * @param {Environment} environment
 * @param {any} pull The pull request from the REST API.
 * @returns {Promise<import("./cla.mjs").Evaluation>}
 */
async function check({ github, context, core }, pull) {
  const { owner, repo } = context.repo;
  const target = { owner, repo };

  const [commits, comments, signed] = await Promise.all([
    github.paginate(github.rest.pulls.listCommits, {
      ...target,
      pull_number: pull.number,
      per_page: 100,
    }),
    github.paginate(github.rest.issues.listComments, {
      ...target,
      issue_number: pull.number,
      per_page: 100,
    }),
    readSignatures(github, target),
  ]);

  const evaluation = evaluate({
    ownerLogin: owner,
    pullAuthor: pull.user,
    commits,
    commitTotal: pull.commits,
    comments,
    signatures: signed.list,
    pullRequest: pull.number,
  });

  if (evaluation.newSignatures.length > 0) {
    try {
      await recordSignatures(github, target, evaluation.newSignatures);
    } catch (error) {
      if (isReadOnlyBotRun(pull, error)) {
        throw error;
      }
      core.warning(`The signatures could not be stored: ${error}`);
      core.setFailed("The CLA signatures could not be stored on the branch.");
    }
  }

  // The commits above were listed for `pull.head.sha`. If a push has arrived
  // since, a status for the new commit would rest on a stale list, so write
  // nothing: the push starts its own run, which sets the status.
  const { data: fresh } = await github.rest.pulls.get({
    ...target,
    pull_number: pull.number,
  });
  if (fresh.head.sha !== pull.head.sha) {
    core.info(
      "The head commit changed during this run, so the status is left to the run for the new commit.",
    );
    return evaluation;
  }

  const repository = context.payload.repository;
  const claUrl = `${repository?.html_url ?? `https://github.com/${owner}/${repo}`}/blob/${repository?.default_branch ?? "main"}/CLA.md`;
  await setStatus(
    github,
    target,
    pull.head.sha,
    buildStatus(evaluation),
    claUrl,
  );

  try {
    await updateComment(
      github,
      target,
      pull.number,
      comments,
      buildComment(evaluation, { claUrl }),
      evaluation.agreed,
    );
  } catch (error) {
    core.warning(`The explanatory comment could not be posted: ${error}`);
  }

  return evaluation;
}

/**
 * Sets the `CLA` status on a commit unless the newest `CLA` status there
 * already has the same state and description, so repeated runs do not pile up
 * statuses.
 * @param {any} github
 * @param {{ owner: string, repo: string }} repo
 * @param {string} sha
 * @param {{ state: string, description: string }} status
 * @param {string} targetUrl
 * @returns {Promise<void>}
 */
async function setStatus(github, repo, sha, status, targetUrl) {
  const { data: existing } = await github.rest.repos.listCommitStatusesForRef({
    ...repo,
    ref: sha,
    per_page: 100,
  });
  const newest = existing.find((item) => item.context === STATUS_CONTEXT);
  if (
    newest?.state === status.state &&
    newest.description === status.description
  ) {
    return;
  }
  await github.rest.repos.createCommitStatus({
    ...repo,
    sha,
    state: status.state,
    context: STATUS_CONTEXT,
    description: status.description,
    target_url: targetUrl,
  });
}

/**
 * @param {string} text
 * @returns {string} The text with Windows line endings made plain and the ends
 *   trimmed, so a comment GitHub stored differently still compares as equal.
 */
function plain(text) {
  return text.replace(/\r\n/g, "\n").trim();
}

/**
 * Creates, updates or leaves alone the one explanatory comment. Only the
 * comment this token wrote is updated. A comment is created only while someone
 * still has to agree; an existing one is always brought up to date.
 * @param {any} github
 * @param {{ owner: string, repo: string }} repo
 * @param {number} pullNumber
 * @param {Array<{ id: number, body?: string | null, user?: { login?: string } | null }>} comments
 * @param {string} body
 * @param {boolean} agreed
 * @returns {Promise<void>}
 */
async function updateComment(github, repo, pullNumber, comments, body, agreed) {
  const existing = comments.find(
    (item) =>
      item.user?.login === BOT_LOGIN &&
      typeof item.body === "string" &&
      item.body.includes(COMMENT_MARKER),
  );
  if (existing) {
    if (plain(String(existing.body)) !== plain(body)) {
      await github.rest.issues.updateComment({
        ...repo,
        comment_id: existing.id,
        body,
      });
    }
  } else if (!agreed) {
    await github.rest.issues.createComment({
      ...repo,
      issue_number: pullNumber,
      body,
    });
  }
}
