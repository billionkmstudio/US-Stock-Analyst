// ============================================
// 專家畫像：巴菲特派（價值投資）
// ============================================
// 核心理念：以合理價格買進優秀企業，長期持有
// 關注：護城河、ROE、自由現金流、安全邊際
// 對形態：完全忽略
// ============================================

import type { StockSnapshot, ExpertVerdict, VerdictReason } from "../expert-types";

const EXPERT_ID = "buffett_value";
const EXPERT_NAME = "Value Investor";
const EXPERT_NAME_ZH = "巴菲特派";
const SCHOOL = "value_investing";
const SCHOOL_ZH = "價值投資";

// ── 規則門檻（可調參數）──────────────────────

const THRESHOLDS = {
  // 估值門檻
  pe_max: 25,                // PE 超過此值 = 太貴
  pe_attractive: 18,         // PE 低於此值 = 有吸引力
  forward_pe_max: 22,        // Forward PE 上限
  peg_max: 1.5,              // PEG > 1.5 成長性不夠便宜
  peg_attractive: 1.0,       // PEG < 1 = 好價格

  // 品質門檻
  roe_min: 12,               // ROE 至少 12%
  roe_excellent: 20,         // ROE > 20% = 優秀
  gross_margin_min: 30,      // 毛利率 > 30% 暗示護城河
  net_margin_min: 10,        // 淨利率 > 10%
  debt_to_equity_max: 1.5,   // 負債比不能太高

  // 現金流
  fcf_yield_min: 3,          // 自由現金流殖利率 > 3%
  fcf_yield_attractive: 5,   // > 5% 非常有吸引力

  // 成長
  revenue_growth_min: 3,     // 營收至少正成長
  eps_growth_min: 5,         // EPS 年增 > 5%

  // 安全邊際（用分析師目標價中位數做簡易替代）
  margin_of_safety: 0.20,    // 至少 20% 折讓
};

// ── 規則評估 ──────────────────────────────

