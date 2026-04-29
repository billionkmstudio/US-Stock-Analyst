"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import dynamic from "next/dynamic";
import ExpertPanel from "@/components/ExpertPanel";

// 修正：用 .then(mod => mod.default) 解決 Next.js 14 dynamic() 型別推斷問題
const CandlestickChart = dynamic<{ symbol: string }>(
  () => import("@/components/CandlestickChart").then((mod) => mod.default),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface StockInfo {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
}

export default function StockDetailPage() {
  const params = useParams();
  const symbol = (params?.symbol as string)?.toUpperCase() ?? "";

  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBasicInfo() {
      setLoading(true);
      const { data: prices } = await supabase
        .from("daily_prices")
        .select("*")
        .eq("symbol", symbol)
        .order("date", { ascending: false })
        .limit(2);

      if (prices && prices.length >= 1) {
        const latest = prices[0];
        const prev = prices[1];
        const change = prev ? latest.close - prev.close : 0;
        const changePct = prev ? (change / prev.close) * 100 : 0;

        setStockInfo({
          symbol,
          name: symbol,
          price: latest.close,
          change,
          changePct,
        });
      }
      setLoading(false);
    }

    if (symbol) loadBasicInfo();
  }, [symbol]);

  if (!symbol) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* ── 標題列 ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {symbol}
          </h1>
          {stockInfo && (
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                ${stockInfo.price.toFixed(2)}
              </span>
              <span
                className={`text-lg font-semibold font-mono ${
                  stockInfo.change >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-500"
                }`}
              >
                {stockInfo.change >= 0 ? "+" : ""}
                {stockInfo.change.toFixed(2)} ({stockInfo.changePct.toFixed(2)}
                %)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── K 線圖 ── */}
      <section>
        <CandlestickChart symbol={symbol} />
      </section>

      {/* ── 專家策略建議面板 ── */}
      <section>
        <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-4 flex items-center gap-2">
          <span>🧠</span>
          <span>專家策略模擬器</span>
        </h2>
        <ExpertPanel symbol={symbol} />
      </section>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="w-full h-[400px] rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse flex items-center justify-center">
      <span className="text-sm text-zinc-400">K 線圖載入中...</span>
    </div>
  );
}
