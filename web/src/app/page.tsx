import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { PriceChart } from "@/components/PriceChart";

export default async function StockDetailPage({
  params,
}: {
  params: { symbol: string };
}) {
  const symbol = params.symbol.toUpperCase();
  const supabase = createClient();

  // 拉最近 6 個月日線
  const { data: prices } = await supabase
    .from("daily_prices")
    .select("date, close, open, high, low, volume")
    .eq("symbol", symbol)
    .order("date", { ascending: false })
    .limit(180);

  // 拉最新一筆基本面
  const { data: fundList } = await supabase
    .from("fundamentals")
    .select("*")
    .eq("symbol", symbol)
    .order("snapshot_at", { ascending: false })
    .limit(1);

  const fund = fundList?.[0];

  // 拉最近一日的指標
  const { data: indList } = await supabase
    .from("daily_indicators")
    .select("*")
    .eq("symbol", symbol)
    .order("date", { ascending: false })
    .limit(1);

  const ind = indList?.[0];

  const chartData = (prices || []).slice().reverse().map((p) => ({
    date: p.date,
    close: p.close,
  }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/"
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← 回到自選股
      </Link>

      <h1 className="text-2xl font-medium mt-4 mb-6">{symbol}</h1>

      {chartData.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-500">
          尚無資料,等下次 worker 跑完(每日美東收盤後)
        </div>
      ) : (
        <>
          {/* 價格圖 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
            <h2 className="text-base font-medium mb-3">收盤價(近 180 日)</h2>
            <PriceChart data={chartData} />
          </div>

          {/* 指標摘要 */}
          {ind && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
              <h2 className="text-base font-medium mb-3">技術指標(最新)</h2>
              <Stats
                items={[
                  { label: "SMA 20", value: fmt(ind.sma_20) },
                  { label: "SMA 50", value: fmt(ind.sma_50) },
                  { label: "SMA 200", value: fmt(ind.sma_200) },
                  { label: "RSI 14", value: fmt(ind.rsi_14, 1) },
                  { label: "MACD", value: fmt(ind.macd, 3) },
                  { label: "ATR 14", value: fmt(ind.atr_14, 2) },
                ]}
              />
            </div>
          )}

          {/* 基本面摘要 */}
          {fund && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="text-base font-medium mb-3">基本面快照</h2>
              <Stats
                items={[
                  { label: "PE", value: fmt(fund.pe_ratio, 1) },
                  { label: "Forward PE", value: fmt(fund.forward_pe, 1) },
                  { label: "PEG", value: fmt(fund.peg_ratio, 2) },
                  { label: "PB", value: fmt(fund.pb_ratio, 2) },
                  { label: "ROE", value: fmtPct(fund.roe) },
                  { label: "毛利率", value: fmtPct(fund.profit_margin) },
                  { label: "股息殖利率", value: fmtPct(fund.dividend_yield) },
                  { label: "市值", value: fmtBig(fund.market_cap) },
                ]}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-xs text-gray-500 dark:text-gray-400">{it.label}</dt>
          <dd className="text-base mt-1">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v * 100).toFixed(2) + "%";
}

function fmtBig(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  return v.toFixed(0);
}
