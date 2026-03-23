# E2E Debugging: 7588-grunnlag (Trygdeavgift 25%-regel)

**Dato:** 2026-03-22 — 2026-03-23
**Branch:** feature/ftrl-trygdeavgift-25-prosent-regel-e2e
**CI Runs:**
- Run 23405365030 (forrige, 7 failed / 61 passed)
- Run 23425338486 (etter fiks, 4 failed / 64 passed)

## Sammendrag

Debugging av E2E-feil ved testing av 25%-regel for trygdeavgift. Involvert 5 tjenester
med custom Docker images (`7588-grunnlag`-tag). Koordinert feilsøking mellom 4 Claude Code-instanser
(e2e-tests, melosys-api, melosys-trygdeavgift-beregning, faktureringskomponenten).

## Utgangspunkt

Forste CI-kjoring (run 23405365030) ga 7 feilende tester / 61 bestatt.

### Docker Image Tags (alle pa 7588-grunnlag)

- melosys-api
- melosys-web
- melosys-trygdeavgift-beregning
- melosys-dokgen
- faktureringskomponenten

## Identifiserte og fiksede problemer

### 1. melosys-dokgen tag ble ikke plukket opp

**Problem:** `melosys-dokgen` var den eneste tjenesten som var hardkodet til `:latest` i
workflow og docker-compose. Nar man trigget workflow med `melosys-dokgen:7588-grunnlag`
ble den ignorert med "Unknown service" i case-blokken.

**Fiks:** Lagt til `MELOSYS_DOKGEN_TAG`-variabel i:
- `.github/workflows/e2e-tests.yml` (9 steder: defaults, parsing, output, env, pull, compose)
- `docker-compose.yml` (image tag)
- `reporters/test-summary.ts` (tagEnvVars-liste for step summary)

**PR:** #243 (merget til main)
**Commits:** `bf5fb63`, `3271391`

### 2. ArithmeticException i faktureringskomponenten

**Problem:** `BelopBeregner` brukte `RoundingMode.UNNECESSARY` som kastet
`ArithmeticException` nar `enhetspris * antallManeder` ga mer enn 2 desimaler.
25%-regelen gir beregninger med desimaler som ikke er eksakte.

**Symptom:** Prosessinstans feilet pa steget `OPPRETT_FAKTURASERIE` med:
```
Kall mot Faktureringskomponenten feilet 500 INTERNAL_SERVER_ERROR - /fakturaserier
```

**Fiks:** Endret til `RoundingMode.HALF_UP` i faktureringskomponenten.

**Resultat:** Fikset 1 test (arsavregning-ikke-skattepliktig).

### 3. ArithmeticException i melosys-trygdeavgift-beregning

**Problem:** `Penger.kt` hadde tre steder med `BigDecimal.divide/setScale` uten
`RoundingMode`. Samme type feil som faktureringskomponenten — 25%-regelen gir
beregninger som ikke er eksakte.

**Symptom:**
```
ArithmeticException: Rounding necessary
```

**Fiks:** Lagt til `RoundingMode.HALF_UP` pa alle tre steder i `Penger.kt`.

### 4. intValueExact() i melosys-api

**Problem:** `ArsavregningController.kt:228` brukte `intValueExact()` pa
`trygdeavgiftsbelopMd` som kan ha desimaler nar 25%-regelen gir f.eks. 3448.33.

**Symptom:**
```
ArithmeticException: Rounding necessary
```

**Fiks:** `setScale(0, RoundingMode.HALF_UP)` for `intValueExact()`.

## Gjenstaaende feil etter fiks (4 stk)

### CI Run 23425338486: 4 failed, 64 passed, 2 flaky

#### Feil 1-3: Fakturaserie-referanse null ved nyvurdering (3 tester)

**Tester:**
1. `komplett-sak-flere-land-arbeidsinntekt-nv-kansellering.spec.ts`
2. `komplett-sak-flere-land-arbeidsinntekt.spec.ts`
3. `komplett-sak-nv-annulering-lukker-apne-arsavregninger.spec.ts`

**Feilmelding:**
```
Error: Failed to get fakturaserie null: 404 -
{"message":"Fant ikke fakturaserie pa: null"}
```

**Analyse:**
- Alle tre testene oppretter forstegangsvedtak, arsavregning, og deretter nyvurdering
- `getFakturaserieReferanse(behandlingId)` returnerer `null` for nyvurdering-behandlingen
- Testen forventer at alle behandlinger (opprinnelig, arsavregning, nyvurdering) har
  fakturaserie for a verifisere at sum = 0 etter annullering
- Faktureringskomponenten har ingen feil i loggene — alle POST /fakturaserier lyktes
- Problemet er at OPPRETT_FAKTURASERIE-steget enten ikke kjorer eller ikke lagrer
  referansen for nyvurdering-behandlingen
- Mulig race condition mellom nyvurdering-opprettelse og prosessinstans-fullforelse

**Status:** Uavklart. Krever videre debugging av prosessinstans-flyten for nyvurdering
i melosys-api.

#### Feil 4: Nyvurdering periodeendring (1 test)

**Test:** `komplett-sak-nv-periode-endres-til-kun-tidligere-ar.spec.ts`

**Feilmelding:** `Bad Request` — testen prover a endre en behandling som ikke er redigerbar.

**Analyse:** Samme underliggende problem som feil 1-3. Nyvurdering-behandlingen er
enten auto-vedtatt eller i feil tilstand for redigering.

**Status:** Uavklart.

#### Flaky tester (ikke-blokkerende)

1. `aarsavregning-ftrl.spec.ts` — feilet forste gang, bestod pa retry
2. `eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts` — "Step transition timed out
   after 90s. API responded OK but heading is still Yrkessituasjon" — kjent
   frontend-rendering-issue i melosys-web

## Forbedring fra forrige kjoring

| Metrikk | Run 23405365030 | Run 23425338486 | Endring |
|---------|-----------------|-----------------|---------|
| Passed  | 61              | 64              | +3      |
| Failed  | 7               | 4               | -3      |
| Flaky   | 2               | 2               | 0       |

Tre tester som feilet med avrundingsfeil (ArithmeticException / Rounding necessary)
er naa fikset.

## Koordinering

Feilsoking ble koordinert mellom fire Claude Code-instanser via claude-peers:

- **melosys-e2e-tests** — kjorte tester, analyserte feil, distribuerte feilmeldinger
- **melosys-api (37sxdycw)** — analyserte prosessinstans-logg, fikset intValueExact
- **melosys-trygdeavgift-beregning (o1u36azj)** — fikset RoundingMode i Penger.kt
- **faktureringskomponenten (l6se017r)** — fikset RoundingMode i BelopBeregner

## Neste steg

1. Debugge hvorfor nyvurdering-behandlinger ikke far fakturaserie-referanse
   - Sjekk om `skalOppretteFakturaserie` returnerer false for nyvurderinger
   - Sjekk om prosessinstansen for nyvurdering inkluderer OPPRETT_FAKTURASERIE-steget
2. Vurdere om testene bor ha null-sjekk for fakturaserie-referanse ved annullering
   (kanskje annullerte behandlinger ikke skal ha fakturaserie)
3. Frontend-rendering-issue for steg-overgang er kjent og sporet separat
