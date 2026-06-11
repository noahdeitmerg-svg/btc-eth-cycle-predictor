#!/usr/bin/env python3
"""FRED-Makrodaten: VIX, Dollar-Index (breit), 10J-2J-Zinskurve.
Liest FRED_API_KEY aus .env. Speichert public/data/macro_data.json (ohne Key).
Zusaetzlich: Makro-Werte an den historischen BTC-Boeden (fuer ehrlichen Kontext)."""
import json, urllib.request, urllib.parse, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = {}
if (ROOT / ".env").exists():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1); ENV[k.strip()] = v.strip()
KEY = ENV.get("FRED_API_KEY", "") or __import__("os").environ.get("FRED_API_KEY", "")
if not KEY:
    raise SystemExit("FRED_API_KEY fehlt in .env")

SERIES = {"vix": "VIXCLS", "dxy": "DTWEXBGS", "yield_10y2y": "T10Y2Y"}
BOTTOM_DATES = ["2015-01-14", "2018-12-15", "2022-11-21"]
TOP_DATES = ["2017-12-16", "2021-11-09", "2025-10-06"]

def fred(series_id):
    q = urllib.parse.urlencode({"series_id": series_id, "api_key": KEY,
                                "file_type": "json", "observation_start": "2010-01-01"})
    url = f"https://api.stlouisfed.org/fred/series/observations?{q}"
    obs = json.load(urllib.request.urlopen(url, timeout=40))["observations"]
    return {o["date"]: float(o["value"]) for o in obs if o["value"] not in (".", "")}

def value_near(d, date_str, tol=10):
    base = datetime.date.fromisoformat(date_str)
    for off in range(tol + 1):
        for s in (1, -1):
            key = str(base + datetime.timedelta(days=off * s))
            if key in d: return d[key]
    return None

out = {"fetched": str(datetime.date.today()), "source": "FRED (St. Louis Fed)", "series": {}}
for name, sid in SERIES.items():
    data = fred(sid)
    last_date = max(data)
    out["series"][name] = {
        "fred_id": sid,
        "current": data[last_date],
        "current_date": last_date,
        "at_btc_bottoms": {d: value_near(data, d) for d in BOTTOM_DATES},
        "at_btc_tops": {d: value_near(data, d) for d in TOP_DATES},
    }
    print(f"{name} ({sid}): aktuell {data[last_date]} ({last_date}), {len(data)} Beobachtungen")

json.dump(out, open(ROOT / "public" / "data" / "macro_data.json", "w"), indent=1)
print("gespeichert -> public/data/macro_data.json")
