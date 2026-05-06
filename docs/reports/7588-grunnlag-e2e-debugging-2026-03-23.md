# E2E Debugging: 7588-grunnlag (Trygdeavgift 25%-regel)

**Dato:** 2026-03-22 — 2026-03-23
**Branch:** feature/ftrl-trygdeavgift-25-prosent-regel-e2e
**CI Runs:**
- Run 23405365030 (første, 7 failed / 61 passed)
- Run 23425338486 (etter backend-fikser, 4 failed / 64 passed)
- Run 23434973899 (etter test-fikser, venter på resultat)

## Sammendrag

Debugging av E2E-feil ved testing av 25%-regel for trygdeavgift. Involvert 5 tjenester
med custom Docker images (`7588-grunnlag`-tag). Koordinert feilsøking mellom 4 Claude Code-instanser
(e2e-tests, melosys-api, melosys-trygdeavgift-beregning, faktureringskomponenten).

Alle 4 gjenstående feil løst — 4/4 bestod lokalt. Fiksene var en kombinasjon av
backend-fikser (ArithmeticException) og test-fikser (inntekt under minstebeløp, feil
API-endepunkt for fakturaserie-kjeder).

## Docker Image Tags (alle på 7588-grunnlag)

- melosys-api
- melosys-web
- melosys-trygdeavgift-beregning
- melosys-dokgen
- faktureringskomponenten

## Identifiserte og fiksede problemer

### 1. melosys-dokgen tag ble ikke plukket opp (CI-infra)

**Problem:** `melosys-dokgen` var den eneste tjenesten som var hardkodet til `:latest` i
workflow og docker-compose. Når man trigget workflow med `melosys-dokgen:7588-grunnlag`
ble den ignorert med "Unknown service" i case-blokken.

**Fiks:** Lagt til `MELOSYS_DOKGEN_TAG`-variabel i:
- `.github/workflows/e2e-tests.yml` (9 steder: defaults, parsing, output, env, pull, compose)
- `docker-compose.yml` (image tag)
- `reporters/test-summary.ts` (tagEnvVars-liste for step summary)

**PR:** #243 (merget til main)
**Commits:** `bf5fb63`, `3271391`

### 2. ArithmeticException i faktureringskomponenten (backend)

**Problem:** `BeløpBeregner` brukte `RoundingMode.UNNECESSARY` som kastet
`ArithmeticException` når `enhetspris * antallMåneder` ga mer enn 2 desimaler.
25%-regelen gir beregninger med desimaler som ikke er eksakte.

**Symptom:** Prosessinstans feilet på steget `OPPRETT_FAKTURASERIE` med:
```
Kall mot Faktureringskomponenten feilet 500 INTERNAL_SERVER_ERROR - /fakturaserier
```

**Fiks:** Endret til `RoundingMode.HALF_UP` i faktureringskomponenten.

### 3. ArithmeticException i melosys-trygdeavgift-beregning (backend)

**Problem:** `Penger.kt` hadde tre steder med `BigDecimal.divide/setScale` uten
`RoundingMode`. Samme type feil som faktureringskomponenten — 25%-regelen gir
beregninger som ikke er eksakte.

**Fiks:** Lagt til `RoundingMode.HALF_UP` på alle tre steder i `Penger.kt`.

### 4. intValueExact() i melosys-api (backend)

**Problem:** `ÅrsavregningController.kt:228` brukte `intValueExact()` på
`trygdeavgiftsbeløpMd` som kan ha desimaler når 25%-regelen gir f.eks. 3448.33.

**Fiks:** `setScale(0, RoundingMode.HALF_UP)` før `intValueExact()`.

### 5. Bruttoinntekt under minstebeløpet med 25%-regelen (test-data)

**Problem:** Alle 4 feilende tester brukte bruttoinntekt 10000 kr/mnd. Med
25%-regelen og minstebeløp 99650 kr/år ble årlig inntekt for lav:
10000 kr/mnd x 6 mnd = 60000 kr/år < 99650 kr → avgift = 0.

Med avgift = 0 ble ingen fakturaserie opprettet (harFakturerbarTrygdeavgift=false),
og testene feilet med "Failed to get fakturaserie null".

