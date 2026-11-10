import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AGREEMENT_SENTENCE,
  addSignatures,
  buildComment,
  buildStatus,
  CLA_VERSION,
  COMMENT_MARKER,
  evaluate,
  isAgreementComment,
  parseSignatures,
  serialiseSignatures,
} from "../../../../scripts/cla/cla.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const CLA_URL = "https://github.com/mooship/karta/blob/main/CLA.md";

type User = { login: string; id: number; type: string };

const user = (login: string, id: number, type = "User"): User => ({
  login,
  id,
  type,
});
const owner = user("mooship", 1);
const ada = user("ada", 2);
const grace = user("grace", 3);

const commit = (author: User | null, sha = "abc1234def", name = "Someone") => ({
  sha,
  author,
  commit: { author: { name } },
});

const comment = (
  author: User,
  body: string,
  id = 100,
  createdAt = "2026-11-10T08:00:00Z",
) => ({
  id,
  html_url: `https://github.com/mooship/karta/pull/7#issuecomment-${id}`,
  created_at: createdAt,
  user: author,
  body,
});

const signature = (login: string, id: number) => ({
  login,
  id,
  signedAt: "2026-01-01T00:00:00.000Z",
  pullRequest: 1,
  commentUrl: "u",
  claVersion: "1.0",
});

const evaluateWith = (overrides: Record<string, unknown> = {}) =>
  evaluate({
    ownerLogin: "mooship",
    pullAuthor: ada,
    commits: [commit(ada)],
    commitTotal: 1,
    comments: [],
    signatures: [],
    pullRequest: 7,
    ...overrides,
  } as never);

/** Quotes every line of a comment, as GitHub's quote reply does. */
const quoteReply = (text: string) =>
  text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

describe("the CLA text", () => {
  const claText = readFileSync(path.join(REPO, "CLA.md"), "utf8");

  it("holds the sentence the check looks for, word for word", () => {
    expect(claText).toContain(`> ${AGREEMENT_SENTENCE}`);
  });

  it("states the version the signatures record", () => {
    expect(claText).toContain(`Version ${CLA_VERSION}`);
  });
});

