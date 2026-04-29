"use client";

import { useEffect, useState } from "react";
import type { ConsensusResult, ExpertVerdict } from "@/lib/expert-types";
import { SIGNAL_LABELS_ZH, SIGNAL_COLORS } from "@/lib/expert-types";

// ============================================
// 專家策略建議面板
// ============================================
// 放在個股詳情頁的 K 線圖下方
// 呼叫 /api/analysis/[symbol] 取得專家建議
// ============================================

interface ExpertPanelProps {
  symbol: string;
}

interface AnalysisResponse {
  consensus: ConsensusResult;
  computed_at: string;
}

export default function ExpertPanel({ symbol }: ExpertPanelProps) {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedExpert, setExpandedExpert] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalysis() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/analysis/${symbol}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "分析載入失敗");
        }
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "未知錯誤");
      } finally {
        setLoading(false);
      }
    }
    fetchAnalysis();
  }, [symbol]);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500" />
          <span className="text-sm text-zinc-500">專家分析引擎運算中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-6">
        <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { consensus } = data;

  return (
    <div className="space-y-4">
      {/* ── 綜合建議卡片 ── */}
      <ConsensusCard consensus={consensus} computedAt={data.computed_at} />

      {/* ── 分歧與共識 ── */}
      <InsightsCard consensus={consensus} />

      {/* ── 每位專家詳細判斷 ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          各派專家判斷
        </h3>
        {consensus.verdicts.map((verdict) => (
          <ExpertCard
            key={verdict.expert_id}
            verdict={verdict}
            expanded={expandedExpert === verdict.expert_id}
            onToggle={() =>
              setExpandedExpert(
                expandedExpert === verdict.expert_id ? null : verdict.expert_id
              )
            }
          />
        ))}
      </div>

      {/* ── 免責聲明 ── */}
      <p className="text-[11px] text-zinc-400 dark:text-zinc-600 leading-relaxed">
        ⚠️ 以上為規則化的策略模擬，非真實人物意見。僅供參考，投資決策請自行判斷。
        所有專家畫像基於公開的投資原則建立，與實際操作可能有重大差異。
      </p>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 子元件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 綜合建議卡片 */
function ConsensusCard({
  consensus,
  computedAt,
}: {
  consensus: ConsensusResult;
  computedAt: string;
}) {
  const signalColor = SIGNAL_COLORS[consensus.consensus_signal];
  const signalLabel = SIGNAL_LABELS_ZH[consensus.consensus_signal];

  // 共識度條的顏色
  const agreementColor =
    consensus.agreement_level >= 70
      ? "bg-green-500"
      : consensus.agreement_level >= 40
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* 頂部信號條 */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: signalColor + "15" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full animate-pulse"
            style={{ backgroundColor: signalColor }}
          />
          <span
            className="text-lg font-bold"
            style={{ color: signalColor }}
          >
            {signalLabel}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">
            <span className="text-green-600 dark:text-green-400 font-medium">
              {consensus.bull_count} 看多
            </span>
            {" · "}
            <span className="text-zinc-500 font-medium">
              {consensus.neutral_count} 觀望
            </span>
            {" · "}
            <span className="text-red-500 font-medium">
              {consensus.bear_count} 看空
            </span>
          </span>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* 綜合分數 */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            綜合分數
          </span>
          <div className="flex items-center gap-3">
            <div className="w-40 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${((consensus.consensus_score + 100) / 200) * 100}%`,
                  backgroundColor: signalColor,
                }}
              />
            </div>
            <span className="text-sm font-mono font-bold" style={{ color: signalColor }}>
              {consensus.consensus_score > 0 ? "+" : ""}
              {consensus.consensus_score}
            </span>
          </div>
        </div>

        {/* 共識度 */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            專家共識度
          </span>
          <div className="flex items-center gap-3">
            <div className="w-40 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${agreementColor}`}
                style={{ width: `${consensus.agreement_level}%` }}
              />
            </div>
            <span className="text-sm font-mono font-bold text-zinc-700 dark:text-zinc-300">
              {consensus.agreement_level}%
            </span>
          </div>
        </div>

        {/* 建議操作 */}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            {consensus.suggested_action}
          </p>
        </div>

        {/* 建議價位 */}
        {(consensus.entry_prices.length > 0 || consensus.stop_loss) && (
          <div className="flex flex-wrap gap-3">
            {consensus.entry_prices.map((ep, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 px-3 py-1.5"
              >
                <span className="text-[11px] text-green-600 dark:text-green-400">
                  {ep.label}
                </span>
                <span className="text-sm font-mono font-bold text-green-700 dark:text-green-300">
                  ${ep.price}
                </span>
              </div>
            ))}
            {consensus.stop_loss && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-1.5">
                <span className="text-[11px] text-red-500 dark:text-red-400">
                  停損
                </span>
                <span className="text-sm font-mono font-bold text-red-600 dark:text-red-300">
                  ${consensus.stop_loss}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="text-[11px] text-zinc-400 dark:text-zinc-600">
          分析時間：{new Date(computedAt).toLocaleString("zh-TW")}
        </div>
      </div>
    </div>
  );
}

/** 分歧與共識洞察卡片 */
function InsightsCard({ consensus }: { consensus: ConsensusResult }) {
  if (!consensus.key_disagreement && !consensus.key_agreement) return null;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3">
      {consensus.key_disagreement && (
        <div className="flex gap-3">
          <span className="text-base flex-shrink-0">⚡</span>
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
              關鍵分歧
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {consensus.key_disagreement}
            </p>
          </div>
        </div>
      )}
      {consensus.key_agreement && (
        <div className="flex gap-3">
          <span className="text-base flex-shrink-0">🤝</span>
          <div>
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
              共識觀點
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {consensus.key_agreement}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** 單一專家判斷卡片 */
function ExpertCard({
  verdict,
  expanded,
  onToggle,
}: {
  verdict: ExpertVerdict;
  expanded: boolean;
  onToggle: () => void;
}) {
  const signalColor = SIGNAL_COLORS[verdict.signal];
  const signalLabel = SIGNAL_LABELS_ZH[verdict.signal];

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* 摘要行（可點擊展開） */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ExpertAvatar expertId={verdict.expert_id} />
          <div className="text-left">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {verdict.expert_name_zh}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {verdict.school_zh}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* 形態態度指標 */}
          <div className="hidden sm:flex items-center gap-1" title="對形態訊號的重視程度">
            <span className="text-[10px] text-zinc-400">形態</span>
            <div className="flex gap-0.5">
              {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold) => (
                <div
                  key={threshold}
                  className={`w-1.5 h-3 rounded-sm ${
                    verdict.pattern_weight >= threshold
                      ? "bg-blue-500"
                      : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* 信號徽章 */}
          <span
            className="text-xs font-bold px-3 py-1 rounded-full"
            style={{
              color: signalColor,
              backgroundColor: signalColor + "18",
            }}
          >
            {signalLabel}
          </span>

          {/* 信心度 */}
          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 w-8 text-right">
            {verdict.confidence}%
          </span>

          {/* 展開箭頭 */}
          <svg
            className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* 展開的詳細內容 */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-zinc-100 dark:border-zinc-800">
          {/* 判斷理由 */}
          <div className="mt-4 space-y-2">
            {verdict.reasons
              .sort((a, b) => b.weight - a.weight)
              .map((reason, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0">
                    {reason.assessment === "positive"
                      ? "🟢"
                      : reason.assessment === "negative"
                        ? "🔴"
                        : "🟡"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        {reason.factor}
                      </span>
                      <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                      <span className="text-[10px] text-zinc-400">
                        權重 {(reason.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                      {reason.detail}
                    </p>
                  </div>
                </div>
              ))}
          </div>

          {/* 建議價位 */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs">
            {verdict.target_entry != null && (
              <div>
                <span className="text-zinc-400">建議進場</span>{" "}
                <span className="font-mono font-bold text-green-600 dark:text-green-400">
                  ${verdict.target_entry}
                </span>
              </div>
            )}
            {verdict.target_exit != null && (
              <div>
                <span className="text-zinc-400">目標價</span>{" "}
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  ${verdict.target_exit}
                </span>
              </div>
            )}
            {verdict.stop_loss != null && (
              <div>
                <span className="text-zinc-400">停損價</span>{" "}
                <span className="font-mono font-bold text-red-500">
                  ${verdict.stop_loss}
                </span>
              </div>
            )}
          </div>

          {/* 形態態度 */}
          {verdict.pattern_comment && (
            <div className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500 italic">
              📐 {verdict.pattern_comment}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 專家頭像 */
function ExpertAvatar({ expertId }: { expertId: string }) {
  const config: Record<string, { emoji: string; bg: string }> = {
    buffett_value: { emoji: "🏛️", bg: "bg-amber-100 dark:bg-amber-900/40" },
    hedge_quant: { emoji: "📊", bg: "bg-purple-100 dark:bg-purple-900/40" },
    dalio_allweather: { emoji: "🌐", bg: "bg-blue-100 dark:bg-blue-900/40" },
    ark_disruptive: { emoji: "🚀", bg: "bg-pink-100 dark:bg-pink-900/40" },
    analyst_consensus: { emoji: "🏦", bg: "bg-teal-100 dark:bg-teal-900/40" },
  };

  const { emoji, bg } = config[expertId] ?? {
    emoji: "🤖",
    bg: "bg-zinc-100 dark:bg-zinc-800",
  };

  return (
    <div
      className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${bg}`}
    >
      {emoji}
    </div>
  );
}
