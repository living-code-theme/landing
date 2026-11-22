import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import snapshot from "../data/github-stars.json" with { type: "json" };
import { fetchGitHubStars, GITHUB_ORGANIZATION, summarizeGitHubStars } from "../src/lib/github-stars.mjs";
import { syncGitHubStars } from "../scripts/sync-github-stars.mjs";

const repository = (name, stars = 0, extra = {}) => ({ name, full_name: `${GITHUB_ORGANIZATION}/${name}`, private: false, stargazers_count: stars, ...extra });
const response = batch => new Response(JSON.stringify(batch), { headers: { "content-type": "application/json" } });

test("organization stars include all public pages, forks, archives and repositories without ports", async () => {
  const first = Array.from({ length: 100 }, (_, i) => repository(`repo-${i}`, i));
  const last = [repository("core", 7, { archived: true }), repository("fork", 4, { fork: true })];
  const requests = [];
  const data = await fetchGitHubStars({ token: "test-read-only-token", fetcher: async (url, options) => {
    requests.push(url);
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(url.pathname, `/orgs/${GITHUB_ORGANIZATION}/repos`);
    assert.equal(url.searchParams.get("type"), "public");
    assert.equal(url.searchParams.get("per_page"), "100");
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers.Authorization, "Bearer test-read-only-token");
    assert.ok(options.signal instanceof AbortSignal);
    return response(url.searchParams.get("page") === "1" ? first : last);
  } });
  assert.deepEqual(requests.map(url => url.searchParams.get("page")), ["1", "2"]);
  assert.deepEqual(summarizeGitHubStars(data), { totalStars: 4961, repositoryCount: 102 });
  assert.deepEqual(data.repositories[0], { name: "core", stars: 7 });
  assert.equal(JSON.stringify(data).includes("test-read-only-token"), false);
});

test("an exact full page requests the next page, without sending authorization when unauthenticated", async () => {
  let requests = 0;
  const data = await fetchGitHubStars({ fetcher: async (_url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    return response(++requests === 1 ? Array.from({ length: 100 }, (_, i) => repository(`repo-${i}`)) : []);
  } });
  assert.equal(requests, 2);
  assert.deepEqual(summarizeGitHubStars(data), { totalStars: 0, repositoryCount: 100 });
});

test("malformed counts, duplicate names, unexpected owners and private repositories cannot produce a total", async () => {
  for (const repositories of [
    [{ name: "core", stars: -1 }], [{ name: "core", stars: 1.5 }], [{ name: "core", stars: "3" }],
    [{ name: "core", stars: 1 }, { name: "CORE", stars: 2 }], [{ name: "../escape", stars: 1 }],
    [{ name: "core", stars: Number.MAX_SAFE_INTEGER }, { name: "landing", stars: 1 }], [null],
  ]) assert.throws(() => summarizeGitHubStars({ schemaVersion: 1, organization: GITHUB_ORGANIZATION, repositories }));
  for (const batch of [
    { message: "API unavailable" }, [repository("core", 3, { private: true })],
    [repository("core", 3, { full_name: "another-organization/core" })],
    [repository("core", 3), repository("core", 3)],
  ]) await assert.rejects(fetchGitHubStars({ fetcher: async () => response(batch) }));
  assert.throws(() => summarizeGitHubStars({ ...snapshot, schemaVersion: 2 }));
  assert.throws(() => summarizeGitHubStars({ ...snapshot, organization: "another-organization" }));
  assert.deepEqual(summarizeGitHubStars({ schemaVersion: 1, organization: GITHUB_ORGANIZATION, repositories: [] }), { totalStars: 0, repositoryCount: 0 });
});

test("snapshot updates are deterministic; unchanged totals and repositories do not churn the file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "landing-stars-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // A URL containing an encoded space must remain a valid filesystem destination.
  const output = pathToFileURL(join(directory, "github stars.json"));
  let batch = [repository("landing", 0), repository("core", 3)];
  const fetcher = async () => response(batch);
  assert.deepEqual(await syncGitHubStars({ output, fetcher }), { changed: true, totalStars: 3, repositoryCount: 2 });
  const before = await stat(output);
  batch.reverse();
  assert.deepEqual(await syncGitHubStars({ output, fetcher }), { changed: false, totalStars: 3, repositoryCount: 2 });
  assert.equal((await stat(output)).mtimeMs, before.mtimeMs);
  batch = [repository("core", 2), repository("landing", 0)]; // Stars can decrease.
  assert.deepEqual(await syncGitHubStars({ output, fetcher }), { changed: true, totalStars: 2, repositoryCount: 2 });
  assert.deepEqual((await readdir(directory)), ["github stars.json"], "no temporary file remains");
});

test("a later-page error or rate limit never replaces the previous complete snapshot with partial data or zero", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "landing-stars-failure-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "stars.json");
  await syncGitHubStars({ output, fetcher: async () => response([repository("core", 3)]) });
  const before = await readFile(output, "utf8");
  await assert.rejects(syncGitHubStars({ output, fetcher: async url => url.searchParams.get("page") === "1"
    ? response(Array.from({ length: 100 }, (_, i) => repository(`repo-${i}`, 1)))
    : new Response("rate limit", { status: 403 }) }), /403/);
  assert.equal(await readFile(output, "utf8"), before);
  await assert.rejects(syncGitHubStars({ output, fetcher: async () => { throw new Error("network unavailable"); } }), /network unavailable/);
  assert.equal(await readFile(output, "utf8"), before);
});

test("every generated page renders the same checked-in total in both header layouts and footer, without client-side GitHub API requests", async () => {
  const { totalStars, repositoryCount } = summarizeGitHubStars(snapshot);
  const dist = new URL("../dist/", import.meta.url);
  const pages = (await readdir(dist, { recursive: true })).filter(path => path.endsWith(".html"));
  assert.ok(pages.length > 0);
  for (const path of pages) {
    const html = await readFile(new URL(path, dist), "utf8");
    for (const [region, expected] of [["header", 2], ["footer", 1]]) {
      const content = html.match(new RegExp(`<${region}[\\s\\S]*?<\\/${region}>`))?.[0];
      assert.ok(content, `${path}: ${region}`);
      assert.equal([...content.matchAll(/data-github-stars/g)].length, expected, `${path}: ${region}`);
      const links = [...content.matchAll(/<a[^>]*href="https:\/\/github.com\/living-code-theme"[\s\S]*?<\/a>/g)];
      assert.equal(links.length, expected, `${path}: ${region}`);
      for (const [link] of links) {
        assert.ok(link.includes(`>${totalStars.toLocaleString("en-US")}</span>`), path);
        assert.ok(link.includes(`across all ${repositoryCount} public`), path);
        assert.match(link, /aria-hidden="true" focusable="false"/);
      }
    }
  }
  for (const file of (await readdir(new URL("_astro/", dist))).filter(file => file.endsWith(".js"))) {
    assert.doesNotMatch(await readFile(new URL(`_astro/${file}`, dist), "utf8"), /api\.github\.com/);
  }
});

test("the hero stays free of GitHub counters", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const hero = html.match(/<section[^>]*id="hero"[\s\S]*?<\/section>/)?.[0];
  assert.ok(hero);
  assert.doesNotMatch(hero, /data-github-stars/);
});