describe("isAgreementComment", () => {
  it("accepts a plain comment holding the exact sentence", () => {
    expect(isAgreementComment(AGREEMENT_SENTENCE)).toBe(true);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(
      isAgreementComment(`  ${AGREEMENT_SENTENCE.toUpperCase()}\n\n`),
    ).toBe(true);
    expect(isAgreementComment(AGREEMENT_SENTENCE.replace(/ /g, "   "))).toBe(
      true,
    );
  });

  it("accepts the sentence copied from CLA.md's blockquote, with one quote marker", () => {
    expect(isAgreementComment(`> ${AGREEMENT_SENTENCE}`)).toBe(true);
    expect(isAgreementComment(`>${AGREEMENT_SENTENCE}`)).toBe(true);
    expect(isAgreementComment(`  > ${AGREEMENT_SENTENCE}`)).toBe(true);
  });

  it("rejects a sentence quoted twice, as a quote reply to a quote would write it", () => {
    expect(isAgreementComment(`> > ${AGREEMENT_SENTENCE}`)).toBe(false);
    expect(isAgreementComment(`>> ${AGREEMENT_SENTENCE}`)).toBe(false);
    expect(isAgreementComment(`> >${AGREEMENT_SENTENCE}`)).toBe(false);
  });

  it("rejects a quote reply to the bot's own comment", () => {
    const botComment = buildComment(evaluateWith(), { claUrl: CLA_URL });
    expect(isAgreementComment(`${quoteReply(botComment)}\n\nOk`)).toBe(false);
    expect(isAgreementComment(botComment)).toBe(false);
  });

  it("rejects any comment that holds the bot's marker or heading", () => {
    expect(isAgreementComment(`${COMMENT_MARKER}\n${AGREEMENT_SENTENCE}`)).toBe(
      false,
    );
    expect(
      isAgreementComment(
        `${AGREEMENT_SENTENCE}\n${COMMENT_MARKER.toUpperCase()}`,
      ),
    ).toBe(false);
    expect(
      isAgreementComment(
        `## Contributor licence agreement\n\n${AGREEMENT_SENTENCE}`,
      ),
    ).toBe(false);
  });

  it("rejects a sentence inside a fenced code block", () => {
    expect(isAgreementComment(`\`\`\`\n${AGREEMENT_SENTENCE}\n\`\`\``)).toBe(
      false,
    );
    expect(isAgreementComment(`~~~\n${AGREEMENT_SENTENCE}\n~~~`)).toBe(false);
    expect(
      isAgreementComment(`\`\`\`text\n${AGREEMENT_SENTENCE}\n\`\`\``),
    ).toBe(false);
    expect(
      isAgreementComment(`\`\`\`\`\n${AGREEMENT_SENTENCE}\n\`\`\`\`\``),
    ).toBe(false);
  });

  it("keeps hiding text after a line that is too short or of the wrong kind to close the fence", () => {
    expect(
      isAgreementComment(`\`\`\`\`\n\`\`\`\n${AGREEMENT_SENTENCE}\n\`\`\`\`\n`),
    ).toBe(false);
    expect(
      isAgreementComment(`~~~\n\`\`\`\n${AGREEMENT_SENTENCE}\n~~~\n`),
    ).toBe(false);
  });

  it("rejects a sentence in a fence that is never closed", () => {
    expect(isAgreementComment(`\`\`\`\n${AGREEMENT_SENTENCE}`)).toBe(false);
  });

  it("rejects a sentence in a fenced block inside a quote", () => {
    expect(
      isAgreementComment(`> \`\`\`\n> ${AGREEMENT_SENTENCE}\n> \`\`\``),
    ).toBe(false);
  });

  it("accepts a sentence after a closed fence", () => {
    expect(
      isAgreementComment(`\`\`\`\nsome code\n\`\`\`\n${AGREEMENT_SENTENCE}`),
    ).toBe(true);
  });

  it("rejects a sentence inside an inline code span", () => {
    expect(isAgreementComment(`\`${AGREEMENT_SENTENCE}\``)).toBe(false);
    expect(isAgreementComment(`\`\`${AGREEMENT_SENTENCE}\`\``)).toBe(false);
    expect(
      isAgreementComment(
        `\`${AGREEMENT_SENTENCE.slice(0, 40)}\n${AGREEMENT_SENTENCE.slice(40)}\``,
      ),
    ).toBe(false);
  });

  it("rejects a sentence inside an HTML comment, on one line or several", () => {
    expect(isAgreementComment(`<!-- ${AGREEMENT_SENTENCE} -->`)).toBe(false);
    expect(isAgreementComment(`<!--\n${AGREEMENT_SENTENCE}\n-->\nHello`)).toBe(
      false,
    );
  });

  it("accepts the sentence beside code spans, fences and comments", () => {
    expect(
      isAgreementComment(
        `Hello \`x\` <!-- note -->\n${AGREEMENT_SENTENCE}\n\`\`\`\ncode\n\`\`\``,
      ),
    ).toBe(true);
  });

  it("accepts a missing or doubled trailing full stop", () => {
    expect(isAgreementComment(AGREEMENT_SENTENCE.replace(/\.$/, ""))).toBe(
      true,
    );
    expect(isAgreementComment(`${AGREEMENT_SENTENCE}.`)).toBe(true);
  });

  it("accepts the sentence on its own line with an organisation on another", () => {
    const body = `${AGREEMENT_SENTENCE}\n\nI contribute for Example (Pty) Ltd.`;
    expect(isAgreementComment(body)).toBe(true);
    expect(
      isAgreementComment(`Hello!\r\n> ${AGREEMENT_SENTENCE}\r\nThanks`),
    ).toBe(true);
  });

  it("rejects a sentence wrapped over two lines", () => {
    const half = AGREEMENT_SENTENCE.indexOf(" at the time");
    expect(
      isAgreementComment(
        `${AGREEMENT_SENTENCE.slice(0, half)}\n${AGREEMENT_SENTENCE.slice(half)}`,
      ),
    ).toBe(false);
  });

  it("rejects a paraphrase", () => {
    expect(isAgreementComment("I agree to the CLA.")).toBe(false);
    expect(
      isAgreementComment(
        "I have read the contributor licence agreement and I agree to it.",
      ),
    ).toBe(false);
    expect(
      isAgreementComment(AGREEMENT_SENTENCE.replace("agree", "accept")),
    ).toBe(false);
  });

  it("rejects part of the sentence", () => {
    expect(
      isAgreementComment(
        "I have read the contributor licence agreement in CLA.md at the time of this pull request",
      ),
    ).toBe(false);
  });

  it("rejects the sentence with extra words on the same line", () => {
    expect(isAgreementComment(`${AGREEMENT_SENTENCE} Not really.`)).toBe(false);
    expect(
      isAgreementComment(`I do not think that ${AGREEMENT_SENTENCE}`),
    ).toBe(false);
  });

  it("rejects empty and non-string bodies", () => {
    expect(isAgreementComment("")).toBe(false);
    expect(isAgreementComment(null)).toBe(false);
    expect(isAgreementComment(undefined)).toBe(false);
  });
});

