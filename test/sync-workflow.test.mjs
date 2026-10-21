import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/sync-ports.yml", import.meta.url), "utf8");
const steps = workflow.split(/^      - name: /m).slice(1);
const step = (name) => {
  const result = steps.find((block) => block.startsWith(`${name}\n`));
  assert.ok(result, name);
  return result;
};
const script = (name) => step(name).split("        run: |\n")[1]
  .split("\n").filter((line) => line.startsWith("          ")).map((line) => line.slice(10)).join("\n");

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "landing-workflow-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Workflow test");
  git("config", "user.email", "workflow@example.test");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", "/dev/null");
  mkdirSync(join(directory, "data/ports"), { recursive: true });
  writeFileSync(join(directory, "data/ports/.gitkeep"), "");
  mkdirSync(join(directory, "public/port-images"), { recursive: true });
  writeFileSync(join(directory, "data/ports.json"), '{"ports":[]}\n');
  writeFileSync(join(directory, "public/port-images/original.webp"), "existing capture");
  git("add", ".");
  git("commit", "-m", "Initial inputs");
  const head = git("rev-parse", "HEAD");
  const bin = join(directory, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), '#!/usr/bin/env bash\nif [[ "${MOCK_GH_FAILURE:-}" == true ]]; then exit 1; fi\nprintf "%s\\n" "$MOCK_LAST_SUCCESS"\n');
  chmodSync(join(bin, "gh"), 0o755);
  const run = (name, env = {}) => spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script(name)], {
    cwd: directory, encoding: "utf8", env: {
      ...process.env, PATH: `${bin}:${process.env.PATH}`,
      GITHUB_EVENT_NAME: "schedule", GITHUB_REPOSITORY: "living-code-theme/landing",
      GITHUB_OUTPUT: join(directory, "output"), GITHUB_STEP_SUMMARY: join(directory, "summary"),
      MOCK_LAST_SUCCESS: head, ...env,
    },
  });
  const output = () => Object.fromEntries(readFileSync(join(directory, "output"), "utf8").trim().split("\n").map((line) => line.split("=")));
  const origin = () => {
    const path = join(directory, "origin.git");
    git("init", "--bare", "--initial-branch=main", path);
    git("remote", "add", "origin", path);
    git("push", "origin", "HEAD:main");
  };
  return { directory, git, head, run, output, origin };
}

