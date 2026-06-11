/* Sprach-Umschalter DE/EN (Beta).
 * Übersetzt die statischen UI-Texte per Exakt-Map über Textknoten.
 * Dynamische Analysetexte (live berechnet) bleiben deutsch — Zahlen sind universell. */
'use strict';
(function () {
  const MAP = {
    'Datenlage:': 'Data basis:',
    'So liest du das:': 'How to read this:',
    'Status zeigt, wie tief die Korrektur ist und ob die Bewertung historisch billig/teuer ist.': 'Status shows how deep the correction is and whether valuation is historically cheap or expensive.',
    'Die Kernzone ist die kleinstmögliche Zone, die rückwirkend alle Böden abgedeckt hätte — kein exakter Preis.': 'The core zone is the smallest zone that would have covered all past bottoms — not an exact price.',
    'Backtest und Charts zeigen ungeschönt, wie das Modell historisch abgeschnitten hat.': 'Backtest and charts show, unvarnished, how the model performed historically.',
    'Bitcoin existiert seit 2009 — es gibt exakt 3 abgeschlossene Zyklen. Alle Aussagen beruhen auf diesen 3 plus Live-Daten; die Kernzone hätte alle 3 getroffen und wurde an ihnen kalibriert. Keine Finanzberatung.': 'Bitcoin has existed since 2009 — there are exactly 3 completed cycles. Everything here is based on those 3 plus live data; the core zone would have caught all 3 and was calibrated on them. Not financial advice.',
    'Status': 'Status', 'Validierung': 'Validation', 'Chart': 'Chart', 'Muster': 'Pattern', 'Einordnung': 'Context', 'Struktur': 'Structure', 'Bewertung': 'Valuation', 'Makro': 'Macro', 'Empirie': 'Empirics', 'Fazit': 'Verdict', 'Beobachtung': 'Observation', 'Elliott-Wellen': 'Elliott Waves',
    'Boden-Kernzone · Bitcoin': 'Bottom core zone · Bitcoin', 'Boden-Kernzone · Ethereum': 'Bottom core zone · Ethereum', 'Szenario-Rechner': 'Scenario calculator',
    'Aktueller Kurs': 'Current price', 'Zyklus-Hoch': 'Cycle high', 'Korrektur': 'Correction', 'Bewertung (Proxy)': 'Valuation (proxy)',
    'Backtest — walk-forward, echte Zahlen': 'Backtest — walk-forward, real numbers',
    'Wellen-Zählung & aktuelle Analyse': 'Wave count & current analysis',
    'Bitcoin — Kurs, Fibonacci, 200W-SMA': 'Bitcoin — price, Fibonacci, 200W SMA',
    'Ethereum — Kurs, Fibonacci, 200W-SMA': 'Ethereum — price, Fibonacci, 200W SMA',
    'Solana — nur zur Einordnung': 'Solana — for context only',
    '4-Jahres-Halving-Zyklen im Vergleich': '4-year halving cycles compared',
    'Rainbow — Angst/Gier-Bänder': 'Rainbow — fear/greed bands',
    'Korrektur-Verlauf & Fibonacci': 'Correction overlay & Fibonacci',
    'Bitcoin — MVRV-Proxy': 'Bitcoin — MVRV proxy', 'Umfeld (FRED, live)': 'Environment (FRED, live)',
    'Boden-Wahrscheinlichkeits-Matrix (Bitcoin)': 'Bottom probability matrix (Bitcoin)',
    'Ehrliche Einordnung': 'Honest verdict',
    'Boden': 'Bottom', 'Datum': 'Date', 'Tatsächlich': 'Actual', 'Prognose (8 Wo. vorher)': 'Forecast (8 wks prior)', 'Fehler': 'Error', 'Ergebnis': 'Result',
    'Kurs-Level': 'Price level', 'Drawdown': 'Drawdown', 'Anteil früherer Zyklen': 'Share of past cycles',
    'Aktuelle Phase': 'Current phase', 'Fibonacci-Zielzonen': 'Fibonacci targets', 'Top-Timing': 'Top timing',
    'Z-Score': 'Z-score', 'VIX': 'VIX', 'Dollar-Index': 'Dollar index', 'Zinskurve 10J−2J': 'Yield curve 10y−2y',
    '52-Wochen-Hoch / -Tief': '52-week high / low', 'Abstand vom 52W-Hoch': 'Distance from 52w high',
    'Vollbild': 'Fullscreen', 'Kerzen': 'Candles', 'Linie': 'Line', 'Hell': 'Light', 'Dunkel': 'Dark', 'Alarm aktivieren': 'Enable alerts', 'Alarm aktiv ✓': 'Alerts on ✓',
    'Keine Finanzberatung · n=3-Backtest · ehrliche Zahlen statt beeindruckender Zahlen': 'Not financial advice · n=3 backtest · honest numbers over impressive numbers'
  };
  function applyLang() {
    if ((localStorage.getItem('lang') || 'de') !== 'en') return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const t = n.textContent.trim();
      if (MAP[t]) n.textContent = n.textContent.replace(t, MAP[t]);
    }
  }
  window.applyLang = applyLang;
  document.addEventListener('DOMContentLoaded', () => {
    applyLang();
    const btn = document.getElementById('lang-btn');
    if (!btn) return;
    const cur = localStorage.getItem('lang') || 'de';
    btn.textContent = cur === 'en' ? 'DE' : 'EN (Beta)';
    btn.addEventListener('click', () => {
      localStorage.setItem('lang', cur === 'en' ? 'de' : 'en');
      location.reload();
    });
  });
})();