describe("who needs to agree", () => {
  it("needs the pull request author and each distinct commit author once", () => {
    const result = evaluateWith({
      pullAuthor: ada,
      commits: [commit(ada), commit(grace), commit(grace), commit(ada)],
      commitTotal: 4,
    });
    expect(result.required.map((r: User) => r.login)).toEqual(["ada", "grace"]);
  });

  it("treats logins as case-insensitive when removing duplicates", () => {
    const result = evaluateWith({
      commits: [commit({ ...ada, login: "ADA" })],
    });
    expect(result.required).toHaveLength(1);
  });

  it("exempts the repository owner in any case", () => {
    const result = evaluateWith({
      pullAuthor: owner,
      commits: [commit({ ...owner, login: "MooShip" })],
    });
    expect(result.required).toEqual([]);
    expect(result.agreed).toBe(true);
  });

  it("exempts bots such as Dependabot and GitHub Actions", () => {
    const dependabot = user("dependabot[bot]", 49699333, "Bot");
    const actions = user("github-actions[bot]", 41898282, "Bot");
    const result = evaluateWith({
      pullAuthor: dependabot,
      commits: [commit(dependabot), commit(actions)],
      commitTotal: 2,
    });
    expect(result.required).toEqual([]);
    expect(result.agreed).toBe(true);
  });

  it("still needs a human who committed on a bot's pull request", () => {
    const dependabot = user("dependabot[bot]", 49699333, "Bot");
    const result = evaluateWith({
      pullAuthor: dependabot,
      commits: [commit(dependabot), commit(grace)],
      commitTotal: 2,
    });
    expect(result.missing.map((r: User) => r.login)).toEqual(["grace"]);
    expect(result.authorMissing).toBe(false);
  });

  it("counts a commit author with no GitHub login as not agreed", () => {
    const result = evaluateWith({
      commits: [commit(ada), commit(null, "deadbeef1234", "Unlinked Person")],
      commitTotal: 2,
      comments: [comment(ada, AGREEMENT_SENTENCE)],
    });
    expect(result.agreed).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.unresolved).toEqual([
      { sha: "deadbee", name: "Unlinked Person" },
    ]);
  });

  it("treats an empty author object as having no login", () => {
    const result = evaluateWith({
      commits: [commit({} as User, "0123456789ab", "Nobody")],
      comments: [comment(ada, AGREEMENT_SENTENCE)],
    });
    expect(result.unresolved).toEqual([{ sha: "0123456", name: "Nobody" }]);
  });

  it("reports one entry for each unlinked commit", () => {
    const result = evaluateWith({
      commits: [
        commit(null, "1111111aaa", "A"),
        commit(null, "2222222bbb", "B"),
      ],
      commitTotal: 2,
    });
    expect(result.unresolved).toHaveLength(2);
  });

  it("fails closed when the pull request author is null", () => {
    const result = evaluateWith({ pullAuthor: null });
    expect(result.authorUnresolved).toBe(true);
    expect(result.agreed).toBe(false);
    expect(buildStatus(result).state).toBe("failure");
    expect(buildComment(result, { claUrl: CLA_URL })).toMatch(
      /author of this pull request could not be identified/,
    );
  });

  it("fails closed when the pull request author has no id or no login", () => {
    for (const pullAuthor of [
      { login: "ada", type: "User" },
      { id: 2, type: "User" },
      {},
    ]) {
      const result = evaluateWith({
        pullAuthor,
        comments: [comment(ada, AGREEMENT_SENTENCE)],
      });
      expect(result.authorUnresolved).toBe(true);
      expect(result.agreed).toBe(false);
    }
  });

  it("does not treat a resolved author as unresolved", () => {
    expect(evaluateWith().authorUnresolved).toBe(false);
  });
});

