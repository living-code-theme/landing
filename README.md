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
pnpm test:browser  # Chrome/Chromium; set CHROME_BIN if it is not named google-chrome.
pnpm preview
```

`pnpm build` writes the static website to `dist/`. Build before running the tests that inspect generated pages.
Workflow regression tests also require Git and Bash; they use temporary repositories and never contact GitHub or deploy.
Browser regressions start a temporary local HTTPS Wrangler asset server and Chrome profile, checking screenshot requests, no-script and
failed-personalization fallbacks, CSP enforcement, navigation, and controls. They never deploy. The local test browser
accepts Wrangler's self-signed certificate; production TLS validation is unchanged.

## What belongs here

| Input | Ownership |
|---|---|
| `astro.config.mjs`, `src/` | Astro bootstrap, pages, layouts, styling, browser interactions and presentation helpers |
| `data/theme.json`, `src/styles/theme.css` | Versioned core exports: resolved palettes, roles, contrast measurements, glyph outlines and matching CSS |
| `data/ports.json`, `data/ports/` | Validated metadata index and immutable per-port guide documents delivered by core |
| `public/port-images/` | Default local capture store; optional R2 mode pins external capture URLs, dimensions, hashes and sizes instead |
| `public/port.schema.json` | Static copy of core's schema, served at <https://living-code.dev/port.schema.json> for editor autocomplete |
| `src/assets/fonts/`, `public/fonts/`, favicon assets | Bundled/fingerprinted font binaries, public license files and icons; brand sources live in core |
| `data/image-variants.json`, `public/image-variants/` | Website-owned, content-addressed responsive screenshot derivatives, prepared explicitly and committed |
| `public/social/<slug>.jpg` | Optional 1280×640 share cards; matching port pages emit Open Graph and Twitter image metadata. Update the card when its app preview changes. |
| `test/` | Website rendering, interactions, build output and standalone-input checks |
| `wrangler.jsonc` | Website deployment configuration |

Reusable maintainer logic belongs in [core](https://github.com/living-code-theme/core): discovery, manifest and README
validation, README templates, scaffolding, local-port previews, theme generation and isolated-checkout verification.
There are no port-maintenance scripts or templates here and no runtime dependency on core. Rendering/sanitizing repository
Markdown, grouping ports and preparing responsive screenshot derivatives remain website concerns. The only refresh script
here is `pnpm images:prepare`; it does not discover repositories or execute port code.

`data/ports.json` is the only port index. Schema 2 contains metadata and references into `data/ports/`, not every
README. Each port page loads and verifies only its own content-addressed guide document. Core derives guide v1's
Markdown sections from the authoritative README; GitHub table/dropdown presentation is not a website data contract.
The existing schema-1 catalog remains readable during rollout, without merging any fallback registry.

Only successfully discovered public repositories appear. An empty repository is not a published port. No legacy
catalog or screenshot source can add entries. Discovery/build never executes port scripts.

Category presentation order is fixed in `src/lib/ports.mjs`: Editors, AI & Agents, Terminals, CLI & TUI, Browsers, Apps,
Web (including Web & code), then Theme systems. Input refreshes do not change this order. Only populated
categories appear; new categories follow the established ones in discovery order, and ports within each
category retain their discovery order.

The finder opens immediately and loads one shared, content-addressed metadata asset on first use; failure or no
JavaScript retains the normal full-catalog link. The homepage ships at most five fallback previews, while **every
captured port stays eligible** for the existing per-browser rotating selection. Near the gallery, only the chosen previews
are fetched from shared static fragments rendered by the same component. Screenshot sources stay inert until that selection
settles, so visitors never download a fallback set and immediately replace it. The gallery loads small current-flavor
thumbnails and one selected full capture; other full captures load on hover/focus or selection, not all at once.
Both complete port lists and all port pages remain static and accessible without JavaScript, including real gallery
images in `noscript` fallbacks. In external capture mode, full-size originals stay at the public asset origin;
responsive derivatives are committed locally. The website compiler never downloads images.

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

Authenticated discovery batches up to 100 repository heads per query and fetches only changed public inputs at
immutable revisions. Large catalogs require `GH_TOKEN`; small anonymous runs remain supported. Public blob downloads
use GitHub's fixed CDN origin without an authorization header, not thousands of API content requests. Invalid port
updates retain the last working snapshot; incomplete listings and authentication/rate-limit failures abort without
removing ports. Visitors never query GitHub for discovery. Normal website builds never refresh these inputs.

For a manual refresh, review the changed data/assets in the landing checkout, then run `pnpm images:prepare`,
`pnpm build`, `pnpm test` and `pnpm test:browser` there before committing. The automated equivalent is configured below; ordinary local builds stay offline.

### Responsive screenshot preparation

Run `pnpm images:prepare` in the landing after refreshing capture inputs. This is the **only** website command that
may download screenshots. It accepts only content-addressed captures from the snapshot's explicit HTTPS asset base
(or local `public/port-images/`), verifies source hashes, pinned remote sizes and decoded dimensions, and generates
240/480/960/1600px WebP variants without upscaling. Downloads omit credentials, reject redirects, have a timeout and
are size-bounded. It reuses verified existing variants without network access and publishes the new manifest only after
all captures succeed, then prunes obsolete derivatives. Commit `data/image-variants.json` and `public/image-variants/`
alongside the refreshed inputs. The current derivative set adds roughly 18 MB; full-size remote originals are not copied
into Git. Normal builds never fetch images: an unprepared capture (a local-port preview, or core's synthetic scale
fixture) falls back to its original as one truthful source, never a fake responsive srcset, and the build prints a
warning. Both `pnpm deploy` and CI run `pnpm images:prepare` before every build, so production always ships variants;
CI also commits any derivatives that were missing. Changing the pinned Sharp version or resize recipe regenerates them.

## Automatic discovery and deployment

[`.github/workflows/sync-ports.yml`](.github/workflows/sync-ports.yml) runs on `main` pushes, manual dispatch, and once
a day at **00:07 UTC**. GitHub can delay scheduled runs; this is polling, not a delivery SLA.
It runs only in `living-code-theme/landing` on `main`.

The workflow checks out landing and a **pinned, reviewed core commit** into separate directories. It installs core's
locked dependencies and runs `pnpm sync:ports --landing <checkout>` there. Port scripts are never executed.
Discovery validates metadata, README and captures from one published revision per repository, keeping the previous
working snapshot for an invalid port update. Global listing/authentication failures stop the run without removals.

The workflow installs landing and prepares responsive derivatives before deciding whether publication is needed.
When publication is needed, it builds and runs both unit/build and browser tests, commits **only** `data/ports.json`,
`data/ports/`, local `public/port-images/`, `data/image-variants.json` and `public/image-variants/` changes, then deploys
the already-tested `dist/` to the `living-code-landing` Cloudflare Worker.
It deploys in the same run because a bot commit made with `GITHUB_TOKEN` does not trigger another Actions workflow.
Ordinary website pushes also go through this validation/deployment path.

Unchanged, already-published runs are no-ops. Manual dispatch forces a build/test/deploy. The workflow compares the
checkout with the last successful `main` run so a failed deployment is retried on the next poll even without another
port change; a follow-up poll can conservatively redeploy a bot-created sync commit. Runs are serialized. If `main`
advances during validation, the run fails rather than force-pushing or merging an untested combination. Inspect the
Actions log, rerun the workflow, or let the next scheduled run retry.

### One-time activation

1. Ensure core's `main` branch includes **commit `ee6b2324148015d5c4e0c3de683b3eb658e23f46`**, the tooling revision
   pinned in the workflow. It supports optional preview sections for image-free READMEs, the branded README header,
   and single-symbol port emoji such as π, while retaining strict validation of declared captures. That commit is published; update the pin explicitly when adopting a reviewed tooling change.
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

### Scalable publication and optional R2

The pinned core revision supports schema-2 publication and batched discovery. The first updated sync converts a
schema-1 catalog into the small index and immutable per-port documents; local fixtures are never published.
For later tooling changes, publish/review core first, then advance the exact SHA in this workflow. Capture storage
remains local/Git unless a maintainer explicitly enables and configures R2.

For optional R2 capture storage, set the Actions variable **`PORT_ASSET_STORAGE=r2`**, plus **`R2_BUCKET`** and
**`R2_PUBLIC_URL`** as Actions variables or secrets (variables take precedence). Store **`R2_ACCESS_KEY_ID`** /
**`R2_SECRET_ACCESS_KEY`** as secrets, scoped to object read/write in that bucket. The workflow reuses
`CLOUDFLARE_ACCOUNT_ID`. Set the storage mode last, after the bucket, public domain and credentials are ready.
Without `PORT_ASSET_STORAGE=r2`, the workflow stays in **`git`** mode and does not upload. Default **`git`** mode
requires none of these optional settings.
Uploads finish before the index can reference their immutable public URLs; a failed upload does not publish dangling
captures. Bucket creation, public access/domain setup and remote retention are explicit maintainer operations, not
part of the workflow. See core's [publication guide](https://github.com/living-code-theme/core/blob/main/docs/PORT-PUBLICATION.md).

Use this workflow as the sole automated production deployer. If Cloudflare Workers Builds was connected directly to
GitHub, disable its automatic Git deployment trigger to avoid a competing deployment outside this validation flow.
The workflow uses `wrangler.jsonc`; it does not change custom-domain routing or DNS.

### Publish one port at a time

1. Push the completed port (including `port.json`, README, theme files and declared images) to its public repository's
   default branch. Merely creating the GitHub repository is not enough.
2. The next scheduled sync discovers it, validates the website and deploys it. For immediate feedback, manually dispatch
   **sync-ports** on landing's `main`. Each valid repository adds one port; no website registry edit or completion of
   other ports is required.
3. Check `/ports/<slug>/` on the deployed site. **Source** opens the owning repository, and the flavor preview uses
   that repository's cached captures. The hidden HTML `data-port-revision` attribute records the full imported
   revision for smoke checks; it is not shown in the page's details.

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

Port pages render a versioned installation guide compiled from the repository-owned README, with configuration, compatibility
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

## Verify 400-port capacity (from core)

```sh
pnpm test:scale --landing ../landing --keep --report /tmp/living-code-scale.json
```

This creates a marked, synthetic 400-port fixture in an isolated copy, not the production catalog. It tests cold,
unchanged, changed, failing and removed ports through the discovery/storage adapters, then performs a real frozen
install, offline build and website tests. Existing port documentation and real captures are not modified. GitHub/R2
network responses are simulated; production network latency and credentials still need normal rollout verification.

## Hosting

Deploy to **Cloudflare Workers** with static assets (no Worker script or server adapter required):

```sh
pnpm exec wrangler login  # Once; CI can use CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
pnpm deploy
```

`pnpm deploy` prepares screenshot derivatives, builds and publishes `dist/` to the `living-code-landing` Worker. `wrangler.jsonc`
enables `workers.dev`, trailing-slash URLs and the generated `404.html`. HTTPS is enforced outside the repository:
the `living-code.dev` zone has **Always Use HTTPS** and HSTS (with subdomains) enabled, and every `.dev` domain
(including `workers.dev`) is on browsers' HSTS preload list. Keep both zone settings on; static assets then cost no
Worker invocations. For a local preview with headers, use `pnpm build && pnpm exec wrangler dev --local-protocol https`
and accept the local self-signed certificate. Plain `pnpm preview` does not apply `_headers`.

`public/_headers` sets HSTS (`includeSubDomains; preload`, matching the zone setting; every subdomain must serve HTTPS), framing protection, nosniff, referrer and
permissions policies. The build replaces its CSP placeholder with SHA-256 hashes of every emitted executable inline script
across all pages, so client-router destinations work under the original document's policy. JavaScript never allows
`unsafe-inline` or `unsafe-eval`; styles allow inline declarations for the existing theme/animation system.
The image policy permits this site and `https://assets.living-code.dev`; if the configured capture origin changes, review
and update that allowlist as well. CSP is enforced on the deployed assets and exercised by browser regressions.

Fingerprinted `/_astro/*` assets (including bundled fonts), `/image-variants/*`, `/port-finder/*` and `/app-previews/*`
are cached for a year with `immutable`. HTML retains normal revalidation. On another static host, apply the generated
`dist/_headers` policies and configure an HTTP-to-HTTPS redirect; Astro alone does not enforce transport security.

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
