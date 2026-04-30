// ============================================
// 專家畫像：ARK 派（顛覆性創新）
// ============================================
// 核心理念：押注顛覆性創新，容忍高波動高估值
// 關注：營收成長、市場規模、動能、願景
// 對形態：低度關注
// ============================================

import type { StockSnapshot, ExpertVerdict, VerdictReason } from "../expert-types";

const EXPERT_ID = "ark_disruptive";
const EXPERT_NAME = "Disruptive Innovation";
const EXPERT_NAME_ZH = "ARK 創新派";
const SCHOOL = "disruptive_innovation";
const SCHOOL_ZH = "顛覆性創新";

const THRESHOLDS = {
  // 成長（ARK 最看重的）
  revenue_growth_excellent: 30,  // YoY > 30% = 超高速成長
  revenue_growth_good: 15,       // YoY > 15% = 高成長
  revenue_growth_min: 5,         // 至少要正成長
  eps_growth_good: 20,           // EPS 成長 > 20%

  // 估值（ARK 容忍度高）
  ps_ratio_max: 30,              // PS > 30 才算真的太貴
  pe_irrelevant_if_growing: true, // 如果營收高成長，PE 不重要

  // 動能（ARK 喜歡有動能的）
  rsi_momentum_zone: [45, 75],   // RSI 45-75 是健康動能區
  price_above_sma50: true,       // 至少要在 SMA50 之上

  // 市場規模
  market_cap_sweet_spot_min: 5,  // 50 億美元以上（不是太小的 penny stock）
  market_cap_sweet_spot_max: 500, // 5000 億以下（還有成長空間）
};

