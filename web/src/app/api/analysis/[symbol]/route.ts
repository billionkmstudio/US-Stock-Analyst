// ============================================
// /api/analysis/[symbol]/route.ts
// ============================================
// 從 Supabase 讀取已算好的數據，
// 即時套用專家規則引擎，回傳綜合建議
// ============================================
 
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { runAllExperts } from "@/lib/consensus-engine";
import type { StockSnapshot, PatternSignal } from "@/lib/expert-types";
 
export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol = params.symbol.toUpperCase();
  const supabase = createClient();
 
  try {
    // 並行讀取所有需要的數據
    const [priceResult, indicatorResult, fundamentalResult, patternResult] =
      await Promise.all([
        // 最新價格
        supabase
          .from("daily_prices")
          .select("*")
          .eq("symbol", symbol)
          .order("date", { ascending: false })
          .limit(2),
 
        // 最新技術指標
        supabase
          .from("daily_indicators")
          .select("*")
          .eq("symbol", symbol)
          .order("date", { ascending: false })
          .limit(1),
 
        // 最新基本面
        supabase
          .from("fundamentals")
          .select("*")
          .eq("symbol", symbol)
          .order("snapshot_at", { ascending: false })
          .limit(1),
 
        // 近期形態訊號（30 天內）
        supabase
          .from("pattern_signals")
          .select("*")
          .eq("symbol", symbol)
          .gte(
            "detected_at",
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          )
          .order("detected_at", { ascending: false }),
      ]);
 
    // 檢查是否有數據
    const latestPrice = priceResult.data?.[0];
    const prevPrice = priceResult.data?.[1];
    const indicators = indicatorResult.data?.[0];
    const fundamentals = fundamentalResult.data?.[0];
    const patterns = patternResult.data ?? [];
 
    if (!latestPrice) {
      return NextResponse.json(
        { error: `找不到 ${symbol} 的價格數據，請確認已加入自選股且 Worker 已執行` },
        { status: 404 }
      );
    }
 
    // 計算漲跌幅
    const changePct =
      prevPrice && prevPrice.close > 0
        ? ((latestPrice.close - prevPrice.close) / prevPrice.close) * 100
        : 0;
 
    // 組裝 StockSnapshot
    const snapshot: StockSnapshot = {
      symbol,
      name: fundamentals?.name ?? symbol,
      date: latestPrice.date,
      price: Number(latestPrice.close),
      change_pct: changePct,
 
      // 基本面
      pe_ratio: fundamentals?.pe_ratio != null ? Number(fundamentals.pe_ratio) : null,
      forward_pe: fundamentals?.forward_pe != null ? Number(fundamentals.forward_pe) : null,
      peg_ratio: fundamentals?.peg_ratio != null ? Number(fundamentals.peg_ratio) : null,
      pb_ratio: fundamentals?.pb_ratio != null ? Number(fundamentals.pb_ratio) : null,
      ps_ratio: fundamentals?.ps_ratio != null ? Number(fundamentals.ps_ratio) : null,
      roe: fundamentals?.roe != null ? Number(fundamentals.roe) * 100 : null,
      roic: fundamentals?.roic != null ? Number(fundamentals.roic) * 100 : null,
      gross_margin: fundamentals?.gross_margin != null ? Number(fundamentals.gross_margin) * 100 : null,
      net_margin: fundamentals?.profit_margin != null ? Number(fundamentals.profit_margin) * 100 : null,
      fcf_yield: fundamentals?.fcf_yield != null ? Number(fundamentals.fcf_yield) * 100 : null,
      dividend_yield: fundamentals?.dividend_yield != null ? Number(fundamentals.dividend_yield) * 100 : null,
      debt_to_equity: fundamentals?.debt_to_equity != null ? Number(fundamentals.debt_to_equity) : null,
      revenue_growth: fundamentals?.revenue_growth != null ? Number(fundamentals.revenue_growth) * 100 : null,
      eps_growth: fundamentals?.eps_growth != null ? Number(fundamentals.eps_growth) * 100 : null,
      market_cap: fundamentals?.market_cap != null ? Number(fundamentals.market_cap) : null,
 
      // 技術指標
      rsi_14: indicators?.rsi_14 != null ? Number(indicators.rsi_14) : null,
      macd: indicators?.macd != null ? Number(indicators.macd) : null,
      macd_signal: indicators?.macd_signal != null ? Number(indicators.macd_signal) : null,
      macd_histogram: indicators?.macd_histogram != null ? Number(indicators.macd_histogram) : null,
      sma_20: indicators?.sma_20 != null ? Number(indicators.sma_20) : null,
      sma_50: indicators?.sma_50 != null ? Number(indicators.sma_50) : null,
      sma_200: indicators?.sma_200 != null ? Number(indicators.sma_200) : null,
      bb_upper: indicators?.bb_upper != null ? Number(indicators.bb_upper) : null,
      bb_lower: indicators?.bb_lower != null ? Number(indicators.bb_lower) : null,
      atr_14: indicators?.atr_14 != null ? Number(indicators.atr_14) : null,
      volume_ratio: indicators?.volume_ratio != null ? Number(indicators.volume_ratio) : null,
 
      // 形態訊號
      patterns: (patterns || []).map(
        (p: Record<string, unknown>): PatternSignal => ({
          pattern_name: (p.pattern_name as string) ?? "",
          pattern_type: (p.pattern_type as PatternSignal["pattern_type"]) ?? "neutral",
          confidence: Number(p.confidence ?? 0),
          stage: (p.stage as PatternSignal["stage"]) ?? "forming",
          detected_at: (p.detected_at as string) ?? "",
          description: (p.description as string) ?? "",
        })
      ),
 
      // 分析師
      analyst_target_mean: fundamentals?.analyst_target_mean != null ? Number(fundamentals.analyst_target_mean) : null,
      analyst_target_low: fundamentals?.analyst_target_low != null ? Number(fundamentals.analyst_target_low) : null,
      analyst_target_high: fundamentals?.analyst_target_high != null ? Number(fundamentals.analyst_target_high) : null,
      analyst_buy_count: fundamentals?.analyst_buy_count != null ? Number(fundamentals.analyst_buy_count) : null,
      analyst_hold_count: fundamentals?.analyst_hold_count != null ? Number(fundamentals.analyst_hold_count) : null,
      analyst_sell_count: fundamentals?.analyst_sell_count != null ? Number(fundamentals.analyst_sell_count) : null,
    };
 
    // 執行所有專家評估（純 TypeScript 邏輯，毫秒級）
    const consensus = runAllExperts(snapshot);
 
    return NextResponse.json({
      snapshot,
      consensus,
      computed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Expert analysis error:", error);
    return NextResponse.json(
      { error: "分析過程發生錯誤" },
      { status: 500 }
    );
  }
}
 




