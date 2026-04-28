import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { AddStockForm } from "@/components/AddStockForm";
import { LogoutButton } from "@/components/LogoutButton";

export default async function HomePage() {
  const supabase = createClient();

  const { data: watchlist } = await supabase
    .from("watchlist")
    .select("*")
    .order("added_at", { ascending: true });

  const symbols = (watchlist || []).map((w) => w.symbol);
  let latestPrices: Record<string, { close: number; prev_close: number; date: string }> = {};

  if (symbols.length > 0) {
    // 拉每支的最近兩天,算漲跌
    const { data: prices } = await supabase
      .from("daily_prices")
      .select("symbol, close, date")
      .in("symbol", symbols)
      .order("date", { ascending: false });

    if (prices) {
      const countMap: Record<string, number> = {};
      for (const p of prices) {
        countMap[p.symbol] = (countMap[p.symbol] || 0) + 1;
        if (countMap[p.symbol] === 1) {
          latestPrices[p.symbol] = { close: Number(p.close), prev_close: Number(p.close), date: p.date };
        } else if (countMap[p.symbol] === 2) {
          latestPrices[p.symbol].prev_close = Number(p.close);
        }
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">自選股</h1>
        <LogoutButton />
      </header>

      <AddStockForm />

      <div className="mt-6 bg-[#0a0e17] border border-gray-800 rounded-xl overflow-hidden">
        {(watchlist || []).length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            還沒有自選股,在上方加入第一支吧
          </div>
        ) : (
          <table className="w-full">
            <thead className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 font-medium">代號</th>
                <th className="px-4 py-3 font-medium text-right">收盤</th>
                <th className="px-4 py-3 font-medium text-right">漲跌</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">日期</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">備註</th>
              </tr>
            </thead>
            <tbody>
              {(watchlist || []).map((w) => {
                const p = latestPrices[w.symbol];
                const change = p ? p.close - p.prev_close : 0;
                const changePct = p ? (change / p.prev_close) * 100 : 0;
                const isUp = change >= 0;

                return (
                  <tr
                    key={w.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/stocks/${w.symbol}`}
                        className="font-medium text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {w.symbol}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm">
                      {p ? `$${p.close.toFixed(2)}` : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-medium ${
                      p ? (isUp ? "text-green-400" : "text-red-400") : "text-gray-500"
                    }`}>
                      {p ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">
                      {p?.date || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">
                      {w.note || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <footer className="mt-6 text-[11px] text-gray-600">
        資料每日盤後由 GitHub Actions 自動更新
      </footer>
    </div>
  );
}
