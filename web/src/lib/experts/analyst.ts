// ============================================
// 專家畫像：投行分析師派
// ============================================
// 核心理念：綜合分析師共識、目標價、基本面均衡
// 關注：分析師目標價、買賣評級、估值、成長、技術確認
// 對形態：中度關注（用於時機選擇）
// ============================================

import type { StockSnapshot, ExpertVerdict, VerdictReason } from "../expert-types";

const EXPERT_ID = "analyst_consensus";
const EXPERT_NAME = "Sell-Side Analyst";
const EXPERT_NAME_ZH = "投行分析師";
const SCHOOL = "sell_side_analysis";
const SCHOOL_ZH = "賣方研究";

const THRESHOLDS = {
  // 分析師目標價
  upside_strong: 0.25,       // 上行空間 > 25% = 強烈推薦
  upside_moderate: 0.10,     // 上行空間 > 10% = 推薦
  downside_warning: -0.05,   // 下行 > 5% = 警告

  // 分析師共識
  buy_ratio_strong: 0.7,     // > 70% 買入評級 = 高度共識
  buy_ratio_moderate: 0.5,   // > 50% 買入
  sell_ratio_warning: 0.3,   // > 30% 賣出評級 = 警告

  // 基本面（投行看的均衡）
  pe_reasonable: 25,
  forward_pe_attractive: 20,
  revenue_growth_positive: 5,
  roe_decent: 12,
};

