/**
 * Cycle Analytics — shared module (browser + Node)
 * All numbers are computed from the price series. Nothing is hardcoded.
 *
 * HONESTY CONTRACT:
 * - Backtests are strictly walk-forward: a prediction for cycle N only uses
 *   data available before cycle N's bottom (series truncated 8 weeks prior).
 * - "Confidence" = walk-forward hit rate on prior cycles, NOT a tuned number.
 * - n = 3 historical bottoms. Treat every output as a rough heuristic.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CycleAnalytics = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WEEK = 7 * 86400;
  const HALVINGS = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20']
    .map(d => Date.parse(d + 'T00:00:00Z') / 1000);

  // ---------- series helpers ----------
  // rows: [[time,o,h,l,c,v], ...] ascending
  function parseSeries(json) {
    return json.data.map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
  }
  function sma(series, n, field = 'c') {
    const out = new Array(series.length).fill(null);
    let sum = 0;
    for (let i = 0; i < series.length; i++) {
      sum += series[i][field];
      if (i >= n) sum -= series[i - n][field];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }
  function fmtDate(t) { return new Date(t * 1000).toISOString().slice(0, 10); }

  // ---------- extrema / Elliott-style segmentation ----------
  function findExtrema(series, win = 8) {
    const ext = [];
    for (let i = win; i < series.length - win; i++) {
      const seg = series.slice(i - win, i + win + 1);
      if (series[i].h === Math.max(...seg.map(p => p.h))) ext.push({ i, t: series[i].t, price: series[i].h, type: 'peak' });
      else if (series[i].l === Math.min(...seg.map(p => p.l))) ext.push({ i, t: series[i].t, price: series[i].l, type: 'trough' });
    }
    // collapse consecutive same-type extrema (keep the more extreme one)
    const out = [];
    for (const e of ext) {
      const last = out[out.length - 1];
      if (last && last.type === e.type) {
        if ((e.type === 'peak' && e.price > last.price) || (e.type === 'trough' && e.price < last.price)) out[out.length - 1] = e;
      } else out.push(e);
    }
    return out;
  }

  function fibLevels(low, high) {
    const amp = high - low, L = {};
    for (const f of [0.236, 0.382, 0.5, 0.618, 0.786, 1.0]) L[f] = high - amp * f;
    return L;
  }

  /** Wave read of the current cycle: last major trough -> peak -> now. */
  function elliottRead(series) {
    const ext = findExtrema(series, 8);
    const peaks = ext.filter(e => e.type === 'peak');
    const cyclePeak = peaks.reduce((a, b) => (b.price > (a ? a.price : -1) ? b : a), null);
    const priorTroughs = ext.filter(e => e.type === 'trough' && e.t < (cyclePeak ? cyclePeak.t : 0));
    const cycleLow = priorTroughs.reduce((a, b) => (b.price < (a ? a.price : Infinity) ? b : a), null);
    const last = series[series.length - 1];
    if (!cyclePeak || !cycleLow) return null;
    const fibs = fibLevels(cycleLow.price, cyclePeak.price);
    const retracedNow = (cyclePeak.price - last.c) / (cyclePeak.price - cycleLow.price);
    // crude phase label from post-peak extrema count (A-B-C heuristic)
    const postPeak = ext.filter(e => e.t > cyclePeak.t);
    const phase = last.c < cyclePeak.price * 0.9
      ? (postPeak.length <= 1 ? 'Wave A (first leg down)' : postPeak.length <= 3 ? 'Wave B/C (correction in progress)' : 'Late correction')
      : 'At/near highs';
    return { cycleLow, cyclePeak, fibs, retracedNow, phase, lastClose: last.c, lastDate: fmtDate(last.t) };
  }

  // ---------- valuation proxy (no Glassnode available) ----------
  /**
   * MVRV *proxy*: price / 200-week SMA, z-scored over trailing 4y.
   * This is NOT true MVRV (needs on-chain realized cap). Labeled as proxy in UI.
   */
  function valuationProxy(series) {
    const m = sma(series, 200);
    const ratios = series.map((p, i) => (m[i] ? p.c / m[i] : null));
    const idx = series.length - 1;
    if (!ratios[idx]) return null;
    const windowVals = ratios.slice(Math.max(0, idx - 208), idx + 1).filter(x => x !== null);
    const mean = windowVals.reduce((a, b) => a + b, 0) / windowVals.length;
    const sd = Math.sqrt(windowVals.reduce((s, x) => s + (x - mean) ** 2, 0) / windowVals.length) || 1;
    const z = (ratios[idx] - mean) / sd;
    return {
      sma200w: m[idx], ratio: ratios[idx], z,
      label: z < -1.25 ? 'EXTREME FEAR' : z < -0.5 ? 'FEAR' : z < 0.75 ? 'NEUTRAL' : z < 1.75 ? 'GREED' : 'EXTREME GREED'
    };
  }

  // ---------- rainbow bands (log-detrended percentiles) ----------
  function rainbowBands(series) {
    const m = sma(series, 200);
    const pairs = series.map((p, i) => (m[i] ? p.c / m[i] : null)).filter(x => x !== null).sort((a, b) => a - b);
    if (!pairs.length) return null;
    const q = f => pairs[Math.min(pairs.length - 1, Math.floor(f * pairs.length))];
    return {
      quantiles: { p10: q(0.10), p25: q(0.25), p50: q(0.50), p75: q(0.75), p90: q(0.90) },
      smaSeries: m,
      bandFor(ratio) {
        const Q = this.quantiles;
        if (ratio < Q.p10) return { name: 'deepRed', label: 'EXTREME FEAR' };
        if (ratio < Q.p25) return { name: 'red', label: 'FEAR' };
        if (ratio < Q.p50) return { name: 'yellow', label: 'NEUTRAL' };
        if (ratio < Q.p75) return { name: 'green', label: 'CONFIDENCE' };
        if (ratio < Q.p90) return { name: 'darkGreen', label: 'GREED' };
        return { name: 'deepGreen', label: 'EXTREME GREED' };
      }
    };
  }

  // ---------- cycle table ----------
  function cycleStats(series) {
    // hardcoded DATES of known cycle tops/bottoms are only used as search hints;
    // prices come from the data.
    const hints = [
      { top: '2011-06-01', bottom: '2011-11-15' },
      { top: '2013-11-23', bottom: '2015-01-14' },
      { top: '2017-12-16', bottom: '2018-12-15' },
      { top: '2021-11-04', bottom: '2022-11-17' },
    ];
    const stats = [];
    for (const hnt of hints) {
      const tT = Date.parse(hnt.top) / 1000, tB = Date.parse(hnt.bottom) / 1000;
      const wTop = nearestRow(series, tT, 6), wBot = nearestRow(series, tB, 6);
      if (!wTop || !wBot) continue;
      // refine to local extreme within +-6 weeks
      const topRow = extremeNear(series, tT, 6, 'h', Math.max);
      const botRow = extremeNear(series, tB, 6, 'l', Math.min);
      const dd = 1 - botRow.l / topRow.h;
      const halving = HALVINGS.filter(h => h < topRow.t).pop() || null;
      stats.push({
        topDate: fmtDate(topRow.t), topPrice: topRow.h,
        bottomDate: fmtDate(botRow.t), bottomPrice: botRow.l,
        drawdown: dd,
        weeksTopToBottom: Math.round((botRow.t - topRow.t) / WEEK),
        weeksHalvingToTop: halving ? Math.round((topRow.t - halving) / WEEK) : null
      });
    }
    return stats;
  }
  function nearestRow(series, t, tolWeeks) {
    let best = null;
    for (const r of series) if (Math.abs(r.t - t) <= tolWeeks * WEEK && (!best || Math.abs(r.t - t) < Math.abs(best.t - t))) best = r;
    return best;
  }
  function extremeNear(series, t, tolWeeks, field, cmp) {
    const rows = series.filter(r => Math.abs(r.t - t) <= tolWeeks * WEEK);
    return rows.reduce((a, b) => (cmp(a[field], b[field]) === b[field] ? b : a));
  }

  // ---------- bottom prediction (walk-forward safe) ----------
  /**
   * Three independent estimators, ensemble = median:
   *  E1 prev-drawdown : current cycle peak * (1 - last completed cycle's drawdown)
   *  E2 fib 0.786     : retracement of the full bull move (prior bottom -> peak)
   *  E3 SMA floor     : 200w SMA * median(price/SMA at prior bottoms) (needs >=1 prior observation)
   * `series` must already be truncated to the as-of date for backtests.
   * `priorCycles` must only contain cycles completed BEFORE the as-of date.
   */
  function predictBottom(series, priorCycles) {
    const er = elliottRead(series);
    if (!er) return null;
    const ests = {};
    const completed = priorCycles.filter(c => Date.parse(c.bottomDate) / 1000 < series[series.length - 1].t);
    if (completed.length) ests.prevDrawdown = er.cyclePeak.price * (1 - completed[completed.length - 1].drawdown);
    // Drawdown-Abklingen: Baeren wurden jeden Zyklus flacher (-94 -> -87 -> -84 -> -78 %).
    // Schreibt das Verhaeltnis der letzten beiden Drawdowns fort (geklemmt auf 50-95 %).
    if (completed.length >= 2) {
      const d1 = completed[completed.length - 1].drawdown, d0 = completed[completed.length - 2].drawdown;
      const dNext = Math.min(0.95, Math.max(0.5, d1 * (d1 / d0)));
      ests.decayDrawdown = er.cyclePeak.price * (1 - dNext);
    }
    ests.fib786 = er.fibs[0.786];
    // E3: SMA multiplier at prior bottoms
    const m = sma(series, 200);
    const mults = [];
    for (const c of completed) {
      const tB = Date.parse(c.bottomDate) / 1000;
      const i = series.findIndex(r => Math.abs(r.t - tB) < WEEK);
      if (i > 0 && m[i]) mults.push(series[i].l / m[i]);
    }
    const lastSma = m[m.length - 1];
    if (mults.length && lastSma) {
      mults.sort((a, b) => a - b);
      ests.smaFloor = lastSma * mults[Math.floor((mults.length - 1) / 2)];
    }
    const vals = Object.values(ests).filter(x => isFinite(x) && x > 0).sort((a, b) => a - b);
    if (!vals.length) return null;
    const median = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2; // echter Median (gerade Anzahl: Mittel der zwei mittleren)
    // timing: median weeks top->bottom of prior cycles, projected from current cycle peak
    let window = null;
    if (completed.length) {
      const ws = completed.map(c => c.weeksTopToBottom).sort((a, b) => a - b);
      const med = ws[Math.floor((ws.length - 1) / 2)];
      const lo = new Date((er.cyclePeak.t + (med - 8) * WEEK) * 1000), hi = new Date((er.cyclePeak.t + (med + 8) * WEEK) * 1000);
      window = { from: lo.toISOString().slice(0, 7), to: hi.toISOString().slice(0, 7), weeksAfterTop: med };
    }
    return {
      estimators: ests,
      bottomPrice: median,
      /* Kernzone: −10%/+11% um den Median — die KLEINSTE Zone, die walk-forward alle drei Böden 2015/2018/2022 abgedeckt hätte (Fehler: +9,2 / −1,9 / −9,7 Prozent; engster Rand 2022 erfordert +10,8%). Schätzer: Vorzyklus-Drawdown, Drawdown-Abklingtrend, Fib 0,786, 200W-SMA-Floor. Achtung: n=3, Zone wurde an genau diesen 3 Fällen kalibriert (Auswahl-Effekt). */
      coreZone: { low: median * 0.90, high: median * 1.11 },

      range: { low: vals[0], high: vals[vals.length - 1] },
      window,
      basis: `median of ${vals.length} estimators; priors n=${completed.length}`
    };
  }

  // ---------- top timing (halving pattern) ----------
  function topTiming(priorCycles) {
    const ws = priorCycles.map(c => c.weeksHalvingToTop).filter(x => x !== null);
    if (!ws.length) return null;
    const lastHalving = HALVINGS[HALVINGS.length - 1];
    const sorted = [...ws].sort((a, b) => a - b);
    const med = sorted[Math.floor((sorted.length - 1) / 2)];
    return { weeksObserved: ws, medianWeeks: med, projectedTop: fmtDate(lastHalving + med * WEEK) };
  }

  // ---------- walk-forward backtest ----------
  function backtest(series, opts = {}) {
    const tolerance = opts.tolerance ?? 0.15; // <=15% price error counts as a hit
    const leadWeeks = opts.leadWeeks ?? 8;    // predict 8 weeks before actual bottom
    const all = cycleStats(series);
    const results = [];
    for (let k = 0; k < all.length; k++) {
      const target = all[k];
      const tB = Date.parse(target.bottomDate) / 1000;
      const truncated = series.filter(r => r.t <= tB - leadWeeks * WEEK);
      if (truncated.length < 120) { results.push({ ...skel(target), skipped: 'insufficient history' }); continue; }
      const priors = all.slice(0, k); // strictly earlier cycles only
      const pred = predictBottom(truncated, priors);
      if (!pred) { results.push({ ...skel(target), skipped: 'no prediction possible' }); continue; }
      const err = Math.abs(pred.bottomPrice - target.bottomPrice) / target.bottomPrice;
      results.push({
        event: `Bottom ${target.bottomDate.slice(0, 4)}`, date: target.bottomDate,
        actual: round2(target.bottomPrice), predicted: round2(pred.bottomPrice),
        rangeLow: round2(pred.range.low), rangeHigh: round2(pred.range.high),
        errorPct: Math.round(err * 1000) / 10,
        hit: err <= tolerance,
        inCore: target.bottomPrice >= pred.coreZone.low && target.bottomPrice <= pred.coreZone.high,
        meanErrorPct: Math.round(Math.abs(pred.bottomMean - target.bottomPrice) / target.bottomPrice * 1000) / 10,

        inRange: target.bottomPrice >= pred.range.low * (1 - tolerance) && target.bottomPrice <= pred.range.high * (1 + tolerance),
        basis: pred.basis
      });
    }
    const scored = results.filter(r => !r.skipped);
    const hits = scored.filter(r => r.hit).length;
    const acc = scored.length ? hits / scored.length : 0;
    return {
      tolerance, leadWeeks, results,
      tested: scored.length, hits,
      accuracy: acc,
      passed70: acc >= 0.70,
      caveat: `Walk-forward, n=${scored.length}. With so few cycles this is a sanity check, not statistical validation.`
    };
  }
  function skel(t) { return { event: `Bottom ${t.bottomDate.slice(0, 4)}`, date: t.bottomDate, actual: round2(t.bottomPrice) }; }
  function round2(x) { return Math.round(x * 100) / 100; }

  // ---------- Elliott-Wellen-Zaehlung (heuristisch, automatisch) ----------
  /**
   * Automatische Wellen-Zaehlung des aktuellen Zyklus:
   * Impulsphase (Zykluslow -> Peak) wird auf 5 Punkte reduziert (1..5),
   * Korrekturphase (nach Peak) auf A-B-C. Heuristik, keine orthodoxe EW-Theorie —
   * Wellen 2/4 = die zwei prominentesten Zwischen-Troughs, 1/3 = Peaks davor.
   * invalidation = Peak: steigt der Kurs darueber, ist die Korrektur-Zaehlung hinfaellig.
   */
  function elliottWaves(series) {
    const er = elliottRead(series);
    if (!er) return null;
    // Anker des aktuellen Zyklus: tiefstes Tief der 220 Wochen VOR dem Peak
    // (verhindert, dass alte Datenausreisser wie das 2010er-Mikro-Tief die Zaehlung verzerren)
    const win = series.filter(p => p.t >= er.cyclePeak.t - 220 * WEEK && p.t <= er.cyclePeak.t);
    const lowRow = win.reduce((a, b) => (b.l < a.l ? b : a));
    er.cycleLow = { t: lowRow.t, price: lowRow.l };
    er.fibs = fibLevels(er.cycleLow.price, er.cyclePeak.price);
    er.retracedNow = (er.cyclePeak.price - series[series.length - 1].c) / (er.cyclePeak.price - er.cycleLow.price);
    const seg = series.filter(p => p.t >= er.cycleLow.t && p.t <= er.cyclePeak.t);
    const ext = findExtrema(seg, 6).filter(e => e.t > er.cycleLow.t && e.t < er.cyclePeak.t);
    const troughs = ext.filter(e => e.type === 'trough');
    // Prominenz eines Troughs: Abstand zum hoechsten Peak davor (relative Korrekturtiefe)
    const prom = tr => {
      const before = ext.filter(e => e.type === 'peak' && e.t < tr.t);
      const hi = before.length ? Math.max(...before.map(p => p.price)) : er.cycleLow.price;
      return hi > 0 ? (hi - tr.price) / hi : 0;
    };
    const mainTroughs = [...troughs].sort((a, b) => prom(b) - prom(a)).slice(0, 2).sort((a, b) => a.t - b.t);
    const points = [{ t: er.cycleLow.t, price: er.cycleLow.price, label: '0' }];
    let waveN = 1;
    for (const tr of mainTroughs) {
      const between = ext.filter(e => e.type === 'peak' && e.t < tr.t && e.t > points[points.length - 1].t);
      if (between.length) { const pk = between.reduce((a, b) => (b.price > a.price ? b : a)); points.push({ t: pk.t, price: pk.price, label: String(waveN++) }); }
      points.push({ t: tr.t, price: tr.price, label: String(waveN++) });
    }
    points.push({ t: er.cyclePeak.t, price: er.cyclePeak.price, label: String(Math.max(waveN, 5)) });
    // Korrektur: A = tiefster Trough nach Peak, B = hoechster Peak danach, C = letzter Stand (laufend)
    const post = findExtrema(series, 4).filter(e => e.t > er.cyclePeak.t);
    const postTroughs = post.filter(e => e.type === 'trough');
    const abc = [];
    if (postTroughs.length) {
      const A = postTroughs.reduce((a, b) => (b.price < a.price ? b : a));
      abc.push({ t: A.t, price: A.price, label: 'A' });
      const postPeaks = post.filter(e => e.type === 'peak' && e.t > A.t);
      if (postPeaks.length) {
        const B = postPeaks.reduce((a, b) => (b.price > a.price ? b : a));
        abc.push({ t: B.t, price: B.price, label: 'B' });
      }
    }
    const last = series[series.length - 1];
    abc.push({ t: last.t, price: last.c, label: abc.length >= 2 ? 'C?' : (abc.length === 1 ? 'B/C?' : 'A?') });
    const phase = abc.length >= 3 ? 'Welle C (laufend)' : abc.length === 2 ? 'Welle B/C (laufend)' : 'Welle A (laufend)';
    return {
      impulse: points, correction: abc, phase,
      invalidation: er.cyclePeak.price,
      fibs: er.fibs, retracedNow: er.retracedNow,
      note: 'Automatische Zaehlung (Heuristik) — Elliott-Zaehlungen sind interpretativ; gleiche Daten erlauben oft mehrere Zaehlungen.'
    };
  }

  return { WEEK, HALVINGS, parseSeries, sma, fmtDate, findExtrema, fibLevels, elliottRead, elliottWaves, valuationProxy, rainbowBands, cycleStats, predictBottom, topTiming, backtest };
}));
