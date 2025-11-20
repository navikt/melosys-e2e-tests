# EU/EØS Tester

Denne mappen inneholder E2E-tester for **EU/EØS** (Utsendt arbeidstaker) arbeidsflyten.

## Hva er EU/EØS?

EU/EØS-saker håndterer tilfeller hvor arbeidstakere sendes ut til EU/EØS-land. Arbeidsflyten skiller seg fra FTRL og Trygdeavtale.

## Testfiler

### `eu-eos-fullfort-vedtak.spec.ts`

**Komplett arbeidsflyt test** som dekker:
1. Opprett ny EU/EØS-sak (UTSENDT_ARBEIDSTAKER)
2. Fyll inn periode med dateplukker (år og dag)
3. Velg EU/EØS-land (f.eks. Danmark)
4. Velg Yrkesaktiv/Selvstendig
5. Velg arbeidsgiver
6. Velg arbeidstype (Lønnet arbeid/Ulønnet arbeid)
7. Svar på to spørsmål (Ja/Nei)
8. Innvilg søknad og fatt vedtak direkte

**Testresultater:** ✅ Test passerer

### `eu-eos-13.1-arbeid-flere-land-fullfort-vedtak.spec.ts`

**Komplett arbeidsflyt test for "Arbeid i flere land"** som dekker:
1. Opprett ny EU/EØS-sak (ARBEID_FLERE_LAND)
2. Fyll inn periode (Fra og Til dato)
3. Velg to land (Estland og Norge)
4. Velg årsak (SØKNAD)
5. Opprett behandling
6. Bekreft første steg
7. Velg hovedland (Norge) via radio-knapp
8. Velg arbeidsgiver (Ståles Stål AS) via checkbox
9. Svar på spørsmål om arbeidslokasjon (checkbox)
10. Velg arbeidstype (Lønnet arbeid i to eller flere land)
11. Velg prosentandel (% eller mer)
12. Fyll inn fritekst-felter (begrunnelse og ytterligere informasjon)
13. Fatt vedtak direkte

**Testresultater:** 🔄 Ny test - under testing

### `eu-eos-13.1-arbeid-flere-land-selvstendig-fullfort-vedtak.spec.ts`

**Variant av "Arbeid i flere land" med selvstendig næringsvirksomhet** som dekker:
1. Opprett ny EU/EØS-sak (ARBEID_FLERE_LAND)
2. Fyll inn periode (Fra og Til dato)
3. Velg to land (Sverige og Norge)
4. Velg årsak (SØKNAD)
5. Opprett behandling
6. Bekreft første steg
7. Velg hovedland (Norge) via radio-knapp
8. Velg arbeidsgiver (Ståles Stål AS) via checkbox
9. Svar på spørsmål om arbeidslokasjon (checkbox)
10. Velg arbeidstype (Selvstendig næringsvirksomhet i to eller flere land)
11. Velg prosentandel (% eller mer)
12. Fyll inn fritekst-felter (begrunnelse og ytterligere informasjon)
13. Velg SED-dokument (SED A003) via popup
14. Fatt vedtak direkte

**Testresultater:** 🔄 Ny test - under testing

**Forskjeller fra basis-testen:**
- Bruker **Sverige + Norge** (i stedet for Estland + Norge)
- Velger **Selvstendig næringsvirksomhet** (i stedet for Lønnet arbeid)
- Håndterer **SED-dokument popup** før vedtak

## Page Objects

### `EuEosBehandlingPage`
**Lokasjon:** `pages/behandling/eu-eos-behandling.page.ts`

Håndterer EU/EØS behandlingsflyten:
- Periode-valg med dateplukker
- Land-valg (EU/EØS-land)
- Yrkesaktiv/Selvstendig-valg
- Arbeidsgiver-valg (checkbox)
- Arbeidstype-valg (Lønnet/Ulønnet arbeid)
- Spørsmål (Ja/Nei)
- Innvilge/avslå søknad
- Fatte vedtak direkte

