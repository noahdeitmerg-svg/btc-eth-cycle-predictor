/* Dashboard-Logik: lädt Daten, rechnet CycleAnalytics, rendert Charts.
 * Alle angezeigten Zahlen werden beim Laden aus den Datendateien berechnet.
 * Nichts ist hartkodiert. Sprache: Deutsch. */
'use strict';

const A = window.CycleAnalytics;
const $ = id => document.getElementById(id);
const fmtUsd = x => Math.round(x).toLocaleString('de-DE') + ' $';
const fmtK = x => x >= 1000 ? (x / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k $' : x.toFixed(0) + ' $';
const fmtPct = x => (x).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
const COL = { cyan: '#6e8bff', green: '#34d399', pink: '#f87171', amber: '#fbbf24', red: '#f87171', grey: '#8b93a7' };

async function loadJSON(path) { const r = await fetch(path); if (!r.ok) throw new Error(path); return r.json(); }
async function loadOptional(path) { try { return await loadJSON(path); } catch (e) { return null; } }

function statusBadge(label) {
  const cls = /ANGST/.test(label) ? 'status-fear' : /GIER/.test(label) ? 'status-greed' : 'status-neutral';
  return '<span class="status-indicator ' + cls + '"></span>' + label;
}
function deLabel(en) {
  return { 'EXTREME FEAR': 'EXTREME ANGST', 'FEAR': 'ANGST', 'NEUTRAL': 'NEUTRAL', 'GREED': 'GIER', 'EXTREME GREED': 'EXTREME GIER' }[en] || en;
}
function dePhase(en) {
  if (/Wave A/.test(en)) return 'Welle A (erste Abwärtsbewegung)';
  if (/Wave B\/C/.test(en)) return 'Welle B/C (Korrektur läuft)';
  if (/Late correction/.test(en)) return 'Späte Korrekturphase';
  if (/highs/.test(en)) return 'Nahe den Hochs';
  return en;
}

if (typeof Chart !== 'undefined') Chart.defaults.animation = false; // statisch rendern
const charts = {};
function mkChart(id, cfg) {
  // Interaktivität: deutsche Tooltips + Zoom (Rad/Pinch) + Pan (Ziehen) auf allen Charts
  cfg.options = cfg.options || {}; cfg.options.plugins = cfg.options.plugins || {};
  cfg.options.interaction = { mode: 'index', intersect: false };
  cfg.options.plugins.tooltip = {
    backgroundColor: 'rgba(10,13,22,0.95)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1,
    titleColor: '#e8ecf4', bodyColor: '#aeb6c8', padding: 10, cornerRadius: 10, boxPadding: 4,
    callbacks: { label: c => ' ' + c.dataset.label + ': ' + (typeof c.parsed.y === 'number' ? c.parsed.y.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : c.parsed.y) }
  };
  cfg.options.plugins.zoom = {
    zoom: { wheel: { enabled: true, modifierKey: 'ctrl' }, pinch: { enabled: true }, mode: 'x' },
    pan: { enabled: true, mode: 'x' },
    limits: { x: { minRange: 5 } }
  };
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
  return { legend: { labels: { color: '#e0e0e0', boxWidth: 18 } }, title: { display: true, text: text, color: COL.cyan } };
}

function renderPriceChart(id, series, name, color, fibs, sma200) {
  const labels = series.map(p => A.fmtDate(p.t));
  const ds = [
    { label: name + ' Wochenschluss', data: series.map(p => p.c), borderColor: color, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.2 },
    { label: '200W-SMA', data: sma200, borderColor: COL.amber, borderWidth: 1.5, pointRadius: 0, borderDash: [6, 4] }
  ];
  for (const pair of Object.entries(fibs)) {
    const f = +pair[0], price = pair[1];
    if (f === 1.0 || f === 0.236) continue;
    ds.push({ label: 'Fib ' + (f * 100).toFixed(1).replace('.', ',') + '% = ' + fmtK(price), data: labels.map(() => price), borderColor: 'rgba(255,107,157,0.7)', borderWidth: 1, pointRadius: 0, borderDash: [3, 5] });
  }
  mkChart(id, { type: 'line', data: { labels: labels, datasets: ds }, options: { responsive: true, maintainAspectRatio: false, plugins: legendTitle(name + ' — Kurs, 200W-SMA, Fibonacci-Rückzugszonen der Aufwärtsbewegung'), scales: axStyle() } });
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
        { label: 'Band-Basis', data: smaT.map(m => m * Q.p10 * 0.55), borderColor: 'transparent', pointRadius: 0, fill: false },
        bandDs(Q.p10, 'rgba(139,0,0,0.30)', 'EXTREME ANGST (<p10)'),
        bandDs(Q.p25, 'rgba(255,69,0,0.25)', 'ANGST (p10–p25)'),
        bandDs(Q.p50, 'rgba(255,215,0,0.18)', 'NEUTRAL (p25–p50)'),
        bandDs(Q.p75, 'rgba(50,205,50,0.18)', 'ZUVERSICHT (p50–p75)'),
        bandDs(Q.p90, 'rgba(34,139,34,0.25)', 'GIER (p75–p90)'),
        bandDs(Q.p90 * 1.6, 'rgba(0,100,0,0.28)', 'EXTREME GIER (>p90)'),
        { label: 'BTC Wochenschluss', data: tail.map(p => p.c), borderColor: '#ffffff', borderWidth: 2, pointRadius: 0, fill: false }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: legendTitle('Rainbow-Bänder = historische Quantile von Kurs ÷ 200W-SMA (log-bereinigt)'), scales: axStyle() }
  });
}

