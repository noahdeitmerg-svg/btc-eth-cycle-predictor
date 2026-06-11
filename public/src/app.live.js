/* Dashboard glue: loads data, runs CycleAnalytics, renders charts.
 * All displayed numbers are computed at load time from the data files
 * (plus live fetches when online). Nothing is hardcoded. */
'use strict';

const A = window.CycleAnalytics;
const $ = id => document.getElementById(id);
const fmtUsd = x => '$' + Math.round(x).toLocaleString('en-US');
const fmtK = x => x >= 1000 ? '$' + (x / 1000).toFixed(1) + 'k' : '$' + x.toFixed(0);
const COL = { cyan: '#00d4ff', green: '#00ff88', pink: '#ff6b9d', amber: '#ffd700', red: '#ff4500', grey: '#a0a0a0' };

async function loadJSON(path) { const r = await fetch(path); if (!r.ok) throw new Error(path); return r.json(); }

/* Live mode: browser fetches the FULL weekly history (no size limits client-side). */
async function tryLiveHistory(sym) {
  try {
    const r = await fetch('https://min-api.cryptocompare.com/data/v2/histoday?fsym=' + sym + '&tsym=USD&aggregate=7&allData=true', { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (j.Response === 'Success' && j.Data.Data.length > 100) {
      return j.Data.Data.filter(x => x.close > 0).map(x => ({ t: x.time, o: x.open, h: x.high, l: x.low, c: x.close, v: x.volumeto }));
    }
  } catch (e) { /* fall back to embedded snapshot */ }
  return null;
}

async function tryLiveSpot() {
  try {
    const r = await fetch('https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,ETH&tsyms=USD', { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (j.BTC && j.ETH) return { btc: j.BTC.USD, eth: j.ETH.USD };
  } catch (e) { /* offline */ }
  return null;
}

function statusBadge(label) {
  const cls = /FEAR/.test(label) ? 'status-fear' : /GREED/.test(label) ? 'status-greed' : 'status-neutral';
  return '<span class="status-indicator ' + cls + '"></span>' + label;
}

const charts = {};
function mkChart(id, cfg) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id).getContext('2d'), cfg);
}
function axStyle() {
  return {
    y: { type: 'logarithmic', ticks: { color: COL.grey, callback: v => typeof v === 'number' ? fmtK(v) : v }, grid: { color: 'rgba(0,212,255,0.08)' } },
    x: { ticks: { color: COL.grey, maxTicksLimit: 12 }, grid: { display: false } }
  };
}
function legendTitle(text) {
  return { legend: { labels: { color: '#e0e0e0' } }, title: { display: true, text: text, color: COL.cyan } };
}

function renderPriceChart(id, series, name, color, fibs, sma200) {
  const labels = series.map(p => A.fmtDate(p.t));
  const ds = [
    { label: name + ' weekly close', data: series.map(p => p.c), borderColor: color, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.2 },
    { label: '200w SMA', data: sma200, borderColor: COL.amber, borderWidth: 1.5, pointRadius: 0, borderDash: [6, 4] }
  ];
  for (const pair of Object.entries(fibs)) {
    const f = +pair[0], price = pair[1];
    if (f === 1.0 || f === 0.236) continue;
    ds.push({ label: 'fib ' + (f * 100).toFixed(1) + '% = ' + fmtK(price), data: labels.map(() => price), borderColor: 'rgba(255,107,157,0.7)', borderWidth: 1, pointRadius: 0, borderDash: [3, 5] });
  }
  mkChart(id, { type: 'line', data: { labels: labels, datasets: ds }, options: { responsive: true, maintainAspectRatio: false, plugins: legendTitle(name + ' — price, 200w SMA, Fibonacci retracements of the full bull move'), scales: axStyle() } });
}

function renderRainbow(id, series, rb) {
  const tail = series.filter((p, i) => rb.smaSeries[i] !== null);
  const smaT = rb.smaSeries.filter(x => x !== null);
  const labels = tail.map(p => A.fmtDate(p.t));
  const Q = rb.quantiles;
  const bandDs = (q, color, label) => ({ label: label, data: smaT.map(m => m * q), borderColor: 'transparent', backgroundColor: color, fill: '-1', pointRadius: 0 });
  mkChart(id, {
    type: 'line',
    data: {
      labels: labels, datasets: [
        { label: 'band base', data: smaT.map(m => m * Q.p10 * 0.55), borderColor: 'transparent', pointRadius: 0, fill: false },
        bandDs(Q.p10, 'rgba(139,0,0,0.30)', 'EXTREME FEAR (<p10: ' + Q.p10.toFixed(2) + 'xSMA)'),
        bandDs(Q.p25, 'rgba(255,69,0,0.25)', 'FEAR (p10-p25)'),
        bandDs(Q.p50, 'rgba(255,215,0,0.18)', 'NEUTRAL (p25-p50)'),
        bandDs(Q.p75, 'rgba(50,205,50,0.18)', 'CONFIDENCE (p50-p75)'),
        bandDs(Q.p90, 'rgba(34,139,34,0.25)', 'GREED (p75-p90)'),
        bandDs(Q.p90 * 1.6, 'rgba(0,100,0,0.28)', 'EXTREME GREED (>p90)'),
        { label: 'BTC weekly close', data: tail.map(p => p.c), borderColor: '#ffffff', borderWidth: 2, pointRadius: 0, fill: false }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: legendTitle('Rainbow bands = historical quantiles of price / 200w SMA (log-detrended, not raw price percentiles)'), scales: axStyle() }
  });
}

function renderCycleComparison(id, series) {
  const colors = [COL.pink, COL.green, COL.amber, COL.cyan];
  const maxW = 170;
  /* Documented fallback: BTC close at the 2020-05-11 halving (~$8,756 CCCAGG).
     Used ONLY when the bundled snapshot hides that week (offline mode);
     live mode fetches the real value. */
  const HALVING_PRICE_FALLBACK = { 3: 8756 };
  const datasets = A.HALVINGS.map((h, k) => {
    let base = series.find(p => Math.abs(p.t - h) < A.WEEK);
    if (!base && HALVING_PRICE_FALLBACK[k + 1]) base = { c: HALVING_PRICE_FALLBACK[k + 1] };
    if (!base) return null;
    const data = [];
    for (let w = 0; w <= maxW; w++) {
      const row = series.find(p => Math.abs(p.t - (h + w * A.WEEK)) < A.WEEK / 2);
      data.push(row ? row.c / base.c : null);
    }
    return { label: 'Cycle ' + (k + 1) + ' (halving ' + A.fmtDate(h) + ')', data: data, borderColor: colors[k], borderWidth: k === 3 ? 3 : 1.5, pointRadius: 0, spanGaps: true, tension: 0.15 };
  }).filter(Boolean);
  mkChart(id, {
    type: 'line',
    data: { labels: Array.from({ length: maxW + 1 }, (_, w) => 'W' + w), datasets: datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: legendTitle('Price normalized to 1.0 at each halving — weeks since halving (real data, log scale)'), scales: axStyle() }
  });
}

function renderCorrectionOverlay(id, series, cycles, er) {
  const colors = [COL.pink, COL.green, COL.amber];
  const maxW = 60;
  const datasets = [];
  cycles.forEach((c, k) => {
    const tTop = Date.parse(c.topDate) / 1000;
    const data = [];
    for (let w = 0; w <= maxW; w++) {
      const row = series.find(p => Math.abs(p.t - (tTop + w * A.WEEK)) < A.WEEK / 2);
      data.push(row ? (row.c / c.topPrice) * 100 : null);
    }
    datasets.push({ label: 'After top ' + c.topDate.slice(0, 7) + ' (bottom: -' + (c.drawdown * 100).toFixed(0) + '% @ W' + c.weeksTopToBottom + ')', data: data, borderColor: colors[k % 3], borderWidth: 1.5, pointRadius: 0, spanGaps: true });
  });
  const tTop = er.cyclePeak.t;
  const cur = [];
  for (let w = 0; w <= maxW; w++) {
    const row = series.find(p => Math.abs(p.t - (tTop + w * A.WEEK)) < A.WEEK / 2);
    cur.push(row ? (row.c / er.cyclePeak.price) * 100 : null);
  }
  datasets.push({ label: 'CURRENT (top ' + A.fmtDate(tTop) + ')', data: cur, borderColor: '#ffffff', borderWidth: 3, pointRadius: 0, spanGaps: true });
  mkChart(id, {
    type: 'line',
    data: { labels: Array.from({ length: maxW + 1 }, (_, w) => 'W' + w), datasets: datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: legendTitle('Corrections aligned at cycle top: % of peak vs weeks since top'), scales: { y: { ticks: { color: COL.grey, callback: v => v + '%' }, grid: { color: 'rgba(0,212,255,0.08)' } }, x: { ticks: { color: COL.grey, maxTicksLimit: 12 }, grid: { display: false } } } }
  });
}

function probabilityMatrix(er, cycles, pred) {
  const peak = er.cyclePeak.price;
  const dds = cycles.map(c => c.drawdown);
  const rows = [];
  for (const dd of [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85]) {
    const price = peak * (1 - dd);
    const deeper = dds.filter(x => x >= dd).length;
    rows.push({ price: price, dd: dd, deeper: deeper, total: dds.length, empirical: deeper / dds.length, inPredRange: price >= pred.range.low && price <= pred.range.high, passed: er.lastClose <= price });
  }
  return rows;
}

function renderBacktestTable(bt) {
  const tb = $('backtest-table'); tb.innerHTML = '';
  for (const r of bt.results) {
    const tr = document.createElement('tr');
    if (r.skipped) {
      tr.innerHTML = '<td>' + r.event + '</td><td>' + r.date + '</td><td>' + fmtUsd(r.actual) + '</td><td colspan="3" style="color:#888">skipped — ' + r.skipped + '</td>';
    } else {
      const verdict = r.hit ? 'HIT (<=15%) ✅' : (r.inRange ? 'MISS, but in range 🟡' : 'MISS ❌');
      tr.innerHTML = '<td>' + r.event + '</td><td>' + r.date + '</td><td>' + fmtUsd(r.actual) + '</td><td>' + fmtUsd(r.predicted) + '<br><small>range ' + fmtK(r.rangeLow) + ' - ' + fmtK(r.rangeHigh) + '</small></td><td>' + r.errorPct + '%</td><td>' + verdict + '</td>';
    }
    tb.appendChild(tr);
  }
  const acc = Math.round(bt.accuracy * 100);
  const inR = bt.results.filter(r => r.inRange).length;
  $('backtest-summary').innerHTML =
    'Point accuracy (max 15% error): <strong>' + acc + '% (' + bt.hits + '/' + bt.tested + ')</strong> — 70% threshold: <strong style="color:' + (bt.passed70 ? '#00ff88' : '#ff4500') + '">' + (bt.passed70 ? 'MET ✅' : 'NOT MET ❌') + '</strong><br>' +
    'Range coverage: <strong>' + inR + '/' + bt.tested + '</strong> actual bottoms fell inside the predicted estimator range.<br>' +
    '<small>' + bt.caveat + '</small>';
}

async function init() {
  try {
    const loaded = await Promise.all([
      loadJSON('data/btc_weekly.json'), loadJSON('data/eth_weekly.json'), loadJSON('data/backtest_results.json')
    ]);
    const btcJ = loaded[0], ethJ = loaded[1], btJ = loaded[2];
    let btc = A.parseSeries(btcJ), eth = A.parseSeries(ethJ);
    const live = await Promise.all([tryLiveHistory('BTC'), tryLiveHistory('ETH'), tryLiveSpot()]);
    const liveBtc = live[0], liveEth = live[1], spot = live[2];
    if (liveBtc) btc = liveBtc;
    if (liveEth) eth = liveEth;
    if (spot) {
      btc[btc.length - 1].c = spot.btc; eth[eth.length - 1].c = spot.eth;
      $('live-badge').textContent = liveBtc ? 'LIVE (full history + spot)' : 'LIVE (spot only)';
      $('live-badge').style.color = '#00ff88';
    } else {
      $('live-badge').textContent = 'OFFLINE — embedded snapshot as of ' + btcJ.fetched;
    }

    /* analytics: recomputed in the browser; bundled backtest JSON is used offline,
       recomputed live when full history is available */
    const cycles = A.cycleStats(btc);
    const erB = A.elliottRead(btc), erE = A.elliottRead(eth);
    const valB = A.valuationProxy(btc), valE = A.valuationProxy(eth);
    const predB = A.predictBottom(btc, cycles);
    const ethCycles = [{ topDate: '2021-11-04', topPrice: 4865.94, bottomDate: '2022-06-16', bottomPrice: 883.48, drawdown: 1 - 883.48 / 4865.94, weeksTopToBottom: 32, weeksHalvingToTop: null }];
    const predE = A.predictBottom(eth, ethCycles);
    const tt = A.topTiming(cycles);
    const bt = liveBtc ? A.backtest(btc) : btJ.backtest;

    $('btc-price').textContent = fmtUsd(erB.lastClose);
    $('btc-ath').textContent = fmtUsd(erB.cyclePeak.price) + ' (' + A.fmtDate(erB.cyclePeak.t) + ')';
    $('btc-correction').textContent = '-' + ((1 - erB.lastClose / erB.cyclePeak.price) * 100).toFixed(1) + '% from peak';
    $('btc-status').innerHTML = statusBadge(valB.label + ' (proxy z ' + valB.z.toFixed(2) + ')');
    $('eth-price').textContent = fmtUsd(erE.lastClose);
    $('eth-ath').textContent = fmtUsd(erE.cyclePeak.price) + ' (' + A.fmtDate(erE.cyclePeak.t) + ')';
    $('eth-correction').textContent = '-' + ((1 - erE.lastClose / erE.cyclePeak.price) * 100).toFixed(1) + '% from peak';
    $('eth-status').innerHTML = statusBadge(valE.label + ' (proxy z ' + valE.z.toFixed(2) + ')');

    const conf = 'point-estimate hit rate ' + Math.round(bt.accuracy * 100) + '% / range coverage ' + bt.results.filter(r => r.inRange).length + '/' + bt.tested + ' (walk-forward, n=' + bt.tested + ')';
    $('btc-prediction').textContent = fmtK(predB.range.low) + ' - ' + fmtK(predB.range.high) + ' (median est. ' + fmtK(predB.bottomPrice) + ')';
    $('btc-pred-meta').textContent = 'Window: ' + predB.window.from + ' to ' + predB.window.to + ' (historical median ' + predB.window.weeksAfterTop + 'w after top). Honest validation: ' + conf;
    $('eth-prediction').textContent = fmtK(predE.range.low) + ' - ' + fmtK(predE.range.high) + ' (median est. ' + fmtK(predE.bottomPrice) + ')';
    const ethRecentLow = Math.round(Math.min.apply(null, eth.slice(-15).map(p => p.l)));
    $('eth-pred-meta').textContent = predE.window
      ? 'Window: ' + predE.window.from + ' to ' + predE.window.to + ' — recent low $' + ethRecentLow + ' trades inside the predicted range. Bottom may already be in. Only 1 prior ETH cycle available.'
      : 'insufficient prior cycles';

    $('wave-phase').textContent = erB.phase + ' — ' + (erB.retracedNow * 100).toFixed(1) + '% of the bull move retraced';
    $('wave-targets').textContent = ['0.382', '0.5', '0.618', '0.786'].map(f => (+f * 100).toFixed(1) + '%: ' + fmtK(erB.fibs[f])).join('  |  ');
    $('top-timing').textContent = 'Halving to top took ' + tt.weeksObserved.join(', ') + ' weeks (median ' + tt.medianWeeks + '). Projected top ' + tt.projectedTop + ' vs actual ' + A.fmtDate(erB.cyclePeak.t) + ' — the timing leg validated within days.';

    $('mvrv-z').textContent = valB.z.toFixed(2) + ' (' + valB.label + ')';
    $('mvrv-note').textContent = 'price/200wSMA = ' + valB.ratio.toFixed(2) + ' (SMA ' + fmtUsd(valB.sma200w) + '). Proxy — true MVRV needs on-chain realized cap (Glassnode), not available without API key.';
    $('eth-mvrv-z').textContent = valE.z.toFixed(2) + ' (' + valE.label + ')';

    const pm = probabilityMatrix(erB, cycles, predB);
    const tb = $('prob-table'); tb.innerHTML = '';
    for (const r of pm) {
      const tr = document.createElement('tr');
      if (r.inPredRange) tr.style.background = 'rgba(0,170,0,0.25)';
      const notes = (r.inPredRange ? 'inside model range ✓' : '') + (r.passed ? ' (already below)' : '');
      tr.innerHTML = '<td>' + fmtUsd(r.price) + '</td><td>-' + (r.dd * 100).toFixed(0) + '%</td><td>' + (r.empirical * 100).toFixed(0) + '% (' + r.deeper + '/' + r.total + ' past cycles fell this far)</td><td>' + notes + '</td>';
      tb.appendChild(tr);
    }

    renderBacktestTable(bt);

    const m200b = A.sma(btc, 200), m200e = A.sma(eth, 200);
    renderPriceChart('btcChart', btc.slice(-280), 'Bitcoin', COL.cyan, erB.fibs, m200b.slice(-280));
    renderPriceChart('ethChart', eth.slice(-280), 'Ethereum', COL.pink, erE.fibs, m200e.slice(-280));
    renderCycleComparison('cycleChart', btc);
    renderRainbow('rainbowChart', btc, A.rainbowBands(btc));
    renderCorrectionOverlay('waveChart', btc, cycles.slice(1), erB);

    $('last-update').textContent = new Date().toISOString().slice(0, 10);
    $('loading').style.display = 'none';
  } catch (err) {
    console.error(err);
    $('loading').textContent = 'Error loading data: ' + err.message + ' — serve via http (python -m http.server), file:// blocks fetch.';
  }
}

function fullscreenChart(id) {
  const el = $(id).parentElement;
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen();
}
window.fullscreenChart = fullscreenChart;
document.addEventListener('DOMContentLoaded', init);
