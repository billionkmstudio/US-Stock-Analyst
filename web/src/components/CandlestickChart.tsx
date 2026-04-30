"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

// ==============================
// 類型定義
// ==============================

type OHLCVRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type IndicatorRow = {
  date: string;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
};

type PatternRow = {
  date: string;
  pattern_name: string;
  pattern_type: "bullish" | "bearish" | "neutral";
  confidence: number;
  stage: string;
  description: string;
};

type Props = {
  priceData: OHLCVRow[];
  indicatorData: IndicatorRow[];
  patternData?: PatternRow[];
  symbol: string;
};

type Overlay = "sma" | "bollinger";

// ==============================
// 顏色設定
// ==============================

const COLORS = {
  bg: "#0a0e17",
  text: "#9ca3af",
  textBright: "#e5e7eb",
  grid: "#1a1f2e",
  crosshair: "#374151",
  up: "#22c55e",
  down: "#ef4444",
  volumeUp: "rgba(34,197,94,0.25)",
  volumeDown: "rgba(239,68,68,0.2)",
  sma20: "#f59e0b",
  sma50: "#3b82f6",
  sma200: "#a855f7",
  bbUpper: "rgba(100,116,139,0.5)",
  bbLower: "rgba(100,116,139,0.5)",
  bbFill: "rgba(100,116,139,0.06)",
  rsiLine: "#f59e0b",
  rsiOverbought: "rgba(239,68,68,0.3)",
  rsiOversold: "rgba(34,197,94,0.3)",
  macdLine: "#3b82f6",
  macdSignal: "#f59e0b",
  macdHistUp: "rgba(34,197,94,0.6)",
  macdHistDown: "rgba(239,68,68,0.6)",
  patternBullish: "#22c55e",
  patternBearish: "#ef4444",
  patternNeutral: "#eab308",
};

// 形態名稱中文對照
const PATTERN_NAMES_ZH: Record<string, string> = {
  // K 線形態
  hammer: "鎚子線",
  inverted_hammer: "倒鎚子",
  bullish_engulfing: "看多吞噬",
  bearish_engulfing: "看空吞噬",
  morning_star: "晨星",
  evening_star: "暮星",
  three_white_soldiers: "三白兵",
  three_black_crows: "三黑鴉",
  doji: "十字星",
  dragonfly_doji: "蜻蜓十字",
  gravestone_doji: "墓碑十字",
  spinning_top: "紡錘線",
  marubozu: "光頭光腳",
  piercing_line: "穿刺線",
  dark_cloud_cover: "烏雲蓋頂",
  harami: "母子線",
  bullish_harami: "看多母子",
  bearish_harami: "看空母子",
  tweezer_top: "鑷子頂",
  tweezer_bottom: "鑷子底",
  // 圖形形態
  head_and_shoulders_top: "頭肩頂",
  head_and_shoulders_bottom: "頭肩底",
  double_top: "雙頂（M頭）",
  double_bottom: "雙底（W底）",
  ascending_triangle: "上升三角",
  descending_triangle: "下降三角",
  symmetric_triangle: "對稱三角",
  rising_wedge: "上升楔形",
  falling_wedge: "下降楔形",
  bull_flag: "多頭旗形",
  bear_flag: "空頭旗形",
  cup_and_handle: "杯柄形態",
};

// ==============================
// 主元件
// ==============================

