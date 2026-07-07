# ATDD Proof of Concept — Trygdeavtale

Omstrukturering av én test etter Dave Farleys fire-lags ATDD-modell.
Mønsteret er hentet fra [atdd-course-examples](https://github.com/davef77/atdd-course-examples).

---

## Før og etter

### Før — `tests/trygdeavtale/trygdeavtale-fullfort-vedtak.spec.ts`

TypeScript-kode som blander *hva* og *hvordan*. En fagekspert kan ikke lese dette.

```typescript
test('skal fullføre trygdeavtale-arbeidsflyt med vedtak', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const behandling = new TrygdeavtaleBehandlingPage(page);
    const arbeidssted = new TrygdeavtaleArbeidsstedPage(page);
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('TRYGDEAVTALE');
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema('YRKESAKTIV');
    await opprettSak.velgAarsak('SØKNAD');
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await opprettSak.assertions.verifiserBehandlingOpprettet();
    await page.getByRole('link', { name: 'TRIVIELL KARAFFEL -' }).click();
    await behandling.fyllUtPeriodeOgLand('01.01.2024', '01.01.2026', 'AU');
    await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
    await behandling.innvilgeOgVelgBestemmelse('AUS_ART9_3');
    await arbeidssted.fyllUtArbeidsstedOgFattVedtak('Test');
    await waitForProcessInstances(page.request, 60);
    await behandling.assertions.verifiserBehandlingAvsluttet({
      forventetIverksettProsess: 'IVERKSETT_VEDTAK_TRYGDEAVTALE',
    });
});
```

### Etter — `features/trygdeavtale/trygdeavtale-vedtak.feature`

Strukturert tekst på norsk. En saksbehandler kan lese og verifisere dette.

```gherkin
# language: no
Egenskap: Trygdeavtale - fatte vedtak om medlemskap
  Som saksbehandler
  ønsker jeg å behandle en søknad om medlemskap som gjelder et land Norge har en trygdeavtale med
  slik at søker får et vedtak om medlemskap

  Scenario: Fullføre trygdeavtale-behandling med vedtak
    Gitt en opprettet trygdeavtale-behandling
    Når saksbehandler fatter vedtak med resultat "INNVILGET"
    Så blir behandlingen fullført og søknad innvilget
```

---

## De fire lagene

```
┌─────────────────────────────────────────────────────────────┐
│  Lag 1 — TESTTILFELLE (features/)                           │
│  Gherkin .feature-filer på norsk.                           │
│  Ikke kode. Lesbart for fageksperter.                       │
│  playwright-bdd verifiserer at feature matcher kode.        │
├─────────────────────────────────────────────────────────────┤
│  Lag 2 — DSL + BINDINGER (atdd/)                            │
│  TrygdeavtaleDsl: domenespråk, ingen POM-kjennskap.         │
│  Steps: lim som kobler Gherkin → DSL (én linje per steg).   │
├─────────────────────────────────────────────────────────────┤
│  Lag 3 — PROTOKOLLDRIVERE (atdd/drivers/, pages/, helpers/) │
│  TrygdeavtaleDriver: oversetter domene → POM-kall.          │
│  POMs, database-hjelpere, auth, cleanup.                    │
├─────────────────────────────────────────────────────────────┤
│  Lag 4 — SYSTEM UNDER TEST (docker-compose)                 │
│  17 tjenester som speiler produksjon.                       │
└─────────────────────────────────────────────────────────────┘
```

### Filstruktur

```
features/
  trygdeavtale/
    trygdeavtale-vedtak.feature        ← Lag 1: Spesifikasjonen

atdd/
  trygdeavtale.dsl.ts                  ← Lag 2: DSL (ingen POM-imports)
  fixtures.ts                          ← Lag 2: Kobler driver → DSL → Playwright
  steps/
    trygdeavtale.steps.ts              ← Lag 2: Binding — Gherkin → DSL
  drivers/
    trygdeavtale.driver.ts             ← Lag 3: Protokolldriver (POM-orkestrering)

pages/                                 ← Lag 3: POMs (uendret)
helpers/                               ← Lag 3: Hjelpere (uendret)
```

---

## Hvordan lagene henger sammen

```
Feature-fil                Steps (lim)                 DSL (Lag 2)               Driver (Lag 3)
─────────────────────      ─────────────────────       ─────────────────────     ──────────────────
"Gitt en opprettet         Given('en opprettet...',    opprettBehandling() {     loggInn()
 trygdeavtale-behandling"    ({ trygdeavtale }) =>       driver.loggInn()        navigerTilOpprettSak()
                               trygdeavtale               driver.navigerTil...    opprettSak()
                                 .opprettBehandling()      driver.opprettSak()    navigerTilBehandling()
                             )                             driver.navigerTil...
                                                        }

"Når saksbehandler         When('...fatter vedtak..', fattVedtak('INNVILGET') { fyllUtBehandling()
 fatter vedtak med           ({ trygdeavtale }, r) =>   driver.fyllUt...()      fattVedtak()
 resultat INNVILGET"           trygdeavtale              driver.fattVedtak()
                                 .fattVedtak(r)        }
                             )
```

### Nøkkelprinsipp: lagene kjenner kun laget under

- **Feature-fil** → kjenner bare domene-begreper
- **Steps** → kjenner bare DSL-metoder
- **DSL** → kjenner bare driver-metoder (ingen POM-imports)
- **Driver** → kjenner POMs og helpers

Hvis en UI-knapp endrer navn → kun POM og driver oppdateres.
Hvis domene-begrepet endrer seg → feature-fil, steps og DSL oppdateres.

---

## Standardverdier

Alle disse er skjult i driver-laget og POM-enes defaults:

| Verdi | TypeScript-testen | Feature-filen |
|-------|-------------------|---------------|
| Bruker-ID | `USER_ID_VALID` | (standard) |
| Sakstype | `'TRYGDEAVTALE'` | (standard) |
| Sakstema | `'MEDLEMSKAP_LOVVALG'` | (standard) |
| Behandlingstema | `'YRKESAKTIV'` | (standard) |
| Årsak | `'SØKNAD'` | (standard) |
| Periode | `'01.01.2024' - '01.01.2026'` | (standard) |
| Land | `'AU'` (Australia) | (standard) |
| Arbeidsgiver | `'Ståles Stål AS'` | (standard) |
| Bestemmelse | `'AUS_ART9_3'` | (standard) |
| Arbeidssted | `'Test'` | (standard) |

---

## Slik kjører du

```bash
# BDD-tester
npx playwright test --project=bdd

# Gamle tester (uendret)
npx playwright test --project=chromium
```

---

## Referanser

- [ATTD-goal.md](ATTD-goal.md) — Hvorfor vi gjør dette
- [ATDD-refactor-plan.md](ATDD-refactor-plan.md) — Migrasjonsplan
- [Dave Farleys kurseksempler](https://github.com/davef77/atdd-course-examples) — Originalmønsteret
- [playwright-bdd](https://github.com/vitalets/playwright-bdd) — Cucumber for Playwright