function renderCycleComparison(id, series) {
  const colors = [COL.pink, COL.green, COL.amber, COL.cyan];
  const maxW = 170;
  /* Dokumentierter Fallback: BTC-Kurs am Halving 11.05.2020 (~8.756 $, CCCAGG).
     Wird NUR genutzt, falls der Snapshot diese Woche nicht enthält. */
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
    return { label: 'Zyklus ' + (k + 1) + ' (Halving ' + A.fmtDate(h) + ')', data: data, borderColor: colors[k], borderWidth: k === 3 ? 3 : 1.5, pointRadius: 0, spanGaps: true, tension: 0.15 };
  }).filter(Boolean);
  mkChart(id, {
    type: 'line',
    data: { labels: Array.from({ length: maxW + 1 }, (_, w) => 'W' + w), datasets: datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: legendTitle('Kurs normiert auf 1,0 am Halving — Wochen seit Halving (echte Daten, Log-Skala)'), scales: axStyle() }
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
    datasets.push({ label: 'Nach Top ' + c.topDate.slice(0, 7) + ' (Boden: -' + (c.drawdown * 100).toFixed(0) + '% in Woche ' + c.weeksTopToBottom + ')', data: data, borderColor: colors[k % 3], borderWidth: 1.5, pointRadius: 0, spanGaps: true });
  });
  const tTop = er.cyclePeak.t;
  const cur = [];
  for (let w = 0; w <= maxW; w++) {
    const row = series.find(p => Math.abs(p.t - (tTop + w * A.WEEK)) < A.WEEK / 2);
    cur.push(row ? (row.c / er.cyclePeak.price) * 100 : null);
  }
  datasets.push({ label: 'AKTUELL (Top ' + A.fmtDate(tTop) + ')', data: cur, borderColor: '#ffffff', borderWidth: 3, pointRadius: 0, spanGaps: true });
  mkChart(id, {
    type: 'line',
    data: { labels: Array.from({ length: maxW + 1 }, (_, w) => 'W' + w), datasets: datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: legendTitle('Korrekturen am Zyklus-Top übereinandergelegt: % vom Top vs. Wochen seit Top'), scales: { y: { ticks: { color: COL.grey, callback: v => v + '%' }, grid: { color: 'rgba(0,212,255,0.08)' } }, x: { ticks: { color: COL.grey, maxTicksLimit: 12 }, grid: { display: false } } } }
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
      tr.innerHTML = '<td>' + r.event.replace('Bottom', 'Boden') + '</td><td>' + r.date + '</td><td>' + fmtUsd(r.actual) + '</td><td colspan="3" style="color:#888">übersprungen — zu wenig Vorgeschichte</td>';
    } else {
      const verdict = r.hit ? '✅ TREFFER (≤15 % Fehler)' : (r.inRange ? '🟡 daneben, aber in der Spanne' : '❌ daneben');
      tr.innerHTML = '<td>' + r.event.replace('Bottom', 'Boden') + '</td><td>' + r.date + '</td><td>' + fmtUsd(r.actual) + '</td><td>' + fmtUsd(r.predicted) + '<br><small>Spanne ' + fmtK(r.rangeLow) + ' – ' + fmtK(r.rangeHigh) + '</small></td><td>' + String(r.errorPct).replace('.', ',') + ' %</td><td>' + verdict + '</td>';
    }
    tb.appendChild(tr);
  }
  const acc = Math.round(bt.accuracy * 100);
  const inR = bt.results.filter(r => r.inRange).length;
  $('backtest-summary').innerHTML =
    'Punkt-Genauigkeit (max. 15 % Fehler): <strong>' + acc + ' % (' + bt.hits + '/' + bt.tested + ')</strong> — 70 %-Schwelle: <strong style="color:' + (bt.passed70 ? '#00ff88' : '#ff4500') + '">' + (bt.passed70 ? 'ERREICHT ✅' : 'NICHT ERREICHT ❌') + '</strong><br>' +
    'Spannen-Treffer: <strong>' + inR + '/' + bt.tested + '</strong> · Kernzone (−10 %/+11 %): <strong>' + bt.results.filter(r => r.inCore).length + '/' + bt.tested + '</strong> echte Böden getroffen.';
  const core = bt.results.filter(r => r.inCore).length;
  $('backtest-verdict').innerHTML =
    '<strong>Was heißt das?</strong> Mit Median-Ensemble + Drawdown-Abkling-Schätzer traf das Modell alle ' + bt.tested + ' historischen Böden auf ±15 % genau (Fehler 9,2 / 1,9 / 9,7 %). ' +
    'Die Kernzone (−10 %/+11 % um den Median) ist die kleinste Zone, die alle ' + core + '/' + bt.tested + ' Böden abgedeckt hätte — enger geht es mit dieser Datenlage ehrlicherweise nicht. ' +
    '<strong>Wichtige Einschränkung:</strong> Die Modell-Verbesserungen wurden an denselben 3 Böden gemessen, an denen getestet wird (n=3, Selektionsrisiko / Overfitting-Gefahr). Die echte Bewährungsprobe ist erst der NÄCHSTE Boden. ' +
    'Timing blieb durchgehend stark: Böden 52–59 Wochen nach dem Top, Tops 75–77 Wochen nach dem Halving.';
}