test("automation runs every 15 minutes and on main pushes or manual dispatch", () => {
  assert.match(workflow, /cron: "7,22,37,52 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:\n    branches: \[main\]/);
  assert.match(workflow, /github\.repository == 'living-code-theme\/landing' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /group: landing-production\n  cancel-in-progress: false/);
  assert.match(workflow, /timeout-minutes: 15/);
});

test("discovery stays in pinned core tooling while website installs and builds stay standalone", () => {
  const checkout = step("Check out reviewed discovery tooling");
  assert.match(checkout, /repository: living-code-theme\/core/);
  assert.match(checkout, /ref: [a-f0-9]{40}\n/);
  const revision = checkout.match(/ref: ([a-f0-9]{40})\n/)[1];
  assert.ok(readFileSync(new URL("../README.md", import.meta.url), "utf8").includes(`commit \`${revision}\``), "README and workflow must describe the same reviewed core pin");
  assert.match(checkout, /persist-credentials: false/);
  const discovery = step("Discover and validate public port repositories");
  assert.match(discovery, /working-directory: core/);
  assert.match(discovery, /pnpm sync:ports --landing "\$GITHUB_WORKSPACE\/landing"/);
  assert.doesNotMatch(discovery, /CLOUDFLARE_API_TOKEN/, "discovery receives bucket-scoped R2 credentials, not deployment credentials");
  assert.match(discovery, /vars\.PORT_ASSET_STORAGE \|\| 'git'/);
  assert.match(discovery, /--r2/);
  for (const action of [...workflow.matchAll(/uses: ([^\s]+)@([^\s]+)/g)]) assert.match(action[2], /^[a-f0-9]{40}$/, action[1]);
});

test("validation and a non-force push precede deployment of the already-tested assets", () => {
  const names = ["Check Cloudflare configuration", "Install website dependencies", "Build the website", "Test the built website", "Commit only validated snapshots and captures", "Reject an outdated production checkout", "Deploy validated assets to Cloudflare Workers"];
  const positions = names.map((name) => workflow.indexOf(`- name: ${name}`));
  assert.ok(positions.every((position, i) => position >= 0 && (!i || position > positions[i - 1])));
  const commit = step(names[4]);
  assert.match(commit, /if: steps\.changes\.outputs\.changed == 'true'/);
  assert.match(commit, /git push origin HEAD:main/);
  assert.doesNotMatch(commit, /--force|git (?:pull|rebase)|git add/);
  const deploy = step(names[6]);
  assert.match(deploy, /if: steps\.changes\.outputs\.publish == 'true'/);
  assert.match(deploy, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(deploy, /vars\.CLOUDFLARE_ACCOUNT_ID \|\| secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(deploy, /run: pnpm exec wrangler deploy/);
  assert.doesNotMatch(deploy, /pnpm (?:build|deploy)|login/);
});

for (const [name, env, publish] of [
  ["unchanged, already-published snapshot is a no-op", {}, "false"],
  ["manual dispatch forces validation and deployment", { GITHUB_EVENT_NAME: "workflow_dispatch" }, "true"],
  ["first run publishes without a previous successful workflow", { MOCK_LAST_SUCCESS: "" }, "true"],
  ["new website code or a failed deployment is retried without new port changes", { MOCK_LAST_SUCCESS: "a".repeat(40) }, "true"],
]) test(name, (t) => {
  const f = fixture(t);
  const result = f.run("Decide whether to publish", env);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.output(), { changed: "false", publish });
  assert.equal(f.git("rev-parse", "HEAD"), f.head);
});

test("discovered updates stage only the snapshot and captures, not unrelated files", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.directory, "data/ports.json"), '{"ports":[{"id":"new"}]}\n');
  writeFileSync(join(f.directory, "public/port-images/new.webp"), "new capture");
  writeFileSync(join(f.directory, `data/ports/new.${"a".repeat(64)}.json`), '{"schemaVersion":1}\n');
  writeFileSync(join(f.directory, "unrelated.txt"), "not a generated input");
  const result = f.run("Decide whether to publish");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.output(), { changed: "true", publish: "true" });
  assert.deepEqual(f.git("diff", "--cached", "--name-only").split("\n"), ["data/ports.json", `data/ports/new.${"a".repeat(64)}.json`, "public/port-images/new.webp"]);
});

test("a workflow-history API failure aborts rather than treating the deployment as current", (t) => {
  const f = fixture(t);
  assert.notEqual(f.run("Decide whether to publish", { MOCK_GH_FAILURE: "true" }).status, 0);
  assert.equal(f.git("rev-parse", "HEAD"), f.head);
});

test("missing Cloudflare credentials fail before a snapshot can be committed", (t) => {
  const f = fixture(t);
  for (const env of [
    { CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "account" },
    { CLOUDFLARE_API_TOKEN: "test-token", CLOUDFLARE_ACCOUNT_ID: "" },
  ]) assert.notEqual(f.run("Check Cloudflare configuration", env).status, 0);
  assert.equal(f.run("Check Cloudflare configuration", { CLOUDFLARE_API_TOKEN: "test-token", CLOUDFLARE_ACCOUNT_ID: "account" }).status, 0);
  assert.equal(f.git("rev-parse", "HEAD"), f.head);
});

test("an advanced production branch is rejected instead of deploying an outdated checkout", (t) => {
  const f = fixture(t);
  f.origin();
  assert.equal(f.run("Reject an outdated production checkout").status, 0);
  f.git("commit", "--allow-empty", "-m", "New production version");
  f.git("push", "origin", "HEAD:main");
  f.git("reset", "--hard", f.head);
  const result = f.run("Reject an outdated production checkout");
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Production advanced during validation/);
});
