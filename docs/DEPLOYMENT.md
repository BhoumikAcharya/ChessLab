# ChessLab static deployment

## Current state

No domain or live Hostinger destination has been selected. The application can be
built and packaged without one. Nothing in the release command publishes files,
changes DNS, creates an account, or purchases a domain.

## Make the upload package

Requirements: a supported Node version, npm, and the `zip`/`unzip` commands (present
on this project's Mac development machine).

```sh
npm ci
npm run release
```

This runs tests, lint, the TypeScript/production build, and release verification.
Outputs:

- `release/chesslab-hostinger.zip`: extract its **contents** into the website folder.
- `release/manifest.json`: file sizes and SHA-256 digests, plus archive checksum and engine source commit.
- `release/UPLOAD.txt`: short upload instructions.

Each ZIP starts fresh; obsolete hashed bundles cannot remain from an older build.
The ZIP contains the app, engine, GPL notices, source archive, build instructions,
and `.htaccess`. It contains no imported browser games, backups, credentials,
`node_modules`, development server, or required server runtime.

The package is about 61 MiB because it includes the full unmodified Stockfish
source archive. That archive is an optional download; the application does not
fetch it during startup or analysis.

## Upload when a destination is available

1. Export a JSON backup from the current app before moving to a different origin.
   IndexedDB is tied to the exact browser origin; localhost data will not appear
   automatically on a domain or a different subdomain/port.
2. Back up any existing files in the chosen Hostinger folder. Use a clean target
   folder for the first upload; do not overwrite another site.
3. In Hostinger File Manager, upload the ZIP and extract it into `public_html/`, or
   a chosen subdirectory such as `public_html/chesslab/`. The resulting folder must
   contain `index.html`, `assets/`, `stockfish/`, `.htaccess`, and the notices file.
   Do not leave an extra enclosing `dist/` directory.
4. Preserve `stockfish/source/stockfish-16.0.0-source.tgz` and the accompanying
   instructions and GPL text. The Settings screen links to them.
5. Open the final HTTPS address. Hash routing and relative asset URLs support both
   the site root and subdirectory hosting. No SPA rewrite rule or Node runtime is needed.
6. Restore the backup on the new origin. Existing games/preferences there are
   preserved; preferences from the backup are restored only when none exist.

The included `.htaccess` supplies the WASM MIME type and prevents transparent
HTTP decompression of the downloadable source archive. It also asks browsers to
revalidate index.html. The final server's behavior must still be checked; Vite
preview does not interpret Apache directives.

## Live acceptance checks

Check these on the actual final origin, rather than assuming local results carry over:

- Root HTML and hashed JS/CSS assets load over HTTPS.
- Engine JS and WASM return 200 responses (not HTML error/fallback pages); WASM
  has `Content-Type: application/wasm`.
- PGN import, real Stockfish analysis, cancel/retry, and cached reload work.
- The Fool's Mate and setup-FEN promotion fixtures from TESTING.md work.
- Public Chess.com archive access works from the deployed origin, including an
  actionable PGN fallback if the browser blocks it. No proxy or password is used.
- Backup export/restore works on the new origin.
- Settings' source archive and build-instruction links work. The archive download
  has SHA-256 `e9334f6baec2a83f93a21fe90345a0aaf837a42ba0bd04813d9b051104b7568f`.
- Repeat review/navigation/promotion gestures on physical mobile devices and in
  the target browsers. Responsive desktop emulation is not a physical-device test.

Do not cache `index.html` indefinitely or add a service worker without testing
updates and engine/cache compatibility. No service worker is required in V1.

## Rollback

Keep the previous upload ZIP before updating an existing site. Restore that
known-good static package if a deployment fails. Browser games live in IndexedDB,
not in the uploaded folder; do not clear site data as part of a file rollback.
Retain a JSON backup before any change of origin or storage schema.

## Verify an extracted upload locally

```sh
node scripts/verify-dist.mjs /absolute/path/to/extracted-upload
npm run preview -- --outDir /absolute/path/to/extracted-upload
```

The verifier rejects missing HTML assets, absolute deployment asset paths,
missing notices, and mismatched engine/source checksums. It does not claim to
validate TLS, DNS, real device gestures, or the deployed Chess.com CORS behavior.