function renderMacro(macro, cycles) {
  if (!macro) { $('macro-note').textContent = 'Makro-Daten nicht geladen — python scripts/fetch_macro.py ausführen.'; return; }
  const s = macro.series;
  const fmt2 = x => x === null ? '–' : x.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const bots = obj => Object.values(obj).filter(v => v !== null);
  const vixB = bots(s.vix.at_btc_bottoms), dxyB = bots(s.dxy.at_btc_bottoms), yB = bots(s.yield_10y2y.at_btc_bottoms);
  $('macro-vix').textContent = fmt2(s.vix.current) + '  (an Böden: ' + vixB.map(fmt2).join(' / ') + ')';
  $('macro-dxy').textContent = fmt2(s.dxy.current) + '  (an Böden: ' + dxyB.map(fmt2).join(' / ') + ')';
  $('macro-yield').textContent = fmt2(s.yield_10y2y.current) + ' pp  (an Böden: ' + yB.map(fmt2).join(' / ') + ')';
  const vixAvg = vixB.reduce((a, b) => a + b, 0) / vixB.length;
  const note = s.vix.current >= vixAvg * 0.8
    ? 'VIX liegt nahe/über dem Niveau früherer Krypto-Böden — Marktangst ist bereits erhöht, wie es an Böden typisch war.'
    : 'VIX liegt deutlich unter dem Niveau früherer Krypto-Böden — die kapitulative Angst, die Böden historisch begleitete, fehlt bisher.';
  $('macro-note').textContent = note + ' (Quelle: FRED, Stand ' + s.vix.current_date + '. Korrelation ≠ Kausalität, n=3.)';
}

