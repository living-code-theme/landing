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

## What belongs here

| Input | Ownership |
|---|---|
| `astro.config.mjs`, `src/` | Astro bootstrap, pages, layouts, styling, browser interactions and presentation helpers |
| `data/theme.json`, `src/styles/theme.css` | Versioned core exports: resolved palettes, roles, contrast measurements, glyph outlines and matching CSS |
| `data/ports.json`, `public/port-images/` | Validated port snapshots and captures delivered by core's discovery tooling |
| `data/legacy-ports.json`, `data/legacy-images.json`, `src/assets/legacy/` | Temporary committed fallback for ports that have not migrated |
| `public/port.schema.json` | Static copy of core's schema, served at <https://living-code.dev/port.schema.json> for editor autocomplete |
| `public/fonts/`, favicon assets | Local website assets; brand sources live in core |
| `test/` | Website rendering, interactions, build output and standalone-input checks |
| `wrangler.jsonc` | Website deployment configuration |

Reusable maintainer logic belongs in [core](https://github.com/living-code-theme/core): discovery, manifest and README
validation, README templates, scaffolding, local-port previews, theme generation and isolated-checkout verification.
There are no maintenance scripts or templates here and no runtime dependency on core. Rendering/sanitizing repository
Markdown, grouping ports and adapting committed data for the UI remain website concerns.

Keep legacy inputs until all ports have migrated. Discovered ports replace matching legacy slugs; removing a migrated
port does not resurrect its old entry. Legacy screenshots remain real, byte-for-byte captures.

## Refresh website inputs (from core)

The following commands run **in a core checkout**, after `pnpm install --frozen-lockfile` there. Pass the website
checkout explicitly; it does not need to be a sibling or have a particular directory name.

```sh
# Theme JSON, CSS and the hosted schema; does not touch discovered or legacy port content.
pnpm build
pnpm export:landing --landing ../landing

# README, metadata and real images pinned to one commit per public port repository.
GH_TOKEN="$(gh auth token)" pnpm sync:ports --landing ../landing --dry-run
GH_TOKEN="$(gh auth token)" pnpm sync:ports --landing ../landing
```

Authentication is optional for public repositories and increases GitHub rate limits. Invalid port updates retain the
last working snapshot; incomplete listings and authentication/rate-limit failures abort without removing ports.
Visitors never contact GitHub. Normal website builds never refresh these inputs.

Review the changed data/assets in the landing checkout, then run `pnpm build` and `pnpm test` there before committing.
Cross-repository delivery/PR automation is not configured by this repository.

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

For Cloudflare Workers Builds, use `pnpm install --frozen-lockfile` to install, `pnpm build` to build and
`pnpm exec wrangler deploy` to deploy. Use Node 24 and this repository as the project root.

Custom-domain routing and DNS are not changed by this configuration. Attach `living-code.dev` to the Worker when
ready; the canonical URL is in `astro.config.mjs`. Alternatively, serve `dist/` at any site root. Root-relative URLs
do not support a default `/landing/` project URL without additional base-path work.

## License and attribution

- Application code: [MIT](LICENSE), © Elliot Luque.
- JetBrains Mono font and glyph outlines, including the `[lc]` mark: SIL Open Font License 1.1; see `public/fonts/OFL-JetBrainsMono.txt`.
- Geist font: see `public/fonts/OFL-Geist.txt`.
- Application icons: Simple Icons, with a text fallback where no logo exists.
