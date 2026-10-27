# ChessLab

ChessLab is a local-first, dark-only post-game review app. Import a completed game, inspect Stockfish evaluations in **Moves**, and open **Coach** when you want help comparing continuations. No backend, paid API, or LLM service is required.

**Status: working V1 under local testing.** The original implementation had analysis-integrity defects. The current implementation normalizes scores, preserves PGN setup positions, validates variations and caches, and treats analysis failures as errors. Production deployment and cross-browser acceptance are still required; this is not a claim that every PRD item is complete.

## Run locally

Use Node **20.19+ or 22.12+** (Node 24 is used for local checks) and npm.

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
npm run preview
npm run release  # Tests + lint + build + verified Hostinger upload ZIP
```

`build` runs TypeScript checking and generates static output in `dist/`. `test` runs Vitest, including worker-protocol tests and IndexedDB tests with fake-indexeddb. Browser acceptance instructions are in [docs/TESTING.md](docs/TESTING.md).

## Implemented

- Completed single/multiple PGN import through paste, file selection, or drag/drop. Invalid records are reported while valid games are retained.
- Public Chess.com archive import with sequential requests, rate-limit retry/backoff, fetch cancellation, partial-failure reporting, and a manual-PGN fallback. No credentials or scraping.
- Legal positions through chess.js, including SetUp/FEN, Black-to-move starts, castling, promotion, and en passant.
- Original game navigation, keyboard arrows, board flip, autoplay, last-move highlighting, candidate replay, return to game, and legal exploratory branches. Promotion branches offer a piece choice.
- Real single-threaded Stockfish 16 WASM in a dedicated classic worker, served locally. No CDN fallback. Initial position plus each game position are evaluated.
- Moves-first review, evaluation bar/timeline, legal engine candidates, turning-point links, deterministic classifications, and optional Coach.
- Coach compares recommended and played continuations. Concrete mate explanations require legally replayed mating evidence. Captures are described literally; uncertain explanations use a neutral fallback.
- IndexedDB game/review/settings persistence, stable canonical game identities, transactional saves, and latest-compatible-review dashboard metrics.
- JSON backups with consistent database snapshots and transactional additive restore. Restore preserves existing games and preferences, restores backup preferences when no local preferences exist, retains import timestamps/sources, validates PGNs, and skips incompatible or already-present reviews.
- Desktop layout and a compact, always-visible navigation bar on mobile. Dashboard, library, review, and Settings have been checked at 375, 768, and 1280px without page-wide overflow; wide tables scroll inside their cards.

## Scores, classifications, and honest limits

All scores are from **White's perspective**, independent of board orientation. `+M3` means White has a forced mate in three; `−M3` means Black does. Terminal checkmate shows `1–0`/`0–1`; rule-derived draws show Draw. An unanalysed position shows `—`, never an assumed zero.

Move loss is `max(0, before − after)` for White and `max(0, after − before)` for Black, using the engine's evaluations of adjacent positions. The initial position is analyzed rather than assumed equal. Estimates depend on depth and can change on reanalysis.

| Centipawn loss | Classification |
|---|---|
| ≤10 | Best |
| ≤30 | Strong |
| ≤60 | Acceptable |
| ≤120 | Inaccuracy |
| ≤250 | Mistake |
| >250 | Blunder |

A move with only one legal option is Forced. There is no opening-book source, so the app does **not** assign Book labels. The quality percentage is a ChessLab estimate, `round(100 × exp(−0.004 × average loss))`, not Chess.com's accuracy. Mate scores use a large bounded score for these estimates, so short games with missed mates can have very low percentages.

Analysis is cached only when all positions finish with valid results. Engine crashes, timeouts, missing scores, and illegal PVs fail the run. Cancellation disposes the worker immediately. A prior compatible review is retained when reanalysis fails or is cancelled.

Old reviews from the initial implementation are retained in storage/backup but excluded from the UI because their score perspective and provenance cannot be trusted. Re-analyze those games. Reviews include schema version, engine label, settings, canonical PGN identity, exact FENs, PVs, and completion time. Changing default depth does not silently rewrite an older review; the UI displays its analyzed depth and offers reanalysis.

Known limitations:

- Exploratory branches have no engine score unless the exact FEN matches a cached game position. Use Return to Game to resume the original review; branch exploration never edits the PGN.
- Coach currently supports capture facts and fully evidenced mate continuations, not reliable forks, pins, hanging-piece detection, or a comprehensive positional coach.
- Analysis is per game. No batch engine queue or per-branch engine search.
- Import is restricted to completed games, but the app cannot verify whether a manually supplied result accurately describes a real finished game. Do not use for live-game assistance.
- Data belongs to the current browser/device. Clearing browser storage removes it. Export backups regularly. Quota/permission failures are surfaced, but browser quota behavior still requires device testing.
- Safari desktop has passed PGN import, real WASM analysis, mate scoring, Coach replay, and cached reload. Firefox, physical mobile gestures, and Chess.com access from a future deployed origin still require acceptance checks.

## Architecture

- `src/services/gameState.ts`: legal PGN reconstruction, variation replay, canonical identity.
- `src/services/pgnParser.ts` / `chesscom.ts`: import and public archive transport.
- `src/workers/stockfishLoader.ts`: base-path-aware local classic worker creation.
- `src/services/stockfish.ts`: UCI lifecycle, score normalization, PV verification, game analysis.
- `src/services/classification.ts`: thresholds and summaries.
- `src/services/intelligence.ts` / `explanationTemplates.ts`: chess evidence and conservative coaching text.
- `src/services/analysisCache.ts` / `storage.ts`: cache compatibility, persistence, backup/restore.
- `src/components/`: dashboard, library, review, import, and settings UI.

## Static hosting

1. Run `npm run build` and test `npm run preview`.
2. Upload the contents of `dist/` to Hostinger's web root or subdirectory. Hash routing needs no route rewrite. The relative Vite base keeps engine JS/WASM beside the application.
3. Verify the actual HTTPS deployment: PGN import, worker/WASM requests, cancellation, cache restoration, and Chess.com access. Local success does not establish deployed-origin API access.
4. Serve `stockfish/*.wasm` as `application/wasm`. The single-threaded build does not require cross-origin-isolation headers.
5. Keep the bundled engine source, instructions, and GPL notices available. Use [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for packaging, live acceptance, and rollback steps.

## Attribution and engine source

ChessLab is independent of Chess.com and Stockfish. Engine files are copied unmodified from npm `stockfish@16.0.0`. GPLv3 text, authors, and dependency notices are included in `public/stockfish/` and `public/THIRD_PARTY_NOTICES.txt` and copied into production output.

The pinned upstream source archive is in `vendor/stockfish/`, at the exact Git commit recorded by npm stockfish@16.0.0: `efc5758a1cf72ec7644fa771a1f17fcbfdae410e`. Its prebuilt JS/WASM match the installed engine byte for byte. Builds verify checksums and serve the complete archive with build instructions under `stockfish/source/`; Settings links to both. The archive includes the C++ source, network, Makefiles, wrappers, GPL text, and build script. We have not claimed a bit-for-bit historical recompilation.

`npm run release` produces `release/chesslab-hostinger.zip` plus an inventory/checksum manifest. The approximately 61 MiB upload includes the source archive; ordinary app startup and analysis do not download that archive. No domain is needed to create the package, and packaging does not publish anything.

Authoritative requirements remain in [docs/PRD.md](docs/PRD.md), [docs/DESIGN.md](docs/DESIGN.md), and [AGENTS.md](AGENTS.md). The Antigravity prompt and illustrative reference PNG/HTML files named by the original README are absent from this checkout.
