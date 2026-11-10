import { describe, expect, it } from "vitest";
import { findAdministrators } from "../../../../scripts/cla/admins.mjs";
import {
  AGREEMENT_SENTENCE,
  BOT_LOGIN,
  CLA_VERSION,
  COMMENT_MARKER,
  parseSignatures,
  serialiseSignatures,
} from "../../../../scripts/cla/cla.mjs";
import { run } from "../../../../scripts/cla/run.mjs";

type User = { login: string; id: number; type: string };
type Call = { name: string; params: Record<string, unknown> };
type Params = Record<string, unknown>;
type Failure = { status: number; times?: number; after?: () => void };

const user = (login: string, id: number, type = "User"): User => ({
  login,
  id,
  type,
});
const owner = user("mooship", 1);
const ada = user("ada", 2);
const grace = user("grace", 3);
const dependabot = user("dependabot[bot]", 49699333, "Bot");
const bot = user(BOT_LOGIN, 41898282, "Bot");

const HEAD = "headsha000000000000000000000000000000000";
const NEW_HEAD = "newhead00000000000000000000000000000000";

const comment = (
  author: User,
  body: string,
  id: number,
  created = "2026-11-10T08:00:00Z",
) => ({
  id,
  html_url: `https://github.com/mooship/karta/pull/7#issuecomment-${id}`,
  created_at: created,
  user: author,
  body,
});

const commit = (author: User | null) => ({
  sha: "abc1234def5678",
  author,
  commit: { author: { name: "Someone" } },
});

const signature = (login: string, id: number) => ({
  login,
  id,
  signedAt: "2026-01-01T00:00:00.000Z",
  pullRequest: 1,
  commentUrl: "u",
  claVersion: "1.0",
});

type World = {
  /** The pull request author; null models a deleted account. */
  pullAuthor?: User | null;
  commits?: Array<ReturnType<typeof commit>>;
  /** What the pull request says its commit count is. */
  pullCommits?: number;
  comments?: Array<ReturnType<typeof comment>>;
  /** The signatures file, when the branch has one. */
  file?: string;
  /** Whether the signatures branch exists. */
  branch?: boolean;
  /** Writes of the signatures file that fail with 409 before one succeeds. */
  conflicts?: number;
  /** Runs when a write conflicts, to model another run writing first. */
  onConflict?: () => void;
  /** Head commits that successive reads of the pull request report. */
  headShas?: string[];
  /** The statuses already on the head commit, newest first. */
  statuses?: Array<{ context: string; state: string; description: string }>;
  /** Makes a named API call fail with an HTTP status. */
  failOn?: Record<string, Failure>;
  /** Answers the signatures file read with something other than a file. */
  contentShape?: "array" | "not-base64";
  /** Stores comments with Windows line endings, as GitHub can. */
  crlf?: boolean;
  /** The repository permission GitHub reports for a login; "none" if unlisted. */
  permissions?: Record<string, string>;
  /** Logins whose permission lookup fails with the given HTTP status. */
  permissionErrors?: Record<string, number>;
};

