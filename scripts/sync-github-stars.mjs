// Explicit maintenance command, never part of the offline website build or browser runtime.
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchGitHubStars, summarizeGitHubStars } from "../src/lib/github-stars.mjs";

export async function syncGitHubStars({ output = new URL("../data/github-stars.json", import.meta.url), fetcher = fetch, token = "" } = {}) {
  const snapshot = await fetchGitHubStars({ fetcher, token });
  const bytes = `${JSON.stringify(snapshot, null, 2)}\n`;
  let previous;
  try { previous = await readFile(output, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const changed = bytes !== previous;
  if (changed) {
    const temporary = `${output instanceof URL ? fileURLToPath(output) : output}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, output);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return { changed, ...summarizeGitHubStars(snapshot) };
}

if (import.meta.main) {
  try {
    const result = await syncGitHubStars({ token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "" });
    console.log(`GitHub stars: ${result.totalStars} across ${result.repositoryCount} public repositories (${result.changed ? "updated" : "unchanged"}).`);
  } catch (error) {
    console.error(`Could not refresh GitHub stars; existing snapshot retained. ${error.message}`);
    process.exitCode = 1;
  }
}
