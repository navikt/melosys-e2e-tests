---
jira: MELOSYS-8123
epic: MELOSYS-6579 — Automatisk opprette årsavregningsbehandlinger på ikke skattepliktige
status: verified
test: tests/aarsavregning/aarsavregning-oppgave-skatteaar-i-beskrivelse-og-nokkelord.spec.ts
toggles: {}        # default-state; per-trigger-koreografi av melosys.faktureringskomponenten.ikke-tidligere-perioder er testmekanikk (se binding)
tags: [årsavregning, oppgave, gosys, skattehendelse, ikke-skattepliktig, ftrl]
---

# Skatteår i beskrivelse på årsavregningsoppgave

## Forretningsregel

Når Melosys automatisk oppretter en årsavregningsbehandling, skal saksbehandler kunne identifisere *hvilket skatteår* behandlingen gjelder direkte fra oppgaveoversikten i Gosys — uten å måtte åpne selve behandlingen. Årsavregningsoppgaver har i dag oppgavetype «Behandle årsavregning» (`BEH_ARSAVREG`) med tema Trygdeavgift, men beskrivelsesfeltet settes alltid tomt ([Oppgaver i Gosys](https://confluence.adeo.no/spaces/TEESSI/pages/478253092), [MELOSYS-6525](https://jira.adeo.no/browse/MELOSYS-6525), [MELOSYS-7614](https://jira.adeo.no/browse/MELOSYS-7614)). Regelen som innføres er: beskrivelsesfeltet skal inneholde skatteåret behandlingen gjelder for, satt automatisk ved opprettelse.

## Scenario

```gherkin
# Trigger 1 — skattehendelse fra Skatteetaten
Scenario: Årsavregningsoppgave fra skattehendelse får skatteår i beskrivelse
  Gitt at Melosys mottar en skattehendelse for skatteår X
    Og skatteår X ikke allerede har en årsavregningsbehandling på saken
   Når Melosys automatisk oppretter en årsavregningsbehandling for skatteår X
   Så er skatteår X angitt i beskrivelsesfeltet i den tilknyttede årsavregningsoppgaven i Gosys
    Og oppgaven har ellers riktig tema, oppgavetype og gjelderfelt

# Trigger 2 — periodisk jobb for ikke-skattepliktige
Scenario: Årsavregningsoppgave fra ikke-skattepliktig-jobb får skatteår i beskrivelse
  Gitt at Melosys kjører den periodiske jobben for ikke-skattepliktige for skatteår X
    Og det finnes saker som kvalifiserer til automatisk årsavregning for skatteår X
   Når Melosys automatisk oppretter en årsavregningsbehandling for skatteår X
   Så er skatteår X angitt i beskrivelsesfeltet i den tilknyttede årsavregningsoppgaven i Gosys
    Og oppgaven har ellers riktig tema, oppgavetype og gjelderfelt

# Trigger 3 — saksbehandlingsflyt ved endring tilbake i tid
Scenario: Årsavregningsoppgave fra saksbehandlingsflyt for tidligere år X får skatteår i beskrivelse
  Gitt at en saksbehandler gjennomfører en endring som berører et tidligere år X
    Og Melosys automatisk oppretter en årsavregningsbehandling for år X som følge av endringen
   Når årsavregningsbehandlingen og tilhørende oppgave opprettes
   Så er år X angitt i beskrivelsesfeltet i den tilknyttede årsavregningsoppgaven i Gosys
    Og oppgaven har ellers riktig tema, oppgavetype og gjelderfelt
```

## Akseptansekriterier (det fagperson signerer av på)

- [ ] Gitt at Melosys i kontekst av lytting på skattemeldinger automatisk oppretter en årsavregningsbehandling for skatteår X — så er skatteår X satt i beskrivelsesfeltet i den tilknyttede årsavregningsoppgaven
- [ ] Gitt at Melosys automatisk oppretter en årsavregningsbehandling i kontekst av jobben «ikke skattepliktige» for skatteår X — så er skatteår X satt i beskrivelsesfeltet i den tilknyttede årsavregningsoppgaven
- [ ] Gitt at Melosys i kontekst av en saksbehandlingsflyt automatisk oppretter en årsavregningsbehandling for tidligere år X — så er år X satt i beskrivelsesfeltet i den tilknyttede årsavregningsoppgaven
- [ ] **Avklaring påkrevd — bekreft med fagperson (Yvonne Jacobs):** Hvilket format skal skatteåret ha i beskrivelsesfeltet? Kun årstallet (`2024`), eller en lesbar etikett (`Skatteår 2024`)? Jira-saken spesifiserer kun «X».

## Kjente avgrensninger (ikke dekket her)

- **Manuelt opprettede årsavregningsbehandlinger:** Saken dekker kun automatisk opprettelse. Skal beskrivelsesfeltet også settes ved manuell opprettelse, er det en separat avklaring.
- **Oppdatering av eksisterende oppgaver:** Saken sier ingenting om å retroaktivt fylle inn beskrivelse på årsavregningsoppgaver som allerede er opprettet uten år.
- **Innhentingsbrev ved automatisk opprettelse:** Tilgrensende flyt er spesifisert i [MELOSYS-8122](https://nav.atlassian.net/browse/MELOSYS-8122) og dekkes ikke her.
- **Duplikatsikring ved automatisk opprettelse:** Håndteres i [MELOSYS-7592](https://jira.adeo.no/browse/MELOSYS-7592) og er en forutsetning, ikke en del av denne speken.

---

## Teknisk binding
*(for testagenten — domeneleseren kan stoppe over linjen)*

> **Verbatim-regel:** verdier merket `(verbatim)` er flyt-spesifikke `selectOption`-argumenter
> og skal brukes **ordrett**. Ikke "korriger" dem mot eksempelverdier i POM-ens JSDoc — samme
> dropdown bruker ulike koder i ulike flyter.

> **Status-merknad:** Funksjonaliteten (år i beskrivelse) er **ikke implementert i melosys-api
> ennå** (MELOSYS-8123 er i «Utvikle og teste»). Beskrivelse-assertions forventes røde til
> feature-branchen lander; resten av flyten (oppgaveopprettelse, tema, oppgavetype) er grønn i dag.

**Skatteår X i testene:** `FORRIGE_AAR` (konstant i `pages/shared/constants.ts`, `inneværende år − 1`).
Beskrivelse-assertion er format-robust inntil avklaringen fra fagperson: assert at beskrivelsen
**inneholder** `String(FORRIGE_AAR)` (dekker både `2025` og `Skatteår 2025`).

### Felles forutsetning (alle tre triggere)

Vedtatt FTRL-sak med trygdeavgift som betales til NAV (ikke-skattepliktig), avgiftsperiode i
forrige år — samme oppskrift som `tests/aarsavregning/aarsavregning-ikke-skattepliktig.spec.ts`:

- bruker: `USER_ID_VALID` (`30056928150`, "TRIVIELL KARAFFEL"; aktørId i mock: `1111111111111`)
- `OpprettNySakPage.opprettStandardSak(USER_ID_VALID)` (FTRL / MEDLEMSKAP_LOVVALG / YRKESAKTIV / SØKNAD)
- `MedlemskapPage`: `velgPeriode('01.01.${FORRIGE_AAR}', '31.12.${FORRIGE_AAR}')` (`TestPeriods.previousYearPeriod`) ·
  `velgLand('Afghanistan')` · `velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON')` **(verbatim)**
- `ArbeidsforholdPage.fyllUtArbeidsforhold('Ståles Stål AS')`
- `LovvalgPage`: `velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A')` **(verbatim)** · `svarJaPaaFørsteSpørsmål()` ·
  Ja på "Har søker vært medlem i minst" og "Har søker nær tilknytning til" · `klikkBekreftOgFortsett()`
- `ResultatPeriodePage.fyllUtResultatPeriode('INNVILGET')`
- `TrygdeavgiftPage`: `ventPåSideLastet()` · `velgSkattepliktig(false)` · `velgInntektskilde('INNTEKT_FRA_UTLANDET')` **(verbatim)** ·
  `velgBetalesAga(false)` · `fyllInnBruttoinntektMedApiVent('100000')` · `klikkBekreftOgFortsett()`
- `VedtakPage.klikkFattVedtak()` · `waitForProcessInstances(page.request, 30)`

**Toggle-koreografi** (`UnleashHelper`, toggle `melosys.faktureringskomponenten.ikke-tidligere-perioder`):
- **Trigger 1 og 2:** toggle **AV** under saksopprettelse/vedtak (forrige-års-UI-et krever det, og
  fakturering må akseptere serien), **PÅ** igjen *etter* vedtaket, før selve triggeren utløses
  (hindrer også at trigger 3 auto-oppretter årsavregningen i samme vedtak).
- **Trigger 3 (= NV-mønsteret):** toggle **AV** under førstegangsvedtaket for *inneværende* år →
  faktura-rader settes `BESTILT` (`withFaktureringDatabase`) → toggle **PÅ** → **ny vurdering**
  som endrer perioden til kun forrige år → `fattVedtakForNyVurdering('FEIL_I_BEHANDLING')` →
  `OppretteÅrsavregningVedEndring` (NV-grenen, `årMedEndringer = {forrige år}`) auto-oppretter
  årsavregningen. Samme oppskrift som `komplett-sak-nyvurdering-periode-endres-til-kun-tidligere-aar.spec.ts`.
  NV-spesifikke verdier: lovvalg `FTRL_KAP2_2_1` **(verbatim)** · situasjon
  `MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD` **(verbatim)** · Ja på "Er søkers arbeidsoppdrag i",
  "Plikter arbeidsgiver å betale", "Har søker lovlig opphold i" · resultat/trygdeavgift beholdes
  (`klikkBekreftOgFortsett()`).

**Endringslogg (teknisk binding)**
- 2026-06-10: Trigger 3 var opprinnelig bundet som *førstegangsvedtak* for rent tidligere år med
  toggle PÅ. Lokal kjøring viste to problemer: (a) Trygdeavgift-steget rendres ikke for rene
  tidligere-års-perioder med togglen PÅ; (b) faktureringskomponenten avviser deterministisk
  tidligere-års-fakturaserier for førstegangsbehandlinger («Startdato kan ikke være fra tidligere
  år») — én grønn kjøring skyldtes toggle-propagerings-race mellom api og fakturering. Re-bundet
  til ny vurdering-mønsteret over (prod-realistisk «endring som berører tidligere år»).
  Domenelaget uendret.

### Trigger-utløsning

1. **Skattehendelse:** publiser rå JSON til Kafka-topic `teammelosys.skattehendelser.v1-local`
   (api kjører `local-mock`-profil; `SkattehendelserConsumer` deserialiserer via objectMapper):
   ```
   {"gjelderPeriode":"${FORRIGE_AAR}","identifikator":"${USER_ID_VALID}","hendelsetype":"NY"}
   ```
   via `docker exec -i kafka kafka-console-producer --bootstrap-server kafka.melosys.docker-internal:9092 --topic teammelosys.skattehendelser.v1-local`
   (helper: `publishSkattehendelse` i `helpers/skattehendelse-helper.ts`). `identifikator` kan være
   fnr — api slår opp aktørId via PDL. Krever toggle `melosys.skattehendelse.consumer` PÅ (default).
2. **Ikke-skattepliktig-jobb:** `AdminApiHelper.finnIkkeSkattepliktigeSaker(request, '${FORRIGE_AAR}-01-01', '${FORRIGE_AAR}-12-31', true)`
   + `waitForIkkeSkattepliktigeSakerJob(request, 60, 1000)`; assert `antallProsessert === 1`.
3. **Saksbehandlingsflyt:** ingen ekstra handling — vedtaket i felles-forutsetningen er selve triggeren.

### Assertions (binder «Så»-linjene)

Oppgaveregisteret verifiseres via melosys-mock: `fetchOppgaver(request)`
(`helpers/mock-helper.ts`, `GET http://localhost:8083/testdata/verification/oppgave` — returnerer
full `Oppgave` inkl. `beskrivelse` og `tema`; `OppgaveInfo`-interfacet utvides med disse feltene).
Opprettelsen er asynkron (Kafka-consume / jobb / prosessinstans) → bruk `expect.poll` (timeout 30 s)
til nøyaktig **én** oppgave med `oppgavetype === 'BEH_ARSAVREG'` finnes, deretter:

- `beskrivelse` inneholder `String(FORRIGE_AAR)` ← **selve akseptansekriteriet**
- `oppgavetype === 'BEH_ARSAVREG'` (← «riktig oppgavetype»)
- `tema === 'TRY'` (← «riktig tema»)
- `behandlingstema === 'ab0484'` (UTENFOR_AVTALAND_YRKESAKTIV — FTRL/YRKESAKTIV-mapping i `OppgaveGosysMapping`)
- `aktoerId === '1111111111111'` (← «riktig gjelderfelt» for testbrukeren)

Avslutt hver test med `waitForProcessInstances(page.request, 30)` slik at cleanup-fixturen ikke
treffer aktive prosessinstanser.

**Page Objects:** `HovedsidePage`, `OpprettNySakPage`, `MedlemskapPage`, `ArbeidsforholdPage`, `LovvalgPage`, `ResultatPeriodePage`, `TrygdeavgiftPage`, `VedtakPage`
**Konstanter:** `pages/shared/constants.ts` (`USER_ID_VALID`, `FORRIGE_AAR`)
**Hjelpere:** `helpers/api-helper.ts` (`AdminApiHelper`, `waitForProcessInstances`), `helpers/mock-helper.ts` (`fetchOppgaver`), `helpers/skattehendelse-helper.ts` (`publishSkattehendelse`, ny), `helpers/date-helper.ts` (`TestPeriods`, `TestPeriodsISO`), `helpers/unleash-helper.ts`