export function evaluateARK(stock: StockSnapshot): ExpertVerdict {
  const reasons: VerdictReason[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  // ━━━ 1. 營收成長（最重要）(權重 0.30) ━━━
  const growthWeight = 0.30;
  if (stock.revenue_growth != null) {
    if (stock.revenue_growth >= THRESHOLDS.revenue_growth_excellent) {
      reasons.push({
        factor: "營收成長",
        assessment: "positive",
        detail: `營收年增 ${stock.revenue_growth.toFixed(0)}%，超高速成長，正是 ARK 最愛`,
        weight: growthWeight,
      });
      totalScore += growthWeight * 95;
    } else if (stock.revenue_growth >= THRESHOLDS.revenue_growth_good) {
      reasons.push({
        factor: "營收成長",
        assessment: "positive",
        detail: `營收年增 ${stock.revenue_growth.toFixed(0)}%，高成長軌道`,
        weight: growthWeight,
      });
      totalScore += growthWeight * 65;
    } else if (stock.revenue_growth >= THRESHOLDS.revenue_growth_min) {
      reasons.push({
        factor: "營收成長",
        assessment: "neutral",
        detail: `營收年增 ${stock.revenue_growth.toFixed(0)}%，成長放緩但仍為正`,
        weight: growthWeight,
      });
      totalScore += growthWeight * 10;
    } else {
      reasons.push({
        factor: "營收成長",
        assessment: "negative",
        detail: `營收年增 ${stock.revenue_growth.toFixed(0)}%，成長停滯或衰退`,
        weight: growthWeight,
      });
      totalScore += growthWeight * -50;
    }
    totalWeight += growthWeight;
  }

  // ━━━ 2. 毛利率（創新公司的定價能力）(權重 0.15) ━━━
  const marginWeight = 0.15;
  if (stock.gross_margin != null) {
    if (stock.gross_margin >= 60) {
      reasons.push({
        factor: "毛利率（創新溢價）",
        assessment: "positive",
        detail: `毛利率 ${stock.gross_margin.toFixed(0)}%，極強定價能力，軟體/平台特徵`,
        weight: marginWeight,
      });
      totalScore += marginWeight * 80;
    } else if (stock.gross_margin >= 40) {
      reasons.push({
        factor: "毛利率（創新溢價）",
        assessment: "positive",
        detail: `毛利率 ${stock.gross_margin.toFixed(0)}%，有不錯的定價能力`,
        weight: marginWeight,
      });
      totalScore += marginWeight * 40;
    } else {
      reasons.push({
        factor: "毛利率（創新溢價）",
        assessment: "negative",
        detail: `毛利率 ${stock.gross_margin.toFixed(0)}%，偏低，可能是硬體或競爭激烈`,
        weight: marginWeight,
      });
      totalScore += marginWeight * -20;
    }
    totalWeight += marginWeight;
  }

  // ━━━ 3. 動能（ARK 喜歡趨勢向上的）(權重 0.20) ━━━
  const momentumWeight = 0.20;
  let momentumScore = 0;
  let momentumDetails: string[] = [];

  if (stock.sma_50 != null && stock.price > stock.sma_50) {
    momentumScore += 30;
    momentumDetails.push("價格 > SMA50");
  } else if (stock.sma_50 != null) {
    momentumScore -= 20;
    momentumDetails.push("價格 < SMA50");
  }

  if (stock.rsi_14 != null) {
    if (stock.rsi_14 >= 45 && stock.rsi_14 <= 75) {
      momentumScore += 30;
      momentumDetails.push(`RSI ${stock.rsi_14.toFixed(0)} 健康動能`);
    } else if (stock.rsi_14 < 30) {
      momentumScore += 10; // ARK 會在超賣時加碼
      momentumDetails.push(`RSI ${stock.rsi_14.toFixed(0)} 超賣，可能是加碼機會`);
    } else if (stock.rsi_14 > 80) {
      momentumScore -= 15;
      momentumDetails.push(`RSI ${stock.rsi_14.toFixed(0)} 過熱`);
    }
  }

  if (stock.volume_ratio != null && stock.volume_ratio > 1.3 && stock.change_pct > 0) {
    momentumScore += 15;
    momentumDetails.push("量增價漲");
  }

  if (momentumDetails.length > 0) {
    const assessment = momentumScore > 15 ? "positive" : momentumScore < -10 ? "negative" : "neutral";
    reasons.push({
      factor: "動能趨勢",
      assessment,
      detail: momentumDetails.join("；"),
      weight: momentumWeight,
    });
    totalScore += momentumWeight * momentumScore;
    totalWeight += momentumWeight;
  }

  // ━━━ 4. 估值（ARK 容忍度高）(權重 0.10) ━━━
  const valWeight = 0.10;
  if (stock.ps_ratio != null) {
    const highGrowth = stock.revenue_growth != null && stock.revenue_growth >= THRESHOLDS.revenue_growth_good;

    if (highGrowth && stock.ps_ratio <= THRESHOLDS.ps_ratio_max) {
      reasons.push({
        factor: "估值（成長調整）",
        assessment: "positive",
        detail: `PS ${stock.ps_ratio.toFixed(1)}，配合高成長仍可接受`,
        weight: valWeight,
      });
      totalScore += valWeight * 40;
    } else if (stock.ps_ratio > THRESHOLDS.ps_ratio_max) {
      reasons.push({
        factor: "估值（成長調整）",
        assessment: "negative",
        detail: `PS ${stock.ps_ratio.toFixed(1)}，即便考慮成長也偏貴`,
        weight: valWeight,
      });
      totalScore += valWeight * -20;
    } else {
      reasons.push({
        factor: "估值（成長調整）",
        assessment: "neutral",
        detail: `PS ${stock.ps_ratio.toFixed(1)}`,
        weight: valWeight,
      });
      totalScore += valWeight * 10;
    }
    totalWeight += valWeight;
  } else if (stock.pe_ratio != null) {
    // 退而求其次用 PE
    reasons.push({
      factor: "估值",
      assessment: "neutral",
      detail: `PE ${stock.pe_ratio.toFixed(1)}（ARK 派較不看重 PE）`,
      weight: valWeight,
    });
    totalScore += valWeight * 0;
    totalWeight += valWeight;
  }

  // ━━━ 5. 市場規模（成長空間）(權重 0.15) ━━━
  const capWeight = 0.15;
  if (stock.market_cap != null) {
    const capB = stock.market_cap / 1e9; // 轉成十億

    if (capB >= THRESHOLDS.market_cap_sweet_spot_min && capB <= THRESHOLDS.market_cap_sweet_spot_max) {
      reasons.push({
        factor: "市值（成長空間）",
        assessment: "positive",
        detail: `市值 ${fmtCap(stock.market_cap)}，在甜蜜區間，有足夠成長空間`,
        weight: capWeight,
      });
      totalScore += capWeight * 60;
    } else if (capB > THRESHOLDS.market_cap_sweet_spot_max) {
      reasons.push({
        factor: "市值（成長空間）",
        assessment: "neutral",
        detail: `市值 ${fmtCap(stock.market_cap)}，大型股成長空間有限`,
        weight: capWeight,
      });
      totalScore += capWeight * 0;
    } else {
      reasons.push({
        factor: "市值（成長空間）",
        assessment: "neutral",
        detail: `市值 ${fmtCap(stock.market_cap)}，規模較小風險較高`,
        weight: capWeight,
      });
      totalScore += capWeight * -10;
    }
    totalWeight += capWeight;
  }

  // ━━━ 6. EPS 成長 (權重 0.10) ━━━
  const epsWeight = 0.10;
  if (stock.eps_growth != null) {
    if (stock.eps_growth >= THRESHOLDS.eps_growth_good) {
      reasons.push({
        factor: "EPS 成長",
        assessment: "positive",
        detail: `EPS 年增 ${stock.eps_growth.toFixed(0)}%，獲利能力快速提升`,
        weight: epsWeight,
      });
      totalScore += epsWeight * 70;
    } else if (stock.eps_growth > 0) {
      reasons.push({
        factor: "EPS 成長",
        assessment: "neutral",
        detail: `EPS 年增 ${stock.eps_growth.toFixed(0)}%，正成長但不算快`,
        weight: epsWeight,
      });
      totalScore += epsWeight * 20;
    } else {
      reasons.push({
        factor: "EPS 成長",
        assessment: "negative",
        detail: `EPS 年增 ${stock.eps_growth.toFixed(0)}%，獲利衰退`,
        weight: epsWeight,
      });
      totalScore += epsWeight * -30;
    }
    totalWeight += epsWeight;
  }

  // ── 計算最終信號 ──

  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const confidence = Math.min(95, Math.round(Math.abs(normalizedScore) + (totalWeight * 25)));
  const signal = scoreToSignal(normalizedScore);

  // ARK 派的進場策略：分批，回調到 SMA50 附近
  let targetEntry: number | null = null;
  if (stock.sma_50 != null) {
    targetEntry = Math.round(stock.sma_50 * 0.98 * 100) / 100; // SMA50 下方 2%
  }

  // ARK 不太設停損（長線信仰），但我們還是給一個寬鬆的
  let stopLoss: number | null = null;
  if (stock.sma_200 != null) {
    stopLoss = Math.round(stock.sma_200 * 0.85 * 100) / 100; // SMA200 下方 15%
  }

  return {
    expert_id: EXPERT_ID,
    expert_name: EXPERT_NAME,
    expert_name_zh: EXPERT_NAME_ZH,
    school: SCHOOL,
    school_zh: SCHOOL_ZH,
    signal,
    confidence: Math.min(confidence, 95),
    target_entry: targetEntry,
    target_exit: null, // 5 年以上長線，不設短線目標
    stop_loss: stopLoss,
    reasons,
    pattern_weight: 0.15,
    pattern_comment: "創新派主要看基本面成長趨勢，形態僅作為短線參考",
  };
}

function scoreToSignal(score: number): ExpertVerdict["signal"] {
  if (score >= 55) return "strong_buy";
  if (score >= 20) return "buy";
  if (score >= -20) return "hold";
  if (score >= -55) return "sell";
  return "strong_sell";
}

function fmtCap(v: number): string {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(0) + "M";
  return v.toFixed(0);
}
