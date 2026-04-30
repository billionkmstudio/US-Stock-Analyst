// ============================================
// 專家畫像：達里歐派（全天候 / 風險平價）
// ============================================
// 核心理念：風險分散、波動率管理、宏觀週期
// 關注：波動率(ATR/BB)、均線趨勢、負債、股息、估值合理性
// 對形態：中度關注（作為風險訊號）
// ============================================

import type { StockSnapshot, ExpertVerdict, VerdictReason } from "../expert-types";

const EXPERT_ID = "dalio_allweather";
const EXPERT_NAME = "All Weather";
const EXPERT_NAME_ZH = "達里歐派";
const SCHOOL = "risk_parity";
const SCHOOL_ZH = "全天候 / 風險平價";

const THRESHOLDS = {
  // 波動率
  atr_pct_high: 3.0,        // ATR / Price > 3% = 高波動
  atr_pct_low: 1.0,         // ATR / Price < 1% = 低波動
  bb_width_high: 0.10,      // BB 寬度 > 10% = 波動放大

  // 趨勢穩定性
  price_above_sma200: true,  // 長線多頭是基本條件

  // 基本面（達里歐重視穩健性）
  debt_to_equity_max: 1.0,   // 負債比保守
  dividend_yield_min: 1.0,   // 有股息更好
  pe_max: 30,                // 不追求極低 PE，但不要太離譜
  roe_min: 10,               // 基本品質

  // 風險調整
  rsi_extreme_high: 75,
  rsi_extreme_low: 25,
};

