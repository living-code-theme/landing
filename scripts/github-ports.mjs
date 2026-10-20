const API = "https://api.github.com";
export const LIMITS = { manifest: 32 * 1024, readme: 512 * 1024, image: 10 * 1024 * 1024, listing: 4 * 1024 * 1024 };

export class GitHubError extends Error {
  constructor(status, path) {
    super(`GitHub ${status}: ${path}`);
    this.status = status;
  }
}

async function limitedBody(response, limit) {
  if (Number(response.headers.get("content-length")) > limit) throw new Error(`Response exceeds ${limit} bytes`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) { await response.body.cancel().catch(() => {}); throw new Error(`Response exceeds ${limit} bytes`); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** GitHub-only, read-only adapter. Tokens are never used for arbitrary README/image URLs. */
export function githubPorts({ token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN, fetchImpl = fetch } = {}) {
  async function request(path, { raw = false, limit = LIMITS.listing, missing = false } = {}) {
    const response = await fetchImpl(`${API}${path}`, {
      headers: {
        Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "living-code-port-discovery",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(20_000), redirect: "error",
    });
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new GitHubError(response.status, path);
    const bytes = await limitedBody(response, limit);
    return raw ? bytes : JSON.parse(bytes.toString("utf8"));
  }
  return {
    async repositories(org) {
      const result = [];
      for (let page = 1; ; page++) {
        const batch = await request(`/orgs/${org}/repos?type=public&per_page=100&page=${page}`);
        if (!Array.isArray(batch)) throw new Error("GitHub returned an invalid repository listing");
        result.push(...batch);
        if (batch.length < 100) return result;
      }
    },
    async revision(repo) {
      const commit = await request(`/repos/${repo.full_name}/commits/${encodeURIComponent(repo.default_branch)}`);
      if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error("GitHub returned an invalid commit SHA");
      return commit.sha;
    },
    file(repo, revision, path, limit) {
      return request(`/repos/${repo.full_name}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${revision}`, { raw: true, missing: true, limit });
    },
  };
}
