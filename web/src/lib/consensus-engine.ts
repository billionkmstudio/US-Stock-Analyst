// ============================================
// 綜合決策聚合器（五位專家版）
// ============================================

import type {
  StockSnapshot,
  ExpertVerdict,
  ConsensusResult,
} from "./expert-types";
import { SIGNAL_SCORES } from "./expert-types";
import { evaluateBuffett } from "./experts/buffett";
import { evaluateHedgeFund } from "./experts/hedge-fund";
import { evaluateDalio } from "./experts/dalio";
import { evaluateARK } from "./experts/ark";
import { evaluateAnalyst } from "./experts/analyst";

// ── 專家權重 ──────────────────────────────

const EXPERT_WEIGHTS: Record<string, number> = {
  buffett_value: 1.0,
  hedge_quant: 1.0,
  dalio_allweather: 1.0,
  ark_disruptive: 0.8,       // 創新派偏激進，稍降權重
  analyst_consensus: 0.9,    // 分析師有利益衝突，略降
};

// ── 執行所有專家評估 ────────────────────────

export function runAllExperts(stock: StockSnapshot): ConsensusResult {
  const verdicts: ExpertVerdict[] = [
    evaluateBuffett(stock),
    evaluateHedgeFund(stock),
    evaluateDalio(stock),
    evaluateARK(stock),
    evaluateAnalyst(stock),
  ];

  return aggregateVerdicts(stock, verdicts);
}

// ── 聚合邏輯 ──────────────────────────────

function aggregateVerdicts(
  stock: StockSnapshot,
  verdicts: ExpertVerdict[]
): ConsensusResult {
  let weightedSum = 0;
  let totalWeight = 0;
  let bullCount = 0;
  let bearCount = 0;
  let neutralCount = 0;

  for (const v of verdicts) {
    const w = EXPERT_WEIGHTS[v.expert_id] ?? 1.0;
    const score = SIGNAL_SCORES[v.signal];
    weightedSum += score * w;
    totalWeight += w;

    if (score > 0) bullCount++;
    else if (score < 0) bearCount++;
    else neutralCount++;
  }

  const consensusScore = totalWeight > 0
    ? Math.round(weightedSum / totalWeight)
    : 0;

  // ── 共識度計算 ──
  const scores = verdicts.map((v) => SIGNAL_SCORES[v.signal]);
  const allSameDirection =
    scores.every((s) => s > 0) || scores.every((s) => s < 0) || scores.every((s) => s === 0);
  const maxSpread = Math.max(...scores) - Math.min(...scores);
  const agreementLevel = allSameDirection
    ? Math.round(100 - (maxSpread / 200) * 30)
    : Math.round(Math.max(0, 100 - (maxSpread / 200) * 100));

  // ── 分歧與共識 ──
  const { keyDisagreement, keyAgreement } = findKeyInsights(verdicts);

  const consensusSignal = scoreToConsensusSignal(consensusScore);

  const suggestedAction = buildSuggestedAction(
    consensusSignal,
    consensusScore,
    agreementLevel,
    verdicts,
    stock
  );

  // ── 彙整進場價位 ──
  const entryPrices: { label: string; price: number }[] = [];
  for (const v of verdicts) {
    if (v.target_entry != null) {
      entryPrices.push({
        label: `${v.expert_name_zh}建議`,
        price: v.target_entry,
      });
    }
  }
  entryPrices.sort((a, b) => a.price - b.price);

  // 取最嚴格的停損
  const stopLosses = verdicts
    .map((v) => v.stop_loss)
    .filter((s): s is number => s != null);
  const stopLoss = stopLosses.length > 0 ? Math.max(...stopLosses) : null;

  return {
    symbol: stock.symbol,
    date: stock.date,
    verdicts,
    consensus_signal: consensusSignal,
    consensus_score: consensusScore,
    agreement_level: agreementLevel,
    bull_count: bullCount,
    bear_count: bearCount,
    neutral_count: neutralCount,
    key_disagreement: keyDisagreement,
    key_agreement: keyAgreement,
    suggested_action: suggestedAction,
    entry_prices: entryPrices,
    stop_loss: stopLoss,
  };
}

// ── 找出關鍵分歧與共識 ──

