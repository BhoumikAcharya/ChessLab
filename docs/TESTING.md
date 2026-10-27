# ChessLab local verification

Last local verification: 2026-10-28. Use Node 24 (or a version allowed by package.json).

## Automated checks

```sh
npm ci
npm test
npm run lint
npm run build
npm run preview
```

The suite contains 63 tests across eight files:

- `pgnParser`: single/multiple games, headerless archives, legal castling, malformed/unfinished records, canonical identities, and result-looking text in comments/headers/variations.
- `analysis`: actual chess-position reconstruction for setup FEN, Black-to-move numbering, promotion/underpromotion, en passant and castling; legal PV replay; White-perspective centipawn/mate normalization; terminal states; worker protocol readiness, failures, timeout, cancellation/restart, final-position cancellation, and cache incompatibility.
- `stockfish`: classification threshold cases for both colors and forced/book API semantics. Game analysis never assigns Book without an opening source.
- `intelligence`: literal capture facts, verified mate evidence and neutral fallback text.
- `storage`: IndexedDB operations using fake-indexeddb; distinct same-day games, concurrent duplicate imports, atomic analysis saves, latest-only aggregation, invalid reviews, additive backup round trip, malformed backup rejection, legacy review skipping, retained reviews after cancellation, rollback on quota failure, fresh-browser preference restoration, import metadata fidelity, concurrent restores, and deletion races.
- `chesscom`: mocked HTTP transport, abort propagation, 429 retry, failed monthly archives and PGN fallback.
- `settings`: busy-action guards, invalid-file recovery, preference restoration, accessible confirmation focus/Escape behavior, and visible retry after clear failure.
- `review`: component integration with mocked worker/storage/board boundaries; Moves default, tab/FEN preservation, Coach reference FEN, variation stepping/return, and stale-result suppression after cancel/retry.

Worker protocol tests use a deterministic mock worker. They do not establish that a browser can load WASM; the production browser checks below cover that separately. IndexedDB tests do not emulate real browser quota policies.

`build` verifies and copies the pinned Stockfish engine files, full matching source archive, GPL text, authors, and a SHA-256 provenance manifest into public assets before compiling. This does not fetch anything from a CDN.

## Production browser checks performed

The actual built app was served through Vite preview. Checks passed in the available desktop in-app browser:

- Real Stockfish returned evaluations and candidate lines from both the web root and `/chesslab/` subdirectory hosting.
- Fool's Mate `1. f3 e5 2. g4 Qh4# 0-1`: `g4` is a Blunder, its position shows `−M1`, the final position shows `0–1`, and terminal Lines contains no invented `(none)` candidate.
- Coach explained the evidenced mate; recommended replay started before `g4`, Next advanced the variation, and Return restored the original selected position.
- Cancelling a real engine run immediately enabled Retry; the new run completed successfully.
- A setup-FEN promotion game displayed the correct three-piece starting position and fullmove 42, analyzed with real Stockfish, and restored its cached review after reload.
- Board flip preserved the evaluation's White perspective.
- Dragging the setup pawn to the final rank opened a promotion chooser; choosing Knight created a legal exploratory branch and Return restored the original game without changing its PGN.
- Importing two distinct games with the same players/date/result retained both. An invalid third record produced an explicit skipped-record message. The library count updated immediately without Refresh.
- Tabs render with spacing and a visible active state. Unknown branch scores show `—`.

Synthetic audit fixtures remain in local preview browser storage. They are not private user games.

## Additional browser acceptance pass

- Exported an actual JSON backup using the browser download control and restored it through the native file chooser into an isolated local origin, without deleting or changing the original library.
- Restored all five games and four compatible reviews; four incompatible/superseded reviews were skipped. Re-export comparison confirmed game PGNs, original import timestamps/sources, and preferences were preserved.
- Tried a malformed `null` JSON backup, verified an actionable error and unchanged game count, then successfully retried the valid backup without adding duplicates or replacing existing preferences.
- Checked Dashboard, Library, Review, and Settings at 375, 768, and 1280px in the browser's viewport override. All twelve cases fit the page width after fixing the review legend, desktop library flex sizing, and dashboard table containment.
- These are responsive browser checks, not tests on physical phones or other browser engines.

## Source and release verification

- npm stockfish@16.0.0 records source commit `efc5758a1cf72ec7644fa771a1f17fcbfdae410e`.
- Downloaded the complete archive for that commit. The archive includes 24 C++ source files, headers, Makefiles, wrappers, NNUE network, build script, and GPL text.
- Compared its prebuilt single-threaded JS and WASM with the installed npm files: both match byte for byte. Its build.js also matches the installed copy.
- Source archive SHA-256: `e9334f6baec2a83f93a21fe90345a0aaf837a42ba0bd04813d9b051104b7568f`.
- The application build rejects mismatched source or engine bytes. `npm run verify:dist` checks the static output; `npm run release` also creates and inventories the upload ZIP.
- Safari 26.4 desktop additionally passed completed-PGN import, real WASM analysis of Fool's Mate, correct `−M1` scoring and Blunder classification, Coach line replay/Next, and cached reload with Moves selected.
- Built the upload ZIP, extracted it, and matched all fourteen files against its manifest. The verifier rejected a missing WASM file and a corrupted source archive, then passed after those test mutations were restored.
- Served the extracted ZIP as a local static app, restored test data, and ran fresh Stockfish analysis of the setup-FEN promotion fixture successfully.
- Discovered that the preview server treats a `.gz` suffix as HTTP Content-Encoding and transparently decompresses downloads. The served source uses `.tgz` instead; an actual browser download matches the original archive SHA-256 exactly.
- A historical engine recompilation was not performed; the verification above compares the published source release's bundled binaries with the exact distributed engine.

## Repeatable fixtures

Fool's Mate:

```pgn
[White "Audit White"]
[Black "Audit Black"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1
```

Promotion from a custom start:

```pgn
[White "Audit Promotion"]
[Black "Audit King"]
[SetUp "1"]
[FEN "7k/P7/6K1/8/8/8/8/8 w - - 0 42"]
[Result "1-0"]

42. a8=Q# 1-0
```

Use `npm run preview -- --port 4174 --base /chesslab/` to repeat subdirectory testing. It serves the unchanged relative-base production output under that prefix.

## Still required before release

- Actual Hostinger HTTPS deployment and Chess.com public API access from that deployed origin.
- Firefox and real mobile-device testing, including drag/promotion gestures. Desktop Safari and 375/768px responsive checks pass.
- Browser-level storage denial/quota tests. Automated IndexedDB quota tests and real browser JSON download/restore round trips pass, but do not replace device quota checks.
- Review accessibility and rendering at 1280, 1440, and 1600px on the target browsers.
