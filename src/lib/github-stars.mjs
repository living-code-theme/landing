// Website-owned public organization statistics. Normal builds consume only the checked-in snapshot.
export const GITHUB_ORGANIZATION = "living-code-theme";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const MAX_RESPONSE = 8 * 1024 * 1024;
const repositoryName = /^[a-z0-9._-]{1,100}$/i;

export function summarizeGitHubStars(snapshot) {
  if (snapshot?.schemaVersion !== 1 || snapshot.organization !== GITHUB_ORGANIZATION || !Array.isArray(snapshot.repositories) || snapshot.repositories.length > PAGE_SIZE * MAX_PAGES) {
    throw new Error("Invalid GitHub stars snapshot");
  }
  const names = new Set();
  let totalStars = 0;
  for (const repository of snapshot.repositories) {
    if (!repository || typeof repository.name !== "string" || !repositoryName.test(repository.name) || names.has(repository.name.toLowerCase()) || !Number.isSafeInteger(repository.stars) || repository.stars < 0) {
      throw new Error("Invalid or duplicate repository in GitHub stars snapshot");
    }
    names.add(repository.name.toLowerCase());
    totalStars += repository.stars;
    if (!Number.isSafeInteger(totalStars)) throw new Error("GitHub stars total exceeds the supported range");
  }
  return { totalStars, repositoryCount: snapshot.repositories.length };
}

// Includes every public repository, even forks, archived repositories and repositories without a port.
// Explicit numbered pages keep credentials on the fixed API origin, never a URL from a Link header.
export async function fetchGitHubStars({ fetcher = fetch, token = "" } = {}) {
  const repositories = [];
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "living-code-landing-stars",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(`https://api.github.com/orgs/${GITHUB_ORGANIZATION}/repos`);
    url.search = new URLSearchParams({ type: "public", per_page: String(PAGE_SIZE), page: String(page), sort: "full_name", direction: "asc" }).toString();
    const response = await fetcher(url, { headers, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`GitHub stars request failed (${response.status})`);
    if (Number(response.headers.get("content-length")) > MAX_RESPONSE) throw new Error("GitHub stars response is too large");
    const text = await response.text();
    if (text.length > MAX_RESPONSE) throw new Error("GitHub stars response is too large");
    const batch = JSON.parse(text);
    if (!Array.isArray(batch) || batch.length > PAGE_SIZE) throw new Error("Invalid GitHub repositories response");
    for (const repository of batch) {
      if (repository?.private !== false || typeof repository.full_name !== "string" || repository.full_name.toLowerCase() !== `${GITHUB_ORGANIZATION}/${repository.name}`.toLowerCase()) {
        throw new Error("GitHub stars response contains an unexpected repository");
      }
      repositories.push({ name: repository.name, stars: repository.stargazers_count });
    }
    if (batch.length < PAGE_SIZE) {
      const snapshot = { schemaVersion: 1, organization: GITHUB_ORGANIZATION, repositories };
      summarizeGitHubStars(snapshot); // Never persist a partial, duplicate or malformed catalog.
      repositories.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      return snapshot;
    }
  }
  throw new Error("GitHub repositories exceeded the pagination limit");
}
