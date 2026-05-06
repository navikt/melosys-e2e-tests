# Nullable trygdesats — oppsummering av nedstrøms feil og fikser

**Jira:** MELOSYS-7588, MELOSYS-7969
**Periode:** 2026-03-22 — 2026-03-23
**Berørte repoer:** melosys-api, melosys-dokgen, faktureringskomponenten, melosys-trygdeavgift-beregning, melosys-e2e-tests

## Bakgrunn

MELOSYS-7588 og MELOSYS-7969 utvider datamodellen for trygdeavgift med støtte for
25%-regelen og minstebeløp. Når 25%-regelen eller minstebeløpet slår inn, settes
`trygdesats = null` i stedet for en tallverdi. Beregningstypen (ORDINÆR,
TJUEFEM_PROSENT_REGEL, MINSTEBELOEP) lagres som eget felt.

Denne endringen brøt nedstrøms tjenester og brevmaler som antok at trygdesats alltid
er et tall, og eksisterende E2E-tester som antok at enhver bruttoinntekt gir positiv
trygdeavgift.

## Oversikt over feil og fikser

### melosys-trygdeavgift-beregning

Kilden til nullable sats — her ble selve 25%-regelen implementert.

| Feil | Beskrivelse | Fiks |
|------|-------------|------|
| ArithmeticException i Penger.kt | Tre steder brukte `BigDecimal.divide/setScale` uten `RoundingMode`. 25%-regelen gir beregninger med desimaler som ikke er eksakte. | Lagt til `RoundingMode.HALF_UP` på alle tre steder. |

### melosys-api

Hovedtjenesten som konsumerer nullable sats og videresender til nedstrøms tjenester.

| Feil | Beskrivelse | Fiks |
|------|-------------|------|
| ORA-02292 FK-feil | V151 opprettet `trygdeavgiftsperiode_grunnlag` med FK til `medlemskapsperiode` uten cascade. Hibernate slettet i vilkårlig rekkefølge ved nyvurdering. | V152: `ON DELETE SET NULL` på tre FK-er. |
| intValueExact() krasj | `ÅrsavregningController` brukte `intValueExact()` på trygdeavgiftsbeløp som kan ha desimaler (f.eks. 3448.33). | `setScale(0, RoundingMode.HALF_UP)` før `intValueExact()`. |
| InformasjonTrygdeavgiftMapper `!!` | Brukte `!!` (not-null assert) på legacy FK-felter som kan være null med ny grunnlag-tabell. | Byttet til safe accessor-metoder (`hentGrunnlagInntekstperiode()`). |

### melosys-dokgen

Dokumentgenerering som lager vedtaksbrev med trygdeavgift-tabeller.

| Feil | Beskrivelse | Fiks |
|------|-------------|------|
| JSON-schema avviste null | 6 brevmal-schemaer hadde `"avgiftssats": {"type": "number"}` som required. | Endret til `"type": ["number", "null"]` og fjernet fra required. |
| Handlebars `gt`-helper krasjet | `(gt periode.avgiftssats 0)` kastet `IllegalArgumentException: Not a comparable: null`. | Erstattet med `(gt periode.avgiftPerMd 0)` (beløp er aldri null). Sats-visning med `{{#if}}` for null-safe rendering. |

### faktureringskomponenten

Faktureringstjenesten som oppretter fakturaserier basert på trygdeavgiftsbeløp.

| Feil | Beskrivelse | Fiks |
|------|-------------|------|
| ArithmeticException i BeløpBeregner | Brukte `RoundingMode.UNNECESSARY` i `setScale(2)`. 25%-regelen gir enhetspriser med mer enn 2 desimaler. | Endret til `RoundingMode.HALF_UP`. |

### melosys-e2e-tests

End-to-end-testene som avdekket problemene og som selv trengte oppdatering.

| Feil | Beskrivelse | Fiks |
|------|-------------|------|
| melosys-dokgen tag hardkodet | Docker image for melosys-dokgen var hardkodet til `:latest` i CI workflow. Custom tag ble ignorert. | Lagt til `MELOSYS_DOKGEN_TAG`-variabel i workflow, docker-compose og test-reporter. PR #243. |
| Bruttoinntekt under minstebeløp | Testene brukte 10000 kr/mnd. Med 25%-regelen og minstebeløp 99650 kr/år ga dette beløp=0 for en 6-måneders periode (60000 < 99650). | Økt til 100000 kr/mnd. |
| Feil API-endepunkt for fakturaserie | Testene brukte `GET /fakturaserier/{referanse}` som kun returnerer én serie. Krediterings-fakturaserier (med negerte beløp) har annen referanse og ble aldri hentet. | Byttet til `GET /fakturaserier?referanse=` som traverserer hele erstattet_med-kjeden inkl. krediteringer. |
| Fakturaserie-sjekk for annullert NV | To tester sjekket fakturaserie for nyvurdering som ble annullert uten vedtak. Uten vedtak opprettes ingen fakturaserie. | Fjernet fakturaserie-sjekk for nyvurderinger uten vedtak. |
| Floating point i sum-beregning | Sum av store beløp med desimaler ga epsilon-avvik fra 0 (f.eks. 3.64e-12). | Avrunding med `Math.round(sum * 100) / 100`. |

## Felles rotårsak

Alle backend-feil hadde samme rotårsak: **nullable trygdesats** og **beløp med desimaler**
som 25%-regelen introduserer. Koden antok at:

1. `trygdesats` alltid er et tall (aldri null)
2. Beløp alltid er eksakte (ingen avrunding nødvendig)
3. `BigDecimal`-operasjoner gir eksakt resultat uten `RoundingMode`

Alle test-feil hadde samme rotårsak: **testene ble skrevet før 25%-regelen** og
antok at enhver bruttoinntekt gir positiv trygdeavgift og at fakturaserier kan
hentes med én enkelt referanse.

## Resultat

| CI-kjøring | Passed | Failed | Flaky |
|------------|--------|--------|-------|
| Run 23405365030 (før fikser) | 61 | 7 | 2 |
| Run 23425338486 (backend-fikser) | 64 | 4 | 2 |
| Lokalt etter alle fikser | 4/4 | 0 | — |
| Run 23434973899 (alle fikser) | Venter | — | — |

## Hvordan feilene ble funnet

Feilsøkingen ble koordinert mellom fire Claude Code-instanser via claude-peers:

1. **E2E-tester** kjørte testene og identifiserte feilmeldinger
2. **melosys-api** la til debug-logging i OpprettFakturaserie og TrygdeavgiftClient,
   som avslørte at `harFakturerbarTrygdeavgift=false` fordi `beløp=0, sats=null`
3. **trygdeavgift-beregning** bekreftet at beløp=0 er korrekt for inntekt under
   minstebeløpet, og at beregningen annualiserer (60000 kr/år < 99650 minstebeløp)
4. **faktureringskomponenten** identifiserte at krediterings-fakturaserier har
   separat referanse og forklarte forskjellen mellom to API-endepunkter

## Deploy-rekkefølge

Alle tjenester kan deployes uavhengig:

1. **faktureringskomponenten** — RoundingMode-fiks (uavhengig PR)
2. **melosys-dokgen** — Schema + template-fiks (uavhengig PR)
3. **melosys-trygdeavgift-beregning** — RoundingMode i Penger.kt (PR #379)
4. **melosys-api** — V152 cascade + intValueExact + brevmapper (PR #3273)
5. **melosys-e2e-tests** — Test-fikser (branch: feature/ftrl-trygdeavgift-25-prosent-regel-e2e)
