/**
 * Looks up which contributors are administrators of the repository, so the
 * contributor licence agreement check can exempt them (`cla.mjs` stays pure and
 * only receives the resulting list).
 *
 * GitHub reports the permission `admin` for repository administrators and for
 * the owners of the organisation that holds the repository, so no account has
 * to be named in code. The lookup fails closed: any error leaves that person
 * required to agree, with a warning, and is never thrown.
 */

/** The permission GitHub reports for a repository administrator. */
const ADMIN_PERMISSION = "admin";

/**
 * @param {{
 *   github: any,
 *   repo: { owner: string, repo: string },
 *   logins: string[],
 *   core: { warning: (message: string) => void },
 * }} input `logins` must already be distinct, so each is looked up once.
 * @returns {Promise<string[]>} The logins whose permission on the repository is
 *   `admin`, in the order given. A login whose lookup fails, or whose answer is
 *   anything but `admin`, is left out.
 */
export async function findAdministrators({ github, repo, logins, core }) {
  const answers = await Promise.all(
    logins.map(async (login) => {
      try {
        const { data } = await github.rest.repos.getCollaboratorPermissionLevel(
          {
            owner: repo.owner,
            repo: repo.repo,
            username: login,
          },
        );
        return data?.permission === ADMIN_PERMISSION;
      } catch (error) {
        core.warning(
          `The repository permission of ${login} could not be read, so they are not exempt: ${error}`,
        );
        return false;
      }
    }),
  );
  return logins.filter((_, index) => answers[index]);
}