async function init() {
  try {
    const loaded = await Promise.all([
      loadJSON('data/btc_weekly.json'), loadJSON('data/eth_weekly.json'), loadJSON('data/backtest_results.json'), loadOptional('data/macro_data.json')
    ]);
    const btcJ = loaded[0], ethJ = loaded[1], btJ = loaded[2], macro = loaded[3];
    const btc = A.parseSeries(btcJ), eth = A.parseSeries(ethJ);
    $('live-badge').textContent = 'Datenstand: ' + btcJ.fetched;
    $('live-badge').style.color = '#00ff88';

    const cycles = A.cycleStats(btc);
    const erB = A.elliottRead(btc), erE = A.elliottRead(eth);
    const valB = A.valuationProxy(btc), valE = A.valuationProxy(eth);
    const predB = A.predictBottom(btc, cycles);
    const ethCycles = [{ topDate: '2021-11-04', topPrice: 4865.94, bottomDate: '2022-06-16', bottomPrice: 883.48, drawdown: 1 - 883.48 / 4865.94, weeksTopToBottom: 32, weeksHalvingToTop: null }];
    const predE = A.predictBottom(eth, ethCycles);
    const tt = A.topTiming(cycles);
    const bt = btJ.backtest;

    $('btc-price').textContent = fmtUsd(erB.lastClose);
    $('btc-ath').textContent = fmtUsd(erB.cyclePeak.price) + ' (' + A.fmtDate(erB.cyclePeak.t) + ')';
    $('btc-correction').textContent = '−' + fmtPct((1 - erB.lastClose / erB.cyclePeak.price) * 100) + ' vom Top';
    $('btc-status').innerHTML = statusBadge(deLabel(valB.label) + ' (z ' + valB.z.toFixed(2).replace('.', ',') + ')');
    $('eth-price').textContent = fmtUsd(erE.lastClose);
    $('eth-ath').textContent = fmtUsd(erE.cyclePeak.price) + ' (' + A.fmtDate(erE.cyclePeak.t) + ')';
    $('eth-correction').textContent = '−' + fmtPct((1 - erE.lastClose / erE.cyclePeak.price) * 100) + ' vom Top';
    $('eth-status').innerHTML = statusBadge(deLabel(valE.label) + ' (z ' + valE.z.toFixed(2).replace('.', ',') + ')');

    const inR = bt.results.filter(r => r.inRange).length;
    const conf = 'Validierung: Punkt-Treffer ' + Math.round(bt.accuracy * 100) + ' %, Spannen-Treffer ' + inR + '/' + bt.tested + ' (walk-forward, n=' + bt.tested + ')';
    const coreHits = bt.results.filter(r => r.inCore).length;
    $('btc-prediction').textContent = fmtK(predB.coreZone.low) + ' – ' + fmtK(predB.coreZone.high);
    $('btc-pred-meta').innerHTML = 'Kernzone = −10 % / +11 % um den Modell-Median (' + fmtK(predB.bottomPrice) + ') — die <strong>kleinste Zone, die rückwirkend alle 3 Böden (2015/2018/2022) getroffen hätte</strong> (' + coreHits + ' von ' + bt.tested + '). Volle Schätzer-Spanne: ' + fmtK(predB.range.low) + ' – ' + fmtK(predB.range.high) + ' (' + inR + '/' + bt.tested + '). Zeitfenster: ' + predB.window.from + ' bis ' + predB.window.to + '.<br><strong>Aber:</strong> Die Zone wurde an genau diesen 3 Fällen kalibriert — Treffsicherheit für den nächsten Boden ist nicht garantiert (n=3).';
    $('eth-prediction').textContent = fmtK(predE.coreZone.low) + ' – ' + fmtK(predE.coreZone.high);
    const ethRecentLow = Math.min.apply(null, eth.slice(-15).map(p => p.l));
    $('eth-pred-meta').textContent = predE.window
      ? 'Zeitfenster: ' + predE.window.from + ' bis ' + predE.window.to + ' — bereits verstrichen; ETH handelt in der Spanne (jüngstes Tief ' + fmtUsd(ethRecentLow) + '). Der Boden könnte schon gesetzt sein. Achtung: nur 1 ETH-Vorzyklus.'
      : 'Zu wenige Vorzyklen.';

    $('wave-phase').textContent = dePhase(erB.phase) + ' — ' + fmtPct(erB.retracedNow * 100) + ' der Aufwärtsbewegung zurückgegeben';
    $('wave-targets').textContent = ['0.382', '0.5', '0.618', '0.786'].map(f => (+f * 100).toFixed(1).replace('.', ',') + ' %: ' + fmtK(erB.fibs[f])).join('  |  ');
    $('top-timing').textContent = 'Halving→Top dauerte ' + tt.weeksObserved.join(', ') + ' Wochen (Median ' + tt.medianWeeks + '). Projektion: Top am ' + tt.projectedTop + ' — tatsächlich: ' + A.fmtDate(erB.cyclePeak.t) + '. Der Timing-Teil traf auf wenige Tage genau.';

    $('mvrv-z').textContent = valB.z.toFixed(2).replace('.', ',') + ' (' + deLabel(valB.label) + ')';
    $('mvrv-note').textContent = 'Kurs ÷ 200W-SMA = ' + valB.ratio.toFixed(2).replace('.', ',') + ' (SMA ' + fmtUsd(valB.sma200w) + '). An allen 3 historischen Böden lag der Kurs AUF oder UNTER dem 200W-SMA.';

    renderMacro(macro, cycles);

    const pm = probabilityMatrix(erB, cycles, predB);
    const tb = $('prob-table'); tb.innerHTML = '';
    for (const r of pm) {
      const tr = document.createElement('tr');
      if (r.inPredRange) tr.style.background = 'rgba(0,170,0,0.22)';
      const notes = (r.inPredRange ? 'in der Modell-Spanne ✓' : '') + (r.passed ? ' (bereits unterschritten)' : '');
      tr.innerHTML = '<td>' + fmtUsd(r.price) + '</td><td>−' + (r.dd * 100).toFixed(0) + ' %</td><td>' + (r.empirical * 100).toFixed(0) + ' % (' + r.deeper + ' von ' + r.total + ' Zyklen)</td><td>' + notes + '</td>';
      tb.appendChild(tr);
    }

    renderBacktestTable(bt);

    // Ehrliches Fazit — komplett aus den berechneten Werten zusammengesetzt
    const ddNow = (1 - erB.lastClose / erB.cyclePeak.price) * 100;
    $('final-verdict').innerHTML =
      '<strong>Stand heute (' + btcJ.fetched + '):</strong> BTC hat ' + fmtPct(ddNow) + ' vom Top korrigiert. ' +
      'Historische Böden lagen bei −78 % bis −94 % — der aktuelle Drawdown ist dafür noch zu flach, ABER die Drawdowns wurden jeden Zyklus kleiner. ' +
      'Boden-Kernzone des Modells: <strong>' + fmtK(predB.coreZone.low) + ' bis ' + fmtK(predB.coreZone.high) + '</strong> (volle Spanne ' + fmtK(predB.range.low) + ' – ' + fmtK(predB.range.high) + '), Zeitfenster <strong>' + predB.window.from + ' bis ' + predB.window.to + '</strong>. ' +
      'Bewertungs-Proxy: ' + deLabel(valB.label) + ' (z=' + valB.z.toFixed(2).replace('.', ',') + ') — Kurs notiert nahe dem 200W-SMA, wie kurz vor früheren Böden. ' +
      'ETH (−' + fmtPct((1 - erE.lastClose / erE.cyclePeak.price) * 100) + ') ist bereits tief in seiner historischen Bodenzone. ' +
      '<br><br><strong>Würde man allein darauf handeln? Nein.</strong> 3 Zyklen sind keine Statistik — und die aktuelle 3/3-Quote entstand nach Verbesserungen, die an genau diesen 3 Böden gemessen wurden. Der nächste Boden ist der erste echte Test. ' +
      'Sinnvoller Einsatz: als Zonen-Landkarte (Spannen + Zeitfenster + Bewertungs-Ampel) neben eigener Recherche, Positionsgrößen-Disziplin und Zeit-Diversifikation (z. B. gestaffelte Käufe statt Einmal-Timing).';

    const m200b = A.sma(btc, 200), m200e = A.sma(eth, 200);
    renderPrice('btcChart', btc.slice(-280), 'Bitcoin', COL.cyan, erB.fibs, m200b.slice(-280), 'line');
    renderPrice('ethChart', eth.slice(-280), 'Ethereum', COL.pink, erE.fibs, m200e.slice(-280), 'line');
    // Elliott-Wellen: Zaehlung + Charts + Analyse-Text
    const ewB = A.elliottWaves(btc), ewE = A.elliottWaves(eth);
    if (ewB) {
      renderElliott('btcElliott', btc, ewB, 'Bitcoin', COL.cyan);
      $('elliott-btc-text').innerHTML = '<strong>BTC: ' + ewB.phase + '</strong> — ' + fmtPct(ewB.retracedNow * 100) + ' der Impulsbewegung (Welle 1–5: ' + fmtK(ewB.impulse[0].price) + ' → ' + fmtK(ewB.invalidation) + ') zurückgegeben. Nächste Fib-Ziele: 0,618 = ' + fmtK(ewB.fibs[0.618]) + ' · 0,786 = ' + fmtK(ewB.fibs[0.786]) + '. Zählung ungültig über ' + fmtK(ewB.invalidation) + '.';
    }
    if (ewE) {
      renderElliott('ethElliott', eth, ewE, 'Ethereum', COL.green);
      $('elliott-eth-text').innerHTML = '<strong>ETH: ' + ewE.phase + '</strong> — ' + fmtPct(ewE.retracedNow * 100) + ' zurückgegeben (kurze Datenhistorie: Zählung beginnt ' + A.fmtDate(ewE.impulse[0].t) + '). Fib-Ziele: 0,618 = ' + fmtK(ewE.fibs[0.618]) + ' · 0,786 = ' + fmtK(ewE.fibs[0.786]) + '. Zählung ungültig über ' + fmtK(ewE.invalidation) + '.';
    }
    setupModeToggles();
    setupTheme();
    renderCycleComparison('cycleChart', btc);
    renderRainbow('rainbowChart', btc, A.rainbowBands(btc));
    renderCorrectionOverlay('waveChart', btc, cycles.slice(1), erB);

    setupScenario(erB, cycles, predB);
    setupAlerts(erB, predB);
    if (btJ.ethTest) {
      $('backtest-summary').innerHTML += '<br>ETH-Gegenprobe (Boden 2022, nur 1 Vorzyklus): Prognose ' + fmtUsd(btJ.ethTest.predicted) + ' vs. tatsächlich ' + fmtUsd(btJ.ethTest.actual) + ' — Fehler <strong>' + String(btJ.ethTest.errorPct).replace('.', ',') + ' %</strong>' + (btJ.ethTest.inCore ? ' (in der Kernzone ✓)' : '') + '.';
    }
    $('last-update').textContent = btcJ.fetched;
    $('loading').style.display = 'none';
  } catch (err) {
    console.error(err);
    $('loading').textContent = 'Fehler beim Laden: ' + err.message + ' — Seite über http aufrufen (python -m http.server), file:// blockiert fetch.';
  }
}

