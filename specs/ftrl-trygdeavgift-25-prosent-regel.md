# TEST-SPEC: FTRL Trygdeavgift — 25%-regelen og minstebeløp

## Forretningskontekst

Når en frivillig medlem har inntekt over en viss grense, beregnes trygdeavgiften
normalt med en prosentvis sats (f.eks. 6,8 %). Men den totale avgiften kan ikke
overstige 25 % av inntekten som overstiger minstebeløpet (ca. 69 650 kr i 2025).
Denne begrensningen kalles **25%-regelen**.

Når 25%-regelen slår inn, erstatter beregningsservicen flere ordinære
trygdeavgiftsperioder med **én samlet periode** som:
- Har `sats = null` (ikke en prosentverdi — avgiften er beregnet som totalbeløp)
- Har `beregningstype = TJUEFEM_PROSENT_REGEL`
- Refererer **alle** underliggende grunnlag via `grunnlagListe` (ikke bare det siste)

I tillegg finnes **minstebeløp-tilfellet**: dersom inntekten er under minstebeløpet,
skal det ikke betales trygdeavgift. Perioden lagres med `beregningstype = MINSTEBELOEP`,
`sats = null`, og `månedsavgift = 0 kr`.

**Hva dette betyr for UI-et:**
- Sats-kolonnen i avgiftstabellen viser `*` for minstebeløp og `**` for 25%-regelen
  (i stedet for en tallverdi)
- Forklaringstekster vises under tabellen når disse reglene er brukt
- I vedtaksbrevet brukes samme symboler med fotnoter (jf. vedtaksmal V.14)