describe("a commit list that was cut short", () => {
  const agreed = { comments: [comment(ada, AGREEMENT_SENTENCE)] };

  it("passes when the count equals the commits listed", () => {
    const result = evaluateWith({
      ...agreed,
      commits: [commit(ada), commit(ada)],
      commitTotal: 2,
    });
    expect(result.incomplete).toBe(false);
    expect(result.agreed).toBe(true);
  });

  it("fails when one commit is missing from the list", () => {
    const result = evaluateWith({
      ...agreed,
      commits: [commit(ada), commit(ada)],
      commitTotal: 3,
    });
    expect(result.incomplete).toBe(true);
    expect(result.agreed).toBe(false);
  });

  it("fails when GitHub's count is far above the commits listed", () => {
    const result = evaluateWith({ ...agreed, commitTotal: 300 });
    expect(result.incomplete).toBe(true);
    expect(result.agreed).toBe(false);
  });

  it("fails closed when the count is missing or not a number", () => {
    for (const commitTotal of [undefined, Number.NaN, null, "1"]) {
      const result = evaluateWith({ ...agreed, commitTotal });
      expect(result.incomplete).toBe(true);
      expect(result.agreed).toBe(false);
    }
  });
});

describe("who has agreed", () => {
  it("records a comment by the person with the sentence", () => {
    const result = evaluateWith({
      comments: [comment(ada, AGREEMENT_SENTENCE, 55, "2026-11-10T09:30:00Z")],
    });
    expect(result.agreed).toBe(true);
    expect(result.newSignatures).toEqual([
      {
        login: "ada",
        id: 2,
        signedAt: "2026-11-10T09:30:00.000Z",
        pullRequest: 7,
        commentUrl: "https://github.com/mooship/karta/pull/7#issuecomment-55",
        claVersion: CLA_VERSION,
      },
    ]);
  });

  it("takes the earliest agreeing comment when there are several", () => {
    const result = evaluateWith({
      comments: [
        comment(ada, AGREEMENT_SENTENCE, 70, "2026-11-10T10:00:00Z"),
        comment(ada, AGREEMENT_SENTENCE, 60, "2026-11-10T09:00:00Z"),
      ],
    });
    expect(result.newSignatures).toHaveLength(1);
    expect(result.newSignatures[0].commentUrl).toContain("issuecomment-60");
  });

  it("breaks a tie on the same timestamp with the lower comment id", () => {
    const sameTime = "2026-11-10T09:00:00Z";
    for (const comments of [
      [
        comment(ada, AGREEMENT_SENTENCE, 70, sameTime),
        comment(ada, AGREEMENT_SENTENCE, 60, sameTime),
      ],
      [
        comment(ada, AGREEMENT_SENTENCE, 60, sameTime),
        comment(ada, AGREEMENT_SENTENCE, 70, sameTime),
      ],
    ]) {
      const result = evaluateWith({ comments });
      expect(result.newSignatures[0].commentUrl).toContain("issuecomment-60");
    }
  });

  it("does not count a comment written by someone else for the author", () => {
    const result = evaluateWith({
      comments: [comment(grace, AGREEMENT_SENTENCE)],
    });
    expect(result.agreed).toBe(false);
    expect(result.missing.map((r: User) => r.login)).toEqual(["ada"]);
    expect(result.newSignatures).toEqual([]);
  });

  it("does not let the owner agree on someone's behalf", () => {
    const result = evaluateWith({
      comments: [comment(owner, `ada says: ${AGREEMENT_SENTENCE}`)],
    });
    expect(result.agreed).toBe(false);
  });

  it("matches on the account id, not the login", () => {
    const impostor = user("ada", 999);
    const result = evaluateWith({
      comments: [comment(impostor, AGREEMENT_SENTENCE)],
    });
    expect(result.agreed).toBe(false);
  });

  it("does not count a paraphrase", () => {
    const result = evaluateWith({
      comments: [comment(ada, "I agree to the CLA, thanks.")],
    });
    expect(result.agreed).toBe(false);
    expect(result.missing).toHaveLength(1);
  });

  it("does not count a quote reply to the bot", () => {
    const botComment = buildComment(evaluateWith(), { claUrl: CLA_URL });
    const result = evaluateWith({
      comments: [comment(ada, `${quoteReply(botComment)}\n\nDone`)],
    });
    expect(result.agreed).toBe(false);
  });

  it("ignores comments with no author", () => {
    const result = evaluateWith({
      comments: [{ ...comment(ada, AGREEMENT_SENTENCE), user: null }],
    });
    expect(result.agreed).toBe(false);
  });

  it("counts a person already in the signatures file, with no comment", () => {
    const result = evaluateWith({ signatures: [signature("ada", 2)] });
    expect(result.agreed).toBe(true);
    expect(result.newSignatures).toEqual([]);
  });

  it("recognises a renamed account by id", () => {
    const result = evaluateWith({
      pullAuthor: { ...ada, login: "ada-renamed" },
      commits: [commit({ ...ada, login: "ada-renamed" })],
      signatures: [signature("ada", 2)],
    });
    expect(result.agreed).toBe(true);
  });

  it("does not let a new account that took over a login inherit its agreement", () => {
    const result = evaluateWith({ signatures: [signature("ada", 999)] });
    expect(result.agreed).toBe(false);
    expect(result.missing.map((r: User) => r.login)).toEqual(["ada"]);
  });

  it("does not record a signature again for a person already in the file", () => {
    const result = evaluateWith({
      comments: [comment(ada, AGREEMENT_SENTENCE)],
      signatures: [signature("ada", 2)],
    });
    expect(result.newSignatures).toEqual([]);
  });

  it("fails when one of several authors has not agreed", () => {
    const result = evaluateWith({
      commits: [commit(ada), commit(grace)],
      commitTotal: 2,
      comments: [comment(ada, AGREEMENT_SENTENCE)],
    });
    expect(result.agreed).toBe(false);
    expect(result.missing.map((r: User) => r.login)).toEqual(["grace"]);
    expect(result.newSignatures.map((s: { login: string }) => s.login)).toEqual(
      ["ada"],
    );
  });

  it("passes when every author has agreed, one by file and one by comment", () => {
    const result = evaluateWith({
      commits: [commit(ada), commit(grace)],
      commitTotal: 2,
      comments: [comment(grace, AGREEMENT_SENTENCE)],
      signatures: [signature("ada", 2)],
    });
    expect(result.agreed).toBe(true);
    expect(result.newSignatures.map((s: { login: string }) => s.login)).toEqual(
      ["grace"],
    );
  });
});

