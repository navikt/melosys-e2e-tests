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

## Konstanter

### Sakstype
```typescript
import { SAKSTYPER, BEHANDLINGSTEMA } from '../../pages/shared/constants';

SAKSTYPER.EU_EOS              // 'EU_EOS'
BEHANDLINGSTEMA.UTSENDT_ARBEIDSTAKER  // 'UTSENDT_ARBEIDSTAKER'
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

## Viktige forskjeller fra FTRL og Trygdeavtale

1. **Dateplukker** - Bruker år-velger og dag-velger (ikke bare tekstfelt)
2. **Land-dropdown** - Bruker CSS-locator (`.css-19bb58m`) i stedet for label
3. **Yrkesaktiv/Selvstendig** - Eget steg med radio-knapper
4. **Arbeidsgiver** - Bruker **checkbox** i stedet for radio-knapp
5. **Arbeidstype** - Lønnet arbeid vs Ulønnet arbeid
6. **Spørsmål** - To separate Ja/Nei-spørsmål
7. **Ingen egen vedtaksside** - Fatter vedtak direkte fra behandlingssiden (som Trygdeavtale)
8. **Behandlingstema** - UTSENDT_ARBEIDSTAKER (ikke YRKESAKTIV)

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
