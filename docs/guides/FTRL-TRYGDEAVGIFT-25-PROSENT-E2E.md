# E2E-implementasjonsguide: FTRL Trygdeavgift — 25%-regelen og minstebeløp

**Spec:** [`specs/ftrl-trygdeavgift-25-prosent-regel.md`](../../specs/ftrl-trygdeavgift-25-prosent-regel.md)
**Frontend:** [MELOSYS-7530](https://jira.adeo.no/browse/MELOSYS-7530)
**Backend:** [MELOSYS-7588](https://jira.adeo.no/browse/MELOSYS-7588) + [MELOSYS-7969](https://jira.adeo.no/browse/MELOSYS-7969)

---

## Hva skal testes

Frontend viser nå `*`/`**` i sats-kolonnen i stedet for tallverdi når 25%-regelen eller minstebeløp gjelder,
pluss forklarende fotnoter under tabellen. Tre scenarioer:

| Scenario | Bruttoinntekt md. | Sats-kolonne | Fotnote |
|----------|------------------|--------------|---------|
| 25%-regel | `8000` (96 000/år) | `**` | "Trygdeavgiften kan maks utgjøre 25 %..." |
| Minstebeløp | `4000` (48 000/år) | `*` | "Inntekten er lavere enn minstebeløpet..." |
| Ordinær | `30000` (360 000/år) | f.eks. `6.80` | Ingen |

---

## Page Objects som brukes

Alle POM-er finnes allerede. Ingen nye page objects trengs.

### Eksisterende

| Page Object | Fil | Brukes til |
|------------|-----|------------|
| `HovedsidePage` | `pages/hovedside.page.ts` | Navigasjon, opprett ny sak |
| `OpprettNySakPage` | `pages/opprett-ny-sak/opprett-ny-sak.page.ts` | Standard FTRL-sak |
| `MedlemskapPage` | `pages/behandling/medlemskap.page.ts` | Periode, land, trygdedekning |
| `TrygdeavgiftPage` | `pages/trygdeavgift/trygdeavgift.page.ts` | Skatteforhold, inntekt, beregning |
| `VedtakPage` | `pages/vedtak/vedtak.page.ts` | Fatte vedtak |

### Assertions som trengs utvidelse

`TrygdeavgiftAssertions` (`pages/trygdeavgift/trygdeavgift.assertions.ts`) trenger nye metoder:

```typescript
// Ny metode: Verifiser at sats-kolonnen viser symbol i stedet for tall
async verifiserBeregningstype(
  radIndex: number,
  forventetSats: string  // '*', '**', eller tallverdi som '6.80'
): Promise<void> {
  const table = this.page.locator('table').filter({
    has: this.page.getByText('Trygdeperiode')
  });
  await expect(table).toBeVisible({ timeout: 5000 });

  const row = table.locator('tbody tr').nth(radIndex);
  // Sats er kolonne 4 (index 3) med Dekning-kolonne, eller 3 (index 2) uten
  const satsCell = row.locator('td.tall_felt').first();
  await expect(satsCell).toHaveText(forventetSats);
}

// Ny metode: Verifiser fotnoter under tabellen
async verifiserForklaringstekst(tekst: string | RegExp): Promise<void> {
  const forklaring = this.page.locator('.forklaringstekster');
  await expect(forklaring).toBeVisible({ timeout: 5000 });
  await expect(forklaring).toContainText(
    typeof tekst === 'string' ? tekst : tekst
  );
}

// Ny metode: Verifiser at fotnoter IKKE vises
async verifiserIngenForklaringstekster(): Promise<void> {
  const forklaring = this.page.locator('.forklaringstekster');
  await expect(forklaring).not.toBeVisible({ timeout: 2000 });
}
```

---

## Teststruktur

### Filplassering

```
tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts
```

### Skjelett

```typescript
import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { MedlemskapPage } from '../../pages/behandling/medlemskap.page';
import { TrygdeavgiftPage } from '../../pages/trygdeavgift/trygdeavgift.page';
import { VedtakPage } from '../../pages/vedtak/vedtak.page';
import { USER_ID_VALID } from '../../pages/shared/constants';
import { waitForProcessInstances } from '../../helpers/api-helper';

test.describe('FTRL Trygdeavgift — 25%-regelen og minstebeløp', () => {

  // Felles oppsett: opprett FTRL-sak og fyll ut Medlemskap
  async function opprettSakOgFyllMedlemskap(page) {
    const auth = new AuthHelper(page);
    await auth.login();

    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    const medlemskap = new MedlemskapPage(page);

    // Opprett standardsak (FTRL / YRKESAKTIV / FØRSTEGANG / SØKNAD)
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.opprettStandardSak(USER_ID_VALID);
    await opprettSak.assertions.verifiserBehandlingOpprettet();

    // Vent på prosessinstanser
    await waitForProcessInstances(page.request, 30);
    await hovedside.goto();
    await page
      .getByRole('link', { name: new RegExp(`${USER_ID_VALID}`) })
      .first()
      .click();

    // Medlemskap: Full dekning, Afghanistan, 2025
    await medlemskap.velgPeriode('01.01.2025', '31.12.2025');
    await medlemskap.velgLand('Afghanistan');
    await medlemskap.velgTrygdedekning('FULL_DEKNING_FTRL');
    await medlemskap.klikkBekreftOgFortsett();

    return { hovedside, auth };
  }

  test('scenario 1: 25%-regelen begrenser avgiften', async ({ page }) => {
    test.setTimeout(120000);
    await opprettSakOgFyllMedlemskap(page);

    const trygdeavgift = new TrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('8000');

    // Assertions
    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    await trygdeavgift.assertions.verifiserBeregningstype(0, '**');
    await trygdeavgift.assertions.verifiserForklaringstekst(
      'Trygdeavgiften kan maks utgjøre 25 % av inntekten som overstiger minstebeløpet'
    );

    // Fullfør og fatt vedtak
    await trygdeavgift.klikkBekreftOgFortsett();
    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });

  test('scenario 2: inntekt under minstebeløpet', async ({ page }) => {
    test.setTimeout(120000);
    await opprettSakOgFyllMedlemskap(page);

    const trygdeavgift = new TrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('4000');

    // Assertions
    await trygdeavgift.assertions.verifiserBeregningstype(0, '*');
    await trygdeavgift.assertions.verifiserForklaringstekst(
      'Inntekten er lavere enn minstebeløpet for trygdeavgift'
    );

    await trygdeavgift.klikkBekreftOgFortsett();
    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });

  test('scenario 3: ordinær beregning, ingen begrensning', async ({ page }) => {
    test.setTimeout(120000);
    await opprettSakOgFyllMedlemskap(page);

    const trygdeavgift = new TrygdeavgiftPage(page);
    await trygdeavgift.ventPåSideLastet();
    await trygdeavgift.velgSkattepliktig(false);
    await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
    await trygdeavgift.fyllInnBruttoinntektMedApiVent('30000');

    // Assertions
    await trygdeavgift.assertions.verifiserTrygdeavgiftBeregnet();
    // Sats skal være et tall, ikke * eller **
    await trygdeavgift.assertions.verifiserBeregningstype(0, /^\d/);
    await trygdeavgift.assertions.verifiserIngenForklaringstekster();

    await trygdeavgift.klikkBekreftOgFortsett();
    const vedtak = new VedtakPage(page);
    await vedtak.klikkFattVedtak();
  });
});
```

---

## API-interceptering (valgfritt, anbefalt)

For å verifisere at API-responsen inneholder riktig `beregningstype` kan man intercepte responsene:

```typescript
// Sett opp interceptering FØR bruttoinntekt-feltet fylles ut
let apiResponse: any = null;
page.on('response', async (response) => {
  if (response.url().includes('/trygdeavgift/beregning') && response.status() === 200) {
    apiResponse = await response.json();
  }
});

// ... fyll inn bruttoinntekt ...

// Sjekk API-respons
expect(apiResponse.trygdeavgiftsperioder[0].beregningstype).toBe('TJUEFEM_PROSENT_REGEL');
expect(apiResponse.trygdeavgiftsperioder[0].avgiftssats).toBeNull();
```

---

## Kjernepunkter og fallgruver

### 1. API-vent er kritisk

Bruttoinntekt-feltet trigger `/trygdeavgift/beregning` ved blur (Tab). Bruk ALLTID
`fyllInnBruttoinntektMedApiVent()` — aldri `fyllInnBruttoinntekt()` etterfulgt av assertions.
Ellers vil assertions kjøre mot gammel/tom tilstand.

### 2. Sats-kolonneposisjon varierer

Tabellen har forskjellig antall kolonner avhengig av om Dekning-kolonnen vises:
- Med dekning (standard FTRL): Trygdeperiode | Dekning | Inntektskilde | **Sats** | Avgift → index 3
- Uten dekning (EØS-pensjonist): Trygdeperiode | Inntektskilde | **Sats** | Avgift → index 2

Bruk `td.tall_felt` i stedet for fast indeks for robusthet.

### 3. Beregningsrespons avhenger av backend

Beregningen (`beregningstype`, nullable `sats`) gjøres av `melosys-trygdeavgift-beregning`.
Lokalt brukes mock i `melosys-docker-compose`. Sjekk at mocken returnerer riktig
`beregningstype` for de ulike inntektsnivåene — dette kan kreve oppdatering av mock-konfigurasjonen.

### 4. Fotnoter bruker CSS-klasse

Forklaringstekstene ligger i `div.forklaringstekster` under tabellen.
Denne klassen er definert i `trygdeavgiftsperioderTabell.less`.

### 5. Skattepliktig-debounce

`velgSkattepliktig()` har innebygd vent for 500ms debounce + API. Ikke legg til ekstra
`waitForTimeout` etter denne.

---

## Avhengigheter for å kjøre testene

| Komponent | Hva trengs | Status |
|-----------|-----------|--------|
| `melosys-web` | MELOSYS-7530 deployet (beregningstype-visning) | Branch: `feature/7530-25prosent-regel-visning` |
| `melosys-api` | PR #3273 merget (TrygdeavgiftsperiodeDto med beregningstype) | Sjekk status |
| `melosys-trygdeavgift-beregning` | Støtte for 25%-regel og minstebeløp | Sjekk status |
| `melosys-mock` | Mock returnerer beregningstype i respons | Kan trenge oppdatering |

### Mock-oppdatering

Hvis mock-servicen ikke returnerer `beregningstype` i trygdeavgift-beregnings-responsen,
må `melosys-docker-compose/mock` oppdateres. Sjekk:

```bash
# I melosys-docker-compose
grep -r "beregningstype" mock/
grep -r "trygdeavgift/beregning" mock/
```

---

## Sjekkliste

- [ ] Utvid `TrygdeavgiftAssertions` med `verifiserBeregningstype()`, `verifiserForklaringstekst()`, `verifiserIngenForklaringstekster()`
- [ ] Opprett testfil `tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts`
- [ ] Verifiser at mock returnerer korrekt `beregningstype` for de 3 scenarioene
- [ ] Kjør testene lokalt med `pnpm test:e2e tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts`
- [ ] Verifiser at testene passerer i CI