**Nøkkelmetoder:**
- `velgPeriodeMedDatepicker(år, dag)` - Velg periode med dateplukker
- `fyllInnSluttdato(dato)` - Fyll inn sluttdato
- `velgLand(landNavn)` - Velg EU/EØS-land
- `velgYrkesaktiv()` / `velgSelvstendig()` - Velg status
- `velgArbeidsgiver(navn)` - Velg arbeidsgiver
- `velgLønnetArbeid()` / `velgUlønnetArbeid()` - Velg arbeidstype
- `svarJa()` / `svarNei()` - Svar på spørsmål
- `innvilgeSøknad()` / `avslåSøknad()` - Velg søknadsresultat
- `fattVedtak()` - Fatt vedtak direkte
- `fyllUtEuEosBehandling()` - **Hjelpemetode** for komplett flyt

### `EuEosBehandlingAssertions`
**Lokasjon:** `pages/behandling/eu-eos-behandling.assertions.ts`

Verifiseringsmetoder for database og UI:
- `verifiserIngenFeil()` - Ingen feil på siden
- `verifiserBehandlingIDatabase(fnr)` - Verifiser behandling i DB
- `verifiserLovvalgsperiodeIDatabase(fnr, land)` - Verifiser lovvalgsperiode i DB
- `verifiserPeriodeIDatabase(fnr, fraOgMed, tilOgMed)` - Verifiser periode i DB
- `verifiserVedtakIDatabase(fnr)` - Verifiser vedtak i DB
- `verifiserKomplettBehandling(fnr, land)` - Komplett verifisering

### `ArbeidFlereLandBehandlingPage`
**Lokasjon:** `pages/behandling/arbeid-flere-land-behandling.page.ts`

Håndterer "Arbeid i flere land" behandlingsflyten:
- Velg hovedland (radio-knapp)
- Velg arbeidsgiver (checkbox)
- Svar på arbeidslokasjon-spørsmål (checkbox)
- Velg arbeidstype (Lønnet arbeid i to eller flere land)
- Velg prosentandel (% eller mer)
- Fyll inn fritekst-felter (begrunnelse og ytterligere informasjon)
- Fatte vedtak direkte

**Nøkkelmetoder:**
- `velgLandRadio(landNavn)` - Velg hovedland via radio-knapp
- `velgArbeidsgiver(navn)` - Velg arbeidsgiver (med API-venting)
- `velgArbeidUtføresILandSomEr()` - Velg arbeidslokasjon-checkbox
- `velgLønnetArbeidIToEllerFlereLand()` - Velg arbeidstype (lønnet arbeid)
- `velgSelvstendigNæringsvirksomhetIToEllerFlereLand()` - Velg arbeidstype (selvstendig)
- `velgProsentEllerMer()` - Velg prosentandel
- `fyllInnFritekstTilBegrunnelse(tekst)` - Fyll inn begrunnelse
- `fyllInnYtterligereInformasjon(tekst)` - Fyll inn ytterligere info
- `velgSedDokument(sedType)` - Velg SED-dokument via popup (f.eks. 'SED A003')
- `fattVedtak()` - Fatt vedtak direkte
- `klikkBekreftOgFortsett()` - Gå til neste steg
- `fyllUtArbeidFlereLandBehandling()` - **Hjelpemetode** for komplett flyt

### `ArbeidFlereLandBehandlingAssertions`
**Lokasjon:** `pages/behandling/arbeid-flere-land-behandling.assertions.ts`

Verifiseringsmetoder for "Arbeid i flere land" workflow:
- `verifiserIngenFeil()` - Ingen feil på siden
- `verifiserBehandlingIDatabase(fnr)` - Verifiser behandling (ARBEID_FLERE_LAND)
- `verifiserLovvalgsperiodeIDatabase(fnr, land)` - Verifiser lovvalgsperiode
- `verifiserPeriodeIDatabase(fnr, fraOgMed, tilOgMed)` - Verifiser periode
- `verifiserVedtakIDatabase(fnr)` - Verifiser vedtak
- `verifiserKomplettBehandling(fnr, land)` - Komplett verifisering

## Konstanter

### Sakstype
```typescript
import { SAKSTYPER, BEHANDLINGSTEMA } from '../../pages/shared/constants';

SAKSTYPER.EU_EOS                      // 'EU_EOS'
BEHANDLINGSTEMA.UTSENDT_ARBEIDSTAKER  // 'UTSENDT_ARBEIDSTAKER'
BEHANDLINGSTEMA.ARBEID_FLERE_LAND     // 'ARBEID_FLERE_LAND'
```

