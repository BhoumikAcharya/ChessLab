# ChessLab — Coding-agent instructions

Read `README.md`, `docs/PRD.md`, `docs/DESIGN.md`, and `docs/references/README.md` before changing code.

## Non-negotiables

- Create a functional chess-analysis app, not a static replica of reference screenshots.
- **Dark mode only.** Maintain the restrained graphite/teal design language.
- **Moves first.** Open each review with the Moves tab selected; Coach is user-invoked.
- Real browser Stockfish WASM must run inside a worker. Never invent engine evaluations, classifications, coach findings, or progress.
- Validate PGNs and reconstruct chess positions using a chess-rules library. Treat every engine line as a move sequence that must be replayed legally from its reference position.
- Keep chess state, Stockfish worker integration, classification, rules-based intelligence, explanation templates, storage, and UI modules separate and testable.
- Ground concrete coach explanations in positions and engine variations. Use a neutral fallback where evidence is insufficient.
- No LLM APIs, paid cloud services, native server, or ML training in V1.
- Static Hostinger-friendly production output. No required server runtime.
- No live-game assistance. No Chess.com passwords or unofficial scraping.
- Respect open-source licenses and avoid copying proprietary UI assets.

## Workflow

1. Inspect existing repo and docs. Preserve project files.
2. Plan and implement a vertical slice: PGN import -> legal board -> actual Stockfish -> Moves tab -> cached analysis -> evidence-backed Coach.
3. Add error, loading, empty, retry, and cancel states as features are implemented.
4. Test castling, promotion, en passant, mate scores, orientation, cancellation, worker bundling, and persistence.
5. Build and verify the actual production version in a browser.
6. Record which features are implemented and any known limitations; do not claim incomplete features work.
7. Keep this README and test instructions aligned with the real project as it evolves.

The design preview HTML and PNGs are **illustrations, not functional app source code**. Do not ship them as the application.
