"""
GitHub Actions 排程 Worker

每日盤後執行:
1. 從 Supabase 讀出所有 watchlist 中的 symbol(去重)
2. 對每個 symbol 抓 yfinance 資料
3. 計算技術指標
4. 偵測 K 線形態
5. 寫回 Supabase
6. 紀錄執行結果

環境變數(由 GitHub Secrets 注入):
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY  (注意:不是 anon key!)
"""

import os
import sys
import time
from datetime import datetime, date
from typing import Optional

import yfinance as yf
import pandas as pd
from supabase import create_client, Client


# ==============================
# 連線
# ==============================

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("錯誤:缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 環境變數")
    sys.exit(1)

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ==============================
# 資料抓取
# ==============================

def fetch_prices(symbol: str, period: str = "2y") -> Optional[pd.DataFrame]:
    """抓取歷史日線。失敗回傳 None。"""
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, auto_adjust=False)
        if df.empty:
            print(f"  [警告] {symbol} 無價格資料")
            return None
        return df
    except Exception as e:
        print(f"  [錯誤] {symbol} 抓取價格失敗:{e}")
        return None


def fetch_fundamentals(symbol: str) -> Optional[dict]:
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        return {
            "symbol": symbol,
            "snapshot_at": datetime.utcnow().isoformat(),
            "pe_ratio": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "peg_ratio": info.get("pegRatio"),
            "pb_ratio": info.get("priceToBook"),
            "ps_ratio": info.get("priceToSalesTrailing12Months"),
            "roe": info.get("returnOnEquity"),
            "roa": info.get("returnOnAssets"),
            "profit_margin": info.get("profitMargins"),
            "operating_margin": info.get("operatingMargins"),
            "free_cash_flow": info.get("freeCashflow"),
            "dividend_yield": info.get("dividendYield"),
            "market_cap": info.get("marketCap"),
            "enterprise_value": info.get("enterpriseValue"),
            "revenue_growth": info.get("revenueGrowth"),
            "earnings_growth": info.get("earningsGrowth"),
        }
    except Exception as e:
        print(f"  [錯誤] {symbol} 抓取基本面失敗:{e}")
        return None


# ==============================
# 技術指標計算
# ==============================

