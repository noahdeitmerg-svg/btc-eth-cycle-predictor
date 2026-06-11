#!/usr/bin/env python3
"""Daten-Refresh (Hybrid):
- Basis: gebundelte Langzeit-Wochenhistorie (CryptoCompare-Snapshot, seit 2010)
- Frisch: letzte 365 Tage von CoinGecko (Demo-Key aus .env) -> Wochenkerzen,
  ueberschreiben die juengsten Wochen der Basis.
So bleibt die volle Zyklus-Historie erhalten UND die Daten sind aktuell.
Demo-Keys erlauben max. 365 Tage Historie; CryptoCompare keyless liefert 401.
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

def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    return json.load(urllib.request.urlopen(req, timeout=40))

def coingecko_tail_weekly(coin):
    """Letzte 365 Tage von CoinGecko -> Wochenbars [time,o,h,l,c,v]."""
    base = ENV.get("COINGECKO_API", "https://api.coingecko.com/api/v3")
    j = get(f"{base}/coins/{coin}/market_chart?vs_currency=usd&days=365&interval=daily",
            {"x-cg-demo-api-key": CG_KEY})
    vols = {int(t // 1000): v for t, v in j.get("total_volumes", [])}
    weeks = {}
    for ts, close in j["prices"]:
        t = int(ts // 1000); wk = t - (t % (7 * 86400))
        w = weeks.setdefault(wk, {"o": close, "h": close, "l": close, "c": close, "v": 0})
        w["h"] = max(w["h"], close); w["l"] = min(w["l"], close); w["c"] = close
        w["v"] += vols.get(t, 0)
    return [[wk, round(w["o"], 4), round(w["h"], 4), round(w["l"], 4), round(w["c"], 4), round(w["v"])]
            for wk, w in sorted(weeks.items()) if w["c"] > 0]

for sym, coin in (("BTC", "bitcoin"), ("ETH", "ethereum")):
    f = OUT / f"{sym.lower()}_weekly.json"
    snap = json.load(open(f))
    base_rows = {r[0]: r for r in snap["data"]}
    n_before = len(base_rows)
    last_before = max(base_rows)
    if CG_KEY:
        fresh = coingecko_tail_weekly(coin)
        for r in fresh:
            old = base_rows.get(r[0])
            if old:
                # Merge: echte Intraweek-Extreme der Basis behalten, Close aktualisieren
                r = [r[0], old[1], max(old[2], r[2]), min(old[3], r[3]), r[4], max(old[5], r[5])]
            base_rows[r[0]] = r
        src = "CryptoCompare-Snapshot (Langzeit) + CoinGecko Demo (letzte 365 Tage)"
    else:
        fresh = []
        src = snap.get("source", "Snapshot")
    rows = [base_rows[k] for k in sorted(base_rows)]
    snap.update({"source": src, "fetched": str(datetime.date.today()), "data": rows})
    json.dump(snap, open(f, "w"))
    d_last = datetime.date.fromtimestamp(rows[-1][0])
    print(f"{sym}: {n_before} -> {len(rows)} Wochen | neu/aktualisiert: {len(fresh)} | letzte Woche: {d_last} | Schlusskurs: {rows[-1][4]:,}")
print("Fertig. Jetzt: node scripts/run_backtest.mjs")