**Confluence:** [Eksempler på fastsettelse av trygdeavgift](https://confluence.adeo.no/spaces/TEESSI/pages/535938349)
| [25%-regelen](https://confluence.adeo.no/spaces/TEESSI/pages/704156896)

**Jira:** [MELOSYS-7588](https://jira.adeo.no/browse/MELOSYS-7588)
| [MELOSYS-7969](https://jira.adeo.no/browse/MELOSYS-7969)
| [MELOSYS-7530](https://jira.adeo.no/browse/MELOSYS-7530) (frontend)

## Forutsetninger

- Testbruker: `USER_ID_VALID` (konstant — `30056928150`, "TRIVIELL KARAFFEL")
- Saksbehandler er innlogget
- Feature toggle for 25%-regelen er aktivert i beregningsservicen
- `melosys-trygdeavgift-beregning` er deployet med grunnlagListe-støtte
- `melosys-api` er deployet med TrygdeavgiftsperiodeGrunnlag-entiteten
- Frontend (MELOSYS-7530) er deployet med beregningstype-visning
- Sak opprettes med: `FTRL` / `MEDLEMSKAP_LOVVALG` / `YRKESAKTIV` / `FØRSTEGANG` / `SØKNAD`

## Arbeidsflyt (steg som skal testes)

### Scenario 1: 25%-regelen begrenser avgiften

1. Logg inn som saksbehandler
2. Opprett standardsak for testbruker (FTRL / YRKESAKTIV / FØRSTEGANG)
3. Vent på prosessinstanser
4. Fyll ut Medlemskap-steget:
   - Periode: `01.01.2025` til `31.12.2025`
   - Land: `Afghanistan` (eller annet ikke-EØS-land)
   - Bestemmelse: `§ 2-8 første ledd a` (frivillig, yrkesaktiv i utlandet)
   - Trygdedekning: `FULL_DEKNING_FTRL`
5. Bekreft og fortsett til Trygdeavgift-steget
6. Fyll ut skatteforhold:
   - Skattepliktig: `Nei`
7. Fyll ut inntektsopplysninger:
   - Inntektskilde: `INNTEKT_FRA_UTLANDET`
   - Bruttoinntekt per måned: `8000` (96 000 kr/år — over minstebeløp, men lav nok
     slik at 25%-regelen begrenser: (96 000 - 69 650) × 25% = 6 587 < ordinær avgift)
8. Verifiser at beregningen viser:
   - Sats-kolonnen viser `**` (ikke et tall)
   - Forklaringstekst om 25%-regelen er synlig
   - Avgiftsbeløp er positivt
9. Bekreft og fortsett
10. Fatt vedtak
11. Verifiser vedtaksbrevet

### Scenario 2: Inntekt under minstebeløpet

1-6. Som scenario 1
7. Fyll ut inntektsopplysninger:
   - Inntektskilde: `INNTEKT_FRA_UTLANDET`
   - Bruttoinntekt per måned: `4000` (48 000 kr/år — under minstebeløp ca. 69 650 kr)
8. Verifiser at beregningen viser:
   - Sats-kolonnen viser `*` (ikke et tall)
   - Forklaringstekst om minstebeløp er synlig
   - Avgiftsbeløp er `0 kr`
9. Bekreft og fortsett
10. Fatt vedtak

### Scenario 3: Ordinær beregning (ingen begrensning)

1-6. Som scenario 1
7. Fyll ut inntektsopplysninger:
   - Inntektskilde: `INNTEKT_FRA_UTLANDET`
   - Bruttoinntekt per måned: `30000` (360 000 kr/år — høy nok til at ordinær sats gjelder)
8. Verifiser at beregningen viser:
   - Sats-kolonnen viser en tallverdi (f.eks. `6.80`)
   - Ingen forklaringstekst om 25%-regel eller minstebeløp
   - Avgiftsbeløp er positivt

## Forventede garantier (assertions)

### UI — Scenario 1 (25%-regel)
- Beregnings-API (`/trygdeavgift/beregning`) returnerer 200
- Sats-kolonnen viser `**` (symbol, ikke tallverdi)
- Forklaringstekst: "Trygdeavgiften kan maks utgjøre 25 % av inntekten som overstiger minstebeløpet"
- Avgiftsbeløp per måned er positivt
- Vedtak fattes uten feil

### UI — Scenario 2 (minstebeløp)
- Sats-kolonnen viser `*` (symbol)
- Forklaringstekst: "Inntekten er lavere enn minstebeløpet for trygdeavgift"
- Avgiftsbeløp er `0 kr`

### UI — Scenario 3 (ordinær)
- Sats-kolonnen viser et desimaltall (f.eks. `6.80`)
- Ingen forklaringstekster om begrensningsregler

### API (kan verifiseres via nettverks-interceptering)
- `beregningstype` i API-respons er:
  - `TJUEFEM_PROSENT_REGEL` for scenario 1
  - `MINSTEBELOEP` for scenario 2
  - `null` (eller `ORDINAER`) for scenario 3
- `sats` i API-respons er `null` for scenario 1 og 2, tallverdi for scenario 3
- `grunnlagListe` inneholder minst 1 element for scenario 1

### Database (via API eller direkte sjekk)
- `trygdeavgiftsperiode.beregningstype` er korrekt lagret
- `trygdeavgiftsperiode.trygdesats` er `NULL` for scenario 1 og 2
- `trygdeavgiftsperiode_grunnlag`-tabellen har rader for den begrensede perioden

## Kjente edge cases (ikke dekket av denne speken)

- Flere inntektskilder med ulik sats (f.eks. utenlandsinntekt + næringsinntekt)
- Perioder som krysser årsskifte (25%-regelen beregnes per år)
- EØS-pensjonist med 25%-regel (egen beregningsservice)
- Misjonærinntekt kombinert med ordinær inntekt
- Satsendring midt i perioden (aldersovergang gir ulik sats per halvår)
- Årsavregning der 25%-regelen slår inn på endelig avgift
- Ny vurdering (ReplikerBehandlingsresultat) av sak med 25%-regel

## Tekniske referanser

- **Test-fil:** (ikke implementert ennå — avhenger av MELOSYS-7530)
- **Page Objects:** `TrygdeavgiftPage` (trenger utvidelse for beregningstype-visning),
  `VedtakPage`, `OpprettNySakPage`, `HovedsidePage`, `MedlemskapPage`
- **Backend-endringer:**
  - `melosys-trygdeavgift-beregning`: PR #379 (grunnlagListe, beregningstype, nullable sats)
  - `melosys-api`: PR #3273 (TrygdeavgiftsperiodeGrunnlag, Flyway V150, dual-read)
- **Frontend-oppgave:** [MELOSYS-7530](https://jira.adeo.no/browse/MELOSYS-7530) —
  Tilpasse visning av beregning og grunnlag (Figma-skisser tilgjengelig)
- **Vedtaksmal:** V.14 — bruker `*`/`**` symboler med fotnoter