/** An in-memory stand-in for the parts of Octokit the check uses. */
function makeWorld(init: World = {}) {
  const calls: Call[] = [];
  const fired: Record<string, number> = {};
  const state = {
    branch: init.branch ?? init.file !== undefined,
    file: init.file as string | undefined,
    sha: 1,
    conflicts: init.conflicts ?? 0,
    comments: [...(init.comments ?? [])],
    statuses: [...(init.statuses ?? [])],
    nextCommentId: 5000,
    pendingTree: undefined as string | undefined,
    reads: 0,
  };
  const httpError = (status: number) =>
    Object.assign(new Error(`HTTP ${status}`), { status });
  /** Records the call, then fails it when the test asked for that. */
  const enter = (name: string, params: Params) => {
    calls.push({ name, params });
    const failure = init.failOn?.[name];
    if (
      failure &&
      (fired[name] ?? 0) < (failure.times ?? Number.POSITIVE_INFINITY)
    ) {
      fired[name] = (fired[name] ?? 0) + 1;
      failure.after?.();
      throw httpError(failure.status);
    }
  };
  /** One page of a list, the way GitHub pages: the default size is 30. */
  const page = <T>(items: T[], params: Params) => {
    const size = Number(params.per_page ?? 30);
    const number = Number(params.page ?? 1);
    return { data: items.slice((number - 1) * size, number * size) };
  };
  const stored = (body: string) =>
    init.crlf ? body.replace(/\r?\n/g, "\r\n") : body;

  const pulls = {
    get: async (params: Params) => {
      enter("pulls.get", params);
      const shas = init.headShas ?? [HEAD];
      const sha = shas[Math.min(state.reads, shas.length - 1)];
      state.reads += 1;
      return {
        data: {
          number: 7,
          state: "open",
          user: init.pullAuthor === undefined ? ada : init.pullAuthor,
          head: { sha },
          commits: init.pullCommits ?? (init.commits ?? [commit(ada)]).length,
        },
      };
    },
    listCommits: async (params: Params) => {
      enter("pulls.listCommits", params);
      return page(init.commits ?? [commit(ada)], params);
    },
  };
  const issues = {
    listComments: async (params: Params) => {
      enter("issues.listComments", params);
      return page(state.comments, params);
    },
    createComment: async (params: Params) => {
      enter("issues.createComment", params);
      const created = comment(
        bot,
        stored(String(params.body)),
        state.nextCommentId++,
      );
      state.comments.push(created);
      return { data: created };
    },
    updateComment: async (params: Params) => {
      enter("issues.updateComment", params);
      const target = state.comments.find((c) => c.id === params.comment_id);
      if (target) {
        target.body = stored(String(params.body));
      }
      return { data: target };
    },
  };
  const repos = {
    getContent: async (params: Params) => {
      enter("repos.getContent", params);
      if (init.contentShape === "array") {
        return { data: [{ name: "signatures.json" }] };
      }
      if (init.contentShape === "not-base64") {
        return { data: { encoding: "none", content: "", sha: "blob1" } };
      }
      if (!state.branch || state.file === undefined) {
        throw httpError(404);
      }
      return {
        data: {
          encoding: "base64",
          content: Buffer.from(state.file).toString("base64"),
          sha: `blob${state.sha}`,
        },
      };
    },
    createOrUpdateFileContents: async (params: Params) => {
      enter("repos.createOrUpdateFileContents", params);
      if (state.conflicts > 0) {
        state.conflicts -= 1;
        init.onConflict?.();
        throw httpError(409);
      }
      if (state.file !== undefined && params.sha !== `blob${state.sha}`) {
        throw httpError(409);
      }
      if (state.file === undefined && params.sha !== undefined) {
        throw httpError(422);
      }
      state.file = Buffer.from(String(params.content), "base64").toString();
      state.sha += 1;
      return { data: {} };
    },
    getCollaboratorPermissionLevel: async (params: Params) => {
      enter("repos.getCollaboratorPermissionLevel", params);
      const login = String(params.username);
      const failure = init.permissionErrors?.[login];
      if (failure !== undefined) {
        throw httpError(failure);
      }
      return { data: { permission: init.permissions?.[login] ?? "none" } };
    },
    listCommitStatusesForRef: async (params: Params) => {
      enter("repos.listCommitStatusesForRef", params);
      return { data: [...state.statuses] };
    },
    createCommitStatus: async (params: Params) => {
      enter("repos.createCommitStatus", params);
      state.statuses.unshift({
        context: String(params.context),
        state: String(params.state),
        description: String(params.description),
      });
      return { data: {} };
    },
  };
  const git = {
    getRef: async (params: Params) => {
      enter("git.getRef", params);
      if (!state.branch) {
        throw httpError(404);
      }
      return { data: { object: { sha: "tip" } } };
    },
    createTree: async (params: Params) => {
      enter("git.createTree", params);
      const tree = params.tree as Array<{ content: string }>;
      state.pendingTree = tree[0]?.content;
      return { data: { sha: "tree1" } };
    },
    createCommit: async (params: Params) => {
      enter("git.createCommit", params);
      return { data: { sha: "commit1" } };
    },
    createRef: async (params: Params) => {
      enter("git.createRef", params);
      state.branch = true;
      state.file = state.pendingTree;
      state.sha += 1;
      return { data: {} };
    },
  };

  const github = {
    rest: { pulls, issues, repos, git },
    /** Follows GitHub's paging: asks for page 1, 2, ... until a short page. */
    paginate: async (
      fn: (p: Params) => Promise<{ data: unknown[] }>,
      params: Params,
    ) => {
      const size = Number(params.per_page ?? 30);
      const all: unknown[] = [];
      for (let number = 1; ; number += 1) {
        const { data } = await fn({ ...params, page: number });
        all.push(...data);
        if (data.length < size) {
          return all;
        }
      }
    },
  };
  const logs = {
    failed: [] as string[],
    warnings: [] as string[],
    notices: [] as string[],
    infos: [] as string[],
  };
  const core = {
    info: (m: string) => logs.infos.push(m),
    warning: (m: string) => logs.warnings.push(m),
    notice: (m: string) => logs.notices.push(m),
    setFailed: (m: string) => logs.failed.push(m),
  };
  return { github, core, calls, state, logs };
}

const repo = { owner: "mooship", repo: "karta" };
const pullRequestEvent = {
  eventName: "pull_request_target",
  repo,
  payload: { action: "opened", pull_request: { number: 7 } },
};
const commentEvent = ({
  isPull = true,
  body = AGREEMENT_SENTENCE,
  commenter = ada,
  issueAuthor = ada,
}: {
  isPull?: boolean;
  body?: string;
  commenter?: User;
  issueAuthor?: User;
} = {}) => ({
  eventName: "issue_comment",
  repo,
  payload: {
    action: "created",
    issue: {
      number: 7,
      user: issueAuthor,
      ...(isPull ? { pull_request: {} } : {}),
    },
    comment: { id: 1, body, user: commenter },
  },
});

type WorldHandle = ReturnType<typeof makeWorld>;

const named = (calls: Call[], name: string) =>
  calls.filter((c) => c.name === name);
const statuses = (world: WorldHandle) =>
  named(world.calls, "repos.createCommitStatus");
