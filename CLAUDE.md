# Glitch-Simulator – Projektkontext für Claude Code

## Zweck
Monte-Carlo-Simulation von Prop-Firm-Accounts (Futures und CFD). Verglichen werden zwei Varianten auf **identischen Zufallskursen**:
1. **Ohne Gegentrade**: Fee zahlen, Challenge traden, im Funded Account Auszahlungen holen.
2. **Mit Gegentrade („Glitch“ / „Insurance“)**: zusätzlich eine kleine Gegenposition auf einem privaten Echtgeld-Konto, **nur bis die Challenge bestanden ist** (bei Instant Funding bis zur ersten Auszahlung). So beschreibt es der YouTube-Kanal BWAVE TRADING.

Kernaussage, die das Modell zeigen soll: Der Gegentrade verschiebt nur, *wann* die Fee bezahlt wird (Refinanzierung bei verlorenen Challenges, Kosten bei bestandenen). Der Erwartungswert kommt aus **Fee vs. Payout-Wert** und dem eigenen Trading-Edge, nicht aus dem Hedge.

Hinweis: Gegenpositionen über Konten verbieten alle simulierten Firmen. Das Projekt ist ein Analysewerkzeug, kein Werkzeug zur Umsetzung des Hedges.

## Struktur
```
index.html        Markup (Deutsch), lädt die drei Skripte als klassische <script>-Tags (kein Build, kein Bundler)
css/style.css     Design-Tokens (hell/dunkel) + Layout
js/sim.js         Simulationskern, DOM-frei. Browser: window.GlitchSim, Node: module.exports
js/offers.js      Daten: PRESETS (Szenario-Buttons) und OFFERS (alle Challenge-Angebote)
js/app.js         Oberfläche: Regler + Zahlenfelder, Angebotsauswahl, Kennzahlen, SVG-Chart, Tabellen
test/sim.test.js  Tests für den Kern (node, ohne Abhängigkeiten)
```

## Befehle
- Tests: `npm test` oder `node test/sim.test.js`
- Starten: `index.html` direkt im Browser öffnen, oder `npm start` (python3 http.server auf Port 8000) und `http://localhost:8000` öffnen
- Nach jeder Änderung an `js/sim.js` oder `js/offers.js`: Tests laufen lassen

## Modell (js/sim.js → simulate(P, seed))
- **Trade**: Gewinn `risk*rr` mit Wahrscheinlichkeit `p` (= wr/100), sonst Verlust `risk`; danach minus `cost`.
- **Challenge**: Phase 1 bis `target`, optional Phase 2 bis `target2` (> 0 = 2-Step). Jede Phase startet bei 0.
- **Drawdown**: trailing (`floor = min(peak - dd, 0)`, also Lock beim Startkapital) oder statisch (`ddStatic`: `floor = -dd`). Geprüft wird pro Trade (≈ intraday auf geschlossenen Trades).
- **Funded**: Auszahlung, sobald Gewinn ≥ `buf + minp`. Betrag = `min(cap, (Gewinn - buf) * wf)`, ausgezahlt wird `Betrag * sp` (Split). Max. `maxp` Auszahlungen, danach endet der Account (Review/Live).
- **Gegentrade**: pro Trade `-h * Brutto - h * cost` aufs Echtgeld-Konto. Aktiv in der Absicherungsphase (Challenge, bei Instant bis 1. Auszahlung) oder immer, wenn `hfund = true`.
- **Ausgaben**: netNo, netHe, real (Echtgeld-Saldo), realMin (größter Rückgang = benötigtes Echtgeld), hFail/nFail und hSucc/nSucc (Refinanzierung vs. Kosten), cum*-Reihen für den Chart, die ersten 12 Accounts für die Detailtabelle.
- `MAXT = 500` Trades pro Phase als Notbremse.
- Seed: `mulberry32`, Standard 20261015, „Neu würfeln“ ändert ihn.

## Bekannte Lücken (TODO, nach Priorität)
1. **Consistency-Regeln** (Best Day ≤ 40/50 % in Eval oder Funded, Alpha Capital Direct 15 %) fehlen. Braucht Tages-Struktur: mehrere Trades pro Tag, Tages-P&L.
2. **Daily Loss Limit** (soft/hard) fehlt. Braucht ebenfalls Tages-Struktur.
3. **Gewinntage-Pflicht** (z. B. 5 Tage ≥ 200 $) ist nur über `minp` angenähert.
4. **Monatsgebühren** (Alpha Futures, MFFU rechnen monatlich ab): Fee ist pauschal pro Account, Re-Billing bei langen Challenges fehlt.
5. **Max. offenes Risiko pro Asset** (Alpha Capital Direct 1 %) wird nur über die Risikovorgabe der Angebotsauswahl eingehalten, nicht im Kern geprüft.
6. **Lot-/Kontraktlimits, Slippage-Verteilung, Gaps/News** fehlen.
7. Funded-Phase bei 2-Step-Plänen startet immer bei 0 Gewinn, Puffer-Regeln einzelner Firmen sind vereinfacht.
8. **Alpha Futures (M-010a erledigt)**, offen: Scaling-Plan (Funded) nicht erfasst, Gebühren-PDF (Kommissionen je Kontrakt) nicht ausgewertet, Codepreise ohne Quelle (ALPHA40/ALPHA50 entfernt, `fee` = Listenpreis).

