# Living Code landing

The standalone Astro/Tailwind website for **living-code.dev**, intended for `living-code-theme/landing`.
This repository owns the website, not the theme or port-maintenance tooling. Every build input is committed locally:
no core checkout, symlinks, GitHub access or palette generation is needed to install, build or test it.

## Develop, build and test

Use Node **22.22 or newer** and pnpm **12.9.0**.

```sh
pnpm install --frozen-lockfile
pnpm dev

pnpm build
pnpm test
pnpm preview
```

`pnpm build` writes the static website to `dist/`. Build before running the tests that inspect generated pages.
Workflow regression tests also require Git and Bash; they use temporary repositories and never contact GitHub or deploy.

## What belongs here

| Input | Ownership |
|---|---|
| `astro.config.mjs`, `src/` | Astro bootstrap, pages, layouts, styling, browser interactions and presentation helpers |
| `data/theme.json`, `src/styles/theme.css` | Versioned core exports: resolved palettes, roles, contrast measurements, glyph outlines and matching CSS |
| `data/ports.json`, `public/port-images/` | Validated port snapshots and captures delivered by core's discovery tooling |
| `public/port.schema.json` | Static copy of core's schema, served at <https://living-code.dev/port.schema.json> for editor autocomplete |
| `public/fonts/`, favicon assets | Local website assets; brand sources live in core |
| `test/` | Website rendering, interactions, build output and standalone-input checks |
| `wrangler.jsonc` | Website deployment configuration |

