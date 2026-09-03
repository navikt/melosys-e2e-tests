# Utenfor avtaleland-tester (Folketrygdloven)

Tester for saker der Norge ensidig vurderer medlemskap etter **folketrygdloven** —
sakstema **«Utenfor avtaleland (ftrl)»** i Melosys (Confluence 371924130). Dette er
søsken-domenet til `eu-eos` og `trygdeavtale`; her finnes ingen EØS-forordning eller
bilateral trygdeavtale som styrer lovvalget.

> **Navn vs. teknisk kode:** Mappa heter `utenfor-avtaleland` (det faglige sakstema-navnet),
> men den tekniske **sakstype**-enumen i UI/kode er fortsatt `FTRL`. Derfor beholder de
> folketrygdlov-spesifikke testene `ftrl-`-prefikset i filnavnet — det signaliserer lovhjemmel,
> ikke domenemappe.

## Sakstype og oppsett

Alle disse testene bruker:
- **Sakstype:** `FTRL`
- **Sakstema:** `MEDLEMSKAP_LOVVALG`
- **Behandlingstema:** `YRKESAKTIV`
- **Testbruker:** `USER_ID_VALID` (30056928150, "TRIVIELL KARAFFEL")

Opprett sak via `OpprettNySakPage.opprettStandardSak(USER_ID_VALID)`.

## Stegflyt

Behandlingen går gjennom disse stegene i rekkefølge:

```
Inngang (Medlemskap) → Virksomhet (Arbeidsforhold) → Bestemmelse (Lovvalg)
  → Perioder (ResultatPeriode) → Trygdeavgift → Vedtak
```

### Viktige kombinasjoner

Trygdedekning og bestemmelse MÅ være kompatible:

| Trygdedekning | Kompatible bestemmelser |
|---|---|
| `FULL_DEKNING_FTRL` | § 2-1, § 2-2, § 2-5 (alle), § 2-7, § 2-7a |
| `FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON` | § 2-8 a/b/c/d, § 2-8 andre ledd |

`FULL_DEKNING_FTRL` er **ikke** kompatibel med § 2-8 (frivillig medlemskap).

### Perioder

- Perioder MÅ inkludere **inneværende år** — ellers viser Trygdeavgift-steget
  kun "skal fastsettes på årsavregning"-melding uten inputfelt.
- Bruk `TestPeriods.currentYearPeriod` / `TestPeriods.standardPeriod` fra `helpers/date-helper.ts`.

### Lovvalg § 2-8 første ledd a

Brukes for frivillig medlemskap (yrkesaktiv i utlandet). Krever svar på:
```typescript
await lovvalg.velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A');
await lovvalg.svarJaPaaFørsteSpørsmål();
await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst');
await lovvalg.svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til');
```

### Resultat Periode med split dekning

`FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON` oppretter flere perioder (helse + pensjon).
Bruk `resultatPeriode.fyllUtResultatPeriode('INNVILGET')` som håndterer overlap automatisk.

### Trygdeavgift med INNTEKT_FRA_UTLANDET

For inntektskilde `INNTEKT_FRA_UTLANDET` MÅ `Betales aga?` besvares:
```typescript
await trygdeavgift.velgInntektskilde('INNTEKT_FRA_UTLANDET');
await trygdeavgift.velgBetalesAga(false);  // Må settes FØR bruttoinntekt
await trygdeavgift.fyllInnBruttoinntektMedApiVent('8000');
```

## Feature toggles

| Toggle | Tjeneste | Effekt |
|---|---|---|
| `melosys.trygdeavgift.25-prosentregel` | melosys-trygdeavgift-beregning | Aktiverer 25%-regel og minstebeløp-beregning |

Aktiver med `UnleashHelper`:
```typescript
const unleash = new UnleashHelper(request);
await unleash.enableFeature('melosys.trygdeavgift.25-prosentregel');
```

## 25%-regelen og minstebeløp

Når 25%-regelen er aktiv, viser sats-kolonnen symboler i stedet for tall:

| Symbol | Beregningstype | Betyr |
|---|---|---|
| `*` | `TJUEFEM_PROSENT_REGEL` | Avgiften begrenses av 25%-regelen |
| `**` | `MINSTEBELOEP` | Inntekten er under minstebeløpet |
| Tall | `ORDINAER` / null | Ordinær sats |

Forklaringstekster vises i `div.forklaringstekster` under tabellen.

Minstebeløp for 2026: **99 650 kr** (se `V6.0__minstebeloep.sql` i melosys-trygdeavgift-beregning).

