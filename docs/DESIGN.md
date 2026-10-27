# ChessLab — Design and interaction specification (V1)

## North star

**Minimal, dark-only, modern, professional, moves-first.** The UI should resemble a restrained desktop analysis tool, not a gaming dashboard. The large chessboard and actual Stockfish analysis must visually dominate the Game Review.

## Palette

| Token | Hex | Use |
|---|---|---|
| Background | `#101419` | App canvas |
| Sidebar | `#151A1F` | Left navigation |
| Surface | `#191F25` | Cards and panels |
| Elevated surface | `#1D242A` | Inputs/hover |
| Border | `#2A333B` | Subtle outlines |
| Primary text | `#EAF0F0` | Headings, important data |
| Secondary text | `#99A6AF` | Supporting labels |
| Muted text | `#6E7E89` | Metadata |
| Accent | `#66B6A0` | Primary action/selection |
| Warning | `#CFAF72` | Inaccuracy/caution |
| Error | `#C48286` | Mistake/blunder |

Use accessible variants of these colors if contrast needs improvement. Preferred type: Inter / system sans-serif. Subtle 1px borders, 7–10px corner radii, modest icons, disciplined spacing, tabular numeric formatting.

## Screens

**Dashboard (`references/dashboard-dark.png`):** Stat cards with imported/analyzed game counts, results, openings, and recently reviewed games. Accuracy- or engine-based figures must show the number of analyzed games behind them. Keep statistics honest and compact.

**Game Library (`references/game-library-dark.png`):** Search/filter row and dense, readable table. Expose opponent, color, result, time control, opening, engine review status, and clear Analyze / View Review action. Show bulk-import and empty/loading/error states.

**Game Review (`references/game-review-dark.png`):** Large left chessboard, narrow eval bar, players and navigation; right side tabs **Moves | Coach | Lines**, with **Moves always selected by default**. Show actual move history, best response(s), evaluations, and legal engine variations. Evaluation timeline under the main workspace, clickable to navigate. Show original game and exploratory branches distinctly.

**Coach interaction:** Coach never opens automatically. When explicitly requested, it explains a *selected move* using verified chess facts; provides actual versus better variations and a “Show me why” replay action. If a good explanation is unavailable, use a neutral fallback and let the user inspect lines.

## Layout and accessibility

- At 1440–1600px desktop widths: board and analysis side-by-side, close to 50/50.
- On 1280px laptops: preserve a readable board; compress secondary metadata before the board.
- On tablets/mobile: stack board then move/coach tabs then evaluation graph. Support keyboard navigation, focus rings, labels, and high-contrast text.
- Limit decorative graphics, avoid strong shadows, no glossy gradients or large photography.
- Keep every panel consistent across screens. Status colors should convey meaning, not decoration.

## Reference precedence

`docs/PRD.md` > this document > PNG screenshots > optional `references/preview.html` implementation. The images are illustrative, with placeholder scores, opponents, dates, and graphs. Do not use the preview's hardcoded data in the actual application.