describe("the signatures file", () => {
  const entry = signature("ada", 2);

  it("reads an empty or missing file as no signatures", () => {
    expect(parseSignatures("")).toEqual([]);
    expect(parseSignatures("[]\n")).toEqual([]);
  });

  it("reads back what it wrote", () => {
    expect(parseSignatures(serialiseSignatures([entry]))).toEqual([entry]);
  });

  it("writes stable, readable JSON with a trailing newline", () => {
    const text = serialiseSignatures([entry]);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  {\n    "login": "ada"');
  });

  it("refuses text that is not a list of signatures", () => {
    expect(() => parseSignatures("{")).toThrow(/signatures/i);
    expect(() => parseSignatures('{"a":1}')).toThrow(/signatures/i);
    expect(() => parseSignatures('[{"login":"ada"}]')).toThrow(/signatures/i);
    expect(() => parseSignatures("[null]")).toThrow(/signatures/i);
  });

  it("adds new signatures after the existing ones, once for each account", () => {
    const grace1 = signature("grace", 3);
    const merged = addSignatures([entry], [entry, grace1, grace1]);
    expect(merged.map((s: { id: number }) => s.id)).toEqual([2, 3]);
  });

  it("does not change the list it was given", () => {
    const existing = [entry];
    addSignatures(existing, [signature("grace", 3)]);
    expect(existing).toHaveLength(1);
  });
});

describe("the CLA status", () => {
  it("succeeds when everyone has agreed", () => {
    expect(
      buildStatus(
        evaluateWith({ comments: [comment(ada, AGREEMENT_SENTENCE)] }),
      ),
    ).toEqual({
      state: "success",
      description: "All contributors have agreed to the CLA",
    });
  });

  it("fails with the name of the person who has not agreed", () => {
    expect(buildStatus(evaluateWith())).toEqual({
      state: "failure",
      description: "Waiting for the CLA from: ada",
    });
  });

  it("names everyone who has not agreed, sorted", () => {
    const status = buildStatus(
      evaluateWith({
        commits: [commit(grace), commit(ada)],
        commitTotal: 2,
      }),
    );
    expect(status.state).toBe("failure");
    expect(status.description).toBe("Waiting for the CLA from: ada, grace");
  });

  it("says when a commit author has no GitHub account", () => {
    const status = buildStatus(
      evaluateWith({
        commits: [commit(ada), commit(null)],
        commitTotal: 2,
        comments: [comment(ada, AGREEMENT_SENTENCE)],
      }),
    );
    expect(status.state).toBe("failure");
    expect(status.description).toMatch(/not linked to a GitHub account/);
  });

  it("says when the commits could not all be checked", () => {
    const status = buildStatus(
      evaluateWith({
        comments: [comment(ada, AGREEMENT_SENTENCE)],
        commitTotal: 300,
      }),
    );
    expect(status.state).toBe("failure");
    expect(status.description).toMatch(/too many commits/i);
  });

  it("says when the pull request author could not be identified", () => {
    const status = buildStatus(evaluateWith({ pullAuthor: null }));
    expect(status.state).toBe("failure");
    expect(status.description).toMatch(/author could not be identified/i);
  });

  it("stays within GitHub's 140 character limit", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      user(`contributor-with-a-long-name-${i}`, 1000 + i),
    );
    const status = buildStatus(
      evaluateWith({
        commits: many.map((u) => commit(u)),
        commitTotal: many.length,
      }),
    );
    expect(status.description.length).toBeLessThanOrEqual(140);
    expect(status.description.endsWith("...")).toBe(true);
  });
});