const lastState = (world: WorldHandle) => statuses(world).at(-1)?.params.state;
const expectNoSuccess = (world: WorldHandle) => {
  expect(statuses(world).map((c) => c.params.state)).not.toContain("success");
};
const writes = (world: WorldHandle) =>
  named(world.calls, "repos.createOrUpdateFileContents");
const agreement = (author: User, id: number) =>
  comment(author, AGREEMENT_SENTENCE, id);
const botComment = (body: string, id = 9) => comment(bot, body, id);

describe("run: pull request opened", () => {
  it("sets a failing CLA status and posts one comment when nobody has agreed", async () => {
    const world = makeWorld();
    await run({ ...world, context: pullRequestEvent });

    expect(statuses(world)[0]?.params).toMatchObject({
      owner: "mooship",
      repo: "karta",
      sha: HEAD,
      state: "failure",
      context: "CLA",
    });
    const created = named(world.calls, "issues.createComment");
    expect(created).toHaveLength(1);
    expect(String(created[0]?.params.body)).toContain(COMMENT_MARKER);
    expect(String(created[0]?.params.body)).toContain(AGREEMENT_SENTENCE);
    expect(named(world.calls, "git.createRef")).toEqual([]);
  });

  it("passes the owner's pull request with no comment and no signatures", async () => {
    const world = makeWorld({ pullAuthor: owner, commits: [commit(owner)] });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
    expect(named(world.calls, "issues.createComment")).toEqual([]);
    expect(named(world.calls, "git.createRef")).toEqual([]);
  });

  it("passes a known signer with no comment and does not write", async () => {
    const world = makeWorld({
      file: serialiseSignatures([signature("ada", 2)]),
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
    expect(named(world.calls, "issues.createComment")).toEqual([]);
    expect(writes(world)).toEqual([]);
  });

  it("fails a commit author with no GitHub account", async () => {
    const world = makeWorld({
      commits: [commit(ada), commit(null)],
      comments: [agreement(ada, 10)],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("failure");
  });

  it("fails closed when the pull request author is null", async () => {
    const world = makeWorld({ pullAuthor: null });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("failure");
    expect(
      String(named(world.calls, "issues.createComment")[0]?.params.body),
    ).toMatch(/could not be identified/);
  });
});

const permissionCalls = (world: WorldHandle) =>
  named(world.calls, "repos.getCollaboratorPermissionLevel");

describe("run: repository administrators", () => {
  it("passes an administrator's pull request with no comment and no signature", async () => {
    const world = makeWorld({ permissions: { ada: "admin" } });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
    expect(named(world.calls, "issues.createComment")).toEqual([]);
    expect(named(world.calls, "git.createRef")).toEqual([]);
    expect(permissionCalls(world)[0]?.params).toEqual({
      owner: "mooship",
      repo: "karta",
      username: "ada",
    });
  });

  it.each(["write", "maintain", "triage", "read", "none"])(
    "still needs an author whose permission is %s",
    async (permission) => {
      const world = makeWorld({ permissions: { ada: permission } });
      await run({ ...world, context: pullRequestEvent });
      expect(lastState(world)).toBe("failure");
      expect(named(world.calls, "issues.createComment")).toHaveLength(1);
    },
  );

  it("exempts an administrator's commits but still needs a co-author", async () => {
    const world = makeWorld({
      commits: [commit(ada), commit(grace)],
      permissions: { ada: "admin" },
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("failure");
    const description = String(statuses(world)[0]?.params.description);
    expect(description).toContain("grace");
    expect(description).not.toContain("ada");
  });

  it("leaves a person required, and warns, when the lookup fails", async () => {
    const world = makeWorld({ permissionErrors: { ada: 500 } });
    await expect(
      run({ ...world, context: pullRequestEvent }),
    ).resolves.toBeDefined();
    expect(lastState(world)).toBe("failure");
    expect(world.logs.warnings.join(" ")).toContain("ada");
    expect(world.logs.failed).toEqual([]);
  });

  it("does not let one failed lookup stop another person being exempt", async () => {
    const world = makeWorld({
      commits: [commit(ada), commit(grace)],
      permissions: { grace: "admin" },
      permissionErrors: { ada: 403 },
      comments: [agreement(ada, 10)],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
    expect(world.logs.warnings).toHaveLength(1);
  });

  it("never exempts anyone when every lookup is refused on a bot's pull request", async () => {
    const world = makeWorld({
      pullAuthor: dependabot,
      commits: [commit(dependabot), commit(grace)],
      permissionErrors: { grace: 403 },
      failOn: { "repos.createCommitStatus": { status: 403 } },
    });
    await run({ ...world, context: pullRequestEvent });
    expect(world.logs.warnings.join(" ")).toContain("grace");
    expect(statuses(world)[0]?.params.state).toBe("failure");
    expect(world.logs.notices).toHaveLength(1);
    expect(world.logs.failed).toEqual([]);
  });

  it("does not look up bots", async () => {
    const world = makeWorld({
      pullAuthor: dependabot,
      commits: [commit(dependabot), commit(bot)],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
    expect(permissionCalls(world)).toEqual([]);
  });

  it("still exempts the owner's login without a lookup", async () => {
    const world = makeWorld({ pullAuthor: owner, commits: [commit(owner)] });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
    expect(permissionCalls(world)).toEqual([]);
  });

  it("looks each distinct login up once, whatever its case", async () => {
    const world = makeWorld({
      commits: [
        commit(ada),
        commit(grace),
        commit({ ...ada, login: "ADA" }),
        commit(grace),
      ],
      pullCommits: 4,
      comments: [agreement(ada, 10), agreement(grace, 11)],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(
      permissionCalls(world)
        .map((c) => String(c.params.username).toLowerCase())
        .sort(),
    ).toEqual(["ada", "grace"]);
  });
});

describe("findAdministrators", () => {
  const target = { owner: "mooship", repo: "karta" };
  const fake = (levels: Record<string, string | Error>) => ({
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async ({
          username,
        }: {
          username: string;
        }) => {
          const level = levels[username];
          if (level instanceof Error) {
            throw level;
          }
          return { data: { permission: level } };
        },
      },
    },
  });

  it("returns only the logins GitHub reports as admin", async () => {
    const warnings: string[] = [];
    const found = await findAdministrators({
      github: fake({ ada: "admin", grace: "write" }),
      repo: target,
      logins: ["ada", "grace"],
      core: { warning: (m: string) => warnings.push(m) },
    });
    expect(found).toEqual(["ada"]);
    expect(warnings).toEqual([]);
  });

  it("treats a missing or unexpected permission as not an administrator", async () => {
    const found = await findAdministrators({
      github: fake({ ada: undefined as never, grace: "ADMIN" }),
      repo: target,
      logins: ["ada", "grace"],
      core: { warning: () => undefined },
    });
    expect(found).toEqual([]);
  });

  it("warns and leaves out a login whose lookup throws", async () => {
    const warnings: string[] = [];
    const found = await findAdministrators({
      github: fake({ ada: new Error("boom"), grace: "admin" }),
      repo: target,
      logins: ["ada", "grace"],
      core: { warning: (m: string) => warnings.push(m) },
    });
    expect(found).toEqual(["grace"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("ada");
  });

  it("makes no call for no logins", async () => {
    const found = await findAdministrators({
      github: {},
      repo: target,
      logins: [],
      core: { warning: () => undefined },
    });
    expect(found).toEqual([]);
  });
});

describe("run: the commit count", () => {
  it("fails with too many commits when the pull request has more than were listed", async () => {
    const commits = Array.from({ length: 250 }, () => commit(ada));
    const world = makeWorld({
      commits,
      pullCommits: 300,
      comments: [agreement(ada, 10)],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(statuses(world)[0]?.params).toMatchObject({ state: "failure" });
    expect(String(statuses(world)[0]?.params.description)).toMatch(
      /Too many commits/,
    );
  });

  it("passes when the pull request's count equals the commits listed", async () => {
    const world = makeWorld({
      commits: [commit(ada), commit(ada)],
      pullCommits: 2,
      comments: [agreement(ada, 10)],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
  });

  it("fails closed when the pull request has no commit count", async () => {
    const world = makeWorld({
      pullCommits: Number.NaN,
      comments: [agreement(ada, 10)],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("failure");
  });
});

describe("run: paging", () => {
  const chatter = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      comment(grace, `thanks ${i}`, 100 + i),
    );

  it("finds an agreement comment on the second page of comments", async () => {
    const world = makeWorld({
      comments: [...chatter(100), agreement(ada, 900)],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
    const listed = named(world.calls, "issues.listComments");
    expect(listed.map((c) => c.params.page)).toEqual([1, 2]);
    expect(listed.every((c) => c.params.per_page === 100)).toBe(true);
  });

  it("would miss that comment if only the first page were read", async () => {
    const world = makeWorld({
      comments: [...chatter(100), agreement(ada, 900)],
    });
    const firstPage = await world.github.rest.issues.listComments({});
    expect(firstPage.data).toHaveLength(30);
  });

  it("finds an unagreed commit author on the second page of commits", async () => {
    const commits = [
      ...Array.from({ length: 100 }, () => commit(ada)),
      commit(grace),
    ];
    const world = makeWorld({ commits, comments: [agreement(ada, 10)] });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("failure");
    expect(String(statuses(world)[0]?.params.description)).toContain("grace");
    const listed = named(world.calls, "pulls.listCommits");
    expect(listed.map((c) => c.params.page)).toEqual([1, 2]);
    expect(listed.every((c) => c.params.per_page === 100)).toBe(true);
  });
});

describe("run: agreement comment", () => {
  it("records the signature on a new orphan branch and passes", async () => {
    const world = makeWorld({ comments: [agreement(ada, 10)] });
    await run({ ...world, context: commentEvent() });

    expect(named(world.calls, "git.createCommit")[0]?.params.parents).toEqual(
      [],
    );
    expect(named(world.calls, "git.createRef")[0]?.params).toMatchObject({
      ref: "refs/heads/cla-signatures",
    });
    const stored = parseSignatures(world.state.file ?? "");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      login: "ada",
      id: 2,
      pullRequest: 7,
      claVersion: CLA_VERSION,
    });
    expect(statuses(world)[0]?.params).toMatchObject({
      sha: HEAD,
      state: "success",
    });
  });

  it("takes the head commit from the pull request, not the comment event", async () => {
    const world = makeWorld({ comments: [agreement(ada, 10)] });
    await run({ ...world, context: commentEvent() });
    expect(statuses(world)[0]?.params.sha).toBe(HEAD);
    expect(named(world.calls, "pulls.get").length).toBeGreaterThanOrEqual(1);
  });

  it("updates the existing comment to say everyone has agreed", async () => {
    const world = makeWorld({
      comments: [botComment(`${COMMENT_MARKER}\nold text`), agreement(ada, 10)],
    });
    await run({ ...world, context: commentEvent() });
    const updates = named(world.calls, "issues.updateComment");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.params.comment_id).toBe(9);
    expect(String(updates[0]?.params.body)).toMatch(/have agreed/);
    expect(named(world.calls, "issues.createComment")).toEqual([]);
  });

  it("adds to an existing signatures file", async () => {
    const world = makeWorld({
      file: serialiseSignatures([signature("grace", 3)]),
      comments: [agreement(ada, 10)],
    });
    await run({ ...world, context: commentEvent() });
    expect(
      parseSignatures(world.state.file ?? "").map((s: { id: number }) => s.id),
    ).toEqual([3, 2]);
    expect(named(world.calls, "git.createRef")).toEqual([]);
  });

  it("writes a missing file onto a branch that exists", async () => {
    const world = makeWorld({ branch: true, comments: [agreement(ada, 10)] });
    await run({ ...world, context: commentEvent() });
    const [write] = writes(world);
    expect(write?.params.sha).toBeUndefined();
    expect(write?.params.branch).toBe("cla-signatures");
    expect(named(world.calls, "git.createRef")).toEqual([]);
  });

  it("does not count someone else's comment, even one holding the comment marker", async () => {
    const world = makeWorld({
      comments: [
        comment(grace, `${COMMENT_MARKER}\n${AGREEMENT_SENTENCE}`, 9),
        agreement(grace, 10),
      ],
    });
    await run({ ...world, context: commentEvent() });
    expect(lastState(world)).toBe("failure");
    expect(named(world.calls, "issues.updateComment")).toEqual([]);
    expect(named(world.calls, "issues.createComment")).toHaveLength(1);
  });

  it("does not take a login that a new account now holds as having agreed", async () => {
    const world = makeWorld({
      file: serialiseSignatures([signature("ada", 999)]),
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("failure");
  });

  it("keeps an agreement for an account that has changed its login", async () => {
    const world = makeWorld({
      pullAuthor: { ...ada, login: "ada-renamed" },
      commits: [commit({ ...ada, login: "ada-renamed" })],
      file: serialiseSignatures([signature("ada", 2)]),
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
  });
});

describe("run: storing the signature", () => {
  const agreed = { comments: [agreement(ada, 10)] };

  it("merges with a signature another run wrote first", async () => {
    const world = makeWorld({
      file: "[]\n",
      conflicts: 1,
      ...agreed,
      onConflict: () => {
        world.state.file = serialiseSignatures([signature("grace", 3)]);
        world.state.sha += 1;
      },
    });
    await run({ ...world, context: commentEvent() });
    expect(
      parseSignatures(world.state.file ?? "")
        .map((s: { id: number }) => s.id)
        .sort(),
    ).toEqual([2, 3]);
    expect(world.logs.failed).toEqual([]);
  });

  it("does not write again, or fail, when the conflict was another run storing the same person", async () => {
    const world = makeWorld({
      file: "[]\n",
      conflicts: 1,
      ...agreed,
      onConflict: () => {
        world.state.file = serialiseSignatures([signature("ada", 2)]);
        world.state.sha += 1;
      },
    });
    await run({ ...world, context: commentEvent() });
    expect(writes(world)).toHaveLength(1);
    expect(world.logs.failed).toEqual([]);
    expect(world.logs.warnings).toEqual([]);
    expect(lastState(world)).toBe("success");
  });

  it("retries a write refused with 422", async () => {
    const world = makeWorld({
      file: "[]\n",
      ...agreed,
      failOn: {
        "repos.createOrUpdateFileContents": { status: 422, times: 1 },
      },
    });
    await run({ ...world, context: commentEvent() });
    expect(writes(world)).toHaveLength(2);
    expect(parseSignatures(world.state.file ?? "")).toHaveLength(1);
    expect(world.logs.failed).toEqual([]);
  });

  it("gives up after three conflicts, still reports the pull request, and fails the run", async () => {
    const world = makeWorld({ file: "[]\n", conflicts: 10, ...agreed });
    await run({ ...world, context: commentEvent() });
    expect(writes(world)).toHaveLength(3);
    expect(lastState(world)).toBe("success");
    expect(world.logs.failed).toHaveLength(1);
  });

  it("does not retry a write that fails with a server error", async () => {
    const world = makeWorld({
      file: "[]\n",
      ...agreed,
      failOn: { "repos.createOrUpdateFileContents": { status: 500 } },
    });
    await run({ ...world, context: commentEvent() });
    expect(writes(world)).toHaveLength(1);
    expect(world.logs.failed).toHaveLength(1);
    expect(lastState(world)).toBe("success");
  });

  it("retries when another run created the branch first", async () => {
    const world = makeWorld({
      ...agreed,
      failOn: {
        "git.createRef": {
          status: 422,
          times: 1,
          after: () => {
            world.state.branch = true;
            world.state.file = serialiseSignatures([signature("grace", 3)]);
          },
        },
      },
    });
    await run({ ...world, context: commentEvent() });
    expect(named(world.calls, "git.createRef")).toHaveLength(1);
    expect(
      parseSignatures(world.state.file ?? "")
        .map((s: { id: number }) => s.id)
        .sort(),
    ).toEqual([2, 3]);
    expect(world.logs.failed).toEqual([]);
  });

  it("fails the run, and creates no branch, when the tree cannot be created", async () => {
    const world = makeWorld({
      ...agreed,
      failOn: { "git.createTree": { status: 500 } },
    });
    await run({ ...world, context: commentEvent() });
    expect(world.logs.failed).toHaveLength(1);
    expect(named(world.calls, "git.createCommit")).toEqual([]);
    expect(named(world.calls, "git.createRef")).toEqual([]);
    expect(world.state.branch).toBe(false);
  });

  it("fails the run, and creates no branch, when the commit cannot be created", async () => {
    const world = makeWorld({
      ...agreed,
      failOn: { "git.createCommit": { status: 500 } },
    });
    await run({ ...world, context: commentEvent() });
    expect(world.logs.failed).toHaveLength(1);
    expect(named(world.calls, "git.createRef")).toEqual([]);
  });

  it("fails the run, and does not guess, when the branch lookup fails", async () => {
    const world = makeWorld({
      ...agreed,
      failOn: { "git.getRef": { status: 500 } },
    });
    await run({ ...world, context: commentEvent() });
    expect(world.logs.failed).toHaveLength(1);
    expect(named(world.calls, "git.createTree")).toEqual([]);
  });

  it("still reports the agreement for this pull request when storing fails", async () => {
    const world = makeWorld({
      ...agreed,
      failOn: { "git.createTree": { status: 500 } },
    });
    await run({ ...world, context: commentEvent() });
    expect(lastState(world)).toBe("success");
  });
});

describe("run: reading the signatures file", () => {
  const agreed = { comments: [agreement(ada, 10)] };
  const expectError = async (world: WorldHandle, event = pullRequestEvent) => {
    await expect(run({ ...world, context: event })).rejects.toThrow();
    expect(lastState(world)).toBe("error");
    expectNoSuccess(world);
    expect(writes(world)).toEqual([]);
    expect(named(world.calls, "git.createRef")).toEqual([]);
    expect(named(world.calls, "issues.createComment")).toEqual([]);
  };

  it("sets an error, not a pass, when the read is refused with 403", async () => {
    await expectError(
      makeWorld({ ...agreed, failOn: { "repos.getContent": { status: 403 } } }),
    );
  });

  it("sets an error, not a pass, when the read fails with 500", async () => {
    await expectError(
      makeWorld({ ...agreed, failOn: { "repos.getContent": { status: 500 } } }),
    );
  });

  it("sets an error when the file turns out to be a directory listing", async () => {
    await expectError(makeWorld({ ...agreed, contentShape: "array" }));
  });

  it("sets an error when the file cannot be read as base64 text", async () => {
    await expectError(makeWorld({ ...agreed, contentShape: "not-base64" }));
  });

  it("does not overwrite a damaged signatures file", async () => {
    const world = makeWorld({ file: "{ not json", ...agreed });
    await expect(run({ ...world, context: commentEvent() })).rejects.toThrow(
      /signatures/i,
    );
    expect(writes(world)).toEqual([]);
    expect(world.state.file).toBe("{ not json");
    expect(lastState(world)).toBe("error");
    expectNoSuccess(world);
  });
});

describe("run: failures", () => {
  it("sets an error status, not a pass, when the commits cannot be read", async () => {
    const world = makeWorld({
      failOn: { "pulls.listCommits": { status: 500 } },
    });
    await expect(
      run({ ...world, context: pullRequestEvent }),
    ).rejects.toThrow();
    expect(statuses(world)[0]?.params).toMatchObject({
      sha: HEAD,
      state: "error",
      context: "CLA",
    });
    expectNoSuccess(world);
  });

  it("sets an error status when the comments cannot be read", async () => {
    const world = makeWorld({
      failOn: { "issues.listComments": { status: 500 } },
    });
    await expect(
      run({ ...world, context: pullRequestEvent }),
    ).rejects.toThrow();
    expect(lastState(world)).toBe("error");
    expectNoSuccess(world);
  });

  it("logs a warning and throws the original error when the error status cannot be set either", async () => {
    const world = makeWorld({
      failOn: {
        "pulls.listCommits": { status: 500 },
        "repos.createCommitStatus": { status: 502 },
      },
    });
    await expect(run({ ...world, context: pullRequestEvent })).rejects.toThrow(
      "HTTP 500",
    );
    expect(world.logs.warnings.join(" ")).toMatch(/error status/);
    expectNoSuccess(world);
  });

  it("throws when the status cannot be written for a human's pull request", async () => {
    const world = makeWorld({
      comments: [agreement(ada, 10)],
      failOn: { "repos.createCommitStatus": { status: 403 } },
    });
    await expect(run({ ...world, context: pullRequestEvent })).rejects.toThrow(
      "HTTP 403",
    );
    expect(lastState(world)).toBe("error");
  });

  it("does not set a pass when the pull request cannot be read at all", async () => {
    const world = makeWorld({ failOn: { "pulls.get": { status: 500 } } });
    await expect(
      run({ ...world, context: pullRequestEvent }),
    ).rejects.toThrow();
    expect(statuses(world)).toEqual([]);
  });
});

describe("run: Dependabot and a read-only token", () => {
  const readOnly = { "repos.createCommitStatus": { status: 403 } };

  it("exits quietly with a notice when a bot's pull request cannot get a status", async () => {
    const world = makeWorld({
      pullAuthor: dependabot,
      commits: [commit(dependabot)],
      failOn: readOnly,
    });
    await expect(
      run({ ...world, context: pullRequestEvent }),
    ).resolves.toBeDefined();
    expect(world.logs.notices).toHaveLength(1);
    expect(world.logs.notices[0]).toMatch(/read-only/i);
    expect(world.logs.failed).toEqual([]);
    expect(statuses(world)).toHaveLength(1);
    expect(named(world.calls, "issues.createComment")).toEqual([]);
  });

  it("exits quietly when a human on a bot's pull request cannot be recorded", async () => {
    const world = makeWorld({
      pullAuthor: dependabot,
      commits: [commit(dependabot), commit(grace)],
      comments: [agreement(grace, 10)],
      file: "[]\n",
      failOn: { "repos.createOrUpdateFileContents": { status: 403 } },
    });
    await run({ ...world, context: pullRequestEvent });
    expect(world.logs.notices).toHaveLength(1);
    expect(world.logs.failed).toEqual([]);
  });

  it("treats a 403 on a human's pull request as a real failure", async () => {
    const world = makeWorld({ failOn: readOnly });
    await expect(run({ ...world, context: pullRequestEvent })).rejects.toThrow(
      "HTTP 403",
    );
    expect(world.logs.notices).toEqual([]);
  });

  it("treats other failures on a bot's pull request as real failures", async () => {
    const world = makeWorld({
      pullAuthor: dependabot,
      commits: [commit(dependabot)],
      failOn: { "repos.createCommitStatus": { status: 500 } },
    });
    await expect(run({ ...world, context: pullRequestEvent })).rejects.toThrow(
      "HTTP 500",
    );
    expect(world.logs.notices).toEqual([]);
  });
});

describe("run: the head commit changing", () => {
  it("sets no status and posts nothing when a push arrives during the run", async () => {
    const world = makeWorld({ headShas: [HEAD, NEW_HEAD] });
    await run({ ...world, context: pullRequestEvent });
    expect(statuses(world)).toEqual([]);
    expect(named(world.calls, "issues.createComment")).toEqual([]);
    expect(world.logs.infos.join(" ")).toMatch(/head commit changed/i);
    expect(world.logs.failed).toEqual([]);
  });

  it("still stores a signature that was agreed before the push", async () => {
    const world = makeWorld({
      headShas: [HEAD, NEW_HEAD],
      comments: [agreement(ada, 10)],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(parseSignatures(world.state.file ?? "")).toHaveLength(1);
    expect(statuses(world)).toEqual([]);
  });

  it("sets the status when the head commit is unchanged", async () => {
    const world = makeWorld({ headShas: [HEAD, HEAD] });
    await run({ ...world, context: pullRequestEvent });
    expect(statuses(world)).toHaveLength(1);
  });
});

describe("run: the status", () => {
  const current = (state: string, description: string, context = "CLA") => ({
    context,
    state,
    description,
  });

  it("does not write a status that is already there", async () => {
    const world = makeWorld({
      comments: [agreement(ada, 10)],
      statuses: [current("success", "All contributors have agreed to the CLA")],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(statuses(world)).toEqual([]);
    expect(
      named(world.calls, "repos.listCommitStatusesForRef")[0]?.params,
    ).toMatchObject({ ref: HEAD });
  });

  it("writes once and then leaves the same status alone on later runs", async () => {
    const world = makeWorld();
    await run({ ...world, context: pullRequestEvent });
    await run({ ...world, context: pullRequestEvent });
    await run({ ...world, context: pullRequestEvent });
    expect(statuses(world)).toHaveLength(1);
  });

  it("writes when the state differs", async () => {
    const world = makeWorld({
      comments: [agreement(ada, 10)],
      statuses: [current("failure", "Waiting for the CLA from: ada")],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
  });

  it("writes when only the description differs", async () => {
    const world = makeWorld({
      statuses: [current("failure", "Waiting for the CLA from: someone else")],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(statuses(world)).toHaveLength(1);
  });

  it("looks at the newest CLA status, not an older one", async () => {
    const world = makeWorld({
      comments: [agreement(ada, 10)],
      statuses: [
        current("failure", "Waiting for the CLA from: ada"),
        current("success", "All contributors have agreed to the CLA"),
      ],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
  });

  it("ignores statuses from other checks", async () => {
    const world = makeWorld({
      comments: [agreement(ada, 10)],
      statuses: [
        current("success", "All contributors have agreed to the CLA", "build"),
      ],
    });
    await run({ ...world, context: pullRequestEvent });
    expect(lastState(world)).toBe("success");
  });
});

describe("run: comment events", () => {
  it("does nothing for a comment on an issue that is not a pull request", async () => {
    const world = makeWorld();
    await run({ ...world, context: commentEvent({ isPull: false }) });
    expect(world.calls).toEqual([]);
  });

  it("does nothing for a comment that is not an agreement from someone other than the author", async () => {
    const world = makeWorld();
    await run({
      ...world,
      context: commentEvent({
        body: "Looks good to me.",
        commenter: grace,
      }),
    });
    expect(world.calls).toEqual([]);
  });

  it("does nothing when the sentence is hidden in code in someone else's comment", async () => {
    const world = makeWorld();
    await run({
      ...world,
      context: commentEvent({
        body: `\`\`\`\n${AGREEMENT_SENTENCE}\n\`\`\``,
        commenter: grace,
      }),
    });
    expect(world.calls).toEqual([]);
  });

  it("checks the pull request after any comment by its author", async () => {
    const world = makeWorld();
    await run({
      ...world,
      context: commentEvent({ body: "I fixed my email.", commenter: ada }),
    });
    expect(named(world.calls, "pulls.get")).not.toEqual([]);
    expect(lastState(world)).toBe("failure");
  });

  it("checks the pull request after anyone's agreement comment", async () => {
    const world = makeWorld({
      commits: [commit(ada), commit(grace)],
      comments: [agreement(ada, 10), agreement(grace, 11)],
    });
    await run({
      ...world,
      context: commentEvent({ commenter: grace, issueAuthor: ada }),
    });
    expect(lastState(world)).toBe("success");
  });

  it("still reads the comments from the API, not the event", async () => {
    const world = makeWorld();
    await run({
      ...world,
      context: commentEvent({ commenter: ada, issueAuthor: ada }),
    });
    expect(lastState(world)).toBe("failure");
  });
});

describe("run: the explanatory comment", () => {
  it("updates the comment when a new author appears after everyone had agreed", async () => {
    const agreedText = `${COMMENT_MARKER}\n## Contributor licence agreement\n\nAll contributors on this pull request have agreed.\n`;
    const world = makeWorld({
      commits: [commit(ada), commit(grace)],
      comments: [botComment(agreedText), agreement(ada, 10)],
    });
    await run({ ...world, context: pullRequestEvent });
    const updates = named(world.calls, "issues.updateComment");
    expect(updates).toHaveLength(1);
    expect(String(updates[0]?.params.body)).toContain(AGREEMENT_SENTENCE);
    expect(named(world.calls, "issues.createComment")).toEqual([]);
    expect(lastState(world)).toBe("failure");
  });

  it("ignores a human comment that holds the marker beside the bot's own", async () => {
    const world = makeWorld({
      comments: [
        comment(grace, `${COMMENT_MARKER}\nnot the bot`, 8),
        botComment(`${COMMENT_MARKER}\nold text`, 9),
      ],
    });
    await run({ ...world, context: pullRequestEvent });
    const updates = named(world.calls, "issues.updateComment");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.params.comment_id).toBe(9);
  });

  it("leaves the comment alone when the text has not changed", async () => {
    const world = makeWorld({
      statuses: [{ context: "x", state: "x", description: "x" }],
    });
    await run({ ...world, context: pullRequestEvent });
    await run({ ...world, context: pullRequestEvent });
    expect(named(world.calls, "issues.createComment")).toHaveLength(1);
    expect(named(world.calls, "issues.updateComment")).toEqual([]);
  });

  it("does not edit a comment that GitHub stored with Windows line endings", async () => {
    const world = makeWorld({ crlf: true });
    await run({ ...world, context: pullRequestEvent });
    expect(world.state.comments[0]?.body).toContain("\r\n");
    await run({ ...world, context: pullRequestEvent });
    expect(named(world.calls, "issues.updateComment")).toEqual([]);
  });

  it("keeps the status when the comment cannot be created", async () => {
    const world = makeWorld({
      failOn: { "issues.createComment": { status: 500 } },
    });
    await expect(
      run({ ...world, context: pullRequestEvent }),
    ).resolves.toBeDefined();
    expect(lastState(world)).toBe("failure");
    expect(world.logs.warnings.join(" ")).toMatch(/comment/i);
    expect(world.logs.failed).toEqual([]);
  });

  it("keeps a passing status when the comment cannot be updated", async () => {
    const world = makeWorld({
      comments: [botComment(`${COMMENT_MARKER}\nold text`), agreement(ada, 10)],
      failOn: { "issues.updateComment": { status: 500 } },
    });
    await expect(
      run({ ...world, context: pullRequestEvent }),
    ).resolves.toBeDefined();
    expect(statuses(world).map((c) => c.params.state)).toEqual(["success"]);
    expect(world.logs.warnings.join(" ")).toMatch(/comment/i);
    expect(world.logs.failed).toEqual([]);
  });
});
