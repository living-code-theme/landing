# Living Code landing

The standalone Astro/Tailwind application for **living-code.dev**, intended for `living-code-theme/landing`. Every build input is inside this directory. No sibling checkout, parent palette modules, symlinks to the core repository, or GitHub access is needed to build and test it.

## Develop, build and test

Use Node **22.22 or newer** (CI uses Node 24) and pnpm **12.9.0**.

```sh
pnpm install --frozen-lockfile
pnpm dev

pnpm build
pnpm test
pnpm preview
```

`pnpm build` writes the static website to `dist/`. Build before running the tests that inspect generated pages.

From the current monorepo root, the equivalent commands are `pnpm --dir site ...`.

## Verify independence

```sh
pnpm test:standalone
```

This copies only this directory to a fresh temporary location, excluding dependencies, build output and caches, then installs from the lockfile, builds and runs the entire landing test suite there. It does not copy or read the core's palette, scripts, CSS or screenshots. Add `--keep` to retain the isolated checkout for inspection.

## Build inputs and ownership

| Input | Owner and purpose |
|---|---|
| `data/theme.json` | Versioned core export: resolved palettes, roles, exact contrast measurements, glyph outlines and documentation anchors; includes a deterministic content fingerprint |
| `src/styles/theme.css` | Matching generated theme CSS, not a parent import |
| `data/ports.json`, `public/port-images/` | Derived from public port repositories by discovery; README, metadata and real captures are pinned to one commit |
| `data/legacy-ports.json`, `data/legacy-images.json`, `src/assets/legacy/` | Temporary local fallback for ports that have not migrated |
| `src/`, `public/fonts/`, favicon assets | Landing implementation and its local assets |
| `port.schema.json`, `scripts/`, `templates/` | Discovery, validation and the shared port README scaffold |

The core repository's `pnpm build` currently refreshes the theme export, matching CSS and legacy inputs in this directory. It **does not overwrite discovered port content or its image cache**. Core tests check that these exported bytes and contrast values match the source. Landing tests consume only the exported inputs and reject a below-AA theme snapshot.

After moving this directory into its own repository, theme refreshes should deliver these versioned inputs as a reviewed update from the core. A normal landing build never regenerates the core palette or fetches it over the network. The consumer-side extraction is complete; cross-repository theme delivery automation is separate work.

Keep legacy inputs until all ports have migrated. Discovered ports replace matching legacy slugs, and removed migrated ports are not resurrected. The legacy image index preserves the existing real-capture selection and fallback behavior; screenshots are copied byte-for-byte, not redrawn.

## Discover port updates

```sh
GH_TOKEN="$(gh auth token)" pnpm sync:ports --dry-run
GH_TOKEN="$(gh auth token)" pnpm sync:ports
pnpm build
pnpm test
```

The organization and ports are public; authentication increases GitHub rate limits. Visitors do not contact GitHub. Review and commit `data/ports.json` and `public/port-images/` after validation. Invalid updates keep the last working version; listing/auth/rate-limit failures abort rather than removing ports.

The existing monorepo workflow `.github/workflows/sync-ports.yml` already supports this directory at a repository root. Copy it to the landing repository's `.github/workflows/` during the repository migration. It is not required for local builds. Creating that repository, configuring branch protection, publishing and switching DNS are separate migration steps; this extraction does not perform them.

## Port README scaffold

```sh
pnpm new:port ../kitty --name "Kitty" --group "Terminals" --emoji "🐈"
```

This is a documentation/metadata scaffold, **not** an exporter of an application's theme implementation. Add the actual installable files, real captures and application-specific instructions before publishing. The shared template includes a flavor comparison grid and native flavor dropdowns. Each port owns the resulting README and emoji. Living Code's mascot is the chameleon, with 🦎 as its text-only shorthand.

## Hosting

Serve `dist/` at the site root or a custom domain. The current root-relative URLs do not support a default `/landing/` project URL without additional base-path work. The canonical URL is configured in `astro.config.mjs`.

## License and attribution

- Application code: [MIT](LICENSE), © Elliot Luque.
- JetBrains Mono font and glyph outlines, including the `[lc]` mark: SIL Open Font License 1.1; see `public/fonts/OFL-JetBrainsMono.txt`.
- Geist font: see `public/fonts/OFL-Geist.txt`.
- Application icons: supplied by Simple Icons, with the established text fallback where no logo exists.
