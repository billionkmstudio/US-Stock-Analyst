// ============================================
// 專家策略模擬器 — 型別定義
// ============================================
// 所有專家畫像、規則輸入、判斷結果的介面
// ============================================

/** 股票的完整數據快照（從 DB 讀出，送入規則引擎） */
export interface StockSnapshot {
  symbol: string;
  name: string;
  date: string; // YYYY-MM-DD

  // 價格
  price: number;
  change_pct: number; // 日漲跌幅 %

  // 基本面
  pe_ratio: number | null;
  forward_pe: number | null;
  peg_ratio: number | null;
  pb_ratio: number | null;
  ps_ratio: number | null;
  roe: number | null;           // %
  roic: number | null;          // %
  gross_margin: number | null;  // %
  net_margin: number | null;    // %
  fcf_yield: number | null;     // 自由現金流殖利率 %
  dividend_yield: number | null;
  debt_to_equity: number | null;
  revenue_growth: number | null; // YoY %
  eps_growth: number | null;     // YoY %
  market_cap: number | null;     // 億美元

  // 技術指標（Worker 已算好）
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  bb_upper: number | null;
  bb_lower: number | null;
  atr_14: number | null;
  volume_ratio: number | null;  // 今日成交量 / 20日均量

  // 形態訊號（Worker 偵測結果）
  patterns: PatternSignal[];

  // 分析師共識（yfinance 可取得）
  analyst_target_mean: number | null;
  analyst_target_low: number | null;
  analyst_target_high: number | null;
  analyst_buy_count: number | null;
  analyst_hold_count: number | null;
  analyst_sell_count: number | null;
}

/** 形態偵測訊號 */
export interface PatternSignal {
  pattern_name: string;       // e.g. "head_and_shoulders_top"
  pattern_type: "bullish" | "bearish" | "neutral";
  confidence: number;         // 0-100
  stage: "forming" | "completed" | "confirmed" | "failed";
  detected_at: string;        // ISO date
  description: string;
}

/** 單一專家的判斷結果 */
export interface ExpertVerdict {
  expert_id: string;
  expert_name: string;
  expert_name_zh: string;
  school: string;             // 派別
  school_zh: string;

  signal: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
  confidence: number;         // 0-100
  target_entry: number | null;   // 建議進場價
  target_exit: number | null;    // 建議出場價
  stop_loss: number | null;      // 建議停損價

  // 為什麼（可解釋性）
  reasons: VerdictReason[];

  // 該專家對形態訊號的態度
  pattern_weight: number;     // 0-1, 0=完全忽略
  pattern_comment: string | null;
}

/** 判斷理由 */
export interface VerdictReason {
  factor: string;             // e.g. "PE 估值"
  assessment: "positive" | "negative" | "neutral";
  detail: string;             // e.g. "Forward PE 22.5 高於門檻 20，估值偏貴"
  weight: number;             // 該因子在此專家的權重 0-1
}

/** 綜合建議（聚合所有專家） */
export interface ConsensusResult {
  symbol: string;
  date: string;

  // 個別專家判斷
  verdicts: ExpertVerdict[];

  // 聚合結果
  consensus_signal: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
  consensus_score: number;     // -100(強賣) ~ +100(強買)
  agreement_level: number;     // 共識度 0-100%
  bull_count: number;
  bear_count: number;
  neutral_count: number;

  // 分歧摘要
  key_disagreement: string | null;
  key_agreement: string | null;

  // 建議操作
  suggested_action: string;
  entry_prices: { label: string; price: number }[];
  stop_loss: number | null;
}

/** 信號轉數值（用於加權計算） */
export const SIGNAL_SCORES: Record<ExpertVerdict["signal"], number> = {
  strong_buy: 100,
  buy: 50,
  hold: 0,
  sell: -50,
  strong_sell: -100,
};

/** 信號中文 */
export const SIGNAL_LABELS_ZH: Record<ExpertVerdict["signal"], string> = {
  strong_buy: "強烈買入",
  buy: "買入",
  hold: "觀望",
  sell: "賣出",
  strong_sell: "強烈賣出",
};

/** 信號顏色 */
export const SIGNAL_COLORS: Record<ExpertVerdict["signal"], string> = {
  strong_buy: "#16a34a",
  buy: "#22c55e",
  hold: "#eab308",
  sell: "#f97316",
  strong_sell: "#dc2626",
};
