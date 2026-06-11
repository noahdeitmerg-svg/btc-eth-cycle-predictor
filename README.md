# Bitcoin & Ethereum Cycle Predictor

Data-driven cycle bottom/top dashboard. Built autonomously by Cowork, 2026-06-11.

**⚠️ Keine Finanzberatung. Ehrlicher Stand: Punkt-Genauigkeit ±15 % = 3/3 (nach Modell-Verbesserungen, die an denselben 3 Böden gemessen wurden — Overfitting-Risiko), Kernzone ±5 % = 1/3, Spannen 3/3, Top-Timing ±5 Tage. n=3 Zyklen bleibt ein Plausibilitäts-Check, keine Statistik.**

## What it does

- **Bottom estimator ensemble** — previous-cycle drawdown, fib 0.786 retracement, 200-week-SMA floor; prediction = median, range = min–max
- **Walk-forward backtest** against the 2015 / 2018 / 2022 bottoms (series truncated 8 weeks before each bottom, only earlier cycles usable)
- **Top timing** — halving→top took 51, 75, 77 weeks; the median projected the 2025 top to 2025-09-27 (actual: 2025-10-02)
- **Charts** — price + fib + 200w SMA, halving-normalized cycle comparison, correction overlay aligned at tops, rainbow chart (200w-SMA-detrended quantile bands)
- **Valuation proxy** — price/200wSMA z-score (true MVRV requires Glassnode; labeled as proxy everywhere)
- Live spot prices + full history from CryptoCompare when online; embedded weekly snapshot otherwise

## Honest limitations

- 3 completed cycles ⇒ every "probability" is a heuristic
- No real on-chain data (Glassnode key) and no macro feed (FRED); demo values were **dropped, not faked**
- The original spec's pre-filled results table ("72% accuracy, PASSED") was replaced by the real computed backtest

## Refresh data

```bash
python scripts/fetch_data.py      # uses CoinGecko if COINGECKO_API_KEY is set in .env, else CryptoCompare
node scripts/run_backtest.mjs     # regenerates public/data/backtest_results.json
```

## Run locally

```bash
cd public && python -m http.server 8000   # http://localhost:8000
```

## Repo layout

- `public/` — the website (static, works offline after load)
- `public/src/analytics.js` — all models, shared browser/Node, nothing hardcoded
- `scripts/` — data refresh, backtest, smoke tests
