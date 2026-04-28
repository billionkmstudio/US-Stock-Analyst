"""
GitHub Actions 排程 Worker

每日盤後執行:
1. 從 Supabase 讀出所有 watchlist 中的 symbol(去重)
2. 對每個 symbol 抓 yfinance 資料
3. 計算技術指標
4. 寫回 Supabase
5. 紀錄執行結果

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

    return out


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

    # Supabase 的 upsert 需指定衝突欄位
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

    # 分批 upsert(避免單次太大)
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
    """從 watchlist 取出所有不重複的 symbol(未來支援多用戶時自動 OK)"""
    result = sb.table("watchlist").select("symbol").execute()
    symbols = list(set(item["symbol"] for item in (result.data or [])))
    return sorted(symbols)


# ==============================
# 主流程
# ==============================

def main():
    print(f"=== Worker 開始執行:{datetime.utcnow().isoformat()} ===\n")

    # 紀錄一筆 run
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

    # 失敗的話讓 GitHub Actions 顯示紅色
    if failed > 0 and success == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
