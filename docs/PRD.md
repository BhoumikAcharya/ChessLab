# ChessLab — Product requirements (V1)

**Status:** Approved development specification (not yet implemented)  
**Product:** Local-first personal chess review and learning website  
**Users:** Owner and a few friends, independently on their own browsers  
**Deployment target:** Static Hostinger Premium hosting  
**Goal:** A credible, low-cost, moves-first alternative to subscription game reviews, with optional evidence-based coaching.

## 1. Core principle

A user should import finished chess games, choose one, analyze it with **real Stockfish**, inspect every move and alternative, and request coaching only when unable to understand a position. Never show a generic coach popup automatically; default to **Moves**.

## 2. V1 user flows

### Import

- Upload a single or multi-game `.pgn` file, paste PGN text, or enter a Chess.com username to fetch completed-game public archives.
- Parse and validate SAN, game outcome, FEN setup positions, and headers. Detect duplicates even when imported through different methods.
- Show import counts, errors, progress and cancellation where relevant. Respect Chess.com rate limits; use sequential requests/backoff. Never ask for a Chess.com password.
- Direct browser access to public archives must be tested in the production deployment. If inaccessible, show an actionable failure and offer manual PGN import; do not introduce an undisclosed proxy.

### Browse

- Show a game library of imported games with opponent, color, date, result, time control, opening if available, and analysis status.
- Search/filter/sort; open a game; analyze or reopen a cached result; optionally delete with confirmation.
- Dashboard shows counts, result distribution, common openings, and recent analyzed games. PGN-only statistics are separated from engine-derived statistics.

### Analyze

- Use `chess.js` or equivalent to reconstruct every legal game position and associate an exact FEN with each ply.
- Run a browser-compatible official Stockfish.js WASM build inside a dedicated Web Worker.
- Support readiness/init, UCI `position`/`go`/`stop`, legal PV decoding, configurable quality, MultiPV for selected positions, cancel, progress, errors, and worker disposal.
- Prefer a lightweight one-thread engine for static hosting. Support reanalyzing an individual game at higher quality. Don't automatically analyze thousands of imports.
- Cache final analysis with PGN/game identity, engine version, settings, timestamps, position IDs, scores, and principal variations.
- Normalize evaluations to an explicitly labeled perspective; correctly preserve mate scores. Move quality labels must be the app's own documented deterministic estimates, not proprietary Chess.com scores.

### Review

- Large interactive board with legal position navigation, move list, eval indicator/graph, last-move marking, best-move arrows, and engine lines.
- Moves tab is initially selected. Coach and Lines tabs share board/selected move state and do not reset navigation.
- Allow full/previous/next navigation, keyboard shortcuts, board flip, clicking a move/graph point, replaying candidate variations, exploring legal branches, and returning to the game.
- Show critical turning points and counts of best/strong/acceptable/inaccuracy/mistake/blunder, based on clear internal rules.

### Coach

- Build a chess-intelligence module from **verified facts**: material and captures, recaptures, attacked/defended squares, obvious material-loss continuations, missed forced mates, and selected supported tactical patterns.
- Consume before/after positions, played move, scores, best alternatives, and PVs. Return structured findings with type, affected squares/pieces, evidence line, and verification status.
- Templates convert reliable facts into short explanations and show actual versus recommended continuations; “Show me why” visually replays the evidence.
- When the cause is uncertain, explicitly say the engine prefers another move and invite variation comparison. Never invent chess strategy to fill a template.
- Do not use paid AI APIs, conversational LLMs, or a trained model in V1.

### Persistence and settings

- Store game data and reviewed analysis in IndexedDB on each device, with compatible caching, quota handling, deletion and a backup/export path.
- Settings: analysis budget/depth, board orientation, relevant appearance controls. Theme is **dark only**.
- Warn that browser data is not synced across devices and may be lost if cleared.

## 3. Architecture boundaries

- React, TypeScript, Vite front-end.
- `chess.js` rules/PGN layer.
- Dedicated UCI worker integration for Stockfish.js/WASM.
- Position and game state independent from UI.
- Chess Intelligence Engine: deterministic, testable chess evidence rules.
- Coaching layer: local templates and verifiable references.
- IndexedDB persistence; browser-only deployment.
- No backend/database/LLM service required.

## 4. UX/design

- Follow `docs/DESIGN.md` and the dark-only references.
- Three primary views: Dashboard, Game Library, and Game Review; plus Settings.
- Professional graphite surfaces, muted teal for selection/actions, accessible typography, subtle borders, no copied visual identity from other products.
- The chessboard is prominent and the analysis/move history is primary. Coach is explicitly secondary/on-demand.
- Support desktop, tablet, and mobile without broken navigation.

## 5. Constraints and integrity

- Analysis is for completed games only; no real-time unfair assistance.
- Real chess rules and real engine outputs throughout; don't show mock calculations as actual results.
- Legal candidate variations only; SAN/UCI translations must be position-correct.
- Handle workers/WASM paths in built static output, not just local dev.
- Respect Stockfish GPLv3 and other licenses. ChessLab is independent of Chess.com and RookSac.
- Do not overwrite a user's PGNs or inferred identities without confirmation.

## 6. Acceptance tests

1. Single and multi-game PGNs import and duplicate games are detected.
2. A legal move sequence is reconstructed precisely, including castling, promotion, and en passant.
3. Real Stockfish runs inside the browser and can be stopped/restarted.
4. Every score, best move and PV belongs to the currently displayed position; mates are labeled correctly.
5. Moves opens by default and tab changes preserve the exact selected board state.
6. Replay variation/return-to-game works without changing original PGN.
7. Coach gives verified tactical information, or a truthful fallback when uncertain.
8. Engine-backed metrics never include games that have not been analyzed.
9. Refresh restores local imports and compatible completed reviews.
10. Handle bad PGN, Chess.com API failure/rate limit, worker crash, and IndexedDB errors with useful messages.
11. Production static build loads the WASM assets and works when deployed.
12. Unit/browser tests pass and the README describes real rather than aspirational functionality.

## 7. Out of scope

Full cross-game weakness detection, custom ML, bulk deep analysis, auto-generated training plans, AI chat tutor, accounts/sync, multiplayer, live-game analysis, mandatory laptop/VPS server, and proprietary brilliant/great classifications. Keep storage schema extensible to support these later.

## 8. Delivery

Functional source, automated tests, production build, deployment notes, third-party/license notices, and an explicit implemented/incomplete feature checklist. A static UI demo does not count as a working V1.
