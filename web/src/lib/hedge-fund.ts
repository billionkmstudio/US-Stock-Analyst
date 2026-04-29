// ============================================
// 專家畫像：對沖基金 / 量化派
// ============================================
// 核心理念：動能、技術破位、均線系統、嚴格風控
// 關注：RSI、MACD、均線排列、成交量、形態訊號
// 對形態：高度重視
// ============================================

import type { StockSnapshot, ExpertVerdict, VerdictReason } from "../expert-types";

const EXPERT_ID = "hedge_quant";
const EXPERT_NAME = "Hedge Fund / Quant";
const EXPERT_NAME_ZH = "對沖基金派";
const SCHOOL = "quantitative_momentum";
const SCHOOL_ZH = "量化動能";

// ── 規則門檻 ──────────────────────────────

const THRESHOLDS = {
  // RSI
  rsi_oversold: 30,
  rsi_overbought: 70,
  rsi_strong_oversold: 20,
  rsi_strong_overbought: 80,

  // MACD
  macd_bullish_threshold: 0,    // histogram > 0 = 多方

  // 均線
  sma_bullish_spread: 0.02,     // SMA20 > SMA50 超過 2% = 多頭排列
  price_above_sma200_pct: 0.03, // 價格 > SMA200 * 1.03 = 長線多頭

  // 布林通道
  bb_squeeze_pct: 0.05,         // BB 寬度 < 5% = 擠壓（即將突破）

  // 成交量
  volume_surge: 1.5,            // 成交量 > 1.5 倍均量 = 放量
  volume_dry: 0.6,              // 成交量 < 0.6 倍均量 = 縮量

  // 動能
  momentum_lookback_pct: 0.05,  // 近期漲 > 5% = 正動能

  // 風控
  atr_stop_multiplier: 2,       // 停損 = 2 倍 ATR
};

// ── 規則評估 ──────────────────────────────