## Daten (js/offers.js) – Stand 15.10.2026
- **Alpha Futures** (13 Einträge: Zero, Standard, Advanced je 25k/50k/100k bzw. 50k/100k/150k, Direct 25k–150k): offizielles Help Center, Artikel Juli/Aug. 2026, abgerufen 15.10.2026. Pro Eintrag `src` (Plan-Übersicht), `asof: '2026-10-15'` und `rules` (Rohregeln, `null` = Regel gilt nicht; vom Kern noch nicht gelesen, Datenbasis für M-002 bis M-006).
  - Zero https://help.alpha-futures.com/en/articles/11771813-zero-account-overview
  - Standard https://help.alpha-futures.com/en/articles/11632512-standard-account-overview
  - Advanced https://help.alpha-futures.com/en/articles/11634907-advanced-account-overview
  - Direct https://help.alpha-futures.com/en/articles/15838742-direct-account-overview
  - MLL https://help.alpha-futures.com/en/articles/9491999-maximum-loss-limit-mll
  - Daily Loss Guard https://help.alpha-futures.com/en/articles/9492014-daily-loss-guard
  - Consistency https://help.alpha-futures.com/en/articles/9492048-consistency-rule
  - Payout https://help.alpha-futures.com/en/articles/9492051-payout-policy
  - Instrumente https://help.alpha-futures.com/en/articles/9492096-what-and-when-you-can-trade
  - **Abbildung auf Kernfelder**: Zero/Standard/Advanced `mode 'challenge'`, `target2 0`; Direct `mode 'instant'`, `target 0`. `dd` = MLL, trailing mit Lock bei Start (MLL ist EOD-trailing, der Kern zieht pro Trade nach = konservativ bis M-001/M-002). `buf 0` (MLL lockt bei Start, Auszahlung senkt es nicht). `wfrac 50` für alle (Direct ohne offizielle Angabe, konservativ). `cap` = Auszahlung max., `split 90`, `maxp 5`. `minp`: Zero/Standard max(2 × Auszahlung min; 5 × 200 $) = 1.000 $, Advanced 2.000 $, Direct = 1. Auszahlungsziel für alle Zyklen. `fee` = Listenpreis, `code '–'`: für ALPHA40/ALPHA50 ist keine Quelle belegt.
  - **Nicht im Kern**: Daily Loss Guard (soft, 2 % der Startbalance, nicht bei Standard-Eval und Advanced), Consistency (Eval gesamt, Funded seit letztem Antrag), 5 Gewinntage ≥ 200 $, max. 4 Anträge/Monat, Direct-Zyklen 1./2.+ Ziel, Kontraktlimits, News, flat bis 16:20 ET, Monatsabo.
- **Lucid Trading**: PropTradingVibes (Listenpreise 16.09.2026, Code VIBES −40 %).
- **MyFundedFutures**: PropTradingVibes + PropFirmMap (Preise Juni 2026, Code −50 %). Monatliche Abrechnung.
- **FundedNext Futures**: DamnPropFirms (Partner-Seite) + PipBack. Bots erlaubt.
- **Alpha Capital (CFD)**: alphacapitalgroup.uk (Rules Explained, Instant Funding, Promo-Codes bis 31.10.2026).
- Codes laufen ab und Regeln ändern sich oft. Vor Kauf im Help Center der Firma prüfen und `offers.js` aktualisieren (Datum in `index.html`-Legende „Stand …“ mitziehen).

## Konventionen
- UI-Sprache Deutsch, Zahlen mit `Intl.NumberFormat('de-DE')`, Währung als „1.234 $“, Minus als „−“.
- Keine Abhängigkeiten außer Google Fonts. Kein Framework, kein Build-Schritt.
- Farben nur über CSS-Tokens in `:root` (hell) und die beiden Dunkel-Blöcke; neue Farben in allen drei Blöcken definieren.
- Kern (`sim.js`) bleibt DOM-frei und deterministisch, damit Tests in Node laufen.
- Neue Angebote: Objekt in die passende Gruppe in `OFFERS` (Felder: id, n, mode, fee, list, code, target, target2, dd, ddStatic, buf, minp, wfrac, cap, split, maxp, note, optional maxRisk), danach `npm test`.