**Debug-funn (OpprettFakturaserie):**
```
OPPRETT_FAKTURASERIE for behandling 107:
  harFakturerbarTrygdeavgift=false, skalFaktureres=true,
  antallTrygdeavgiftsperioder=1, perioder=[harAvgift=false, beløp=0, sats=null]
```

**Fiks:** Økt bruttoinntekt fra 10000 til 100000 kr/mnd (godt over minstebeløpet).

### 6. Feil API-endepunkt for fakturaserie-verifisering (test-logikk)

**Problem:** Testene brukte `GET /fakturaserier/{referanse}` som kun returnerer
én fakturaserie. Ved kansellering opprettes en krediterings-fakturaserie med
annen referanse, som aldri ble hentet. Summen kunne derfor aldri bli 0.

**Rotårsak-analyse:**
- Faktureringskomponenten bekreftet at kanselleringen fungerte korrekt
- Krediterings-fakturaserien ble opprettet med negerte beløp
- Men `GET /fakturaserier/{referanse}` returnerer kun den ene serien
- `GET /fakturaserier?referanse={referanse}` traverserer hele erstattet_med-kjeden
  via en rekursiv CTE og inkluderer krediterings-serier

**Fiks:**
- Ny metode `hentFakturaserieKjede` i FaktureringHelper som bruker query-parameter-endepunktet
- Ny metode `totalBeløpKjede` som summerer over en liste av serier
- Deduplisering av serier som finnes i flere kjeder (kreditering lenkes til begge)
- `Math.round(sum * 100) / 100` for floating point-avrunding

### 7. Fakturaserie-sjekk for annullerte nyvurderinger (test-logikk)

**Problem:** To tester annullerte nyvurdering uten å fatte vedtak. Uten vedtak
kjører ikke IVERKSETT_VEDTAK_FTRL, og OPPRETT_FAKTURASERIE oppretter ingen
fakturaserie. Testene forventet likevel fakturaserie for nyvurdering-behandlingen.

**Fiks:** Fjernet fakturaserie-verifisering for nyvurdering-behandlingen i
tester som annullerer uten vedtak.

## Resultater

| Metrikk | Run 23405365030 | Run 23425338486 | Lokalt etter fiks |
|---------|-----------------|-----------------|-------------------|
| Passed  | 61              | 64              | 4/4 (de feilende) |
| Failed  | 7               | 4               | 0                 |
| Flaky   | 2               | 2               | —                 |

Alle 7 opprinnelig feilende tester er nå fikset:
- 3 fikset av backend-fikser (ArithmeticException)
- 4 fikset av test-fikser (inntekt, API-endepunkt, annullering)

## Koordinering

Feilsøking ble koordinert mellom fire Claude Code-instanser via claude-peers:

- **melosys-e2e-tests** — kjørte tester, analyserte feil, distribuerte feilmeldinger
- **melosys-api (37sxdycw)** — analyserte prosessinstans-logg, fikset intValueExact,
  la til debug-logging i OpprettFakturaserie og TrygdeavgiftClient
- **melosys-trygdeavgift-beregning (o1u36azj)** — fikset RoundingMode i Penger.kt,
  bekreftet minstebeløp-beregning og at beløp=0 er korrekt for lav inntekt
- **faktureringskomponenten (l6se017r)** — fikset RoundingMode i BeløpBeregner,
  identifiserte at krediterings-fakturaserie har separat referanse og forklarte
  forskjellen mellom path-parameter og query-parameter API-endepunkt

## Lærdommer

1. **25%-regelen endrer forutsetningene** for eksisterende tester — bruttoinntekt
   som ga positiv avgift før kan gi 0 med minstebeløp-sjekk
2. **Fakturaserie-kjeder** krever riktig API-endepunkt — `?referanse=` traverserer
   hele erstattet_med-kjeden, mens `/{referanse}` kun gir én serie
3. **Floating point** i JavaScript gjør at summen av store beløp med desimaler
   kan gi epsilon-avvik fra 0 (f.eks. 3.64e-12)
4. **Debug-logging i prosessinstans-steg** var avgjørende for å identifisere
   at beløp=0 og sats=null var årsaken, ikke en manglende prosessflyt
