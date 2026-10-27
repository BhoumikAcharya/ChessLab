// ============================================================
// ChessLab Core Type Definitions
// ============================================================

/** Unique identifier for stored games */
export type GameId = string;

/** Analysis status of a game */
export type AnalysisStatus =
  | 'not_analyzed'
  | 'analyzing'
  | 'analyzed'
  | 'failed'
  | 'interrupted';

/** Game result from PGN */
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

/** Player color */
export type PlayerColor = 'white' | 'black';

/** Move classification labels — ChessLab's own system */
export type MoveClassification =
  | 'best'
  | 'strong'
  | 'acceptable'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'book'
  | 'forced';

/** Player info extracted from PGN headers */
export interface PlayerInfo {
  name: string;
  rating?: number;
}

/** Parsed game metadata */
export interface GameMetadata {
  id: GameId;
  white: PlayerInfo;
  black: PlayerInfo;
  result: GameResult;
  date?: string;
  event?: string;
  site?: string;
  opening?: string;
  eco?: string;
  timeControl?: string;
  termination?: string;
  round?: string;
  importedAt: number;
  source: 'pgn_file' | 'pgn_text' | 'chesscom';
  chesscomUrl?: string;
}

/** A stored chess game */
export interface StoredGame {
  id: GameId;
  pgn: string;
  metadata: GameMetadata;
  analysisStatus: AnalysisStatus;
  analysisId?: string;
}

/** Engine evaluation for a single position */
export interface PositionEvaluation {
  /** FEN of the position being evaluated */
  fen: string;
  /** Depth achieved */
  depth: number;
  /** Evaluation in centipawns from White's perspective */
  score: number;
  /** Is this a mate score? */
  isMate: boolean;
  /** Moves to mate (positive = white wins, negative = black wins) */
  mateIn?: number;
  /** Best move in UCI notation */
  bestMove: string;
  /** Best move in SAN notation */
  bestMoveSan: string;
  /** Principal variation in SAN */
  pv: string[];
  /** Additional candidate lines */
  lines: EngineLine[];
  /** The move that was actually played (SAN) */
  playedMove?: string;
  /** Move classification */
  classification?: MoveClassification;
  /** Move number (1-based) */
  moveNumber: number;
  /** Side to move in this evaluated position */
  sideToMove: PlayerColor;
  mover?: PlayerColor;
  centipawnLoss?: number;
  terminal?: 'checkmate' | 'draw';
}

/** A single engine line/variation */
export interface EngineLine {
  /** Rank (1 = best) */
  rank: number;
  /** Evaluation in centipawns from White's perspective */
  score: number;
  /** Mate score */
  isMate: boolean;
  mateIn?: number;
  /** Moves in SAN */
  moves: string[];
  /** Alias for moves array */
  pv?: string[];
  /** San string of the first move */
  sanMove?: string;
  /** UCI string of the first move */
  uciMove?: string;
  /** Depth */
  depth: number;
}

/** Complete analysis result for a game */
export interface GameAnalysis {
  id: string;
  gameId: GameId;
  schemaVersion?: number;
  pgnIdentity?: string;
  multiPv?: number;
  initialPosition?: PositionEvaluation;
  positions: PositionEvaluation[];
  /** Alias for positions */
  evaluations?: PositionEvaluation[];
  /** Engine version used */
  engineVersion: string;
  /** Analysis depth setting */
  analysisDepth: number;
  /** Alias for analysisDepth */
  depth?: number;
  /** When analysis was completed */
  completedAt: number;
  /** Summary statistics */
  summary: AnalysisSummary;
}

/** Summary of analysis results */
export interface AnalysisSummary {
  totalMoves: number;
  whiteClassifications: ClassificationCounts;
  blackClassifications: ClassificationCounts;
  criticalMoments: number[];
  averageCentipawnLoss: { white: number; black: number };
  whiteAccuracy?: number;
  blackAccuracy?: number;
}

/** Count of each classification type */
export interface ClassificationCounts {
  best: number;
  strong: number;
  acceptable: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  book: number;
  forced: number;
}

// ============================================================
// Chess Intelligence Types
// ============================================================

/** Type of chess finding */
export type FindingType =
  | 'material_loss'
  | 'material_gain'
  | 'missed_mate'
  | 'allowed_mate'
  | 'missed_capture'
  | 'better_capture'
  | 'hanging_piece'
  | 'fork'
  | 'pin'
  | 'eval_drop'
  | 'eval_gain'
  | 'neutral';

/** Confidence level in a finding */
export type FindingConfidence = 'verified' | 'likely' | 'uncertain';

/** A structured coaching finding */
export interface ChessFinding {
  type: FindingType;
  confidence: FindingConfidence;
  /** Move index in game */
  moveIndex: number;
  /** Pieces and squares involved */
  affectedSquares: string[];
  affectedPieces: string[];
  /** Human-readable explanation */
  explanation: string;
  /** Relevant variation moves (SAN) */
  relevantVariation: string[];
  /** Evaluation data */
  evalBefore: number;
  evalAfter: number;
  /** Best alternative move */
  bestAlternative?: string;
  bestAlternativeVariation?: string[];
}

// ============================================================
// UI State Types
// ============================================================

/** Active page in the app */
export type AppPage = 'dashboard' | 'library' | 'review' | 'settings';

/** Active tab in game review */
export type ReviewTab = 'moves' | 'coach' | 'lines';

/** Analysis progress */
export interface AnalysisProgress {
  gameId: GameId;
  currentMove: number;
  totalMoves: number;
  percentage?: number;
  status: 'running' | 'complete' | 'cancelled' | 'error';
  error?: string;
}

/** Import progress for Chess.com */
export interface ImportProgress {
  username: string;
  totalMonths: number;
  completedMonths: number;
  gamesFound: number;
  gamesImported: number;
  status: 'running' | 'complete' | 'cancelled' | 'error';
  error?: string;
}

/** App settings */
export interface AppSettings {
  analysisDepth: number;
  multiPv: number;
  chesscomUsername: string;
  boardFlipped: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  analysisDepth: 18,
  multiPv: 3,
  chesscomUsername: '',
  boardFlipped: false,
};
