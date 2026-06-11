#!/usr/bin/env python3
"""Refresh the bundled weekly snapshots. Reads API keys from .env (repo root).
With COINGECKO_API_KEY set, CoinGecko is used; otherwise CryptoCompare (keyless).
Usage: python scripts/fetch_data.py"""
import json, urllib.request, datetime, pathlib, os

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"

def load_env():
    env = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env

ENV = load_env()
CG_KEY = ENV.get("COINGECKO_API_KEY") or os.environ.get("COINGECKO_API_KEY", "")

def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    return json.load(urllib.request.urlopen(req, timeout=30))

def weekly_from_coingecko(coin):  # coin: "bitcoin" / "ethereum"
    url = f"{ENV.get('COINGECKO_API','https://api.coingecko.com/api/v3')}/coins/{coin}/market_chart?vs_currency=usd&days=max&interval=daily"
    j = get(url, {"x-cg-demo-api-key": CG_KEY})
    prices = j["prices"]; vols = dict((int(t//1000), v) for t, v in j.get("total_volumes", []))
    # CoinGecko liefert nur Close -> Wochen-OHLC aus Tages-Closes aggregieren
    weeks = {}
    for ts, close in prices:
        t = int(ts // 1000); wk = t - (t % (7*86400))
        w = weeks.setdefault(wk, {"o": close, "h": close, "l": close, "c": close, "v": 0})
        w["h"] = max(w["h"], close); w["l"] = min(w["l"], close); w["c"] = close
        w["v"] += vols.get(t, 0)
    return [[wk, round(w["o"],4), round(w["h"],4), round(w["l"],4), round(w["c"],4), round(w["v"])]
            for wk, w in sorted(weeks.items()) if w["c"] > 0], "CoinGecko market_chart (weekly OHLC aggregated from daily closes)"

def weekly_from_cryptocompare(sym):  # sym: "BTC" / "ETH"
    j = get(f"https://min-api.cryptocompare.com/data/v2/histoday?fsym={sym}&tsym=USD&aggregate=7&allData=true")
    rows = [r for r in j["Data"]["Data"] if r["close"] > 0]
    return [[r["time"], round(r["open"],4), round(r["high"],4), round(r["low"],4), round(r["close"],4), round(r.get("volumeto",0))]
            for r in rows], "CryptoCompare CCCAGG histoday aggregate=7"

for sym, coin in (("BTC", "bitcoin"), ("ETH", "ethereum")):
    if CG_KEY:
        data, source = weekly_from_coingecko(coin)
    else:
        data, source = weekly_from_cryptocompare(sym)
    json.dump({"symbol": sym, "interval": "weekly", "unit": "USD", "source": source,
               "fetched": str(datetime.date.today()),
               "fields": ["time","open","high","low","close","volume_usd"], "data": data},
              open(OUT / f"{sym.lower()}_weekly.json", "w"))
    print(f"{sym}: {len(data)} weeks via {source.split(' ')[0]}")
print("Now run: node scripts/run_backtest.mjs  (regenerates backtest_results.json)")
