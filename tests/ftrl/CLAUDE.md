# FTRL-tester (Folketrygdloven)

Tester for saker opprettet under Folketrygdloven (FTRL), altså "utenfor avtaleland"-saker
der Norge ensidig vurderer medlemskap.

## Sakstype og oppsett

Alle FTRL-tester bruker:
- **Sakstype:** `FTRL`
- **Sakstema:** `MEDLEMSKAP_LOVVALG`
- **Behandlingstema:** `YRKESAKTIV`
- **Testbruker:** `USER_ID_VALID` (30056928150, "TRIVIELL KARAFFEL")

Opprett sak via `OpprettNySakPage.opprettStandardSak(USER_ID_VALID)`.

## Stegflyt

FTRL-behandlingen går gjennom disse stegene i rekkefølge:

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
- Bruk `TestPeriods.currentYearPeriod` fra `helpers/date-helper.ts`.

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

## Testfiler

| Fil | Dekker |
|---|---|
| `ftrl-trygdeavgift-25-prosent-regel.spec.ts` | 25%-regelen: sats-symboler og forklaringstekster |
| `ftrl-yrkesaktiv-full-dekning-medlemskap.spec.ts` | Medlemskap-steg med FULL_DEKNING_FTRL |
| `klage/ftrl-klage.spec.ts` | Klagebehandling på FTRL-sak |

## Specs

Test-spesifikasjoner finnes under `specs/`:
- `specs/ftrl-trygdeavgift-25-prosent-regel.md` — 25%-regelen
- `specs/ftrl-yrkesaktiv-full-dekning.md` — Full dekning FTRL
- `specs/ftrl-aarsavregning.md` — Årsavregning
