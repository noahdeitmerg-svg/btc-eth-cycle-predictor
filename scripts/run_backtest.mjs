#!/usr/bin/env node
// Walk-forward backtest against historical BTC cycle bottoms + current prediction.
// Writes public/data/backtest_results.json. Reports REAL numbers, pass or fail.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const A = require(join(__dirname, '../public/src/analytics.js'));

const btc = A.parseSeries(JSON.parse(readFileSync(join(__dirname, '../public/data/btc_weekly.json'))));
const eth = A.parseSeries(JSON.parse(readFileSync(join(__dirname, '../public/data/eth_weekly.json'))));

// ---- backtest (BTC) ----
const bt = A.backtest(btc);
console.log('='.repeat(64));
console.log('WALK-FORWARD BACKTEST — BTC cycle bottoms');
console.log('='.repeat(64));
for (const r of bt.results) {
  if (r.skipped) { console.log(`-- ${r.event} (${r.date}): skipped — ${r.skipped}`); continue; }
  console.log(`${r.hit ? 'HIT ' : 'MISS'} ${r.event} ${r.date} | actual $${r.actual} | predicted $${r.predicted} (range ${r.rangeLow}-${r.rangeHigh}) | err ${r.errorPct}% | ${r.basis}`);
}
console.log(`accuracy: ${(bt.accuracy * 100).toFixed(0)}% (${bt.hits}/${bt.tested}) | 70% threshold: ${bt.passed70 ? 'MET' : 'NOT MET'}`);
console.log(`caveat: ${bt.caveat}`);

// ---- current predictions ----
const cycles = A.cycleStats(btc);
const predBtc = A.predictBottom(btc, cycles);
const valBtc = A.valuationProxy(btc);
const erBtc = A.elliottRead(btc);
const tt = A.topTiming(cycles);

const erEth = A.elliottRead(eth);
const ethCycles = [{ topDate: '2021-11-04', topPrice: 4865.94, bottomDate: '2022-06-16', bottomPrice: 883.48, drawdown: 1 - 883.48 / 4865.94, weeksTopToBottom: 32, weeksHalvingToTop: null }];
const predEth = A.predictBottom(eth, ethCycles);
const valEth = A.valuationProxy(eth);

console.log('\nCURRENT BTC:', JSON.stringify({ last: erBtc.lastClose, peak: erBtc.cyclePeak.price, retraced: +(erBtc.retracedNow * 100).toFixed(1), pred: predBtc, valuationProxy: valBtc && { z: +valBtc.z.toFixed(2), label: valBtc.label, sma200w: Math.round(valBtc.sma200w) } }, null, 1));
console.log('\nCURRENT ETH:', JSON.stringify({ last: erEth.lastClose, peak: erEth.cyclePeak.price, retraced: +(erEth.retracedNow * 100).toFixed(1), pred: predEth, valuationProxy: valEth && { z: +valEth.z.toFixed(2), label: valEth.label } }, null, 1));
console.log('\nTOP TIMING PATTERN:', JSON.stringify(tt));

// ---- ETH-Gegenprobe: Walk-forward auf den ETH-Boden 2022-06-16 ----
// Vorzyklus 2018 aus dokumentierten Werten (CCCAGG: Top 2018-01-13 ~1.432 USD, Boden 2018-12-15 ~83 USD),
// da die gebuendelte ETH-Reihe erst 2020-12 beginnt.
const ETH_2018_CYCLE = { topDate: '2018-01-13', topPrice: 1432, bottomDate: '2018-12-15', bottomPrice: 83, drawdown: 1 - 83 / 1432, weeksTopToBottom: 48, weeksHalvingToTop: null };
const ethBottom2022 = { date: '2022-06-16', price: 883.48 };
const tEthB = Date.parse(ethBottom2022.date) / 1000;
const ethTrunc = eth.filter(r => r.t <= tEthB - 8 * 7 * 86400);
const ethPredWF = A.predictBottom(ethTrunc, [ETH_2018_CYCLE]);
let ethTest = null;
if (ethPredWF) {
  const errE = Math.abs(ethPredWF.bottomPrice - ethBottom2022.price) / ethBottom2022.price;
  ethTest = { date: ethBottom2022.date, actual: ethBottom2022.price, predicted: Math.round(ethPredWF.bottomPrice * 100) / 100,
    errorPct: Math.round(errE * 1000) / 10, inCore: ethBottom2022.price >= ethPredWF.coreZone.low && ethBottom2022.price <= ethPredWF.coreZone.high };
  console.log('\nETH-TEST (walk-forward, Boden 2022):', JSON.stringify(ethTest));
}

writeFileSync(join(__dirname, '../public/data/backtest_results.json'), JSON.stringify({
  ethTest,
  generated: new Date().toISOString(),
  backtest: bt,
  cycles,
  current: {
    btc: { prediction: predBtc, valuationProxy: valBtc, elliott: { peak: erBtc.cyclePeak, low: erBtc.cycleLow, retracedNow: erBtc.retracedNow, phase: erBtc.phase, fibs: erBtc.fibs } },
    eth: { prediction: predEth, valuationProxy: valEth, elliott: { peak: erEth.cyclePeak, low: erEth.cycleLow, retracedNow: erEth.retracedNow, phase: erEth.phase, fibs: erEth.fibs } },
    topTiming: tt
  }
}, null, 1));
console.log('\nsaved -> public/data/backtest_results.json');
