# ATDD-eksempel — Trygdeavtale i dybden

Et komplett, kjørbart eksempel på Dave Farleys fire-lags ATDD-modell, avgrenset til
**trygdeavtale**-domenet. Mønsteret er hentet fra
[atdd-course-examples](https://github.com/davef77/atdd-course-examples).

Eksempelet er **opt-in**: det kjører KUN via `npm run test:bdd`, ikke i `npm test`
eller på CI. De opprinnelige `.spec.ts`-testene i `tests/trygdeavtale/` beholdes
uendret (sameksistens) — dette er et mønster-eksempel, ikke en migrering.

---

## Hva eksempelet viser

Ikke bare at oppkoblingen virker, men *verdien*:

- **Precision where needed, defaults elsewhere** — søknadsperioden har fornuftige
  standardverdier og overstyres kun når et scenario sier det eksplisitt.
- **Gjenbruk av vokabular** — hvert nytt scenario komponerer eksisterende
  DSL-metoder i stedet for å skripte fra bunnen.
- **Flerbehandlings-flyt** — nyvurdering oppretter en 2. behandling og deler
  tilstand (behandlingId, medlPeriodeId) mellom stegene.
- **Negativt utfall** — «ikke godkjent unntak» avslutter saken uten
  medlemskapsperiode.

---

## Scenario-katalog

| # | Feature-fil | Scenario | Utledet fra (proven green) |
|---|-------------|----------|-----------------------------|
| 1 | `trygdeavtale-vedtak.feature` | Fullføre behandling med standardperiode | `trygdeavtale-fullfort-vedtak.spec.ts` |
| 2 | `trygdeavtale-vedtak.feature` | Fatte vedtak med eksplisitt oppgitt periode | (ny — demonstrerer override-steget) |
| 3 | `trygdeavtale-nyvurdering.feature` | Nyvurdering forkorter perioden og erstatter MEDL-perioden | `trygdeavtale-nyvurdering.spec.ts` |
| 4a | `trygdeavtale-unntaksregistrering.feature` | Godkjent unntak gir endelig medlemskapsperiode | `trygdeavtale-unntaksregistrering.spec.ts` |
| 4b | `trygdeavtale-unntaksregistrering.feature` | Ikke godkjent unntak avslutter saken uten periode (negativt) | `trygdeavtale-unntaksregistrering.spec.ts` |

---

## Før og etter

### Før — `tests/trygdeavtale/trygdeavtale-fullfort-vedtak.spec.ts`

TypeScript-kode som blander *hva* og *hvordan*. En fagekspert kan ikke lese dette.

```typescript
await hovedside.goto();
await hovedside.klikkOpprettNySak();
await opprettSak.fyllInnBrukerID(USER_ID_VALID);
await opprettSak.velgSakstype('TRYGDEAVTALE');
// ... 10+ linjer til ...
await behandling.fyllUtPeriodeOgLand('01.01.2024', '01.01.2026', 'AU');
await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
await behandling.innvilgeOgVelgBestemmelse('AUS_ART9_3');
await arbeidssted.fyllUtArbeidsstedOgFattVedtak('Test');
```

### Etter — `features/trygdeavtale/trygdeavtale-vedtak.feature`

Strukturert tekst på norsk. En saksbehandler kan lese og verifisere dette.

```gherkin
# language: no
  Scenario: Fullføre trygdeavtale-behandling med standardperiode
    Gitt en opprettet trygdeavtale-behandling
    Når saksbehandler fatter vedtak med resultat "INNVILGET"
    Så blir behandlingen fullført og søknad innvilget
```

---

## De fire lagene

```
┌─────────────────────────────────────────────────────────────┐
│  Lag 1 — TESTTILFELLE (features/)                           │
│  Gherkin .feature-filer på norsk. Lesbart for fageksperter. │
├─────────────────────────────────────────────────────────────┤
│  Lag 2 — DSL + BINDINGER (atdd/)                            │
│  TrygdeavtaleDsl: domenespråk + tilstand. Ingen POM-kjennskap.│
│  Steps: lim Gherkin → DSL (én linje per steg).              │
├─────────────────────────────────────────────────────────────┤
│  Lag 3 — PROTOKOLLDRIVERE (atdd/drivers/, pages/, helpers/) │
│  TrygdeavtaleDriver: oversetter domene → POM-kall.          │
├─────────────────────────────────────────────────────────────┤
│  Lag 4 — SYSTEM UNDER TEST (docker-compose)                 │
└─────────────────────────────────────────────────────────────┘
```

### Filstruktur

```
features/trygdeavtale/
  trygdeavtale-vedtak.feature              ← Lag 1: scenario 1 + 2
  trygdeavtale-nyvurdering.feature         ← Lag 1: scenario 3
  trygdeavtale-unntaksregistrering.feature ← Lag 1: scenario 4a + 4b

atdd/
  trygdeavtale.dsl.ts                      ← Lag 2: DSL (tilstand + domenespråk)
  fixtures.ts                              ← Lag 2: kobler driver → DSL → Playwright
  steps/
    trygdeavtale-vedtak.steps.ts           ← Lag 2: binding (én fil per feature)
    trygdeavtale-nyvurdering.steps.ts
    trygdeavtale-unntaksregistrering.steps.ts
  drivers/
    trygdeavtale.driver.ts                 ← Lag 3: protokolldriver (POM-orkestrering)

pages/, helpers/                           ← Lag 3: POMs + hjelpere (uendret)
```

### Importregel (Farley-korrekt — se merknaden om refactor-plan-dokumentet)

- **Steg** importerer KUN DSL-fixturen (`atdd/fixtures.ts`).
- **DSL** importerer KUN driveren (`atdd/drivers/...`) — ingen POM-imports.
- **Driver** importerer POMs og helpers.

Hvis en UI-knapp endrer navn → kun POM og driver oppdateres. Hvis et domene-begrep
endrer seg → feature-fil, steps og DSL oppdateres.

---

## Precision where needed — override-steget

Standardscenarioet bruker standardverdier. Trenger et scenario en annen periode,
legges det til ETT lesbart Given-steg — resten er fortsatt standard:

```gherkin
  Scenario: Fatte vedtak med eksplisitt oppgitt søknadsperiode
    Gitt en opprettet trygdeavtale-behandling
    Og søknaden gjelder perioden 01.01.2024 til 31.12.2025   ← override
    Når saksbehandler fatter vedtak med resultat "INNVILGET"
    Så blir behandlingen fullført og søknad innvilget
    Og vedtaket gjelder perioden 01.01.2024 til 31.12.2025   ← verifisering
```

Override-steget er en ren felt-skriver på DSL-en (`oppgiPeriode`); `fattVedtak`
leser sammenslåtte standardverdier + overstyringer. Datoer skrives uten
anførselstegn via den egendefinerte `{dato}`-parametertypen.

### Standardverdier (skjult i driver/POM)

| Verdi | Standard | Kan overstyres? |
|-------|----------|-----------------|
| Bruker-ID | `USER_ID_VALID` | nei (fast testperson) |
| Sakstype/-tema/behandlingstema | TRYGDEAVTALE / MEDLEMSKAP_LOVVALG / YRKESAKTIV | nei |
| Søknadsperiode | `01.01.2024 – 01.01.2026` | **ja** (`oppgiPeriode`) |
| Land | `AU` (Australia) | **nei** — mock-begrensning (se under) |
| Arbeidsgiver | `Ståles Stål AS` | **nei** — mock-begrensning (se under) |
| Bestemmelse | `AUS_ART9_3` | knyttet til land (fast) |
| Arbeidssted | `Test` | nei |

### Mock-begrensninger (hvorfor kun periode varierer)

- **Land:** kun Australia (`AU`) har fungerende mock-data. India feiler
  (MELOSYS-6938). Derfor er land ikke en DSL-parameter.
- **Arbeidsgiver:** Aareg-mocken returnerer alltid nøyaktig ett arbeidsforhold
  («Ståles Stål AS», første org i `OrganisasjonRepo`), og POM-ens
  `velgArbeidsgiver` er et radio-oppslag uten fritekst. En override ville bare
  gjentatt defaulten — derfor ingen `oppgiArbeidsgiver`-steg.

Periode er dermed den eneste reelle variasjonsaksen.

---

## Er playwright-bdd nødvendig?

Kort svar: **DSL-en er verdien; Gherkin er valgfri innpakning.** Farleys fire-lags-
modell krever bare at Lag 1 er *strukturert tekst på domenespråk* — ingenting i Lag
2–4 avhenger av Gherkin. Vi beholder likevel playwright-bdd fordi:

- `ATTD-goal.md` sikter eksplisitt på fagekspert-lesbare norske spesifikasjoner —
  det krever strukturert tekst, altså en runner.
- Blant runnerne (cucumber-js, egen parser, playwright-bdd) er playwright-bdd den
  eneste som beholder de bærende Playwright-fixturene gratis: `fixtures/cleanup.ts`
  (DB/mock/Unleash-reset — suiten er ubrukelig uten), `fixtures/docker-logs.ts`,
  traces/screenshots, `workers: 1`, den egendefinerte summary-reporteren.

**Byttbart — og bevist:** stegene er one-linere mot DSL-en, så å rive ut
playwright-bdd koster ~10 omskrevne linjer. Det er demonstrert konkret i
`tests/trygdeavtale/trygdeavtale-vedtak-dsl.spec.ts` (tagget `@manual`): SAMME DSL,
men Lag 1 er ren, lesbar TypeScript i stedet for Gherkin. Den bruker `dslTest` fra
`atdd/fixtures.ts` (samme fixture-funksjon, utvidet fra `@playwright/test` sin base
i stedet for playwright-bdd sin).

Kjør A/B-demoen:

```bash
MANUAL_TESTS=true npx playwright test tests/trygdeavtale/trygdeavtale-vedtak-dsl.spec.ts --project=chromium
```

---

## Slik kjører du

```bash
# ATDD/BDD-eksempelet (opt-in — kjører bddgen først, så bdd-prosjektet)
npm run test:bdd

# BDD i UI-modus (genererer specs først, åpner Playwright UI for bdd-prosjektet)
npx bddgen && npx playwright test --project=bdd --ui

# BDD headed (synlig nettleser, uten UI-panel)
npx bddgen && npx playwright test --project=bdd --headed

# De opprinnelige testene (uendret — kjører også i default npm test / CI)
npx playwright test tests/trygdeavtale --project=chromium
```

> **Merk:** `npm run test:ui` viser kun chromium-prosjektet. BDD-testene ligger i
> `.features-gen/` (gitignored) og krever `npx bddgen` før de finnes på disk.
> Bruk kommandoene over for å se BDD-testene i UI/headed-modus.

> **NB:** Kjør alltid `npm run test:bdd` — den kjører `npx bddgen` FØRST.
> `defineBddConfig` auto-genererer ikke; `.features-gen/` er gitignored, så
> `playwright test --project=bdd` uten `bddgen` kan kjøre utdaterte/manglende
> genererte filer (falsk grønn). `bddgen` feiler også høylytt på manglende/
> dupliserte step-definisjoner — en gratis ekstra sjekk.

NV-/unntak-scenarioene tar ~1–3 min hver og kjører sekvensielt (`workers: 1`).

### På CI (opt-in)

Vanlig CI (`E2E Tests`-workflowen — både `repository_dispatch` når tjenester
publiserer images, og manuell `workflow_dispatch`) kjører **kun chromium**;
bdd-prosjektet er ikke med som standard. Vil du kjøre eksempelet på CI, dispatch
workflowen manuelt med inputen `run_bdd=true`:

```bash
gh workflow run "E2E Tests" --ref <branch> \
  -f environment=latest \
  -f run_bdd=true
```

Da kjører **kun** bdd-prosjektet i denne invokasjonen (`bddgen` først, så
`--project=bdd`) mot samme stack. Mens BDD stabiliseres kjøres altså **ikke**
chromium i samme runde — slik at en urelatert flaky chromium-test ikke kan
sabotere BDD-eksperimentet. `repository_dispatch`-kjøringene setter aldri denne
inputen, så de forblir chromium-only. Lokal `npm run test:bdd` er fortsatt den
vanlige gaten under utvikling.

Test-summaryen (`test-summary.md` / GitHub job summary) viser et **🥒 BDD-only
Run**-banner øverst når `run_bdd=true`, på samme måte som `🏷️ Docker Image Tags`
og `🎚️ Unleash Toggle Overrides`, slik at det er lett å se at en kjøring var
bdd-only.


---

## Konvensjoner (for å utvide eksempelet)

- **Én steps-fil per feature-fil.** playwright-bdd sitt step-register er globalt —
  hver step-tekst må være unik. Grep `atdd/steps/` før du legger til en step.
- **`# language: no`** i alle feature-filer. Ikke aktiver `matchKeywords`.
- **Tekniske koder lekker ikke inn i Lag 1.** Lesbare navn («nye opplysninger»,
  «Australia artikkel 9 nr. 3») mappes til enum/koder inne i DSL-en.
- **Driveren er tilstandsløs.** Metodene tar verdier som argumenter og RETURNERER
  det de fanger (behandlingId, medlPeriodeId). Delt flyt-tilstand bor som private
  felt på DSL-en (fersk per scenario via fixturen) — ingen egen DslContext.
- **Driveren absorberer system-quirks.** F.eks. re-velges arbeidsgiver/bestemmelse
  eksplisitt ved nyvurdering fordi mock-pre-valget racer — DSL/feature slipper å
  vite om det.
- **Infrastruktur bor i driveren, ikke DSL-en.** Login (auth), prosess-venting/
  timeouts og reload-retry er teknisk system-kommunikasjon → Lag 3. DSL-en verken
  kaller eller *nevner* auth/timeout/implementasjons-status (heller ikke i docstrings/
  kommentarer). Fixturen eier cleanup/logging/lifecycle, ikke login.
- **Farley-1:1 = ett domenebegrep, ikke ett driver-kall.** En DSL-metode kan komponere
  flere driver-handlinger (`opprettBehandling` = `opprettFørstegangssak` +
  `åpneNyesteBehandling`) og forblir 1:1 med domenet. Komposisjon er *ikke* et brudd;
  teknisk detalj som lekker inn er det.

---

## Referanser

- [ATTD-goal.md](ATTD-goal.md) — hvorfor vi gjør dette
- [ATDD-refactor-plan.md](ATDD-refactor-plan.md) — bredere migrasjonsplan (revidert 2026-07-07; les merknaden på toppen)
- [Dave Farleys kurseksempler](https://github.com/davef77/atdd-course-examples)
- [playwright-bdd](https://github.com/vitalets/playwright-bdd)