### EU/EØS Land
```typescript
import { EU_EOS_LAND } from '../../pages/shared/constants';

EU_EOS_LAND.DANMARK      // 'Danmark'
EU_EOS_LAND.SVERIGE      // 'Sverige'
EU_EOS_LAND.FINLAND      // 'Finland'
EU_EOS_LAND.TYSKLAND     // 'Tyskland'
EU_EOS_LAND.FRANKRIKE    // 'Frankrike'
EU_EOS_LAND.NEDERLAND    // 'Nederland'
EU_EOS_LAND.ESTLAND      // 'Estland'
EU_EOS_LAND.NORGE        // 'Norge'
```

## Brukseksempler

### Detaljert kontroll
```typescript
const behandling = new EuEosBehandlingPage(page);

// Steg-for-steg kontroll
await behandling.velgPeriodeMedDatepicker('2024', 'fredag 1');
await behandling.fyllInnSluttdato('01.01.2026');
await behandling.velgLand(EU_EOS_LAND.DANMARK);
await behandling.klikkBekreftOgFortsett();

await behandling.velgYrkesaktiv();
await behandling.klikkBekreftOgFortsett();

await behandling.velgArbeidsgiver('Ståles Stål AS');
await behandling.klikkBekreftOgFortsett();

await behandling.velgLønnetArbeid();
await behandling.klikkBekreftOgFortsett();

await behandling.svarJa();
await behandling.klikkBekreftOgFortsett();

await behandling.svarJa();
await behandling.klikkBekreftOgFortsett();

await behandling.innvilgeSøknad();
await behandling.klikkBekreftOgFortsett();
await behandling.fattVedtak();
```

### Hjelpemetoder
```typescript
const behandling = new EuEosBehandlingPage(page);

// Høynivå hjelpemetoder
await behandling.fyllUtPeriodeOgLand('2024', 'fredag 1', '01.01.2026', 'Danmark');
await behandling.velgYrkesaktivEllerSelvstendigOgFortsett(true);
await behandling.velgArbeidsgiverOgFortsett('Ståles Stål AS');
await behandling.velgArbeidstype(true); // Lønnet arbeid
await behandling.svarJaOgFortsett(); // Første spørsmål
await behandling.svarJaOgFortsett(); // Andre spørsmål
await behandling.innvilgeOgFattVedtak();

// Eller enda enklere - bruk standardverdier
await behandling.fyllUtEuEosBehandling();
```

### "Arbeid i flere land" workflow
```typescript
import { ArbeidFlereLandBehandlingPage } from '../../pages/behandling/arbeid-flere-land-behandling.page';
import { EuEosBehandlingPage } from '../../pages/behandling/eu-eos-behandling.page';

const euEosBehandling = new EuEosBehandlingPage(page);
const behandling = new ArbeidFlereLandBehandlingPage(page);

// Under saksopprettelse: Velg to land (bruk EuEosBehandlingPage)
await euEosBehandling.velgLand('Estland');
await euEosBehandling.velgAndreLand('Norge');

// Behandlingsflyt: Steg-for-steg kontroll
await behandling.klikkBekreftOgFortsett(); // Første steg
await behandling.velgLandRadio('Norge');
await behandling.klikkBekreftOgFortsett();
await behandling.velgArbeidsgiver('Ståles Stål AS');
await behandling.klikkBekreftOgFortsett();
await behandling.velgArbeidUtføresILandSomEr();
await behandling.klikkBekreftOgFortsett();
await behandling.velgLønnetArbeidIToEllerFlereLand();
await behandling.klikkBekreftOgFortsett();
await behandling.velgProsentEllerMer();
await behandling.klikkBekreftOgFortsett();
await behandling.fyllInnFritekstTilBegrunnelse('Lorem ipsum');
await behandling.fyllInnYtterligereInformasjon('Dodatkowo');
await behandling.fattVedtak();

// Eller bruk hjelpemetode (anbefalt)
await behandling.fyllUtArbeidFlereLandBehandling('Norge', 'Ståles Stål AS', 'Lorem ipsum', 'Dodatkowo');
```