### Taket måles pr. avgiftsdel — ikke på summen

For frivillig medlemskap måles helsedelen og pensjonsdelen hver for seg mot **ett** felles tak.
En del begrenses kun hvis den *alene* overstiger det, så summen kan godt ligge over taket uten
at noen begrensning inntreffer. To ting følger av det når du skriver tester:

- **`Betales aga?` bestemmer om grenen i det hele tatt er nåbar.** Med aga = Nei er
  pensjonssatsen 26,3 % (2026) — over 25 % — og pensjonsdelen blir da alltid begrenset.
  Med aga = Ja er satsene 6,8 % / 19,4 %, begge under 25 %, og «ingen del begrenset» er mulig.
  Satsene ligger i `trygdeavgift-beregning.frivillig_medlemskap_sats` i postgres. Det er aga
  som avgjør, ikke MED/UTEN-varianten av dekningen: tilleggssatsene (sykepenger,
  yrkesskadetrygd) er 0 når aga betales, så MED og UTEN gir samme beløp da.
- **`ordinaerAvgiftPerDel` fylles KUN når ingen del ble begrenset** (`ingenDelErBegrenset` i
  `BeregningService`). Treffer minst én del taket, splittes svaret i én forklaring pr. del og
  lista er tom.

### Forklaringskortet vises kun når en særregel slo ut

`forklaringerSomSkalVises` i melosys-web skjuler hele «Beregningsforklaring»-kortet med mindre
minst én inntektsgruppe traff 25 %-regelen eller minstebeløpet — alt eller ingenting pr. kort.
En ren ORDINÆR-sak gir altså ikke noe kort i det hele tatt.

For å se en ORDINÆR-forklaring i nettleseren trenger du derfor et **annet** år eller en annen
inntektsgruppe i samme behandling som treffer en særregel. Perioden må da krysse årsskiftet
**framover** (f.eks. 01.11.i år – 31.12.neste år): tidligere år klippes bort av
trygdeavgiftssteget med varselet «skal fastsettes på årsavregning».

Merk også at Perioder-steget som standard innvilger pensjonsdelen først fra *dagens dato* når
perioden er påbegynt — en periode som starter i fortiden gir derfor kortere pensjonsdel enn
helsedel, og andre beløp enn en ren framtidig periode.

## Testfiler

| Fil | Dekker |
|---|---|
| `komplett-sak-2-8a.spec.ts` | § 2-8 første ledd a (arbeidstaker) + full trygdedekning/arbeidsinntekt |
| `komplett-sak-2-8b-student.spec.ts` | § 2-8 første ledd b (student) |
| `komplett-sak-flere-land-arbeidsinntekt.spec.ts` | Flere land, arbeidsinntekt |
| `komplett-sak-flere-land-arbeidsinntekt-nyvurdering-annullering.spec.ts` | Flere land → nyvurdering → annullering |
| `komplett-sak-flere-land-flereinntektskilder.spec.ts` | Flere inntektskilder |
| `nyvurdering-endring-skattestatus.spec.ts` | Nyvurdering ved endret skattestatus |
| `ftrl-yrkesaktiv-2-2-forstegang.spec.ts` | § 2-2 yrkesaktiv, ren førstegangsbehandling (OPPRETT_FAKTURASERIE) |
| `ftrl-manglende-innbetaling-opphor.spec.ts` | Manglende innbetaling → opphør av frivillig medlemskap |
| `ftrl-trygdeavgift-25-prosent-regel.spec.ts` | 25%-regelen: sats-symboler og forklaringstekster |
| `ftrl-trygdeavgift-beregningsforklaring-per-del.spec.ts` | MELOSYS-8171: ordinær avgift pr. avgiftsdel i beregningsforklaringen (trygdeavgift-beregning → api → web) |
| `klage/ftrl-klage.spec.ts` | Klagebehandling på FTRL-sak |

Discovery-/valideringsnotater for lovvalg og trygdeavgift ligger under `docs/`.

## Specs

Test-spesifikasjoner finnes under `specs/`:
- `specs/ftrl-trygdeavgift-25-prosent-regel.md` — 25%-regelen
- `specs/ftrl-opphor-fritekst-autolagring.md` — autolagring av fritekst i opphørsvedtak (MELOSYS-8141, bundet til `ftrl-manglende-innbetaling-opphor.spec.ts`)
- `specs/ftrl-yrkesaktiv-full-dekning.md` — Full dekning FTRL
- `specs/ftrl-aarsavregning.md` — Årsavregning