export function evaluateHedgeFund(stock: StockSnapshot): ExpertVerdict {
  const reasons: VerdictReason[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  // ━━━ 1. 均線系統 (權重 0.25) ━━━
  const maWeight = 0.25;
  if (stock.sma_20 != null && stock.sma_50 != null && stock.sma_200 != null) {
    const above200 = stock.price > stock.sma_200;
    const sma20above50 = stock.sma_20 > stock.sma_50;
    const sma50above200 = stock.sma_50 > stock.sma_200;
    const goldenCross = sma20above50 && sma50above200;
    const deathCross = !sma20above50 && !sma50above200;

    if (goldenCross && above200) {
      reasons.push({
        factor: "均線排列",
        assessment: "positive",
        detail: `完美多頭排列：SMA20 > SMA50 > SMA200，價格在所有均線之上`,
        weight: maWeight,
      });
      totalScore += maWeight * 90;
    } else if (above200 && sma20above50) {
      reasons.push({
        factor: "均線排列",
        assessment: "positive",
        detail: `短線多頭：價格 > SMA200，SMA20 > SMA50`,
        weight: maWeight,
      });
      totalScore += maWeight * 60;
    } else if (deathCross) {
      reasons.push({
        factor: "均線排列",
        assessment: "negative",
        detail: `死亡交叉：SMA20 < SMA50 < SMA200，空頭排列`,
        weight: maWeight,
      });
      totalScore += maWeight * -80;
    } else if (!above200) {
      reasons.push({
        factor: "均線排列",
        assessment: "negative",
        detail: `價格跌破 SMA200（$${stock.sma_200.toFixed(0)}），長線轉空`,
        weight: maWeight,
      });
      totalScore += maWeight * -50;
    } else {
      reasons.push({
        factor: "均線排列",
        assessment: "neutral",
        detail: `均線糾結中，趨勢不明確`,
        weight: maWeight,
      });
      totalScore += maWeight * 0;
    }
    totalWeight += maWeight;
  }

  // ━━━ 2. RSI 動能 (權重 0.20) ━━━
  const rsiWeight = 0.20;
  if (stock.rsi_14 != null) {
    if (stock.rsi_14 <= THRESHOLDS.rsi_strong_oversold) {
      reasons.push({
        factor: "RSI 動能",
        assessment: "positive",
        detail: `RSI ${stock.rsi_14.toFixed(0)} 極度超賣，反彈機率高`,
        weight: rsiWeight,
      });
      totalScore += rsiWeight * 80;
    } else if (stock.rsi_14 <= THRESHOLDS.rsi_oversold) {
      reasons.push({
        factor: "RSI 動能",
        assessment: "positive",
        detail: `RSI ${stock.rsi_14.toFixed(0)} 進入超賣區，留意反轉`,
        weight: rsiWeight,
      });
      totalScore += rsiWeight * 50;
    } else if (stock.rsi_14 >= THRESHOLDS.rsi_strong_overbought) {
      reasons.push({
        factor: "RSI 動能",
        assessment: "negative",
        detail: `RSI ${stock.rsi_14.toFixed(0)} 極度超買，回調風險極高`,
        weight: rsiWeight,
      });
      totalScore += rsiWeight * -70;
    } else if (stock.rsi_14 >= THRESHOLDS.rsi_overbought) {
      reasons.push({
        factor: "RSI 動能",
        assessment: "negative",
        detail: `RSI ${stock.rsi_14.toFixed(0)} 進入超買區，動能可能減弱`,
        weight: rsiWeight,
      });
      totalScore += rsiWeight * -40;
    } else {
      // 50-70 = 健康多頭, 30-50 = 弱勢
      const rsiScore = stock.rsi_14 > 50 ? 30 : -10;
      reasons.push({
        factor: "RSI 動能",
        assessment: stock.rsi_14 > 50 ? "positive" : "neutral",
        detail: `RSI ${stock.rsi_14.toFixed(0)}，${stock.rsi_14 > 50 ? "多方動能健康" : "動能偏弱"}`,
        weight: rsiWeight,
      });
      totalScore += rsiWeight * rsiScore;
    }
    totalWeight += rsiWeight;
  }

  // ━━━ 3. MACD 趨勢 (權重 0.18) ━━━
  const macdWeight = 0.18;
  if (stock.macd != null && stock.macd_signal != null && stock.macd_histogram != null) {
    const bullish = stock.macd > stock.macd_signal;
    const histPositive = stock.macd_histogram > 0;
    const histGrowing = stock.macd_histogram > 0; // 簡化判斷

    if (bullish && histPositive) {
      reasons.push({
        factor: "MACD 趨勢",
        assessment: "positive",
        detail: `MACD 在訊號線之上，柱狀圖正值，多頭趨勢`,
        weight: macdWeight,
      });
      totalScore += macdWeight * 60;
    } else if (!bullish && !histPositive) {
      reasons.push({
        factor: "MACD 趨勢",
        assessment: "negative",
        detail: `MACD 在訊號線之下，柱狀圖負值，空頭趨勢`,
        weight: macdWeight,
      });
      totalScore += macdWeight * -50;
    } else {
      reasons.push({
        factor: "MACD 趨勢",
        assessment: "neutral",
        detail: `MACD 訊號混合，可能正在轉向`,
        weight: macdWeight,
      });
      totalScore += macdWeight * 10;
    }
    totalWeight += macdWeight;
  }

  // ━━━ 4. 成交量確認 (權重 0.12) ━━━
  const volWeight = 0.12;
  if (stock.volume_ratio != null) {
    const priceUp = stock.change_pct > 0;
    const volumeSurge = stock.volume_ratio >= THRESHOLDS.volume_surge;
    const volumeDry = stock.volume_ratio <= THRESHOLDS.volume_dry;

    if (priceUp && volumeSurge) {
      reasons.push({
        factor: "成交量確認",
        assessment: "positive",
        detail: `量增價漲（量比 ${stock.volume_ratio.toFixed(1)}x），多方動能有量支撐`,
        weight: volWeight,
      });
      totalScore += volWeight * 70;
    } else if (!priceUp && volumeSurge) {
      reasons.push({
        factor: "成交量確認",
        assessment: "negative",
        detail: `量增價跌（量比 ${stock.volume_ratio.toFixed(1)}x），恐慌拋售訊號`,
        weight: volWeight,
      });
      totalScore += volWeight * -60;
    } else if (priceUp && volumeDry) {
      reasons.push({
        factor: "成交量確認",
        assessment: "neutral",
        detail: `價漲量縮（量比 ${stock.volume_ratio.toFixed(1)}x），上漲缺乏量能支撐`,
        weight: volWeight,
      });
      totalScore += volWeight * -10;
    } else {
      reasons.push({
        factor: "成交量確認",
        assessment: "neutral",
        detail: `成交量正常（量比 ${stock.volume_ratio.toFixed(1)}x）`,
        weight: volWeight,
      });
      totalScore += volWeight * 0;
    }
    totalWeight += volWeight;
  }

  // ━━━ 5. 布林通道位置 (權重 0.10) ━━━
  const bbWeight = 0.10;
  if (stock.bb_upper != null && stock.bb_lower != null) {
    const bbWidth = (stock.bb_upper - stock.bb_lower) / stock.price;
    const positionInBB = (stock.price - stock.bb_lower) / (stock.bb_upper - stock.bb_lower);

    if (bbWidth < THRESHOLDS.bb_squeeze_pct) {
      reasons.push({
        factor: "布林通道",
        assessment: "neutral",
        detail: `布林帶擠壓（寬度 ${(bbWidth * 100).toFixed(1)}%），大幅波動即將到來`,
        weight: bbWeight,
      });
      totalScore += bbWeight * 10; // 擠壓是中性偏正面（準備突破）
    } else if (positionInBB > 0.9) {
      reasons.push({
        factor: "布林通道",
        assessment: "negative",
        detail: `價格觸及布林上軌，短線可能回調`,
        weight: bbWeight,
      });
      totalScore += bbWeight * -30;
    } else if (positionInBB < 0.1) {
      reasons.push({
        factor: "布林通道",
        assessment: "positive",
        detail: `價格觸及布林下軌，短線可能反彈`,
        weight: bbWeight,
      });
      totalScore += bbWeight * 50;
    } else {
      reasons.push({
        factor: "布林通道",
        assessment: "neutral",
        detail: `價格在布林通道中間區域（位置 ${(positionInBB * 100).toFixed(0)}%）`,
        weight: bbWeight,
      });
      totalScore += bbWeight * 0;
    }
    totalWeight += bbWeight;
  }

  // ━━━ 6. 形態訊號 (權重 0.15) ━━━
  const patternWeight = 0.15;
  const significantPatterns = stock.patterns.filter(
    (p) => p.confidence >= 70 && (p.stage === "completed" || p.stage === "confirmed")
  );

  if (significantPatterns.length > 0) {
    const bullishPatterns = significantPatterns.filter((p) => p.pattern_type === "bullish");
    const bearishPatterns = significantPatterns.filter((p) => p.pattern_type === "bearish");

    if (bullishPatterns.length > bearishPatterns.length) {
      const topPattern = bullishPatterns.sort((a, b) => b.confidence - a.confidence)[0];
      reasons.push({
        factor: "形態訊號",
        assessment: "positive",
        detail: `偵測到看多形態：${topPattern.description}（信心 ${topPattern.confidence}%）`,
        weight: patternWeight,
      });
      totalScore += patternWeight * (topPattern.confidence * 0.8);
    } else if (bearishPatterns.length > bullishPatterns.length) {
      const topPattern = bearishPatterns.sort((a, b) => b.confidence - a.confidence)[0];
      reasons.push({
        factor: "形態訊號",
        assessment: "negative",
        detail: `偵測到看空形態：${topPattern.description}（信心 ${topPattern.confidence}%）`,
        weight: patternWeight,
      });
      totalScore += patternWeight * -(topPattern.confidence * 0.8);
    } else {
      reasons.push({
        factor: "形態訊號",
        assessment: "neutral",
        detail: `多空形態訊號互相矛盾`,
        weight: patternWeight,
      });
      totalScore += patternWeight * 0;
    }
    totalWeight += patternWeight;
  } else {
    reasons.push({
      factor: "形態訊號",
      assessment: "neutral",
      detail: `目前無高信心度形態訊號`,
      weight: patternWeight,
    });
    totalWeight += patternWeight;
  }

  // ── 計算最終信號 ──────────────────────────

  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const confidence = Math.min(95, Math.round(Math.abs(normalizedScore) + (totalWeight * 25)));
  const signal = scoreToSignal(normalizedScore);

  // ── 計算建議價位（嚴格風控）──────────────────

  let targetEntry: number | null = null;
  let targetExit: number | null = null;
  let stopLoss: number | null = null;

  if (stock.atr_14 != null) {
    // 停損 = 現價 - 2 倍 ATR
    stopLoss = Math.round((stock.price - stock.atr_14 * THRESHOLDS.atr_stop_multiplier) * 100) / 100;
    // 目標 = 現價 + 3 倍 ATR（風報比 1.5:1）
    targetExit = Math.round((stock.price + stock.atr_14 * 3) * 100) / 100;
  }

  if (signal === "buy" || signal === "strong_buy") {
    // 回調到 SMA20 附近是好的進場點
    targetEntry = stock.sma_20 != null ? Math.round(stock.sma_20 * 100) / 100 : null;
  }

  // ── 形態評論 ──────────────────────────────

  let patternComment: string | null = null;
  if (significantPatterns.length > 0) {
    patternComment = `高度重視形態訊號，目前偵測到 ${significantPatterns.length} 個有效形態`;
  } else {
    patternComment = "持續監控中，暫無觸發形態";
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
    pattern_weight: 0.85, // 高度重視形態
    pattern_comment: patternComment,
  };
}

function scoreToSignal(score: number): ExpertVerdict["signal"] {
  if (score >= 55) return "strong_buy";
  if (score >= 20) return "buy";
  if (score >= -20) return "hold";
  if (score >= -55) return "sell";
  return "strong_sell";
}