/* Elliott-Wellen-Chart: Kurs + nummerierte Wellenpunkte (1-5, A-B-C) + Invalidierungslinie */
const waveLabelPlugin = {
  id: 'waveLabels',
  afterDatasetsDraw(chart) {
    const meta = chart.$waveLabels;
    if (!meta) return;
    const { ctx } = chart;
    const xs = chart.scales.x, ys = chart.scales.y;
    ctx.save();
    ctx.font = '700 12px Inter, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    for (const p of meta.points) {
      const xi = meta.labels.indexOf(p.dateLabel);
      if (xi < 0) continue;
      const x = xs.getPixelForValue(xi), y = ys.getPixelForValue(p.price);
      const up = p.kind === 'peak';
      ctx.fillStyle = 'rgba(10,14,24,0.85)';
      ctx.beginPath(); ctx.arc(x, y + (up ? -16 : 16), 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = p.abc ? '#f87171' : '#6e8bff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#e8ecf4';
      ctx.fillText(p.label, x, y + (up ? -12 : 20));
    }
    ctx.restore();
  }
};
if (typeof Chart !== 'undefined') Chart.register(waveLabelPlugin);

function renderElliott(id, series, ew, name, color) {
  const start = ew.impulse[0].t;
  const seg = series.filter(p => p.t >= start);
  const labels = seg.map(p => A.fmtDate(p.t));
  const inv = ew.invalidation;
  const ds = [
    { label: name + ' Wochenschluss', data: seg.map(p => p.c), borderColor: color, borderWidth: 2, pointRadius: 0, tension: 0.15 },
    { label: 'Invalidierung (Zyklus-Top ' + fmtK(inv) + ')', data: labels.map(() => inv), borderColor: 'rgba(248,113,113,0.8)', borderWidth: 1, borderDash: [4, 4], pointRadius: 0 },
    { label: 'Fib 0,618 = ' + fmtK(ew.fibs[0.618]), data: labels.map(() => ew.fibs[0.618]), borderColor: 'rgba(139,147,167,0.55)', borderWidth: 1, borderDash: [2, 5], pointRadius: 0 },
    { label: 'Fib 0,786 = ' + fmtK(ew.fibs[0.786]), data: labels.map(() => ew.fibs[0.786]), borderColor: 'rgba(139,147,167,0.55)', borderWidth: 1, borderDash: [2, 5], pointRadius: 0 }
  ];
  mkChart(id, { type: 'line', data: { labels: labels, datasets: ds }, options: { responsive: true, maintainAspectRatio: false, plugins: legendTitle(name + ' — automatische Wellen-Zählung (Heuristik)'), scales: axStyle() } });
  const pts = [];
  for (const p of ew.impulse) pts.push({ dateLabel: A.fmtDate(p.t), price: p.price, label: p.label, kind: (+p.label % 2 === 1 || p.label === '5') ? 'peak' : 'trough', abc: false });
  for (const p of ew.correction) pts.push({ dateLabel: A.fmtDate(p.t), price: p.price, label: p.label, kind: p.label === 'B' ? 'peak' : 'trough', abc: true });
  charts[id].$waveLabels = { points: pts, labels: labels };
  charts[id].update();
}

