---
jira: MELOSYS-8122
epic: MELOSYS-6579 — Automatisk opprette årsavregningsbehandlinger på ikke skattepliktige
status: implemented  # testen er skrevet; brev-assertions er røde til feature-branchen lander (se status-merknad i binding)
test: tests/utenfor-avtaleland/workflows/aarsavregning-innhentingsbrev-automatisk.spec.ts
toggles: {}          # default-state; per-trigger-koreografi av melosys.faktureringskomponenten.ikke-tidligere-perioder er testmekanikk (se binding)
tags: [årsavregning, brev, innhenting, skattehendelse, fullmektig, ftrl]
analysis_trace_id: 7107e6b3-8a4f-4b02-a5a5-87ad4ff15199
---

# Automatisk innhentingsbrev ved opprettelse av årsavregning

## Forretningsregel

Når NAV automatisk oppretter en årsavregningsbehandling for trygdeavgift, skal brevet
"Innhenting av inntektsopplysninger" sendes automatisk til bruker for å innhente endelig
inntektsgrunnlag. Regelen følger steg 4 i årsavregningsflyten: *"Innhente opplysninger — fra
bruker for ikke-skattepliktige"* (nav-wiki: Årsavregning, Confluence page_id 456855459).
Mottakerlogikken følger det generelle brevprinsippet i Melosys: bruker er hovedmottaker, men har
bruker en registrert fullmektig (type `FULLMEKTIG_SØKNAD`), overtar fullmektig som hovedmottaker
([Confluence: Mottakere av brev](https://confluence.adeo.no/spaces/TEESSI/pages/395304999),
[Kodeverk: fullmaktstype](https://confluence.adeo.no/spaces/TEESSI/pages/287472744)).

## Scenario 1 — Skattepliktig uten fullmektig

```gherkin
Gitt at en bruker har en sak med forskuddsvis fakturert trygdeavgift
  Og bruker er skattepliktig
  Og bruker har ingen fullmektig av type FULLMEKTIG_SØKNAD registrert i saken
 Når Melosys automatisk oppretter en årsavregningsbehandling etter skattemelding fra Skatteetaten
 Så skal Melosys ha sendt brevet "Innhenting av inntektsopplysninger" til bruker
```

## Scenario 2 — Skattepliktig med fullmektig

```gherkin
Gitt at en bruker har en sak med forskuddsvis fakturert trygdeavgift
  Og bruker er skattepliktig
  Og bruker har en fullmektig av type FULLMEKTIG_SØKNAD registrert i saken
 Når Melosys automatisk oppretter en årsavregningsbehandling etter skattemelding fra Skatteetaten
 Så skal Melosys ha sendt brevet "Innhenting av inntektsopplysninger" til fullmektig
```

## Scenario 3 — Ikke-skattepliktig uten fullmektig

```gherkin
Gitt at en bruker har en sak med forskuddsvis fakturert trygdeavgift
  Og bruker er ikke skattepliktig
  Og bruker har ingen fullmektig av type FULLMEKTIG_SØKNAD registrert i saken
 Når Melosys automatisk oppretter en årsavregningsbehandling via jobben for ikke-skattepliktige
 Så skal Melosys ha sendt brevet "Innhenting av inntektsopplysninger" til bruker
```

## Scenario 4 — Ikke-skattepliktig med fullmektig

```gherkin
Gitt at en bruker har en sak med forskuddsvis fakturert trygdeavgift
  Og bruker er ikke skattepliktig
  Og bruker har en fullmektig av type FULLMEKTIG_SØKNAD registrert i saken
 Når Melosys automatisk oppretter en årsavregningsbehandling via jobben for ikke-skattepliktige
 Så skal Melosys ha sendt brevet "Innhenting av inntektsopplysninger" til fullmektig
```

## Akseptansekriterier (det fagperson signerer av på)

- [ ] Ved automatisk opprettelse av årsavregning for skattepliktige (skattemelding-trigger): brevet "Innhenting av inntektsopplysninger" sendes automatisk til bruker
- [ ] Ved automatisk opprettelse av årsavregning for skattepliktige med FULLMEKTIG_SØKNAD: brevet sendes til fullmektig i stedet for bruker
- [ ] Ved automatisk opprettelse av årsavregning for ikke-skattepliktige (batch-jobb): brevet "Innhenting av inntektsopplysninger" sendes automatisk til bruker
- [ ] Ved automatisk opprettelse av årsavregning for ikke-skattepliktige med FULLMEKTIG_SØKNAD: brevet sendes til fullmektig i stedet for bruker
- [ ] Brevet som sendes automatisk er identisk med brevet som i dag kan sendes manuelt fra "Send brev"-menyen (brevmal `innhenting_av_inntektsopplysninger`)
- [ ] *(Utledet — bekreft med fagperson)* Brevets årsavregningsår settes til det skatteåret behandlingen gjelder for

## Kjente avgrensninger (ikke dekket her)

- **Saksbehandlingsflyt-kontekst (tidligere år):** Siste AC i Jira er ufullstendig og markert "Under avklaring med Nav M&A" — scenariet der en årsavregning opprettes automatisk i kontekst av saksbehandlingsflyt for tidligere år dekkes ikke av denne speken (tilgrensende oppgavebeskrivelse-flyt finnes i [MELOSYS-8123](https://nav.atlassian.net/browse/MELOSYS-8123)).
- **Backfill for allerede opprettede behandlinger (skatteår 2024):** Dekkes av MELOSYS-8125 som egen oppgave.
- **Brevmal-endring (fjerne "chatte" fra kontaktinfo):** Dekkes av MELOSYS-8133.
- **Idempotens / duplikathåndtering:** Speken definerer ikke oppførsel ved re-opprettelse eller reset av en behandling — avklar om brevet skal sendes på nytt.
- **Feilhåndtering ved brevsending:** Oppførsel dersom dokgen/distribusjon feiler (skal behandling opprettes uten brev? alerting?) er ikke spesifisert i Jira.
- **EØS-pensjonister:** Gjelder kun FTRL-saker med trygdeavgift; EØS-pensjonist-årsavregning er ikke dekket.

---

## Teknisk binding
*(for testagenten — domeneleseren kan stoppe over linjen)*

> **Verbatim-regel:** verdier merket `(verbatim)` er flyt-spesifikke `selectOption`-argumenter
> og skal brukes **ordrett**. Ikke "korriger" dem mot eksempelverdier i POM-ens JSDoc — samme
> dropdown bruker ulike koder i ulike flyter.

> **Status-merknad:** Auto-utsending av innhentingsbrevet er implementert i melosys-api på branch
> `8122-auto-innhentingsbrev-arsavregning` (saksflyt-steg `SEND_INNHENTINGSBREV_AARSAVREGNING` i
> `OPPRETT_NY_BEHANDLING_AARSAVREGNING`, bak toggle `melosys.arsavregning.innhentingsbrev`,
> default AV). Verifiseres i CI mot et pushet image fra den branchen. Til feature-imaget er i CI
> er brev-assertionene korrekt røde. Akseptanse-test skrevet sammen med implementasjonen, samme
> mønster som [`aarsavregning-oppgave-skatteaar-i-beskrivelse.md`](aarsavregning-oppgave-skatteaar-i-beskrivelse.md).
>
> **Toggle:** `melosys.arsavregning.innhentingsbrev` (default AV) styrer brev-steget — testen
> enabler den eksplisitt før triggeren; i CI-dispatch settes også `unleash_force_enable`.

### Forhold til MELOSYS-8123

8122 er **brev-søsknen** til 8123 i samme epic. De deler *nøyaktig* samme automatiske
opprettelses-triggere (Kafka-skattehendelse + ikke-skattepliktig-jobb) og samme felles-
forutsetning (vedtatt FTRL-sak med trygdeavgift, avgiftsperiode i forrige år). Forskjellen er
**kun** «Så»-linjen: 8123 asserterer skatteår i oppgavebeskrivelsen, 8122 asserterer at
innhentingsbrevet ble sendt (og til hvem). Felles-oppsettet under er identisk med
`tests/utenfor-avtaleland/workflows/arsavregning-oppgave-aar-i-beskrivelse.spec.ts`.

### Skatteår X i testene

`FORRIGE_AAR` (konstant i `pages/shared/constants.ts`, `inneværende år − 1`).

### Felles forutsetning (alle scenarier)

Vedtatt FTRL-sak med trygdeavgift som betales til NAV, avgiftsperiode i forrige år — samme
oppskrift som 8123 sin `opprettVedtattIkkeSkattepliktigSak`:

- bruker: `USER_ID_VALID` (`30056928150`, "TRIVIELL KARAFFEL"; aktørId i mock: `1111111111111`)
- `OpprettNySakPage.opprettStandardSak(USER_ID_VALID)` (FTRL / MEDLEMSKAP_LOVVALG / YRKESAKTIV / SØKNAD)
- `MedlemskapPage`: `velgPeriode('01.01.${FORRIGE_AAR}', '31.12.${FORRIGE_AAR}')`
  (`TestPeriods.previousYearPeriod`) · `velgLand('Afghanistan')` ·
  `velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON')` **(verbatim)** · `klikkBekreftOgFortsett()`
- `ArbeidsforholdPage.fyllUtArbeidsforhold('Ståles Stål AS')`
- `LovvalgPage`: `velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A')` **(verbatim)** ·
  `svarJaPaaFørsteSpørsmål()` · Ja på "Har søker vært medlem i minst" og "Har søker nær tilknytning til" ·
  `klikkBekreftOgFortsett()`
- `ResultatPeriodePage.fyllUtResultatPeriode('INNVILGET')`
- `TrygdeavgiftPage`: `ventPåSideLastet()` · `velgSkattepliktig(false)` ·
  `velgInntektskilde('INNTEKT_FRA_UTLANDET')` **(verbatim)** · `velgBetalesAga(false)` ·
  `fyllInnBruttoinntektMedApiVent('100000')` · `klikkBekreftOgFortsett()`
- `VedtakPage.klikkFattVedtak()` · `waitForProcessInstances(page.request, 30)`

> **Merk om «skattepliktig» i scenariene:** Domenelagets skille skattepliktig/ikke-skattepliktig
> handler om *hvilken trigger* som fyrer (skattemelding fra Skatteetaten vs. ikke-skattepliktig-
> jobben). Selve sak-oppsettet bruker `velgSkattepliktig(false)` i begge — trigger-mekanismen er
> aksen som bindes, mottakerlogikken (bruker/fullmektig) er den andre. Dette speiler 8123-testen.

**Toggle-koreografi** (`UnleashHelper`, toggle `melosys.faktureringskomponenten.ikke-tidligere-perioder`):
- toggle **AV** under saksopprettelse/vedtak (forrige-års-UI-et krever det, og fakturering må
  akseptere serien), **PÅ** igjen *etter* vedtaket, før selve triggeren utløses (hindrer at
  saksbehandlingsflyt-grenen auto-oppretter årsavregningen i samme vedtak).

### Trigger-utløsning

1. **Skattehendelse (scenario 1, 2):** publiser rå JSON til Kafka-topic
   `teammelosys.skattehendelser.v1-local` (api kjører `local-mock`-profil; `SkattehendelserConsumer`
   deserialiserer via objectMapper):
   ```
   {"gjelderPeriode":"${FORRIGE_AAR}","identifikator":"${USER_ID_VALID}","hendelsetype":"NY"}
   ```
   via `helpers/skattehendelse-helper.ts` (`publishSkattehendelse`). `identifikator` kan være fnr —
   api slår opp aktørId via PDL. Krever toggle `melosys.skattehendelse.consumer` PÅ (default).
2. **Ikke-skattepliktig-jobb (scenario 3, 4):**
   `AdminApiHelper.finnIkkeSkattepliktigeSaker(request, '${FORRIGE_AAR}-01-01', '${FORRIGE_AAR}-12-31', true)`
   + `waitForIkkeSkattepliktigeSakerJob(request, 60, 1000)`; assert `antallProsessert === 1`.

### Mottaker-akse: bruker vs. fullmektig

Mottakerlogikken ligger i `melosys-api` `BrevmottakerService.avklarMottakereForBruker()`:
`fagsak.finnFullmektig(Fullmaktstype.FULLMEKTIG_SØKNAD)` — finnes en fullmektig, blir brevet sendt
**kun** til fullmektig (innhentingsbrevet er ikke i «både-bruker-og-fullmektig»-listen).
`Produserbaredokumenter.INNHENTING_AV_INNTEKTSOPPLYSNINGER → Mottakerliste(Mottakerroller.BRUKER)`
er default når ingen fullmektig finnes.

**Scenario 1 og 3 (uten fullmektig) bindes som kjørbare tester.** Testbruker `USER_ID_VALID` har
ingen registrert fullmakt i mock/DB → mottaker = bruker.

**Scenario 2 og 4 (med fullmektig) bindes som `test.fixme`** med dokumentert oppsett-sti:
det finnes ingen e2e-fikstur for å registrere en `FULLMEKTIG_SØKNAD`-fullmakt på saken. Fullmakten
ligger i melosys-api sin egen `fullmakt`-tabell (`Fullmakt` → `aktoer_id`, `type`), og krever en
`Aktoer` med `rolle = Aktoersroller.FULLMEKTIG` knyttet til fagsaken. Oppsett-sti for senere
aktivering: DB-injeksjon via `withDatabase` (insert i `AKTOER` med FULLMEKTIG-rolle på fagsaken +
insert i `FULLMAKT(aktoer_id, type='FULLMEKTIG_SØKNAD')`), deretter samme trigger og assert at
brev-mottakeren er fullmektigens fnr i stedet for brukerens. Markeres `fixme` til denne fiksturen
finnes — å fake fullmektig-oppsettet ville gitt falsk dekning.

### Assertions (binder «Så»-linjene)

Brevet verifiseres via `PROSESSINSTANS` i Oracle (`withDatabase`), samme mønster som vedtaksbrev-
verifiseringen i `tests/eu-eos/eu-eos-12.1-iverksetting-mottaker-kjede.spec.ts`. Brev-steget
`SEND_INNHENTINGSBREV_AARSAVREGNING` (inne i `OPPRETT_NY_BEHANDLING_AARSAVREGNING`) kaller dokgen-
mal-produksjon som enqueuer en **egen barn-prosessinstans** `OPPRETT_OG_DISTRIBUER_BREV` (verifisert
mot api-koden, ikke `SEND_BREV` — sistnevnte er doksys-forhåndsproduserte brev). Den opprettes med
`STATUS=KLAR` og plukkes asynkront av saga-workeren (`OPPRETT_OG_JOURNALFØR_BREV` →
`DISTRIBUER_JOURNALPOST`) før den blir `FERDIG` → **poll til FERDIG** (timeout 60 s):

- brev-prosess: `PROSESS_TYPE = 'OPPRETT_OG_DISTRIBUER_BREV'` med
  `REGISTRERT_DATO > SYSDATE - INTERVAL '10' MINUTE` og `DATA` (serialisert DokgenBrevbestilling-
  JSON, felt `"produserbartdokument":"INNHENTING_AV_INNTEKTSOPPLYSNINGER"`) som inneholder
  `INNHENTING_AV_INNTEKTSOPPLYSNINGER` ← **selve akseptansekriteriet** («brevet er sendt»)
- `STATUS === 'FERDIG'` (brevet er produsert, journalført og distribuert)
- **mottaker (scenario 1/3):** samme `DATA` inneholder mottakerens ident — fullmektig-substitusjon
  skjer i `hentMottakere` FØR prosessinstansen lages, så identen er fullmektigens når
  `FULLMEKTIG_SØKNAD` finnes, ellers brukers. Assertionen godtar **minst én** av `USER_ID_VALID`
  (`30056928150`) og aktørId `1111111111111` (fnr/aktørId-format pinnes ved første grønne).
  Helper-signatur: `verifiserInnhentingsbrevSendt(mottakerIdentifikatorer: string[])`. Det lages
  nøyaktig ÉN slik prosessinstans (brevet går kun til én mottaker).

> **Robusthet:** Helperen `verifiserInnhentingsbrevSendt` matcher brevmal-strengen og mottaker som
> delstrenger i `DATA` (samme JS-`includes`-mønster som eu-eos-12.1 bruker på `INNVILGELSE_YRKESAKTIV`).
> Når feature-branchen lander kan eksakt prosesstype/`DATA`-felt for innhentingsbrevet måtte
> finjusteres — assertionen er format-robust nok til at brevmal-treffet er det bærende.

Avslutt hver test med `waitForProcessInstances(page.request, 30)` slik at cleanup-fixturen ikke
treffer aktive prosessinstanser.

**Page Objects:** `HovedsidePage`, `OpprettNySakPage`, `MedlemskapPage`, `ArbeidsforholdPage`,
`LovvalgPage`, `ResultatPeriodePage`, `TrygdeavgiftPage`, `VedtakPage`
**Konstanter:** `pages/shared/constants.ts` (`USER_ID_VALID`, `FORRIGE_AAR`)
**Hjelpere:** `helpers/api-helper.ts` (`AdminApiHelper`, `waitForProcessInstances`),
`helpers/skattehendelse-helper.ts` (`publishSkattehendelse`),
`helpers/db-helper.ts` (`withDatabase`), `helpers/date-helper.ts` (`TestPeriods`, `TestPeriodsISO`),
`helpers/unleash-helper.ts` (`UnleashHelper`)

### Endringslogg (teknisk binding)

- 2026-06-11: Spec opprettet som brev-søsken til MELOSYS-8123. Bundet på branchen
  `e2e/melosys-8122-innhentingsbrev-automatisk` (avledet fra 8123-branchen for å arve
  `skattehendelse-helper.ts`). Scenario 1+3 kjørbare (mottaker=bruker), 2+4 `test.fixme`
  (ingen fullmakt-fikstur). Brev-assertions korrekt røde til melosys-api-feature lander.