Reusable maintainer logic belongs in [core](https://github.com/living-code-theme/core): discovery, manifest and README
validation, README templates, scaffolding, local-port previews, theme generation and isolated-checkout verification.
There are no maintenance scripts or templates here and no runtime dependency on core. Rendering/sanitizing repository
Markdown, grouping ports and adapting committed data for the UI remain website concerns.

`data/ports.json` is the only port catalog. Only successfully discovered public repositories appear in the finder,
showcase and generated port pages. There is no legacy catalog, installation-text fallback or legacy screenshot source.
An empty repository does not count as a published port. A small catalog is intentional while ports migrate.
The snapshot's `migratedSlugs` field remains compatible with core's discovery format, but does not add website entries.

## Refresh website inputs (from core)

The following commands run **in a core checkout**, after `pnpm install --frozen-lockfile` there. Pass the website
checkout explicitly; it does not need to be a sibling or have a particular directory name.

```sh
# Theme JSON, CSS and the hosted schema; does not touch discovered port content.
pnpm build
pnpm export:landing --landing ../landing

# README, metadata and real images pinned to one commit per public port repository.
GH_TOKEN="$(gh auth token)" pnpm sync:ports --landing ../landing --dry-run
GH_TOKEN="$(gh auth token)" pnpm sync:ports --landing ../landing
```

Authentication is optional for public repositories and increases GitHub rate limits. Invalid port updates retain the
last working snapshot; incomplete listings and authentication/rate-limit failures abort without removing ports.
Visitors never contact GitHub. Normal website builds never refresh these inputs.

For a manual refresh, review the changed data/assets in the landing checkout, then run `pnpm build` and `pnpm test`
there before committing. The automated equivalent is configured below; ordinary local builds stay offline.

## Automatic discovery and deployment

[`.github/workflows/sync-ports.yml`](.github/workflows/sync-ports.yml) runs on `main` pushes, manual dispatch, and every
15 minutes at minutes **7, 22, 37 and 52 UTC**. GitHub can delay scheduled runs; this is polling, not a delivery SLA.
It runs only in `living-code-theme/landing` on `main`.

The workflow checks out landing and a **pinned, reviewed core commit** into separate directories. It installs core's
locked dependencies and runs `pnpm sync:ports --landing <checkout>` there. Port scripts are never executed.
Discovery validates metadata, README and captures from one published revision per repository, keeping the previous
working snapshot for an invalid port update. Global listing/authentication failures stop the run without removals.

When publication is needed, the workflow installs landing, builds and tests it, commits **only** `data/ports.json`
and `public/port-images/`, then deploys the already-tested `dist/` to the `living-code-landing` Cloudflare Worker.
It deploys in the same run because a bot commit made with `GITHUB_TOKEN` does not trigger another Actions workflow.
Ordinary website pushes also go through this validation/deployment path.

Unchanged, already-published runs are no-ops. Manual dispatch forces a build/test/deploy. The workflow compares the
checkout with the last successful `main` run so a failed deployment is retried on the next poll even without another
port change; a follow-up poll can conservatively redeploy a bot-created sync commit. Runs are serialized. If `main`
advances during validation, the run fails rather than force-pushing or merging an untested combination. Inspect the
Actions log, rerun the workflow, or let the next scheduled run retry.

### One-time activation

1. Ensure core's `main` branch includes **commit `538cf1fb5ae98ac060ca1b612b28b7bb449db240`**, the tooling revision
   pinned in the workflow. That commit is published; update the pin explicitly when adopting a reviewed tooling change.
2. In landing's **Settings → Secrets and variables → Actions**, configure:
   - Secret **`CLOUDFLARE_API_TOKEN`**: a Cloudflare API token allowed to deploy Workers/static assets in this Worker's
     account (the **Edit Cloudflare Workers** template, scoped to that account). Do not copy a personal Wrangler OAuth
     session into CI.
   - Variable **`CLOUDFLARE_ACCOUNT_ID`**: the Worker's Cloudflare account ID. An Actions secret with the same name is
     also supported.
3. Commit/push the website changes and workflow to landing's `main`. GitHub Actions must be enabled, and branch rules
   must permit `github-actions[bot]` to push generated inputs. No cross-repository PAT or port-repository secret is needed.
4. Use Actions → **sync-ports** → **Run workflow** on `main` to verify discovery, tests and Cloudflare deployment.
   Once working, publish ports normally and let the schedule pick them up.

Use this workflow as the sole automated production deployer. If Cloudflare Workers Builds was connected directly to
GitHub, disable its automatic Git deployment trigger to avoid a competing deployment outside this validation flow.
The workflow uses `wrangler.jsonc`; it does not change custom-domain routing or DNS.

### Publish one port at a time

1. Push the completed port (including `port.json`, README, theme files and declared images) to its public repository's
   default branch. Merely creating the GitHub repository is not enough.
2. The next scheduled sync discovers it, validates the website and deploys it. For immediate feedback, manually dispatch
   **sync-ports** on landing's `main`. Each valid repository adds one port; no website registry edit or completion of
   other ports is required.
3. Check `/ports/<slug>/` on the deployed site. **Source** opens the owning repository, **Snapshot** links to the README
   at the imported commit, and the flavor preview uses that repository's cached captures. The HTML's
   `data-port-revision` attribute records the full imported revision for smoke checks.

The manual discovery commands above and `pnpm deploy` remain available for local verification or recovery.
Normal website installs, builds and tests never contact core or GitHub.

## Port authoring and preview (from core)

```sh
pnpm new:port ../kitty --name "Kitty" --group "Terminals" --emoji "🐈"
pnpm preview:port ../kitty --landing ../landing
# Optional: --port 4412
```

The scaffold writes documentation and metadata, not an application's theme implementation. Add installable files,
real captures and completed instructions before publishing. See core's [port guide](https://github.com/living-code-theme/core/blob/main/docs/PORTS.md).

Previewing validates the draft through the discovery pipeline and builds an isolated website copy. It does not query
GitHub or edit the production catalog. The page identifies itself as a local preview; its revision is a content
fingerprint, not a published commit. Re-run after editing the port.

Port pages show an installation guide derived from the repository-owned README, with configuration, compatibility
and included files in collapsed details. The website's flavor controls replace the README's duplicate flavor grid.
The GitHub link points to the repository for the full documentation.

## Verify independence (from core)

```sh
pnpm test:standalone --landing ../landing
# Optional: --keep to retain the isolated checkout
```

Core's runner copies only website inputs to a temporary directory, without dependencies, build output, caches or
credentials. It installs from the landing lockfile, builds and runs the website tests with no core checkout beside it.
The runner is tooling owned by core, not part of the website bootstrap.

## Hosting

Deploy to **Cloudflare Workers** with static assets (no server adapter required):

```sh
pnpm exec wrangler login  # Once; CI can use CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
pnpm deploy
```

`pnpm deploy` builds and publishes `dist/` to the `living-code-landing` Worker. `wrangler.jsonc` enables `workers.dev`,
trailing-slash URLs and the generated `404.html`. For a local Worker preview, run `pnpm build && pnpm exec wrangler dev`.

Production automation is the **sync-ports** GitHub Actions workflow above, using Node 24 and the same Wrangler
configuration. Avoid enabling a second automatic deployer in Cloudflare Workers Builds.

Custom-domain routing and DNS are not changed by this configuration. Attach `living-code.dev` to the Worker when
ready; the canonical URL is in `astro.config.mjs`. Alternatively, serve `dist/` at any site root. Root-relative URLs
do not support a default `/landing/` project URL without additional base-path work.

## License and attribution

- Application code: [MIT](LICENSE), © Elliot Luque.
- JetBrains Mono font and glyph outlines, including the `[lc]` mark: SIL Open Font License 1.1; see `public/fonts/OFL-JetBrainsMono.txt`.
- Geist font: see `public/fonts/OFL-Geist.txt`.
- Application icons: Simple Icons, with a text fallback where no logo exists.
