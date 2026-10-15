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
- **Handelstage**: bis zu `tpd` Trades pro Tag. Jede Phase und jeder Auszahlungszyklus startet mit einem neuen Tag; Bestehen bzw. Auszahlung beenden den Tag. Ohne Tagesregeln ändert `tpd` nichts am Ergebnis (gleiche Zufallsfolge).
- **Daily Loss Limit** (`dll` > 0): Tages-P&L ≤ −`dll` (geschlossene Trades) beendet den Tag (soft) oder den Account (`dllHard`). Gilt in Challenge und Funded.
- **Consistency**: bester Tag ≤ `cons` % des Phasengewinns (Challenge) bzw. ≤ `consF` % des Zyklusgewinns seit der letzten Auszahlung (Funded/Instant). Sonst wird weitergehandelt. 0 = keine Regel.
- **Drawdown**: trailing (`floor = min(peak - dd, 0)`, also Lock beim Startkapital) oder statisch (`ddStatic`: `floor = -dd`). Geprüft wird pro Trade (≈ intraday auf geschlossenen Trades).
- **Funded**: Auszahlung, sobald Gewinn ≥ `buf + minp` (und Consistency erfüllt). Betrag = `min(cap, (Gewinn - buf) * wf)`, ausgezahlt wird `Betrag * sp` (Split). Max. `maxp` Auszahlungen, danach endet der Account (Review/Live).
- **Gegentrade**: pro Trade `-h * Brutto - h * cost` aufs Echtgeld-Konto. Aktiv in der Absicherungsphase (Challenge, bei Instant bis 1. Auszahlung) oder immer, wenn `hfund = true`.
- **Ausgaben**: netNo, netHe, days, dllStops (soft beendete Tage), dllBreach (Accounts per hartem Limit verloren), consWait (Ziel erreicht, Consistency nicht), real (Echtgeld-Saldo), realMin (größter Rückgang = benötigtes Echtgeld), hFail/nFail und hSucc/nSucc (Refinanzierung vs. Kosten), cum*-Reihen für den Chart, die ersten 12 Accounts für die Detailtabelle.
- `MAXT = 500` Trades pro Phase als Notbremse.
- Seed: `mulberry32`, Standard 20261015, „Neu würfeln“ ändert ihn.

## Bekannte Lücken (TODO, nach Priorität)
1. **Gewinntage-Pflicht** (z. B. 5 Tage ≥ 200 $) ist nur über `minp` angenähert. Die Tages-Struktur ist jetzt da, es fehlt nur der Zähler pro Zyklus.
2. **Monatsgebühren** (Alpha Futures, MFFU rechnen monatlich ab): Fee ist pauschal pro Account, Re-Billing bei langen Challenges fehlt.
3. **Max. offenes Risiko pro Asset** (Alpha Capital Direct 1 %) wird nur über die Risikovorgabe der Angebotsauswahl eingehalten, nicht im Kern geprüft.
4. **Lot-/Kontraktlimits, Slippage-Verteilung, Gaps/News** fehlen.
5. Funded-Phase bei 2-Step-Plänen startet immer bei 0 Gewinn, Puffer-Regeln einzelner Firmen sind vereinfacht.
6. **Tagesregeln vereinfacht**: Daily Loss wird auf geschlossenen Trades geprüft (ein Verlust kann das Limit überschreiten, kein Liquidieren am Limit). Ein `dll` pro Angebot gilt für Challenge und Funded, auch wo die Firma es nur in einer Phase hat. Consistency-Bezugsgröße (Zyklus vs. gesamt) unterscheidet sich je Firma. Trades pro Tag sind fix, kein Stopp nach Tagesgewinn.

## Daten (js/offers.js) – Stand 15.10.2026
- **Alpha Futures**: Preise und 50k-Regeln von alpha-futures.com (offiziell, 15.10.). Advanced 100k/150k Ziel/DD aus TradeTanto. Auszahlbarer Anteil bei Standard nicht offiziell bestätigt.
- **Lucid Trading**: PropTradingVibes (Listenpreise 16.09.2026, Code VIBES −40 %).
- **MyFundedFutures**: PropTradingVibes + PropFirmMap (Preise Juni 2026, Code −50 %). Monatliche Abrechnung.
- **FundedNext Futures**: DamnPropFirms (Partner-Seite) + PipBack. Bots erlaubt.
- **Alpha Capital (CFD)**: alphacapitalgroup.uk (Rules Explained, Instant Funding, Promo-Codes bis 31.10.2026).
- **Tagesregeln** (`dll`, `dllHard`, `cons`, `consF`) stammen aus den `note`-Texten der Angebote. Futures-Limits sind als soft eingetragen, CFD (Alpha Capital) als hart. Annahmen: Alpha Futures Advanced 100k/150k Eval-Consistency 40 % aus 50k übernommen; Soft/Hard bei Alpha Futures Direct und Lucid Direct nicht bestätigt.
- Codes laufen ab und Regeln ändern sich oft. Vor Kauf im Help Center der Firma prüfen und `offers.js` aktualisieren (Datum in `index.html`-Legende „Stand …“ mitziehen).

## Konventionen
- UI-Sprache Deutsch, Zahlen mit `Intl.NumberFormat('de-DE')`, Währung als „1.234 $“, Minus als „−“.
- Keine Abhängigkeiten außer Google Fonts. Kein Framework, kein Build-Schritt.
- Farben nur über CSS-Tokens in `:root` (hell) und die beiden Dunkel-Blöcke; neue Farben in allen drei Blöcken definieren.
- Kern (`sim.js`) bleibt DOM-frei und deterministisch, damit Tests in Node laufen.
- Neue Angebote: Objekt in die passende Gruppe in `OFFERS` (Felder: id, n, mode, fee, list, code, target, target2, dd, ddStatic, buf, minp, wfrac, cap, split, maxp, note, optional maxRisk, dll, dllHard, cons, consF), danach `npm test`.
