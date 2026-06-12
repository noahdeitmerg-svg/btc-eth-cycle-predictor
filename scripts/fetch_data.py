#!/usr/bin/env python3
"""Daten-Refresh v2 — Multi-Timeframe:
  {sym}_4h.json     : letzte ~90 Tage als 4h-Bars (aus CoinGecko-Stundendaten)
  {sym}_daily.json  : letzte 365 Tage als Tagesbars
  {sym}_weekly.json : Langzeit-Snapshot (seit 2010/2020) + frische 365 Tage gemergt
  {sym}_monthly.json: Monatsbars, aggregiert aus der Wochen-Historie
Demo-Key: max 365 Tage; Stundendaten bei days<=90 automatisch.
Usage: python scripts/fetch_data.py"""
import json, urllib.request, datetime, pathlib, os

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"

ENV = {}
if (ROOT / ".env").exists():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1); ENV[k.strip()] = v.strip()
CG_KEY = ENV.get("COINGECKO_API_KEY", "") or os.environ.get("COINGECKO_API_KEY", "")
CG_BASE = ENV.get("COINGECKO_API", "https://api.coingecko.com/api/v3")

def get(url):
    req = urllib.request.Request(url, headers={"x-cg-demo-api-key": CG_KEY})
    return json.load(urllib.request.urlopen(req, timeout=40))

def bars_from_closes(prices, vols, bucket_sec):
    """[[ms, close],...] -> OHLC-Bars je Bucket (o=first, h=max, l=min, c=last)."""
    bars = {}
    vmap = {int(t // 1000): v for t, v in (vols or [])}
    for ts, close in prices:
        t = int(ts // 1000); b = t - (t % bucket_sec)
        w = bars.setdefault(b, {"o": close, "h": close, "l": close, "c": close, "v": 0})
        w["h"] = max(w["h"], close); w["l"] = min(w["l"], close); w["c"] = close
        w["v"] += vmap.get(t, 0)
    return [[b, round(w["o"], 4), round(w["h"], 4), round(w["l"], 4), round(w["c"], 4), round(w["v"])]
            for b, w in sorted(bars.items()) if w["c"] > 0]

def save(sym, tf, rows, src, note=""):
    json.dump({"symbol": sym, "interval": tf, "unit": "USD", "source": src,
               "fetched": str(datetime.date.today()),
               "fields": ["time", "open", "high", "low", "close", "volume_usd"],
               "note": note, "data": rows}, open(OUT / f"{sym.lower()}_{tf}.json", "w"))
    d = datetime.date.fromtimestamp(rows[-1][0]) if rows else "leer"
    print(f"{sym} {tf}: {len(rows)} Bars | letzter: {d} | Schluss: {rows[-1][4] if rows else '-'}")

for sym, coin in (("BTC", "bitcoin"), ("ETH", "ethereum")):
    # ---- 4h (90 Tage, stuendliche Quelle) ----
    j = get(f"{CG_BASE}/coins/{coin}/market_chart?vs_currency=usd&days=90")
    save(sym, "4h", bars_from_closes(j["prices"], j.get("total_volumes"), 4 * 3600),
         "CoinGecko stuendlich (90 Tage) -> 4h-Bars", "OHLC aus Stunden-Schlusskursen aggregiert.")

    # ---- daily (365 Tage) ----
    jd = get(f"{CG_BASE}/coins/{coin}/market_chart?vs_currency=usd&days=365&interval=daily")
    daily = bars_from_closes(jd["prices"], jd.get("total_volumes"), 86400)
    save(sym, "daily", daily, "CoinGecko taeglich (365 Tage)", "OHLC aus Tages-Schlusskursen.")

    # ---- weekly (Langzeit-Snapshot + frische Wochen aus daily) ----
    f = OUT / f"{sym.lower()}_weekly.json"
    snap = json.load(open(f))
    base_rows = {r[0]: r for r in snap["data"]}
    fresh_w = bars_from_closes(jd["prices"], jd.get("total_volumes"), 7 * 86400)
    for r in fresh_w:
        old = base_rows.get(r[0])
        if old:
            r = [r[0], old[1], max(old[2], r[2]), min(old[3], r[3]), r[4], max(old[5], r[5])]
        base_rows[r[0]] = r
    weekly = [base_rows[k] for k in sorted(base_rows)]
    snap.update({"fetched": str(datetime.date.today()), "data": weekly})
    json.dump(snap, open(f, "w"))
    print(f"{sym} weekly: {len(weekly)} Wochen | letzte: {datetime.date.fromtimestamp(weekly[-1][0])} | Schluss: {weekly[-1][4]}")

    # ---- monthly (aus weekly aggregiert) ----
    months = {}
    for t, o, h, l, c, v in weekly:
        key = datetime.date.fromtimestamp(t).strftime("%Y-%m")
        m = months.setdefault(key, {"t": t, "o": o, "h": h, "l": l, "c": c, "v": 0})
        m["h"] = max(m["h"], h); m["l"] = min(m["l"], l); m["c"] = c; m["v"] += v
    monthly = [[m["t"], m["o"], m["h"], m["l"], m["c"], m["v"]] for k, m in sorted(months.items())]
    save(sym, "monthly", monthly, "aggregiert aus Wochen-Historie", "Monatsbars seit Beginn der Historie.")

print("Fertig. Jetzt: node scripts/run_backtest.mjs")