export function evaluateBuffett(stock: StockSnapshot): ExpertVerdict {
  const reasons: VerdictReason[] = [];
  let totalScore = 0;   // 加權分數累計
  let totalWeight = 0;  // 權重累計

  // ━━━ 1. PE 估值 (權重 0.20) ━━━
  const peWeight = 0.20;
  if (stock.pe_ratio != null) {
    if (stock.pe_ratio < THRESHOLDS.pe_attractive) {
      reasons.push({
        factor: "PE 估值",
        assessment: "positive",
        detail: `PE ${stock.pe_ratio.toFixed(1)}，低於吸引力門檻 ${THRESHOLDS.pe_attractive}，價格合理`,
        weight: peWeight,
      });
      totalScore += peWeight * 80;
    } else if (stock.pe_ratio < THRESHOLDS.pe_max) {
      reasons.push({
        factor: "PE 估值",
        assessment: "neutral",
        detail: `PE ${stock.pe_ratio.toFixed(1)}，處於 ${THRESHOLDS.pe_attractive}-${THRESHOLDS.pe_max} 區間，估值尚可`,
        weight: peWeight,
      });
      totalScore += peWeight * 40;
    } else {
      reasons.push({
        factor: "PE 估值",
        assessment: "negative",
        detail: `PE ${stock.pe_ratio.toFixed(1)}，超過上限 ${THRESHOLDS.pe_max}，估值偏貴`,
        weight: peWeight,
      });
      totalScore += peWeight * -30;
    }
    totalWeight += peWeight;
  }

  // ━━━ 2. PEG (權重 0.12) ━━━
  const pegWeight = 0.12;
  if (stock.peg_ratio != null && stock.peg_ratio > 0) {
    if (stock.peg_ratio < THRESHOLDS.peg_attractive) {
      reasons.push({
        factor: "PEG",
        assessment: "positive",
        detail: `PEG ${stock.peg_ratio.toFixed(2)}，成長性相對估值非常便宜`,
        weight: pegWeight,
      });
      totalScore += pegWeight * 90;
    } else if (stock.peg_ratio < THRESHOLDS.peg_max) {
      reasons.push({
        factor: "PEG",
        assessment: "neutral",
        detail: `PEG ${stock.peg_ratio.toFixed(2)}，合理範圍`,
        weight: pegWeight,
      });
      totalScore += pegWeight * 30;
    } else {
      reasons.push({
        factor: "PEG",
        assessment: "negative",
        detail: `PEG ${stock.peg_ratio.toFixed(2)}，成長性不足以支撐估值`,
        weight: pegWeight,
      });
      totalScore += pegWeight * -20;
    }
    totalWeight += pegWeight;
  }

  // ━━━ 3. ROE 品質 (權重 0.18) ━━━
  const roeWeight = 0.18;
  if (stock.roe != null) {
    if (stock.roe >= THRESHOLDS.roe_excellent) {
      reasons.push({
        factor: "ROE 品質",
        assessment: "positive",
        detail: `ROE ${stock.roe.toFixed(1)}%，優秀的資本回報率，暗示強護城河`,
        weight: roeWeight,
      });
      totalScore += roeWeight * 90;
    } else if (stock.roe >= THRESHOLDS.roe_min) {
      reasons.push({
        factor: "ROE 品質",
        assessment: "neutral",
        detail: `ROE ${stock.roe.toFixed(1)}%，尚可但不突出`,
        weight: roeWeight,
      });
      totalScore += roeWeight * 40;
    } else {
      reasons.push({
        factor: "ROE 品質",
        assessment: "negative",
        detail: `ROE ${stock.roe.toFixed(1)}%，低於最低要求 ${THRESHOLDS.roe_min}%，資本效率不佳`,
        weight: roeWeight,
      });
      totalScore += roeWeight * -40;
    }
    totalWeight += roeWeight;
  }

  // ━━━ 4. 毛利率（護城河指標）(權重 0.12) ━━━
  const gmWeight = 0.12;
  if (stock.gross_margin != null) {
    if (stock.gross_margin >= THRESHOLDS.gross_margin_min) {
      reasons.push({
        factor: "毛利率（護城河）",
        assessment: "positive",
        detail: `毛利率 ${stock.gross_margin.toFixed(1)}%，定價能力強`,
        weight: gmWeight,
      });
      totalScore += gmWeight * 70;
    } else {
      reasons.push({
        factor: "毛利率（護城河）",
        assessment: "negative",
        detail: `毛利率 ${stock.gross_margin.toFixed(1)}%，低於 ${THRESHOLDS.gross_margin_min}%，護城河可能不夠深`,
        weight: gmWeight,
      });
      totalScore += gmWeight * -20;
    }
    totalWeight += gmWeight;
  }

  // ━━━ 5. 自由現金流殖利率 (權重 0.15) ━━━
  const fcfWeight = 0.15;
  if (stock.fcf_yield != null) {
    if (stock.fcf_yield >= THRESHOLDS.fcf_yield_attractive) {
      reasons.push({
        factor: "自由現金流殖利率",
        assessment: "positive",
        detail: `FCF Yield ${stock.fcf_yield.toFixed(1)}%，現金流充沛，有吸引力`,
        weight: fcfWeight,
      });
      totalScore += fcfWeight * 85;
    } else if (stock.fcf_yield >= THRESHOLDS.fcf_yield_min) {
      reasons.push({
        factor: "自由現金流殖利率",
        assessment: "neutral",
        detail: `FCF Yield ${stock.fcf_yield.toFixed(1)}%，現金流尚可`,
        weight: fcfWeight,
      });
      totalScore += fcfWeight * 30;
    } else {
      reasons.push({
        factor: "自由現金流殖利率",
        assessment: "negative",
        detail: `FCF Yield ${stock.fcf_yield.toFixed(1)}%，現金流不足`,
        weight: fcfWeight,
      });
      totalScore += fcfWeight * -20;
    }
    totalWeight += fcfWeight;
  }

  // ━━━ 6. 負債比 (權重 0.10) ━━━
  const debtWeight = 0.10;
  if (stock.debt_to_equity != null) {
    if (stock.debt_to_equity <= 0.5) {
      reasons.push({
        factor: "負債水準",
        assessment: "positive",
        detail: `D/E ${stock.debt_to_equity.toFixed(2)}，財務穩健`,
        weight: debtWeight,
      });
      totalScore += debtWeight * 70;
    } else if (stock.debt_to_equity <= THRESHOLDS.debt_to_equity_max) {
      reasons.push({
        factor: "負債水準",
        assessment: "neutral",
        detail: `D/E ${stock.debt_to_equity.toFixed(2)}，負債可接受`,
        weight: debtWeight,
      });
      totalScore += debtWeight * 20;
    } else {
      reasons.push({
        factor: "負債水準",
        assessment: "negative",
        detail: `D/E ${stock.debt_to_equity.toFixed(2)}，負債偏高，有風險`,
        weight: debtWeight,
      });
      totalScore += debtWeight * -40;
    }
    totalWeight += debtWeight;
  }

  // ━━━ 7. 安全邊際 (權重 0.13) ━━━
  const mosWeight = 0.13;
  if (stock.analyst_target_mean != null && stock.price > 0) {
    const upside = (stock.analyst_target_mean - stock.price) / stock.price;
    if (upside >= THRESHOLDS.margin_of_safety) {
      reasons.push({
        factor: "安全邊際",
        assessment: "positive",
        detail: `目標價 $${stock.analyst_target_mean.toFixed(0)} vs 現價 $${stock.price.toFixed(0)}，折讓 ${(upside * 100).toFixed(0)}%，有足夠安全邊際`,
        weight: mosWeight,
      });
      totalScore += mosWeight * 85;
    } else if (upside >= 0.05) {
      reasons.push({
        factor: "安全邊際",
        assessment: "neutral",
        detail: `目標價 $${stock.analyst_target_mean.toFixed(0)} vs 現價 $${stock.price.toFixed(0)}，上行空間 ${(upside * 100).toFixed(0)}%，安全邊際不足`,
        weight: mosWeight,
      });
      totalScore += mosWeight * 20;
    } else {
      reasons.push({
        factor: "安全邊際",
        assessment: "negative",
        detail: `目標價 $${stock.analyst_target_mean.toFixed(0)} vs 現價 $${stock.price.toFixed(0)}，幾乎沒有上行空間`,
        weight: mosWeight,
      });
      totalScore += mosWeight * -40;
    }
    totalWeight += mosWeight;
  }

  // ── 計算最終信號 ──────────────────────────

  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const confidence = Math.min(100, Math.round(Math.abs(normalizedScore) + (totalWeight * 30)));

  const signal = scoreToSignal(normalizedScore);

  // ── 計算建議價位 ──────────────────────────

  let targetEntry: number | null = null;
  let stopLoss: number | null = null;

  if (stock.analyst_target_mean != null) {
    // 巴菲特派要 20% 安全邊際
    targetEntry = Math.round(stock.analyst_target_mean * (1 - THRESHOLDS.margin_of_safety));
  }
  if (stock.sma_200 != null) {
    // 停損設在 200 日均線下方 5%
    stopLoss = Math.round(stock.sma_200 * 0.95);
  }

  return {
    expert_id: EXPERT_ID,
    expert_name: EXPERT_NAME,
    expert_name_zh: EXPERT_NAME_ZH,
    school: SCHOOL,
    school_zh: SCHOOL_ZH,
    signal,
    confidence: Math.min(confidence, 95), // 永遠不到 100%
    target_entry: targetEntry,
    target_exit: null, // 巴菲特派不設目標價，長期持有
    stop_loss: stopLoss,
    reasons,
    pattern_weight: 0, // 完全忽略形態
    pattern_comment: "價值投資不依賴技術形態，只看企業內在價值",
  };
}

function scoreToSignal(score: number): ExpertVerdict["signal"] {
  if (score >= 60) return "strong_buy";
  if (score >= 25) return "buy";
  if (score >= -25) return "hold";
  if (score >= -60) return "sell";
  return "strong_sell";
}