export function evaluateAnalyst(stock: StockSnapshot): ExpertVerdict {
  const reasons: VerdictReason[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  // ━━━ 1. 分析師目標價 (權重 0.30) ━━━
  const targetWeight = 0.30;
  if (stock.analyst_target_mean != null && stock.price > 0) {
    const upside = (stock.analyst_target_mean - stock.price) / stock.price;

    if (upside >= THRESHOLDS.upside_strong) {
      reasons.push({
        factor: "分析師目標價",
        assessment: "positive",
        detail: `共識目標價 $${stock.analyst_target_mean.toFixed(0)}，上行空間 ${(upside * 100).toFixed(0)}%（${stock.analyst_target_low ? `區間 $${stock.analyst_target_low.toFixed(0)}-$${stock.analyst_target_high?.toFixed(0)}` : ""})`,
        weight: targetWeight,
      });
      totalScore += targetWeight * 85;
    } else if (upside >= THRESHOLDS.upside_moderate) {
      reasons.push({
        factor: "分析師目標價",
        assessment: "positive",
        detail: `共識目標價 $${stock.analyst_target_mean.toFixed(0)}，上行空間 ${(upside * 100).toFixed(0)}%`,
        weight: targetWeight,
      });
      totalScore += targetWeight * 50;
    } else if (upside >= THRESHOLDS.downside_warning) {
      reasons.push({
        factor: "分析師目標價",
        assessment: "neutral",
        detail: `共識目標價 $${stock.analyst_target_mean.toFixed(0)}，上行空間僅 ${(upside * 100).toFixed(0)}%，接近充分定價`,
        weight: targetWeight,
      });
      totalScore += targetWeight * 0;
    } else {
      reasons.push({
        factor: "分析師目標價",
        assessment: "negative",
        detail: `共識目標價 $${stock.analyst_target_mean.toFixed(0)}，低於現價 ${(Math.abs(upside) * 100).toFixed(0)}%，分析師認為高估`,
        weight: targetWeight,
      });
      totalScore += targetWeight * -50;
    }
    totalWeight += targetWeight;
  }

  // ━━━ 2. 分析師評級分布 (權重 0.20) ━━━
  const ratingWeight = 0.20;
  if (stock.analyst_buy_count != null && stock.analyst_hold_count != null && stock.analyst_sell_count != null) {
    const total = stock.analyst_buy_count + stock.analyst_hold_count + stock.analyst_sell_count;
    if (total > 0) {
      const buyRatio = stock.analyst_buy_count / total;
      const sellRatio = stock.analyst_sell_count / total;

      if (buyRatio >= THRESHOLDS.buy_ratio_strong) {
        reasons.push({
          factor: "分析師評級",
          assessment: "positive",
          detail: `${stock.analyst_buy_count}買/${stock.analyst_hold_count}持/${stock.analyst_sell_count}賣，${(buyRatio * 100).toFixed(0)}% 推薦買入`,
          weight: ratingWeight,
        });
        totalScore += ratingWeight * 75;
      } else if (buyRatio >= THRESHOLDS.buy_ratio_moderate) {
        reasons.push({
          factor: "分析師評級",
          assessment: "positive",
          detail: `${stock.analyst_buy_count}買/${stock.analyst_hold_count}持/${stock.analyst_sell_count}賣，過半數推薦`,
          weight: ratingWeight,
        });
        totalScore += ratingWeight * 40;
      } else if (sellRatio >= THRESHOLDS.sell_ratio_warning) {
        reasons.push({
          factor: "分析師評級",
          assessment: "negative",
          detail: `${stock.analyst_buy_count}買/${stock.analyst_hold_count}持/${stock.analyst_sell_count}賣，賣出評級偏多`,
          weight: ratingWeight,
        });
        totalScore += ratingWeight * -40;
      } else {
        reasons.push({
          factor: "分析師評級",
          assessment: "neutral",
          detail: `${stock.analyst_buy_count}買/${stock.analyst_hold_count}持/${stock.analyst_sell_count}賣，意見分歧`,
          weight: ratingWeight,
        });
        totalScore += ratingWeight * 0;
      }
      totalWeight += ratingWeight;
    }
  }

  // ━━━ 3. Forward PE（投行最常用）(權重 0.15) ━━━
  const fpeWeight = 0.15;
  if (stock.forward_pe != null && stock.forward_pe > 0) {
    if (stock.forward_pe <= THRESHOLDS.forward_pe_attractive) {
      reasons.push({
        factor: "Forward PE",
        assessment: "positive",
        detail: `Forward PE ${stock.forward_pe.toFixed(1)}，前瞻估值有吸引力`,
        weight: fpeWeight,
      });
      totalScore += fpeWeight * 65;
    } else if (stock.forward_pe <= THRESHOLDS.pe_reasonable) {
      reasons.push({
        factor: "Forward PE",
        assessment: "neutral",
        detail: `Forward PE ${stock.forward_pe.toFixed(1)}，估值尚可`,
        weight: fpeWeight,
      });
      totalScore += fpeWeight * 20;
    } else {
      reasons.push({
        factor: "Forward PE",
        assessment: "negative",
        detail: `Forward PE ${stock.forward_pe.toFixed(1)}，前瞻估值偏貴`,
        weight: fpeWeight,
      });
      totalScore += fpeWeight * -25;
    }
    totalWeight += fpeWeight;
  }

  // ━━━ 4. 營收與獲利成長 (權重 0.15) ━━━
  const growthWeight = 0.15;
  let growthScore = 0;
  let growthDetails: string[] = [];

  if (stock.revenue_growth != null) {
    if (stock.revenue_growth >= THRESHOLDS.revenue_growth_positive) {
      growthScore += 30;
      growthDetails.push(`營收+${stock.revenue_growth.toFixed(0)}%`);
    } else {
      growthScore -= 20;
      growthDetails.push(`營收${stock.revenue_growth.toFixed(0)}%`);
    }
  }

  if (stock.eps_growth != null) {
    if (stock.eps_growth > 0) {
      growthScore += 25;
      growthDetails.push(`EPS+${stock.eps_growth.toFixed(0)}%`);
    } else {
      growthScore -= 15;
      growthDetails.push(`EPS${stock.eps_growth.toFixed(0)}%`);
    }
  }

  if (growthDetails.length > 0) {
    const assessment = growthScore > 15 ? "positive" : growthScore < -10 ? "negative" : "neutral";
    reasons.push({
      factor: "成長動能",
      assessment,
      detail: growthDetails.join("；"),
      weight: growthWeight,
    });
    totalScore += growthWeight * growthScore;
    totalWeight += growthWeight;
  }

  // ━━━ 5. 技術確認（投行用於時機）(權重 0.10) ━━━
  const techWeight = 0.10;
  let techScore = 0;
  let techDetails: string[] = [];

  if (stock.sma_50 != null && stock.sma_200 != null) {
    if (stock.price > stock.sma_50 && stock.sma_50 > stock.sma_200) {
      techScore += 30;
      techDetails.push("均線多頭排列");
    } else if (stock.price < stock.sma_200) {
      techScore -= 25;
      techDetails.push("跌破 SMA200");
    }
  }

  if (stock.rsi_14 != null) {
    if (stock.rsi_14 > 70) {
      techScore -= 15;
      techDetails.push(`RSI ${stock.rsi_14.toFixed(0)} 偏高`);
    } else if (stock.rsi_14 < 30) {
      techScore += 15;
      techDetails.push(`RSI ${stock.rsi_14.toFixed(0)} 超賣`);
    }
  }

  if (techDetails.length > 0) {
    const assessment = techScore > 10 ? "positive" : techScore < -10 ? "negative" : "neutral";
    reasons.push({
      factor: "技術確認",
      assessment,
      detail: techDetails.join("；"),
      weight: techWeight,
    });
    totalScore += techWeight * techScore;
    totalWeight += techWeight;
  }

  // ━━━ 6. 形態（時機選擇）(權重 0.10) ━━━
  const patternWeight = 0.10;
  const confirmedPatterns = stock.patterns.filter(
    (p) => p.confidence >= 65 && (p.stage === "completed" || p.stage === "confirmed")
  );

  if (confirmedPatterns.length > 0) {
    const bullish = confirmedPatterns.filter((p) => p.pattern_type === "bullish");
    const bearish = confirmedPatterns.filter((p) => p.pattern_type === "bearish");

    if (bullish.length > bearish.length) {
      reasons.push({
        factor: "形態（時機）",
        assessment: "positive",
        detail: `${bullish.length} 個看多形態確認，進場時機較佳`,
        weight: patternWeight,
      });
      totalScore += patternWeight * 40;
    } else if (bearish.length > bullish.length) {
      reasons.push({
        factor: "形態（時機）",
        assessment: "negative",
        detail: `${bearish.length} 個看空形態確認，建議等待`,
        weight: patternWeight,
      });
      totalScore += patternWeight * -35;
    }
  } else {
    reasons.push({
      factor: "形態（時機）",
      assessment: "neutral",
      detail: "無明確形態訊號",
      weight: patternWeight,
    });
  }
  totalWeight += patternWeight;

  // ── 計算最終信號 ──

  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const confidence = Math.min(95, Math.round(Math.abs(normalizedScore) + (totalWeight * 25)));
  const signal = scoreToSignal(normalizedScore);

  // 投行的目標價就是分析師共識目標價
  const targetExit = stock.analyst_target_mean != null ? Math.round(stock.analyst_target_mean) : null;

  // 進場價：現價回調 5% 的位置
  const targetEntry = Math.round(stock.price * 0.95 * 100) / 100;

  // 停損：分析師最低目標價下方 5%，或 SMA200 下方 5%
  let stopLoss: number | null = null;
  if (stock.analyst_target_low != null) {
    stopLoss = Math.round(stock.analyst_target_low * 0.95 * 100) / 100;
  } else if (stock.sma_200 != null) {
    stopLoss = Math.round(stock.sma_200 * 0.95 * 100) / 100;
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
    target_exit: targetExit,
    stop_loss: stopLoss,
    reasons,
    pattern_weight: 0.45,
    pattern_comment: "形態用於輔助判斷進場時機，不影響基本面評估",
  };
}

function scoreToSignal(score: number): ExpertVerdict["signal"] {
  if (score >= 50) return "strong_buy";
  if (score >= 18) return "buy";
  if (score >= -18) return "hold";
  if (score >= -50) return "sell";
  return "strong_sell";
}
