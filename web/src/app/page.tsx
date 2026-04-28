import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { AddStockForm } from "@/components/AddStockForm";
import { LogoutButton } from "@/components/LogoutButton";

export default async function HomePage() {
  const supabase = createClient();

  // 拉自選股
  const { data: watchlist } = await supabase
    .from("watchlist")
    .select("*")
    .order("added_at", { ascending: true });

  // 拉每支股票的最新價格
  const symbols = (watchlist || []).map((w) => w.symbol);
  let latestPrices: Record<string, { close: number; date: string }> = {};

  if (symbols.length > 0) {
    const { data: prices } = await supabase
      .from("daily_prices")
      .select("symbol, close, date")
      .in("symbol", symbols)
      .order("date", { ascending: false });

    // 取每支的最新一筆
    if (prices) {
      for (const p of prices) {
        if (!latestPrices[p.symbol]) {
          latestPrices[p.symbol] = { close: p.close, date: p.date };
        }
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-medium">自選股</h1>
        <LogoutButton />
      </header>

      <AddStockForm />

      <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {(watchlist || []).length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            還沒有自選股,在上方加入第一支吧
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 text-left text-sm text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-4 py-3 font-medium">代號</th>
                <th className="px-4 py-3 font-medium">最新收盤</th>
                <th className="px-4 py-3 font-medium">資料日期</th>
                <th className="px-4 py-3 font-medium">備註</th>
              </tr>
            </thead>
            <tbody>
              {(watchlist || []).map((w) => (
                <tr
                  key={w.id}
                  className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/stocks/${w.symbol}`}
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {w.symbol}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {latestPrices[w.symbol]?.close
                      ? `$${latestPrices[w.symbol].close.toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {latestPrices[w.symbol]?.date || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {w.note || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className="mt-8 text-xs text-gray-400 dark:text-gray-500">
        資料每日盤後由 GitHub Actions 自動更新
      </footer>
    </div>
  );
}