### "Arbeid i flere land" - Selvstendig variant med SED-dokument
```typescript
import { ArbeidFlereLandBehandlingPage } from '../../pages/behandling/arbeid-flere-land-behandling.page';

const behandling = new ArbeidFlereLandBehandlingPage(page);

// Samme steg som før, men med selvstendig næringsvirksomhet
await behandling.klikkBekreftOgFortsett();
await behandling.velgLandRadio('Norge');
await behandling.klikkBekreftOgFortsett();
await behandling.velgArbeidsgiver('Ståles Stål AS');
await behandling.klikkBekreftOgFortsett();
await behandling.velgArbeidUtføresILandSomEr();
await behandling.klikkBekreftOgFortsett();

// Forskjell: Velg selvstendig næringsvirksomhet
await behandling.velgSelvstendigNæringsvirksomhetIToEllerFlereLand();
await behandling.klikkBekreftOgFortsett();

await behandling.velgProsentEllerMer();
await behandling.klikkBekreftOgFortsett();
await behandling.fyllInnFritekstTilBegrunnelse('Begrunnelse tekst');
await behandling.fyllInnYtterligereInformasjon('Ytterligere informasjon');

// Forskjell: Håndter SED-dokument popup før vedtak
await behandling.velgSedDokument('SED A003');

// Fatt vedtak
await behandling.fattVedtak();
```

## Viktige forskjeller mellom EU/EØS workflows

### EU/EØS vs FTRL og Trygdeavtale (generelt)

1. **Dateplukker** - Bruker år-velger og dag-velger (ikke bare tekstfelt)
2. **Land-dropdown** - Bruker CSS-locator (`.css-19bb58m`) i stedet for label
3. **Yrkesaktiv/Selvstendig** - Eget steg med radio-knapper
4. **Arbeidsgiver** - Bruker **checkbox** i stedet for radio-knapp
5. **Arbeidstype** - Lønnet arbeid vs Ulønnet arbeid
6. **Spørsmål** - To separate Ja/Nei-spørsmål
7. **Ingen egen vedtaksside** - Fatter vedtak direkte fra behandlingssiden (som Trygdeavtale)
8. **Behandlingstema** - UTSENDT_ARBEIDSTAKER eller ARBEID_FLERE_LAND (ikke YRKESAKTIV)

### "Utsendt arbeidstaker" vs "Arbeid i flere land"

**Utsendt arbeidstaker (12.1):**
- Behandlingstema: `UTSENDT_ARBEIDSTAKER`
- Ett land valgt under opprettelse
- Workflow: Yrkesaktiv/Selvstendig → Arbeidsgiver → Arbeidstype → Ja/Nei-spørsmål → Innvilg/avslå → Vedtak
- POM: `EuEosBehandlingPage`

**Arbeid i flere land (13.1):**
- Behandlingstema: `ARBEID_FLERE_LAND`
- **To land** valgt under opprettelse (f.eks. Estland + Norge)
- Workflow: Velg hovedland → Arbeidsgiver → Arbeidslokasjon-checkbox → Arbeidstype → Prosentandel → Fritekst-felter → Vedtak
- Ulike spørsmål og felter
- POM: `ArbeidFlereLandBehandlingPage`

## Database-verifisering

Alle tester rydder automatisk data via cleanup-fixture. Du kan verifisere database-tilstand:

```typescript
await behandling.assertions.verifiserBehandlingIDatabase(USER_ID_VALID);
await behandling.assertions.verifiserLovvalgsperiodeIDatabase(USER_ID_VALID, 'DK');
await behandling.assertions.verifiserVedtakIDatabase(USER_ID_VALID);

// Eller komplett verifisering
await behandling.assertions.verifiserKomplettBehandling(USER_ID_VALID, 'DK');
```

## Kjøre tester

```bash
# Kjør alle EU/EØS-tester
npm test tests/eu-eos

# Kjør spesifikk test
npm test tests/eu-eos/eu-eos-fullfort-vedtak.spec.ts

# Kjør i UI-modus
npm run test:ui tests/eu-eos
```

## Relatert dokumentasjon

- [POM Migreringsplan](../../docs/pom/MIGRATION-PLAN.md)
- [POM Hurtigstart](../../docs/pom/QUICK-START.md)
- [Hoved CLAUDE.md](../../CLAUDE.md)