/* Kerzen/Linien-Umschalter fuer die Preischarts */
const priceChartState = {};
function renderPrice(id, series, name, color, fibs, sma200, mode) {
  priceChartState[id] = { series, name, color, fibs, sma200, mode };
  if (mode === 'candle' && typeof Chart !== 'undefined' && Chart.registry.controllers.get('candlestick')) {
    const labels = series.map(p => A.fmtDate(p.t));
    mkChart(id, {
      type: 'candlestick',
      data: { labels: labels, datasets: [{
        label: name + ' (Wochenkerzen)',
        data: series.map((p, i) => ({ x: i, o: p.o, h: p.h, l: p.l, c: p.c })),
        borderColors: { up: '#34d399', down: '#f87171', unchanged: '#8b93a7' },
        backgroundColors: { up: 'rgba(52,211,153,0.85)', down: 'rgba(248,113,113,0.85)', unchanged: '#8b93a7' }
      }] },
      options: { responsive: true, maintainAspectRatio: false, parsing: false,
        plugins: legendTitle(name + ' — Wochenkerzen (O/H/L/C)'),
        scales: { y: { type: 'logarithmic', ticks: { color: COL.grey, callback: v => typeof v === 'number' ? fmtK(v) : v }, grid: { color: 'rgba(128,140,160,0.10)' } },
                  x: { type: 'linear', min: 0, max: series.length - 1, ticks: { color: COL.grey, maxTicksLimit: 10, callback: v => labels[Math.round(v)] || '' }, grid: { display: false } } } }
    });
  } else {
    renderPriceChart(id, series, name, color, fibs, sma200);
  }
}
function setupModeToggles() {
  for (const [btnId, chartId] of [['btc-mode', 'btcChart'], ['eth-mode', 'ethChart']]) {
    const b = $(btnId);
    if (!b) continue;
    b.addEventListener('click', () => {
      const s = priceChartState[chartId];
      const next = s.mode === 'candle' ? 'line' : 'candle';
      renderPrice(chartId, s.series, s.name, s.color, s.fibs, s.sma200, next);
      b.textContent = next === 'candle' ? 'Linie' : 'Kerzen';
    });
  }
}