describe("the explanatory comment", () => {
  const pending = () => evaluateWith();
  const done = () =>
    evaluateWith({ comments: [comment(ada, AGREEMENT_SENTENCE)] });
  const build = (evaluation: unknown) =>
    buildComment(evaluation as never, { claUrl: CLA_URL });

  it("starts with the hidden marker so it can be found and updated", () => {
    expect(build(pending()).startsWith(COMMENT_MARKER)).toBe(true);
    expect(build(done()).startsWith(COMMENT_MARKER)).toBe(true);
  });

  it("tells the unsigned author the exact sentence and links CLA.md", () => {
    const text = build(pending());
    expect(text).toContain(`> ${AGREEMENT_SENTENCE}`);
    expect(text).toContain(`(${CLA_URL})`);
    expect(text).toContain("@ada");
    expect(text).toContain("`CLA`");
  });

  it("never agrees to its own text, so it cannot sign for anyone", () => {
    for (const evaluation of [pending(), done()]) {
      expect(isAgreementComment(build(evaluation))).toBe(false);
    }
  });

  it("mentions only the pull request author, and only while they are missing", () => {
    const text = build(
      evaluateWith({
        commits: [commit(ada), commit(grace)],
        commitTotal: 2,
      }),
    );
    expect(text).toContain("@ada");
    expect(text).toContain("`grace`");
    expect(text).not.toContain("@grace");
  });

  it("does not mention anyone when only commit authors are missing", () => {
    const text = build(
      evaluateWith({
        commits: [commit(ada), commit(grace)],
        commitTotal: 2,
        comments: [comment(ada, AGREEMENT_SENTENCE)],
      }),
    );
    expect(text).toContain("`grace`");
    expect(text).not.toMatch(/@\w/);
  });

  it("does not mention a commit author a spoofed noreply email resolved to", () => {
    const victim = user("victim", 4242);
    const text = build(
      evaluateWith({
        commits: [commit(victim, "abc1234def", "Not Really Victim")],
        commitTotal: 1,
        comments: [comment(ada, AGREEMENT_SENTENCE)],
      }),
    );
    expect(text).toContain("`victim`");
    expect(text).not.toContain("@victim");
  });

  it("says that everyone has agreed once they have, listing them sorted", () => {
    const text = build(
      evaluateWith({
        commits: [commit(grace), commit(ada)],
        commitTotal: 2,
        comments: [
          comment(grace, AGREEMENT_SENTENCE, 1),
          comment(ada, AGREEMENT_SENTENCE, 2),
        ],
      }),
    );
    expect(text).toMatch(/have agreed/);
    expect(text).toContain("`ada`, `grace`");
    expect(text).not.toContain(`> ${AGREEMENT_SENTENCE}`);
    expect(text).not.toMatch(/@\w/);
  });

  it("changes from waiting to agreed when the missing person agrees", () => {
    expect(build(pending())).not.toBe(build(done()));
  });

  it("does not depend on the order of commits or comments", () => {
    const a = evaluateWith({
      commits: [commit(ada), commit(grace)],
      commitTotal: 2,
    });
    const b = evaluateWith({
      commits: [commit(grace), commit(ada)],
      commitTotal: 2,
    });
    expect(build(a)).toBe(build(b));
  });

  it("explains how to fix a commit made with an unlinked email address", () => {
    const text = build(
      evaluateWith({
        commits: [commit(ada), commit(null, "deadbeef1234", "Unlinked Person")],
        commitTotal: 2,
        comments: [comment(ada, AGREEMENT_SENTENCE)],
      }),
    );
    expect(text).toContain("`deadbee`");
    expect(text).toContain("`Unlinked Person`");
    expect(text).toMatch(/email address linked to your GitHub account/);
  });

  it("neutralises markdown, mentions and links in a commit author name", () => {
    const text = build(
      evaluateWith({
        commits: [
          commit(null, "deadbeef1234", "`x` @everyone\n<!-- cla-bot -->"),
        ],
        commitTotal: 1,
        pullAuthor: owner,
      }),
    );
    expect(text).not.toContain("@everyone");
    expect(text.match(/<!-- cla-bot -->/g)).toHaveLength(1);
    expect(text).not.toContain("\n<!--");
  });

  it("keeps a web address in a commit author name from becoming a link", () => {
    const text = build(
      evaluateWith({
        commits: [commit(null, "deadbeef1234", "www.evil.com")],
        commitTotal: 1,
        pullAuthor: owner,
      }),
    );
    expect(text).toContain("by `www.evil.com`");
    expect(text).not.toMatch(/(^|[^`])www\.evil\.com/m);
  });

  it("names an unlinked commit author who gave no name, or only symbols, as unknown", () => {
    const nameless = { sha: "abc1234def", author: null, commit: {} };
    const symbols = commit(null, "1111111aaa", "@@@ <>");
    const text = build(
      evaluateWith({
        pullAuthor: owner,
        commits: [nameless, symbols],
        commitTotal: 2,
      }),
    );
    expect(text.match(/by `unknown`/g)).toHaveLength(2);
  });

  it("writes a pull request author's login that cannot be a mention in a code span", () => {
    const odd = user("weird_login", 77);
    const text = build(
      evaluateWith({ pullAuthor: odd, commits: [commit(odd)] }),
    );
    expect(text).toContain("`weird_login`, your agreement is needed.");
    expect(text).not.toContain("@weird_login");
  });

  it("lists at most ten unlinked commits and counts the rest", () => {
    const commits = Array.from({ length: 12 }, (_, i) =>
      commit(null, `${String(i).padStart(7, "0")}abcdef`, `Person ${i}`),
    );
    const text = build(
      evaluateWith({ pullAuthor: owner, commits, commitTotal: 12 }),
    );
    expect(text.match(/^- `/gm)).toHaveLength(10);
    expect(text).toContain("- and 2 more");
  });

  it("says when the commits could not all be checked", () => {
    const text = build(
      evaluateWith({
        comments: [comment(ada, AGREEMENT_SENTENCE)],
        commitTotal: 300,
      }),
    );
    expect(text).toMatch(/too many commits/i);
  });

  it("says no agreement is needed when only the owner or bots contributed", () => {
    const text = build(
      evaluateWith({ pullAuthor: owner, commits: [commit(owner)] }),
    );
    expect(text).toMatch(/no agreement is needed/i);
  });
});
