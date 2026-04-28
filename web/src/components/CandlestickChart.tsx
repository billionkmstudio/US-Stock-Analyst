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

type Props = {
  priceData: OHLCVRow[];
  indicatorData: IndicatorRow[];
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
};

// ==============================
// 主元件
// ==============================

export function CandlestickChart({ priceData, indicatorData, symbol }: Props) {
  const mainChartRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<HTMLDivElement>(null);
  const macdChartRef = useRef<HTMLDivElement>(null);

  const [overlay, setOverlay] = useState<Overlay>("sma");
  const [showRsi, setShowRsi] = useState(true);
  const [showMacd, setShowMacd] = useState(false);
  const [timeRange, setTimeRange] = useState<"1M" | "3M" | "6M" | "1Y" | "ALL">("6M");

  // 根據時間範圍裁切資料
  const filteredData = filterByRange(priceData, timeRange);
  const filteredIndicators = filterByRange(indicatorData, timeRange);

  // 主圖(K 線 + 成交量 + 疊加指標)
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
      addLineSeries(chart, filteredIndicators, "sma_20", COLORS.sma20, 1.5);
      addLineSeries(chart, filteredIndicators, "sma_50", COLORS.sma50, 1.5);
      addLineSeries(chart, filteredIndicators, "sma_200", COLORS.sma200, 1.5);
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
  }, [filteredData, filteredIndicators, overlay]);

  // RSI 副圖
  useEffect(() => {
    if (!rsiChartRef.current || !showRsi || filteredIndicators.length === 0) return;

    const container = rsiChartRef.current;
    container.innerHTML = "";

    const chart = createSubChart(container, 120);

    const rsiSeries = chart.addLineSeries({
      color: COLORS.rsiLine,
      lineWidth: 1.5,
      priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(1) },
    });

    const rsiData: LineData[] = filteredIndicators
      .filter((d) => d.rsi_14 != null)
      .map((d) => ({ time: d.date as Time, value: d.rsi_14! }));
    rsiSeries.setData(rsiData);

    // 超買超賣線
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

    // MACD histogram
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

    // MACD line
    addLineSeries(chart, filteredIndicators, "macd", COLORS.macdLine, 1.5);
    // Signal line
    addLineSeries(chart, filteredIndicators, "macd_signal", COLORS.macdSignal, 1.5);

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
        <div className="flex gap-0.5">
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
      </div>

      {/* 圖例說明 */}
      <div className="px-4 pb-2 flex gap-4 text-[10px] text-gray-500">
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
  lineWidth: number = 1,
  lineStyle: LineStyle = LineStyle.Solid
) {
  const series = chart.addLineSeries({
    color,
    lineWidth: lineWidth as 1 | 2 | 3 | 4,
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