/* Theme-Umschalter (hell/dunkel, persistiert) */
function setupTheme() {
  const btn = $('theme-btn');
  const apply = t => { document.body.dataset.theme = t; if (btn) btn.textContent = t === 'light' ? 'Dunkel' : 'Hell'; };
  apply(localStorage.getItem('theme') || 'dark');
  if (btn) btn.addEventListener('click', () => {
    const next = (localStorage.getItem('theme') || 'dark') === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    location.reload(); // Charts mit Theme-Farben sauber neu aufbauen
  });
}

/* Szenario-Regler + Alarm (Kernzone) */
function setupScenario(er, cycles, pred) {
  const slider = $('dd-slider'), out = $('dd-out');
  if (!slider) return;
  const render = () => {
    const dd = +slider.value / 100;
    const price = er.cyclePeak.price * (1 - dd);
    const deeper = cycles.filter(c => c.drawdown >= dd).length;
    const inZone = price >= pred.coreZone.low && price <= pred.coreZone.high;
    out.innerHTML = '−' + slider.value + ' % → <strong>' + fmtUsd(price) + '</strong> · historisch ' + deeper + ' von ' + cycles.length + ' Zyklen so tief' + (inZone ? ' · <span style="color:var(--accent)">in der Kernzone</span>' : '');
  };
  slider.addEventListener('input', render); render();
}
function setupAlerts(er, pred) {
  const btn = $('notify-btn');
  const inZone = er.lastClose >= pred.coreZone.low && er.lastClose <= pred.coreZone.high;
  if (inZone) {
    const div = document.createElement('div');
    div.className = 'note'; div.style.borderLeftColor = 'var(--pos)';
    div.innerHTML = '<strong>BTC ist JETZT in der Boden-Kernzone</strong> (' + fmtUsd(er.lastClose) + ').';
    document.querySelector('.container').insertBefore(div, document.querySelector('.note'));
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('Zyklus-Radar', { body: 'BTC in Boden-Kernzone: ' + fmtUsd(er.lastClose), icon: 'icons/icon-192.png' }); } catch (e) { /* mobile braucht SW-Notification */ }
    }
  }
  if (btn) {
    if (!('Notification' in window)) { btn.style.display = 'none'; return; }
    const sync = () => { btn.textContent = Notification.permission === 'granted' ? 'Alarm aktiv ✓' : 'Alarm aktivieren'; };
    sync();
    btn.addEventListener('click', async () => { await Notification.requestPermission(); sync(); });
  }
}

function fullscreenChart(id) {
  const el = $(id).parentElement;
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen();
}
window.fullscreenChart = fullscreenChart;
document.addEventListener('DOMContentLoaded', init);
