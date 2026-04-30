import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { CandlestickChart } from "@/components/CandlestickChart";
import ExpertSection from "@/components/ExpertSection";

export default async function StockDetailPage({
  params,
}: {
  params: { symbol: string };
}) {
  const symbol = params.symbol.toUpperCase();
  const supabase = createClient();

  const { data: prices } = await supabase
    .from("daily_prices")
    .select("date, open, high, low, close, volume")
    .eq("symbol", symbol)
    .order("date", { ascending: true })
    .limit(600);

  const { data: indicators } = await supabase
    .from("daily_indicators")
    .select("date, sma_20, sma_50, sma_200, bb_upper, bb_middle, bb_lower, rsi_14, macd, macd_signal, macd_histogram")
    .eq("symbol", symbol)
    .order("date", { ascending: true })
    .limit(600);

  const { data: fundList } = await supabase
    .from("fundamentals")
    .select("*")
    .eq("symbol", symbol)
    .order("snapshot_at", { ascending: false })
    .limit(1);

  const fund = fundList?.[0];
  const latestInd = indicators?.[indicators.length - 1];

  const priceData = (prices || []).map((p) => ({
    date: p.date,
    open: Number(p.open),
    high: Number(p.high),
    low: Number(p.low),
    close: Number(p.close),
    volume: Number(p.volume),
  }));

  const indicatorData = (indicators || []).map((d) => ({
    date: d.date,
    sma_20: d.sma_20 != null ? Number(d.sma_20) : null,
    sma_50: d.sma_50 != null ? Number(d.sma_50) : null,
    sma_200: d.sma_200 != null ? Number(d.sma_200) : null,
    bb_upper: d.bb_upper != null ? Number(d.bb_upper) : null,
    bb_middle: d.bb_middle != null ? Number(d.bb_middle) : null,
    bb_lower: d.bb_lower != null ? Number(d.bb_lower) : null,
    rsi_14: d.rsi_14 != null ? Number(d.rsi_14) : null,
    macd: d.macd != null ? Number(d.macd) : null,
    macd_signal: d.macd_signal != null ? Number(d.macd_signal) : null,
    macd_histogram: d.macd_histogram != null ? Number(d.macd_histogram) : null,
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        ← 回到自選股
      </Link>

      {priceData.length === 0 ? (
        <div className="mt-8 bg-gray-800 rounded-xl p-12 text-center text-gray-400">
          尚無 {symbol} 的資料,請等下次 Worker 跑完
        </div>
      ) : (
        <>
          <div className="mt-4">
            <CandlestickChart
              priceData={priceData}
              indicatorData={indicatorData}
              symbol={symbol}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {latestInd && (
              <div className="bg-[#0a0e17] border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-medium text-gray-400 mb-4 tracking-wide uppercase">
                  技術指標
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="SMA 20" value={fmt(latestInd.sma_20)} />
                  <Stat label="SMA 50" value={fmt(latestInd.sma_50)} />
                  <Stat label="SMA 200" value={fmt(latestInd.sma_200)} />
                  <Stat
                    label="RSI 14"
                    value={fmt(latestInd.rsi_14, 1)}
                    color={rsiColor(latestInd.rsi_14)}
                  />
                  <Stat label="MACD" value={fmt(latestInd.macd, 3)} />
                  <Stat label="BB 寬度" value={
                    latestInd.bb_upper && latestInd.bb_lower && latestInd.bb_middle
                      ? ((Number(latestInd.bb_upper) - Number(latestInd.bb_lower)) / Number(latestInd.bb_middle) * 100).toFixed(1) + "%"
                      : "—"
                  } />
                </div>
                {latestInd.rsi_14 != null && (
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                      <span>超賣 30</span>
                      <span>RSI {Number(latestInd.rsi_14).toFixed(1)}</span>
                      <span>超買 70</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full relative overflow-hidden">
                      <div className="absolute left-0 top-0 h-full w-[30%] bg-green-900/40 rounded-l-full" />
                      <div className="absolute right-0 top-0 h-full w-[30%] bg-red-900/40 rounded-r-full" />
                      <div
                        className="absolute top-0 h-full w-1.5 bg-amber-400 rounded-full -translate-x-1/2"
                        style={{ left: `${Math.min(Math.max(Number(latestInd.rsi_14), 0), 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {fund && (
              <div className="bg-[#0a0e17] border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-medium text-gray-400 mb-4 tracking-wide uppercase">
                  基本面
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="PE" value={fmt(fund.pe_ratio, 1)} />
                  <Stat label="Forward PE" value={fmt(fund.forward_pe, 1)} />
                  <Stat label="PEG" value={fmt(fund.peg_ratio, 2)} />
                  <Stat label="PB" value={fmt(fund.pb_ratio, 2)} />
                  <Stat label="ROE" value={fmtPct(fund.roe)} />
                  <Stat label="淨利率" value={fmtPct(fund.profit_margin)} />
                  <Stat label="營收成長" value={fmtPct(fund.revenue_growth)} color={pctColor(fund.revenue_growth)} />
                  <Stat label="殖利率" value={fmtPct(fund.dividend_yield)} />
                  <Stat label="市值" value={fmtBig(fund.market_cap)} />
                </div>
              </div>
            )}
          </div>

          <div className="mt-6">
            <ExpertSection symbol={symbol} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className={`text-sm mt-0.5 font-medium ${color || "text-gray-200"}`}>
        {value}
      </dd>
    </div>
  );
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "—";
  return Number(v).toFixed(decimals);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (Number(v) * 100).toFixed(2) + "%";
}

function fmtBig(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  return n.toFixed(0);
}

function rsiColor(v: number | null | undefined): string {
  if (v == null) return "";
  const n = Number(v);
  if (n >= 70) return "text-red-400";
  if (n <= 30) return "text-green-400";
  return "text-amber-400";
}

function pctColor(v: number | null | undefined): string {
  if (v == null) return "";
  return Number(v) >= 0 ? "text-green-400" : "text-red-400";
}