export function CandlestickChart({ priceData, indicatorData, patternData, symbol }: Props) {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<HTMLDivElement>(null);
  const macdChartRef = useRef<HTMLDivElement>(null);

  const [overlay, setOverlay] = useState<Overlay>("sma");
  const [showRsi, setShowRsi] = useState(true);
  const [showMacd, setShowMacd] = useState(false);
  const [showPatterns, setShowPatterns] = useState(true);
  const [timeRange, setTimeRange] = useState<"1M" | "3M" | "6M" | "1Y" | "ALL">("6M");

  // 根據時間範圍裁切資料
  const filteredData = filterByRange(priceData, timeRange);
  const filteredIndicators = filterByRange(indicatorData, timeRange);
  const filteredPatterns = patternData ? filterByRange(patternData, timeRange) : [];

  // 主圖(K 線 + 成交量 + 疊加指標 + 形態標注)
  useEffect(() => {
    if (!mainChartRef.current || filteredData.length === 0) return;

    const container = mainChartRef.current;
    container.innerHTML = "";

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: COLORS.bg },
        textColor: COLORS.text,
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: COLORS.crosshair, labelBackgroundColor: "#1f2937" },
        horzLine: { color: COLORS.crosshair, labelBackgroundColor: "#1f2937" },
      },
      rightPriceScale: {
        borderColor: COLORS.grid,
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      timeScale: {
        borderColor: COLORS.grid,
        timeVisible: false,
      },
    });

    // K 線
    const candleSeries = chart.addCandlestickSeries({
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });

    const candleData: CandlestickData[] = filteredData.map((d) => ({
      time: d.date as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleSeries.setData(candleData);

    // ── 形態標注 markers ──
    if (showPatterns && filteredPatterns.length > 0) {
      // 建立日期→價格查詢表
      const priceMap = new Map<string, OHLCVRow>();
      for (const d of filteredData) {
        priceMap.set(d.date, d);
      }

      const markers: SeriesMarker<Time>[] = filteredPatterns
        .filter((p) => p.confidence >= 60)
        .map((p) => {
          const priceRow = priceMap.get(p.date);
          const isBullish = p.pattern_type === "bullish";
          const isBearish = p.pattern_type === "bearish";
          const zhName = PATTERN_NAMES_ZH[p.pattern_name] || p.pattern_name;

          return {
            time: p.date as Time,
            position: isBullish ? "belowBar" as const : "aboveBar" as const,
            color: isBullish
              ? COLORS.patternBullish
              : isBearish
                ? COLORS.patternBearish
                : COLORS.patternNeutral,
            shape: isBullish ? "arrowUp" as const : isBearish ? "arrowDown" as const : "circle" as const,
            text: `${zhName} ${p.confidence}%`,
          };
        })
        .sort((a, b) => (a.time as string).localeCompare(b.time as string));

      if (markers.length > 0) {
        candleSeries.setMarkers(markers);
      }
    }

    // 成交量(底部 histogram)
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const volData: HistogramData[] = filteredData.map((d) => ({
      time: d.date as Time,
      value: d.volume,
      color: d.close >= d.open ? COLORS.volumeUp : COLORS.volumeDown,
    }));
    volumeSeries.setData(volData);

    // 疊加指標
    if (overlay === "sma") {
      addLineSeries(chart, filteredIndicators, "sma_20", COLORS.sma20, 2);
      addLineSeries(chart, filteredIndicators, "sma_50", COLORS.sma50, 2);
      addLineSeries(chart, filteredIndicators, "sma_200", COLORS.sma200, 2);
    } else if (overlay === "bollinger") {
      addLineSeries(chart, filteredIndicators, "bb_upper", COLORS.bbUpper, 1, LineStyle.Dashed);
      addLineSeries(chart, filteredIndicators, "bb_middle", COLORS.sma20, 1);
      addLineSeries(chart, filteredIndicators, "bb_lower", COLORS.bbLower, 1, LineStyle.Dashed);
    }

    chart.timeScale().fitContent();

    const handleResize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [filteredData, filteredIndicators, filteredPatterns, overlay, showPatterns]);

  // RSI 副圖
  useEffect(() => {
    if (!rsiChartRef.current || !showRsi || filteredIndicators.length === 0) return;

    const container = rsiChartRef.current;
    container.innerHTML = "";

    const chart = createSubChart(container, 120);

    const rsiSeries = chart.addLineSeries({
      color: COLORS.rsiLine,
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(1) },
    });

    const rsiData: LineData[] = filteredIndicators
      .filter((d) => d.rsi_14 != null)
      .map((d) => ({ time: d.date as Time, value: d.rsi_14! }));
    rsiSeries.setData(rsiData);

    addConstantLine(chart, rsiData, 70, COLORS.rsiOverbought);
    addConstantLine(chart, rsiData, 30, COLORS.rsiOversold);

    chart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.1, bottom: 0.1 },
    });
    chart.timeScale().fitContent();

    const handleResize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [filteredIndicators, showRsi]);

  // MACD 副圖
  useEffect(() => {
    if (!macdChartRef.current || !showMacd || filteredIndicators.length === 0) return;

    const container = macdChartRef.current;
    container.innerHTML = "";

    const chart = createSubChart(container, 120);

    const histSeries = chart.addHistogramSeries({
      priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(3) },
    });
    const histData: HistogramData[] = filteredIndicators
      .filter((d) => d.macd_histogram != null)
      .map((d) => ({
        time: d.date as Time,
        value: d.macd_histogram!,
        color: d.macd_histogram! >= 0 ? COLORS.macdHistUp : COLORS.macdHistDown,
      }));
    histSeries.setData(histData);

    addLineSeries(chart, filteredIndicators, "macd", COLORS.macdLine, 2);
    addLineSeries(chart, filteredIndicators, "macd_signal", COLORS.macdSignal, 2);

    chart.timeScale().fitContent();

    const handleResize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [filteredIndicators, showMacd]);

  // 最新收盤資訊
  const latest = filteredData[filteredData.length - 1];
  const prev = filteredData[filteredData.length - 2];
  const change = latest && prev ? latest.close - prev.close : 0;
  const changePct = prev ? (change / prev.close) * 100 : 0;
  const isUp = change >= 0;

  // 形態統計
  const visiblePatterns = filteredPatterns.filter((p) => p.confidence >= 60);
  const bullishCount = visiblePatterns.filter((p) => p.pattern_type === "bullish").length;
  const bearishCount = visiblePatterns.filter((p) => p.pattern_type === "bearish").length;

  return (
    <div className="bg-[#0a0e17] rounded-xl overflow-hidden border border-gray-800">
      {/* 頂部資訊列 */}
      <div className="px-4 pt-4 pb-2 flex items-baseline gap-4 flex-wrap">
        <span className="text-xl font-bold text-white tracking-wide">{symbol}</span>
        {latest && (
          <>
            <span className="text-2xl font-semibold text-white">
              ${latest.close.toFixed(2)}
            </span>
            <span className={`text-sm font-medium ${isUp ? "text-green-400" : "text-red-400"}`}>
              {isUp ? "+" : ""}{change.toFixed(2)} ({isUp ? "+" : ""}{changePct.toFixed(2)}%)
            </span>
          </>
        )}
      </div>

      {/* 控制列 */}
      <div className="px-4 pb-3 flex items-center gap-1 flex-wrap">
        {/* 時間範圍 */}
        <div className="flex gap-0.5 mr-4">
          {(["1M", "3M", "6M", "1Y", "ALL"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                timeRange === r
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* 疊加指標 */}
        <div className="flex gap-0.5 mr-4">
          <button
            onClick={() => setOverlay("sma")}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
              overlay === "sma"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            MA
          </button>
          <button
            onClick={() => setOverlay("bollinger")}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
              overlay === "bollinger"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            BB
          </button>
        </div>

        {/* 副圖開關 */}
        <div className="flex gap-0.5 mr-4">
          <button
            onClick={() => setShowRsi(!showRsi)}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
              showRsi
                ? "bg-amber-600/30 text-amber-400"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            RSI
          </button>
          <button
            onClick={() => setShowMacd(!showMacd)}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
              showMacd
                ? "bg-blue-600/30 text-blue-400"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            MACD
          </button>
        </div>

        {/* 形態標注開關 */}
        <div className="flex gap-0.5">
          <button
            onClick={() => setShowPatterns(!showPatterns)}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors flex items-center gap-1.5 ${
              showPatterns
                ? "bg-purple-600/30 text-purple-400"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            形態
            {showPatterns && visiblePatterns.length > 0 && (
              <span className="text-[10px] opacity-70">
                {visiblePatterns.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 圖例說明 */}
      <div className="px-4 pb-2 flex gap-4 text-[10px] text-gray-500 flex-wrap">
        {overlay === "sma" ? (
          <>
            <span><span className="inline-block w-3 h-0.5 bg-amber-500 mr-1 align-middle" />SMA 20</span>
            <span><span className="inline-block w-3 h-0.5 bg-blue-500 mr-1 align-middle" />SMA 50</span>
            <span><span className="inline-block w-3 h-0.5 bg-purple-500 mr-1 align-middle" />SMA 200</span>
          </>
        ) : (
          <>
            <span><span className="inline-block w-3 h-0.5 bg-amber-500 mr-1 align-middle" />BB Middle</span>
            <span className="text-gray-600">BB Upper / Lower (dashed)</span>
          </>
        )}
        {showPatterns && visiblePatterns.length > 0 && (
          <>
            <span className="text-gray-600">|</span>
            <span className="text-green-500">▲ 看多 {bullishCount}</span>
            <span className="text-red-500">▼ 看空 {bearishCount}</span>
          </>
        )}
      </div>

      {/* 主圖 */}
      <div ref={mainChartRef} className="w-full" />

      {/* RSI 副圖 */}
      {showRsi && (
        <div className="border-t border-gray-800">
          <div className="px-4 py-1 text-[10px] text-gray-500">RSI (14)</div>
          <div ref={rsiChartRef} className="w-full" />
        </div>
      )}

      {/* MACD 副圖 */}
      {showMacd && (
        <div className="border-t border-gray-800">
          <div className="px-4 py-1 text-[10px] text-gray-500">MACD (12, 26, 9)</div>
          <div ref={macdChartRef} className="w-full" />
        </div>
      )}

      {/* 形態清單面板 */}
      {showPatterns && visiblePatterns.length > 0 && (
        <div className="border-t border-gray-800 px-4 py-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
            偵測到的形態訊號
          </div>
          <div className="flex flex-wrap gap-2">
            {visiblePatterns
              .sort((a, b) => b.confidence - a.confidence)
              .slice(0, 8)
              .map((p, i) => {
                const zhName = PATTERN_NAMES_ZH[p.pattern_name] || p.pattern_name;
                const colorClass =
                  p.pattern_type === "bullish"
                    ? "bg-green-900/30 border-green-800 text-green-400"
                    : p.pattern_type === "bearish"
                      ? "bg-red-900/30 border-red-800 text-red-400"
                      : "bg-yellow-900/30 border-yellow-800 text-yellow-400";
                const arrow =
                  p.pattern_type === "bullish" ? "▲" : p.pattern_type === "bearish" ? "▼" : "●";

                return (
                  <div
                    key={`${p.date}-${p.pattern_name}-${i}`}
                    className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border ${colorClass}`}
                    title={`${p.description}\n日期：${p.date}\n信心度：${p.confidence}%\n階段：${p.stage}`}
                  >
                    <span>{arrow}</span>
                    <span className="font-medium">{zhName}</span>
                    <span className="opacity-60">{p.confidence}%</span>
                    <span className="opacity-40 text-[9px]">{p.date.slice(5)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ==============================
// 工具函數
// ==============================

function createSubChart(container: HTMLDivElement, height: number): IChartApi {
  return createChart(container, {
    width: container.clientWidth,
    height,
    layout: {
      background: { type: ColorType.Solid, color: COLORS.bg },
      textColor: COLORS.text,
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      fontSize: 10,
    },
    grid: {
      vertLines: { color: COLORS.grid },
      horzLines: { color: COLORS.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: COLORS.crosshair, labelBackgroundColor: "#1f2937" },
      horzLine: { color: COLORS.crosshair, labelBackgroundColor: "#1f2937" },
    },
    rightPriceScale: { borderColor: COLORS.grid },
    timeScale: { borderColor: COLORS.grid, timeVisible: false },
  });
}

function addLineSeries(
  chart: IChartApi,
  data: IndicatorRow[],
  field: keyof IndicatorRow,
  color: string,
  lineWidth: 1 | 2 | 3 | 4 = 1,
  lineStyle: LineStyle = LineStyle.Solid
) {
  const series = chart.addLineSeries({
    color,
    lineWidth,
    lineStyle,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
  });

  const lineData: LineData[] = data
    .filter((d) => d[field] != null)
    .map((d) => ({ time: d.date as Time, value: d[field] as number }));
  series.setData(lineData);
}

function addConstantLine(
  chart: IChartApi,
  referenceData: LineData[],
  value: number,
  color: string
) {
  if (referenceData.length === 0) return;
  const series = chart.addLineSeries({
    color,
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  series.setData([
    { time: referenceData[0].time, value },
    { time: referenceData[referenceData.length - 1].time, value },
  ]);
}

function filterByRange<T extends { date: string }>(
  data: T[],
  range: "1M" | "3M" | "6M" | "1Y" | "ALL"
): T[] {
  if (range === "ALL" || data.length === 0) return data;

  const now = new Date(data[data.length - 1].date);
  const months = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 }[range];
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return data.filter((d) => d.date >= cutoffStr);
}