function findKeyInsights(verdicts: ExpertVerdict[]): {
  keyDisagreement: string | null;
  keyAgreement: string | null;
} {
  if (verdicts.length < 2) {
    return { keyDisagreement: null, keyAgreement: null };
  }

  // 找分歧
  let maxDiff = 0;
  let disagreeA: ExpertVerdict | null = null;
  let disagreeB: ExpertVerdict | null = null;

  for (let i = 0; i < verdicts.length; i++) {
    for (let j = i + 1; j < verdicts.length; j++) {
      const diff = Math.abs(
        SIGNAL_SCORES[verdicts[i].signal] - SIGNAL_SCORES[verdicts[j].signal]
      );
      if (diff > maxDiff) {
        maxDiff = diff;
        disagreeA = verdicts[i];
        disagreeB = verdicts[j];
      }
    }
  }

  let keyDisagreement: string | null = null;
  if (disagreeA && disagreeB && maxDiff > 50) {
    const aTopReason = [...disagreeA.reasons].sort((a, b) => b.weight - a.weight)[0];
    const bTopReason = [...disagreeB.reasons].sort((a, b) => b.weight - a.weight)[0];

    keyDisagreement =
      `${disagreeA.expert_name_zh}看${SIGNAL_SCORES[disagreeA.signal] > 0 ? "多" : "空"}（主因：${aTopReason?.factor ?? "綜合判斷"}），` +
      `${disagreeB.expert_name_zh}看${SIGNAL_SCORES[disagreeB.signal] > 0 ? "多" : "空"}（主因：${bTopReason?.factor ?? "綜合判斷"}）`;
  }

  // 找共識
  let keyAgreement: string | null = null;
  const factorMap = new Map<string, Set<string>>();
  for (const v of verdicts) {
    for (const r of v.reasons) {
      if (!factorMap.has(r.factor)) {
        factorMap.set(r.factor, new Set());
      }
      factorMap.get(r.factor)!.add(r.assessment);
    }
  }

  const agreedFactors: string[] = [];
  for (const [factor, assessments] of factorMap) {
    if (assessments.size === 1) {
      const direction = [...assessments][0];
      if (direction !== "neutral") {
        agreedFactors.push(
          `${factor}${direction === "positive" ? "正面" : "負面"}`
        );
      }
    }
  }

  if (agreedFactors.length > 0) {
    keyAgreement = `所有專家一致認為：${agreedFactors.slice(0, 3).join("、")}`;
  }

  return { keyDisagreement, keyAgreement };
}

// ── 建議操作文字 ──

function buildSuggestedAction(
  signal: ConsensusResult["consensus_signal"],
  score: number,
  agreement: number,
  verdicts: ExpertVerdict[],
  stock: StockSnapshot
): string {
  const parts: string[] = [];

  if (signal === "strong_buy") {
    parts.push("多數專家看多，可考慮建倉或加碼");
  } else if (signal === "buy") {
    parts.push("偏多信號，可小量試單或等回調進場");
  } else if (signal === "hold") {
    parts.push("信號中性，建議觀望等待更明確方向");
  } else if (signal === "sell") {
    parts.push("偏空信號，已持有者考慮減碼或設停損");
  } else {
    parts.push("多數專家看空，建議避開或清倉");
  }

  if (agreement < 40) {
    parts.push("但專家間分歧大，務必謹慎");
  } else if (agreement > 80) {
    parts.push("專家共識度高");
    if (signal === "strong_buy" || signal === "buy") {
      parts.push("但高度共識時也要留意反向風險");
    }
  }

  // 看有幾派看多看空
  const bullExperts = verdicts.filter((v) => SIGNAL_SCORES[v.signal] > 0).map((v) => v.expert_name_zh);
  const bearExperts = verdicts.filter((v) => SIGNAL_SCORES[v.signal] < 0).map((v) => v.expert_name_zh);

  if (bullExperts.length > 0 && bearExperts.length > 0) {
    parts.push(`看多：${bullExperts.join("、")}；看空：${bearExperts.join("、")}`);
  }

  const entries = verdicts
    .map((v) => v.target_entry)
    .filter((e): e is number => e != null)
    .sort((a, b) => a - b);
  if (entries.length >= 2) {
    parts.push(
      `建議分批：第一批 $${entries[entries.length - 1]}，第二批 $${entries[0]}`
    );
  }

  return parts.join("。") + "。";
}

function scoreToConsensusSignal(
  score: number
): ConsensusResult["consensus_signal"] {
  if (score >= 40) return "strong_buy";
  if (score >= 12) return "buy";
  if (score >= -12) return "hold";
  if (score >= -40) return "sell";
  return "strong_sell";
}