export function evaluateDalio(stock: StockSnapshot): ExpertVerdict {
  const reasons: VerdictReason[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  // ━━━ 1. 波動率評估 (權重 0.25) ━━━
  const volWeight = 0.25;
  if (stock.atr_14 != null && stock.price > 0) {
    const atrPct = (stock.atr_14 / stock.price) * 100;

    if (atrPct <= THRESHOLDS.atr_pct_low) {
      reasons.push({
        factor: "波動率",
        assessment: "positive",
        detail: `ATR/Price ${atrPct.toFixed(1)}%，低波動環境，風險可控`,
        weight: volWeight,
      });
      totalScore += volWeight * 70;
    } else if (atrPct <= THRESHOLDS.atr_pct_high) {
      reasons.push({
        factor: "波動率",
        assessment: "neutral",
        detail: `ATR/Price ${atrPct.toFixed(1)}%，波動率適中`,
        weight: volWeight,
      });
      totalScore += volWeight * 20;
    } else {
      reasons.push({
        factor: "波動率",
        assessment: "negative",
        detail: `ATR/Price ${atrPct.toFixed(1)}%，高波動環境，需減少部位或對沖`,
        weight: volWeight,
      });
      totalScore += volWeight * -50;
    }
    totalWeight += volWeight;
  }

  // ━━━ 2. 長線趨勢（SMA200）(權重 0.20) ━━━
  const trendWeight = 0.20;
  if (stock.sma_200 != null) {
    const aboveSMA200 = stock.price > stock.sma_200;
    const distPct = ((stock.price - stock.sma_200) / stock.sma_200) * 100;

    if (aboveSMA200 && distPct > 5) {
      reasons.push({
        factor: "長線趨勢",
        assessment: "positive",
        detail: `價格高於 SMA200 ${distPct.toFixed(0)}%，長線多頭穩固`,
        weight: trendWeight,
      });
      totalScore += trendWeight * 70;
    } else if (aboveSMA200) {
      reasons.push({
        factor: "長線趨勢",
        assessment: "neutral",
        detail: `價格略高於 SMA200，趨勢偏多但不強`,
        weight: trendWeight,
      });
      totalScore += trendWeight * 20;
    } else {
      reasons.push({
        factor: "長線趨勢",
        assessment: "negative",
        detail: `價格低於 SMA200 ${Math.abs(distPct).toFixed(0)}%，長線轉空，風險增加`,
        weight: trendWeight,
      });
      totalScore += trendWeight * -60;
    }
    totalWeight += trendWeight;
  }

  // ━━━ 3. 財務穩健性 (權重 0.20) ━━━
  const healthWeight = 0.20;
  let healthScore = 0;
  let healthFactors: string[] = [];

  if (stock.debt_to_equity != null) {
    if (stock.debt_to_equity <= THRESHOLDS.debt_to_equity_max) {
      healthScore += 30;
      healthFactors.push(`D/E ${stock.debt_to_equity.toFixed(2)} 穩健`);
    } else {
      healthScore -= 30;
      healthFactors.push(`D/E ${stock.debt_to_equity.toFixed(2)} 偏高`);
    }
  }

  if (stock.dividend_yield != null) {
    if (stock.dividend_yield >= THRESHOLDS.dividend_yield_min) {
      healthScore += 20;
      healthFactors.push(`殖利率 ${stock.dividend_yield.toFixed(1)}% 提供緩衝`);
    }
  }

  if (stock.roe != null) {
    if (stock.roe >= THRESHOLDS.roe_min) {
      healthScore += 20;
      healthFactors.push(`ROE ${stock.roe.toFixed(0)}% 合格`);
    } else {
      healthScore -= 15;
      healthFactors.push(`ROE ${stock.roe.toFixed(0)}% 偏低`);
    }
  }

  if (healthFactors.length > 0) {
    const assessment = healthScore > 10 ? "positive" : healthScore < -10 ? "negative" : "neutral";
    reasons.push({
      factor: "財務穩健性",
      assessment,
      detail: healthFactors.join("；"),
      weight: healthWeight,
    });
    totalScore += healthWeight * healthScore;
    totalWeight += healthWeight;
  }

  // ━━━ 4. 估值合理性 (權重 0.15) ━━━
  const valWeight = 0.15;
  if (stock.pe_ratio != null) {
    if (stock.pe_ratio > 0 && stock.pe_ratio <= THRESHOLDS.pe_max) {
      reasons.push({
        factor: "估值合理性",
        assessment: "positive",
        detail: `PE ${stock.pe_ratio.toFixed(1)}，估值在合理範圍內`,
        weight: valWeight,
      });
      totalScore += valWeight * 50;
    } else if (stock.pe_ratio > THRESHOLDS.pe_max) {
      reasons.push({
        factor: "估值合理性",
        assessment: "negative",
        detail: `PE ${stock.pe_ratio.toFixed(1)}，估值偏高增加下行風險`,
        weight: valWeight,
      });
      totalScore += valWeight * -30;
    }
    totalWeight += valWeight;
  }

  // ━━━ 5. 極端風險訊號 (權重 0.10) ━━━
  const riskWeight = 0.10;
  if (stock.rsi_14 != null) {
    if (stock.rsi_14 >= THRESHOLDS.rsi_extreme_high) {
      reasons.push({
        factor: "極端風險",
        assessment: "negative",
        detail: `RSI ${stock.rsi_14.toFixed(0)} 過熱，回調風險高，達里歐派建議減碼`,
        weight: riskWeight,
      });
      totalScore += riskWeight * -50;
    } else if (stock.rsi_14 <= THRESHOLDS.rsi_extreme_low) {
      reasons.push({
        factor: "極端風險",
        assessment: "positive",
        detail: `RSI ${stock.rsi_14.toFixed(0)} 極度超賣，風險報酬比改善`,
        weight: riskWeight,
      });
      totalScore += riskWeight * 40;
    } else {
      reasons.push({
        factor: "極端風險",
        assessment: "neutral",
        detail: `RSI ${stock.rsi_14.toFixed(0)}，未觸及極端區域`,
        weight: riskWeight,
      });
      totalScore += riskWeight * 10;
    }
    totalWeight += riskWeight;
  }

  // ━━━ 6. 形態訊號（作為風險警示）(權重 0.10) ━━━
  const patternWeight = 0.10;
  const bearishPatterns = stock.patterns.filter(
    (p) => p.pattern_type === "bearish" && p.confidence >= 70
  );
  const bullishPatterns = stock.patterns.filter(
    (p) => p.pattern_type === "bullish" && p.confidence >= 70
  );

  if (bearishPatterns.length > 0) {
    reasons.push({
      factor: "形態風險警示",
      assessment: "negative",
      detail: `偵測到 ${bearishPatterns.length} 個看空形態，風險管理角度建議警惕`,
      weight: patternWeight,
    });
    totalScore += patternWeight * -40;
  } else if (bullishPatterns.length > 0) {
    reasons.push({
      factor: "形態風險警示",
      assessment: "positive",
      detail: `偵測到 ${bullishPatterns.length} 個看多形態，趨勢有利`,
      weight: patternWeight,
    });
    totalScore += patternWeight * 30;
  } else {
    reasons.push({
      factor: "形態風險警示",
      assessment: "neutral",
      detail: `無顯著形態訊號`,
      weight: patternWeight,
    });
  }
  totalWeight += patternWeight;

  // ── 計算最終信號 ──

  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const confidence = Math.min(95, Math.round(Math.abs(normalizedScore) + (totalWeight * 25)));
  const signal = scoreToSignal(normalizedScore);

  // 達里歐派的停損比較寬鬆（波動容忍度較高）
  let stopLoss: number | null = null;
  if (stock.sma_200 != null) {
    stopLoss = Math.round(stock.sma_200 * 0.92 * 100) / 100; // SMA200 下方 8%
  }

  return {
    expert_id: EXPERT_ID,
    expert_name: EXPERT_NAME,
    expert_name_zh: EXPERT_NAME_ZH,
    school: SCHOOL,
    school_zh: SCHOOL_ZH,
    signal,
    confidence: Math.min(confidence, 95),
    target_entry: stock.sma_50 != null ? Math.round(stock.sma_50 * 100) / 100 : null,
    target_exit: null, // 全天候策略不做短線目標
    stop_loss: stopLoss,
    reasons,
    pattern_weight: 0.4,
    pattern_comment: "形態作為風險警示參考，不作為主要進出場依據",
  };
}

function scoreToSignal(score: number): ExpertVerdict["signal"] {
  if (score >= 50) return "strong_buy";
  if (score >= 20) return "buy";
  if (score >= -20) return "hold";
  if (score >= -50) return "sell";
  return "strong_sell";
}