def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    計算技術指標。回傳新的 DataFrame,index 為日期。

    為避免 GitHub Actions 上 TA-Lib 安裝麻煩(需 C 函式庫),
    這裡用純 pandas 實作核心指標。
    """
    out = pd.DataFrame(index=df.index)
    close = df["Close"]
    high = df["High"]
    low = df["Low"]

    # 移動平均
    out["sma_20"] = close.rolling(20).mean()
    out["sma_50"] = close.rolling(50).mean()
    out["sma_200"] = close.rolling(200).mean()
    out["ema_12"] = close.ewm(span=12, adjust=False).mean()
    out["ema_26"] = close.ewm(span=26, adjust=False).mean()

    # RSI(14)
    delta = close.diff()
    gain = delta.where(delta > 0, 0).rolling(14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
    rs = gain / loss.replace(0, 1e-10)
    out["rsi_14"] = 100 - (100 / (1 + rs))

    # MACD
    out["macd"] = out["ema_12"] - out["ema_26"]
    out["macd_signal"] = out["macd"].ewm(span=9, adjust=False).mean()
    out["macd_histogram"] = out["macd"] - out["macd_signal"]

    # Bollinger Bands(20, 2σ)
    sma20 = close.rolling(20).mean()
    std20 = close.rolling(20).std()
    out["bb_upper"] = sma20 + 2 * std20
    out["bb_middle"] = sma20
    out["bb_lower"] = sma20 - 2 * std20

    # ATR(14)
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    out["atr_14"] = tr.rolling(14).mean()

    # OBV
    direction = (close.diff() > 0).astype(int) - (close.diff() < 0).astype(int)
    out["obv"] = (direction * df["Volume"]).cumsum()

    # 成交量比（今日 / 20日均量）— 專家策略需要
    vol_sma20 = df["Volume"].rolling(20).mean()
    out["volume_ratio"] = df["Volume"] / vol_sma20.replace(0, 1)

    return out


# ==============================
# K 線形態偵測（純 pandas 實作）
# ==============================

def detect_patterns(df: pd.DataFrame) -> list[dict]:
    """
    偵測 K 線形態。輸入為原始 OHLCV DataFrame。
    回傳 list of dict，每個 dict 代表一個偵測到的形態。

    只偵測最近 60 個交易日的形態（避免過多歷史訊號）。
    """
    if df is None or len(df) < 10:
        return []

    signals = []
    o = df["Open"].values
    h = df["High"].values
    l = df["Low"].values
    c = df["Close"].values
    v = df["Volume"].values
    dates = df.index

    # 只掃描最近 60 天
    start = max(3, len(df) - 60)

    for i in range(start, len(df)):
        body = abs(c[i] - o[i])
        upper_shadow = h[i] - max(o[i], c[i])
        lower_shadow = min(o[i], c[i]) - l[i]
        candle_range = h[i] - l[i]
        is_bullish = c[i] > o[i]
        is_bearish = c[i] < o[i]

        if candle_range == 0:
            continue

        body_pct = body / candle_range
        avg_body = _avg_body(o, c, i, 10)

        dt = dates[i].date().isoformat() if hasattr(dates[i], "date") else str(dates[i])

        # ── 1. 鎚子線 (Hammer) ──
        if (lower_shadow >= body * 2
            and upper_shadow < body * 0.5
            and body_pct > 0.1
            and _is_downtrend(c, i, 5)):
            confidence = min(90, 60 + int(lower_shadow / body * 5))
            signals.append(_signal(dt, "hammer", "bullish", confidence,
                                   "鎚子線：下影線長度超過實體 2 倍，出現在下跌趨勢中"))

        # ── 2. 倒鎚子 (Inverted Hammer) ──
        if (upper_shadow >= body * 2
            and lower_shadow < body * 0.5
            and body_pct > 0.1
            and _is_downtrend(c, i, 5)):
            confidence = min(85, 55 + int(upper_shadow / body * 5))
            signals.append(_signal(dt, "inverted_hammer", "bullish", confidence,
                                   "倒鎚子：上影線長度超過實體 2 倍，出現在下跌趨勢中"))

        # ── 3. 看多吞噬 (Bullish Engulfing) ──
        if (i >= 1
            and c[i-1] < o[i-1]  # 前一根是陰線
            and c[i] > o[i]       # 今天是陽線
            and o[i] <= c[i-1]    # 今天開盤 ≤ 昨天收盤
            and c[i] >= o[i-1]    # 今天收盤 ≥ 昨天開盤
            and body > avg_body * 0.8):
            vol_surge = v[i] > v[i-1] * 1.1
            confidence = 75 if vol_surge else 65
            signals.append(_signal(dt, "bullish_engulfing", "bullish", confidence,
                                   "看多吞噬：陽線完全包覆前一根陰線" + ("，成交量放大" if vol_surge else "")))

        # ── 4. 看空吞噬 (Bearish Engulfing) ──
        if (i >= 1
            and c[i-1] > o[i-1]  # 前一根是陽線
            and c[i] < o[i]       # 今天是陰線
            and o[i] >= c[i-1]    # 今天開盤 ≥ 昨天收盤
            and c[i] <= o[i-1]    # 今天收盤 ≤ 昨天開盤
            and body > avg_body * 0.8):
            vol_surge = v[i] > v[i-1] * 1.1
            confidence = 75 if vol_surge else 65
            signals.append(_signal(dt, "bearish_engulfing", "bearish", confidence,
                                   "看空吞噬：陰線完全包覆前一根陽線" + ("，成交量放大" if vol_surge else "")))

        # ── 5. 晨星 (Morning Star) ──
        if (i >= 2
            and c[i-2] < o[i-2]                              # 第一天大陰線
            and abs(c[i-1] - o[i-1]) < candle_range * 0.15   # 第二天小實體
            and c[i] > o[i]                                    # 第三天大陽線
            and c[i] > (o[i-2] + c[i-2]) / 2                  # 收盤超過第一天中點
            and _is_downtrend(c, i-2, 3)):
            signals.append(_signal(dt, "morning_star", "bullish", 80,
                                   "晨星：三根 K 線反轉形態，底部訊號強"))

        # ── 6. 暮星 (Evening Star) ──
        if (i >= 2
            and c[i-2] > o[i-2]                              # 第一天大陽線
            and abs(c[i-1] - o[i-1]) < candle_range * 0.15   # 第二天小實體
            and c[i] < o[i]                                    # 第三天大陰線
            and c[i] < (o[i-2] + c[i-2]) / 2                  # 收盤低於第一天中點
            and _is_uptrend(c, i-2, 3)):
            signals.append(_signal(dt, "evening_star", "bearish", 80,
                                   "暮星：三根 K 線反轉形態，頂部訊號強"))

        # ── 7. 十字星 (Doji) ──
        if body_pct < 0.08 and candle_range > avg_body * 0.5:
            trend = "bullish" if _is_downtrend(c, i, 5) else "bearish" if _is_uptrend(c, i, 5) else "neutral"
            conf = 65 if trend != "neutral" else 50
            desc = "十字星：開盤收盤幾乎相同，市場猶豫"
            if trend == "bullish":
                desc += "，出現在跌勢末端可能反轉"
            elif trend == "bearish":
                desc += "，出現在漲勢末端可能反轉"
            signals.append(_signal(dt, "doji", trend, conf, desc))

        # ── 8. 三白兵 (Three White Soldiers) ──
        if (i >= 2
            and all(c[i-j] > o[i-j] for j in range(3))          # 三根都是陽線
            and c[i] > c[i-1] > c[i-2]                           # 逐日創高
            and all(abs(c[i-j] - o[i-j]) > avg_body * 0.5 for j in range(3))  # 實體不小
            and _is_downtrend(c, i-2, 3)):
            signals.append(_signal(dt, "three_white_soldiers", "bullish", 82,
                                   "三白兵：連續三根大陽線逐日創高，強烈看多"))

        # ── 9. 三黑鴉 (Three Black Crows) ──
        if (i >= 2
            and all(c[i-j] < o[i-j] for j in range(3))          # 三根都是陰線
            and c[i] < c[i-1] < c[i-2]                           # 逐日創低
            and all(abs(c[i-j] - o[i-j]) > avg_body * 0.5 for j in range(3))
            and _is_uptrend(c, i-2, 3)):
            signals.append(_signal(dt, "three_black_crows", "bearish", 82,
                                   "三黑鴉：連續三根大陰線逐日創低，強烈看空"))

        # ── 10. 穿刺線 (Piercing Line) ──
        if (i >= 1
            and c[i-1] < o[i-1]                     # 前天陰線
            and c[i] > o[i]                           # 今天陽線
            and o[i] < l[i-1]                         # 今天開盤 < 昨天最低
            and c[i] > (o[i-1] + c[i-1]) / 2         # 今天收盤 > 昨天中點
            and c[i] < o[i-1]):                       # 但沒超過昨天開盤(否則是吞噬)
            signals.append(_signal(dt, "piercing_line", "bullish", 70,
                                   "穿刺線：跳空低開後收至前日實體中點以上"))

        # ── 11. 烏雲蓋頂 (Dark Cloud Cover) ──
        if (i >= 1
            and c[i-1] > o[i-1]                     # 前天陽線
            and c[i] < o[i]                           # 今天陰線
            and o[i] > h[i-1]                         # 今天開盤 > 昨天最高
            and c[i] < (o[i-1] + c[i-1]) / 2         # 今天收盤 < 昨天中點
            and c[i] > o[i-1]):                       # 但沒低於昨天開盤
            signals.append(_signal(dt, "dark_cloud_cover", "bearish", 70,
                                   "烏雲蓋頂：跳空高開後收至前日實體中點以下"))

        # ── 12. 看多母子線 (Bullish Harami) ──
        if (i >= 1
            and c[i-1] < o[i-1]                                # 前天大陰線
            and abs(c[i-1] - o[i-1]) > avg_body * 0.8          # 前天實體要夠大
            and c[i] > o[i]                                     # 今天小陽線
            and o[i] > c[i-1] and c[i] < o[i-1]                # 今天被前天包住
            and body < abs(c[i-1] - o[i-1]) * 0.5):            # 今天實體 < 前天一半
            signals.append(_signal(dt, "bullish_harami", "bullish", 62,
                                   "看多母子線：小陽線被前一根大陰線包覆"))

        # ── 13. 看空母子線 (Bearish Harami) ──
        if (i >= 1
            and c[i-1] > o[i-1]                                # 前天大陽線
            and abs(c[i-1] - o[i-1]) > avg_body * 0.8
            and c[i] < o[i]                                     # 今天小陰線
            and o[i] < c[i-1] and c[i] > o[i-1]
            and body < abs(c[i-1] - o[i-1]) * 0.5):
            signals.append(_signal(dt, "bearish_harami", "bearish", 62,
                                   "看空母子線：小陰線被前一根大陽線包覆"))

    return signals


def _signal(dt: str, name: str, ptype: str, confidence: int, description: str) -> dict:
    return {
        "detected_at": dt,
        "pattern_name": name,
        "pattern_type": ptype,
        "confidence": confidence,
        "stage": "completed",
        "description": description,
    }


def _avg_body(o, c, i: int, lookback: int = 10) -> float:
    """前 N 天平均實體大小"""
    start = max(0, i - lookback)
    bodies = [abs(c[j] - o[j]) for j in range(start, i)]
    return sum(bodies) / len(bodies) if bodies else 1.0


def _is_downtrend(c, i: int, lookback: int = 5) -> bool:
    """簡單判斷近期是否在下跌"""
    if i < lookback:
        return False
    return c[i - lookback] > c[i - 1]  # N 天前的收盤 > 昨天收盤


def _is_uptrend(c, i: int, lookback: int = 5) -> bool:
    """簡單判斷近期是否在上漲"""
    if i < lookback:
        return False
    return c[i - lookback] < c[i - 1]


# ==============================
# 寫入 Supabase
# ==============================

def upsert_prices(symbol: str, df: pd.DataFrame) -> int:
    if df is None or df.empty:
        return 0

    rows = []
    for idx, row in df.iterrows():
        rows.append({
            "symbol": symbol,
            "date": idx.date().isoformat() if hasattr(idx, "date") else str(idx),
            "open": _f(row["Open"]),
            "high": _f(row["High"]),
            "low": _f(row["Low"]),
            "close": _f(row["Close"]),
            "volume": _i(row["Volume"]),
            "adj_close": _f(row["Adj Close"]),
        })

    sb.table("daily_prices").upsert(rows, on_conflict="symbol,date").execute()
    return len(rows)


def upsert_indicators(symbol: str, ind_df: pd.DataFrame) -> int:
    if ind_df is None or ind_df.empty:
        return 0

    rows = []
    for idx, row in ind_df.iterrows():
        d = {"symbol": symbol, "date": idx.date().isoformat() if hasattr(idx, "date") else str(idx)}
        for col in ind_df.columns:
            d[col] = _f(row[col])
        rows.append(d)

    BATCH = 200
    total = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i+BATCH]
        sb.table("daily_indicators").upsert(chunk, on_conflict="symbol,date").execute()
        total += len(chunk)
    return total


def insert_fundamentals(data: dict) -> bool:
    if data is None:
        return False
    try:
        sb.table("fundamentals").insert(data).execute()
        return True
    except Exception as e:
        print(f"  [錯誤] 寫入基本面失敗:{e}")
        return False


def upsert_patterns(symbol: str, patterns: list[dict]) -> int:
    """寫入形態訊號到 pattern_signals 表"""
    if not patterns:
        return 0

    rows = []
    for p in patterns:
        rows.append({
            "symbol": symbol,
            "detected_at": p["detected_at"],
            "pattern_name": p["pattern_name"],
            "pattern_type": p["pattern_type"],
            "confidence": p["confidence"],
            "stage": p["stage"],
            "description": p["description"],
        })

    try:
        # 先刪除該 symbol 的舊形態（避免重複累積）
        sb.table("pattern_signals").delete().eq("symbol", symbol).execute()
        # 寫入新的
        BATCH = 100
        total = 0
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i+BATCH]
            sb.table("pattern_signals").insert(chunk).execute()
            total += len(chunk)
        return total
    except Exception as e:
        print(f"  [錯誤] 寫入形態訊號失敗:{e}")
        return 0


# ==============================
# 工具函數
# ==============================

def _f(v):
    """安全轉 float,NaN 變 None"""
    try:
        if pd.isna(v):
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _i(v):
    try:
        if pd.isna(v):
            return None
        return int(v)
    except (TypeError, ValueError):
        return None


def get_all_symbols() -> list:
    """從 watchlist 取出所有不重複的 symbol"""
    result = sb.table("watchlist").select("symbol").execute()
    symbols = list(set(item["symbol"] for item in (result.data or [])))
    return sorted(symbols)


# ==============================
# 主流程
# ==============================

def main():
    print(f"=== Worker 開始執行:{datetime.utcnow().isoformat()} ===\n")

    run_resp = sb.table("analysis_runs").insert({
        "status": "running",
    }).execute()
    run_id = run_resp.data[0]["id"]
    started = time.time()

    symbols = get_all_symbols()
    if not symbols:
        print("自選股清單是空的,跳過")
        sb.table("analysis_runs").update({
            "status": "success",
            "finished_at": datetime.utcnow().isoformat(),
            "symbols_total": 0,
            "symbols_success": 0,
            "symbols_failed": 0,
            "duration_seconds": 0,
        }).eq("id", run_id).execute()
        return

    print(f"準備處理 {len(symbols)} 支股票:{', '.join(symbols)}\n")

    success = 0
    failed = 0
    error_messages = []

    for i, sym in enumerate(symbols, 1):
        print(f"[{i}/{len(symbols)}] {sym}")
        try:
            # 1. 抓價格
            df = fetch_prices(sym, period="2y")
            if df is None:
                failed += 1
                continue

            # 2. 寫價格
            n = upsert_prices(sym, df)
            print(f"  價格寫入 {n} 筆")

            # 3. 算指標
            ind = calculate_indicators(df)
            n = upsert_indicators(sym, ind)
            print(f"  指標寫入 {n} 筆")

            # 4. 抓基本面
            fund = fetch_fundamentals(sym)
            if fund:
                insert_fundamentals(fund)
                print(f"  基本面快照已寫入")

            # 5. 偵測形態
            patterns = detect_patterns(df)
            n = upsert_patterns(sym, patterns)
            print(f"  形態訊號寫入 {n} 筆")

            success += 1

            # 避免被 yfinance 限流
            if i < len(symbols):
                time.sleep(1.5)

        except Exception as e:
            failed += 1
            msg = f"{sym}: {str(e)[:200]}"
            error_messages.append(msg)
            print(f"  [失敗] {e}")

    duration = int(time.time() - started)
    status = "success" if failed == 0 else ("partial" if success > 0 else "failed")

    sb.table("analysis_runs").update({
        "status": status,
        "finished_at": datetime.utcnow().isoformat(),
        "symbols_total": len(symbols),
        "symbols_success": success,
        "symbols_failed": failed,
        "error_message": "\n".join(error_messages) if error_messages else None,
        "duration_seconds": duration,
    }).eq("id", run_id).execute()

    print(f"\n=== 完成:成功 {success} / 失敗 {failed},耗時 {duration}s ===")

    if failed > 0 and success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
