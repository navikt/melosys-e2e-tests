---
jira: MELOSYS-8148
epic: MELOSYS-7080 — Støtte til endringer i medlemskap og trygdeavgift for tidligere år
status: implemented  # testen er skrevet; brev-assertions er røde til feature-branchen lander (se status-merknad i binding)
test: tests/utenfor-avtaleland/workflows/aarsavregning-innhentingsbrev-saksbehandlingsflyt.spec.ts
toggles: {}          # default-state; per-trigger-koreografi av melosys.faktureringskomponenten.ikke-tidligere-perioder er testmekanikk (se binding)
tags: [årsavregning, brev, innhenting, saksbehandlingsflyt, ny-vurdering, fullmektig, ftrl]
analysis_trace_id: cf7e6d7a-23d6-4c1e-93aa-cb65bcf75f8c
---

# Automatisk innhentingsbrev ved årsavregning i saksbehandlingsflyten

## Forretningsregel

Når endelig trygdeavgift skal fastsettes (skatteforvaltningsforskriften § 2-13-2), kreves faktisk
inntekt for inntektsåret som grunnlag. Når Melosys i en **saksbehandlingsflyt** automatisk
oppretter en årsavregningsbehandling for et **tidligere år X** — fordi saksbehandler fatter et
vedtak som endrer en periode tilbake i tid — skal systemet umiddelbart innhente nødvendige
inntektsopplysninger fra bruker. Dette gjøres ved å sende brevet «Innhenting av
inntektsopplysninger» automatisk til bruker, eller til brukers fullmektig av type
`FULLMEKTIG_SØKNAD` dersom dette er registrert på saken. Regelen gjelder for alle sakstyper Melosys
støtter årsavregning for, **med unntak av EØS-pensjonister** (krever særskilt brevtekst, egen
oppgave). Brevet skal **ikke** sendes når saksbehandler **manuelt** oppretter en
årsavregningsbehandling — da er inntektsåret ikke valgt ennå.

*Hjemmel: skatteforvaltningsforskriften § 2-13-2 og folketrygdloven § 23-3.*
*Søsteroppgave: [MELOSYS-8122](https://nav.atlassian.net/browse/MELOSYS-8122) (samme brev, men trigget av skattemeldingslytting / ikke-skattepliktig-jobben) — brukes som implementasjonsmønster.*
*Kilde: [Årsavregning — nav-wiki](file:///Users/rune/source/private/huginn/huginn-nav/wiki/concepts/Årsavregning.md), [Årsavregning - manuell støtte i flyt — Confluence](https://confluence.adeo.no/spaces/TEESSI/pages/704517663), [Mottakere av brev — Confluence](https://confluence.adeo.no/spaces/TEESSI/pages/395304999)*

## Scenario 1 — Automatisk opprettet årsavregning, bruker uten fullmektig

```gherkin
Gitt at saksbehandler fatter vedtak i en saksbehandlingsflyt
  Og vedtaket medfører en endring for et tidligere inntektsår X
  Og Melosys automatisk oppretter en årsavregningsbehandling for år X
  Og bruker ikke har en fullmektig av type FULLMEKTIG_SØKNAD registrert på saken
 Når årsavregningsbehandlingen opprettes
 Så skal brevet «Innhenting av inntektsopplysninger» sendes automatisk til bruker
  Og brevet skal gjelde for inntektsåret X
```

## Scenario 2 — Automatisk opprettet årsavregning, bruker med fullmektig

```gherkin
Gitt at saksbehandler fatter vedtak i en saksbehandlingsflyt
  Og vedtaket medfører en endring for et tidligere inntektsår X
  Og Melosys automatisk oppretter en årsavregningsbehandling for år X
  Og bruker har en fullmektig av type FULLMEKTIG_SØKNAD registrert på saken
 Når årsavregningsbehandlingen opprettes
 Så skal brevet «Innhenting av inntektsopplysninger» sendes automatisk til brukers fullmektig
  Og brevet skal gjelde for inntektsåret X
```

## Scenario 3 — Manuell opprettelse av årsavregning

```gherkin
Gitt at saksbehandler manuelt oppretter en årsavregningsbehandling på saken
  Og inntektsåret er ikke valgt på opprettelsestidspunktet
 Når årsavregningsbehandlingen opprettes
 Så skal Melosys ikke sende brevet «Innhenting av inntektsopplysninger»
```

## Akseptansekriterier (det fagperson signerer av på)

- [ ] Når Melosys automatisk oppretter årsavregningsbehandling som følge av vedtak i saksbehandlingsflyten, og bruker ikke har fullmektig FULLMEKTIG_SØKNAD registrert, sendes brevet «Innhenting av inntektsopplysninger» automatisk til bruker
- [ ] Når Melosys automatisk oppretter årsavregningsbehandling som følge av vedtak i saksbehandlingsflyten, og bruker **har** fullmektig FULLMEKTIG_SØKNAD registrert, sendes brevet automatisk til fullmektig
- [ ] Når saksbehandler manuelt oppretter en årsavregningsbehandling, sendes det **ikke** noe innhentingsbrev automatisk
- [ ] Brevutsending skjer for FTRL yrkesaktiv, FTRL pensjonist og EØS offentlig tjenesteperson (minst disse tre sakstype-flytene)
- [ ] EØS-pensjonister er **ikke** inkludert i denne historien — de skal ikke motta brev via denne funksjonaliteten per nå

## Kjente avgrensninger (ikke dekket her)

- **EØS-pensjonister** — krever særskilt brevtekst; dekkes i separat oppgave (jf. kommentar fra Yvonne 19. juni 2026).
- **FTRL pensjonist og EØS offentlig tjenesteperson som sakstype-flyter:** AC-et nevner disse i tillegg til FTRL yrkesaktiv. Denne speken binder **FTRL yrkesaktiv** som den kjørbare flyten (samme valg som søsteroppgaven 8122). De øvrige sakstype-flytene er regresjons-utvidelser når de respektive auto-opprettelses­flytene er prodsatt (EØS offentlig tjenesteperson = [MELOSYS-7828](https://nav.atlassian.net/browse/MELOSYS-7828), i akseptanse test).
- **Skattemeldingslytting og «ikke skattepliktige»-jobben** som trigger — dekkes av [MELOSYS-8122](https://nav.atlassian.net/browse/MELOSYS-8122) (samme brev, annen trigger). Denne speken dekker **kun saksbehandlingsflyt-triggeren**.
- **Fullmektig-mottaker (scenario 2):** bundet som `test.fixme` — det finnes ingen e2e-fikstur for å registrere en `FULLMEKTIG_SØKNAD`-fullmakt på saken (se binding). Å fake oppsettet ville gitt falsk dekning.
- **Brevinnhold og brevmal** — malens tekst er ikke i scope; mal «Innhenting av inntektsopplysninger v.2» eksisterer fra før (brevmal-identifikator `INNHENTING_AV_INNTEKTSOPPLYSNINGER`).

---

## Teknisk binding
*(for testagenten — domeneleseren kan stoppe over linjen)*

> **Verbatim-regel:** verdier merket `(verbatim)` er flyt-spesifikke `selectOption`-argumenter
> og skal brukes **ordrett**. Ikke "korriger" dem mot eksempelverdier i POM-ens JSDoc — samme
> dropdown bruker ulike koder i ulike flyter.

> **Status-merknad:** Auto-utsending av innhentingsbrevet ved *automatisk* opprettelse av
> årsavregning i saksbehandlingsflyten er **ikke implementert i melosys-api ennå** (MELOSYS-8148 er
> i «Utvikle og teste»). Søsteroppgaven [MELOSYS-8122](https://nav.atlassian.net/browse/MELOSYS-8122)
> (samme brev, annen trigger) er i akseptanse test og er implementasjonsmønsteret. Brev-assertionen
> i scenario 1 forventes derfor **rød** til feature-branchen lander; selve trigger-flyten (sak →
> vedtak → ny vurdering for tidligere år → auto-opprettet årsavregning) er grønn i dag. Dette er en
> akseptanse-test skrevet *foran* implementasjonen, etter samme mønster som
> [`aarsavregning-innhentingsbrev-automatisk.md`](aarsavregning-innhentingsbrev-automatisk.md) (8122)
> og [`aarsavregning-oppgave-skatteaar-i-beskrivelse.md`](aarsavregning-oppgave-skatteaar-i-beskrivelse.md) (8123).
> Testen er **ikke** `@known-error`-tagget (det er for kjente bugs som ikke fikses): den kjøres
> grønn mot feature-image-et når melosys-api-branchen lander, akkurat som 8122/8123 ble verifisert
> mot sine feature-images. Scenario 3 (manuell → ingen brev) er grønn allerede i dag.

### Forhold til MELOSYS-8123 og MELOSYS-8122

MELOSYS-8148 = **8123 sin Trigger 3** (saksbehandlingsflyt som berører tidligere år) **+ 8122 sin
brev-assertion**. Trigger-koreografien (ny vurdering som endrer perioden til kun forrige år, slik at
`OppretteÅrsavregningVedEndring` auto-oppretter årsavregningen) er *byte-for-byte* den samme som
den tredje testen i `tests/utenfor-avtaleland/workflows/arsavregning-oppgave-aar-i-beskrivelse.spec.ts`.
Brev-assertionen (`verifiserInnhentingsbrevSendt`) er den samme som i
`aarsavregning-innhentingsbrev-automatisk.spec.ts` (8122-branchen). Det eneste nye i 8148 er at
disse to kombineres: saksbehandlingsflyt-triggeren skal produsere innhentingsbrevet.

### Skatteår X i testene

`FORRIGE_AAR` (konstant i `pages/shared/constants.ts`, `inneværende år − 1`).

### Scenario 1 (kjørbar) — saksbehandlingsflyt via ny vurdering

Endringen som berører tidligere år gjøres som **ny vurdering** (= NV-mønsteret, prod-realistisk
«endring som berører tidligere år»). Førstegangsvedtaket gjelder *inneværende* år; NV endrer
perioden til *kun forrige år* slik at `OppretteÅrsavregningVedEndring` (NV-grenen,
`årMedEndringer = {forrige år}`) auto-oppretter årsavregningen — som igjen skal utløse
innhentingsbrevet.

**Felles forutsetning (førstegangsvedtak, inneværende år):** vedtatt FTRL-sak med trygdeavgift som
betales til NAV (ikke-skattepliktig). Samme oppskrift som
`opprettVedtattIkkeSkattepliktigSak` i 8122/8123:

- bruker: `USER_ID_VALID` (`30056928150`, "TRIVIELL KARAFFEL"; aktørId i mock: `1111111111111`)
- `OpprettNySakPage.opprettStandardSak(USER_ID_VALID)` (FTRL / MEDLEMSKAP_LOVVALG / YRKESAKTIV / SØKNAD)
- `MedlemskapPage`: `velgPeriode(...)` med **`TestPeriods.currentYearPeriod`** (inneværende år) ·
  `velgLand('Afghanistan')` · `velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON')` **(verbatim)** ·
  `klikkBekreftOgFortsett()`
- `ArbeidsforholdPage.fyllUtArbeidsforhold('Ståles Stål AS')`
- `LovvalgPage`: `velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A')` **(verbatim)** ·
  `svarJaPaaFørsteSpørsmål()` · Ja på "Har søker vært medlem i minst" og "Har søker nær tilknytning til" ·
  `klikkBekreftOgFortsett()`
- `ResultatPeriodePage.fyllUtResultatPeriode('INNVILGET')`
- `TrygdeavgiftPage`: `ventPåSideLastet()` · `velgSkattepliktig(false)` ·
  `velgInntektskilde('INNTEKT_FRA_UTLANDET')` **(verbatim)** · `velgBetalesAga(false)` ·
  `fyllInnBruttoinntektMedApiVent('100000')` · `klikkBekreftOgFortsett()`
- `VedtakPage.klikkFattVedtak()` · `waitForProcessInstances(page.request, 30)`

**Toggle-koreografi** (`UnleashHelper`, toggle `melosys.faktureringskomponenten.ikke-tidligere-perioder`):
- toggle **AV** under førstegangsvedtaket for inneværende år (forrige-års-UI-et / faktureringen
  krever det),
- deretter sett faktura-radene til `BESTILT` via `withFaktureringDatabase`
  (`UPDATE faktura SET status = 'BESTILT'`) — NV-avregningen går ellers ikke gjennom,
- toggle **PÅ** igjen før ny vurdering.

**Ny vurdering (perioden endres til kun forrige år):**
- `HovedsidePage.klikkOpprettNySak()` · `OpprettNySakPage.opprettNyVurdering(USER_ID_VALID, 'SØKNAD')` ·
  `waitForProcessInstances(page.request, 30)` · åpne saken på nytt (`getByRole('link', {name: 'TRIVIELL KARAFFEL -'}).first()`)
- `MedlemskapPage.velgPeriode(...)` med **`TestPeriods.previousYearPeriod`** · `klikkBekreftOgFortsett()`
- `ArbeidsforholdPage.fyllUtArbeidsforhold('Ståles Stål AS')`
- `LovvalgPage`: `velgBestemmelse('FTRL_KAP2_2_1')` **(verbatim)** ·
  `velgBrukersSituasjon('MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD')` **(verbatim)** ·
  `svarJaPaaFørsteSpørsmål()` · Ja på "Er søkers arbeidsoppdrag i", "Plikter arbeidsgiver å betale",
  "Har søker lovlig opphold i" · `klikkBekreftOgFortsett()`
- `ResultatPeriodePage.klikkBekreftOgFortsett()` · `TrygdeavgiftPage.klikkBekreftOgFortsett()`
  (resultat/trygdeavgift beholdes fra forrige behandling)
- `VedtakPage.fattVedtakForNyVurdering('FEIL_I_BEHANDLING')` **(verbatim)** · `waitForProcessInstances(page.request, 30)`

### Scenario 3 (kjørbar) — manuell opprettelse, ingen brev

Manuell opprettelse av en årsavregningsbehandling via «Opprett ny sak» (samme inngang som
`tests/aarsavregning-ftrl.spec.ts`). Inntektsåret er **ikke** valgt på opprettelsestidspunktet
(velges først på selve årsavregningssiden). Det skal **ikke** produseres noe innhentingsbrev ved
opprettelsen.

- `HovedsidePage.goto()` · `HovedsidePage.klikkOpprettNySak()`
- `OpprettNySakPage`: `fyllInnBrukerID(USER_ID_VALID)` · `velgOpprettNySak()` ·
  `velgSakstype(SAKSTYPER.FTRL)` · `velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG)` ·
  `velgBehandlingstema(BEHANDLINGSTEMA.YRKESAKTIV)` · `velgBehandlingstype(BEHANDLINGSTYPE.ÅRSAVREGNING)` ·
  `velgAarsak(AARSAK.SØKNAD)` · `leggBehandlingIMine()` · `klikkOpprettNyBehandling()`
- `opprettSak.assertions.verifiserBehandlingOpprettet()` · `waitForProcessInstances(page.request, 30)`
- **Negativ assertion:** ingen `INNHENTING_AV_INNTEKTSOPPLYSNINGER`-brev-prosessinstans skal finnes
  etter at opprettelses-prosessinstansene er FERDIG (`verifiserIngenInnhentingsbrev`).

### Scenario 2 (test.fixme) — fullmektig-mottaker

Bundet som `test.fixme` — identisk begrunnelse som 8122: det finnes ingen e2e-fikstur for å
registrere en `FULLMEKTIG_SØKNAD`-fullmakt på saken. Fullmakten ligger i melosys-api sin
`fullmakt`-tabell (`Fullmakt` → `aktoer_id`, `type`) og krever en `Aktoer` med rolle `FULLMEKTIG`
knyttet til fagsaken. Oppsett-sti for senere aktivering (DB-injeksjon via `withDatabase`): insert i
`AKTOER` med FULLMEKTIG-rolle på fagsaken + insert i `FULLMAKT(aktoer_id, type='FULLMEKTIG_SØKNAD')`,
deretter samme NV-trigger og assert at brevets `DATA` inneholder fullmektigens fnr i stedet for
brukerens.

### Mottaker-akse: bruker vs. fullmektig

Mottakerlogikken ligger i `melosys-api` `BrevmottakerService.avklarMottakereForBruker()`:
`fagsak.finnFullmektig(Fullmaktstype.FULLMEKTIG_SØKNAD)` — finnes en fullmektig, sendes brevet
**kun** til fullmektig; ellers er `INNHENTING_AV_INNTEKTSOPPLYSNINGER → Mottakerliste(BRUKER)` default.
Testbruker `USER_ID_VALID` har ingen registrert fullmakt → mottaker = bruker (scenario 1).

### Assertions (binder «Så»-linjene)

Brevet verifiseres via `PROSESSINSTANS` i Oracle (`withDatabase`), samme mønster som 8122 og
vedtaksbrev-verifiseringen i `tests/eu-eos/eu-eos-12.1-iverksetting-mottaker-kjede.spec.ts`.
Opprettelsen er asynkron (NV-vedtak → auto-årsavregning → prosessinstans) → poll til en fersk
brev-prosessinstans for innhentingsbrevet finnes:

- brev-prosess: `PROSESS_TYPE IN ('SEND_BREV','OPPRETT_OG_DISTRIBUER_BREV')` med
  `REGISTRERT_DATO > SYSDATE - INTERVAL '10' MINUTE` og `DATA` som inneholder
  `INNHENTING_AV_INNTEKTSOPPLYSNINGER` ← **selve akseptansekriteriet** («brevet er sendt»)
- `STATUS === 'FERDIG'` (brevet er produsert, journalført og distribuert)
- **mottaker (scenario 1):** brev-prosessens `DATA` inneholder brukerens identifikator ← «til
  bruker». Det er uavklart om `DATA` lagrer fnr eller aktørId (feature ikke implementert ennå) →
  assertionen godtar at **minst én** av `USER_ID_VALID` (`30056928150`) og aktørId `1111111111111`
  står i `DATA`. Eksakt identifikator pinnes når feature-branchen lander.
  Helper-signatur: `verifiserInnhentingsbrevSendt(mottakerIdentifikatorer: string[])`.
- **«brevet skal gjelde for inntektsåret X»:** behandlings-/avregningsåret er `FORRIGE_AAR` (NV
  endret perioden til kun forrige år) — soft/format-robust delkriterium; den bærende assertionen er
  brevmal-treffet + mottaker + FERDIG. Pinnes når feature lander og `DATA`-formatet er kjent.
- **scenario 3 (negativ):** `verifiserIngenInnhentingsbrev()` — etter at opprettelses-prosess­instansene
  er FERDIG skal **ingen** brev-prosessinstans med `INNHENTING_AV_INNTEKTSOPPLYSNINGER` finnes.

> **Robusthet:** `verifiserInnhentingsbrevSendt` matcher brevmal-strengen og mottaker som
> delstrenger i `DATA` (samme JS-`includes`-mønster som 8122 og eu-eos-12.1). Når feature-branchen
> lander kan eksakt prosesstype/`DATA`-felt måtte finjusteres — brevmal-treffet er det bærende.

Avslutt hver test med `waitForProcessInstances(page.request, 30)` slik at cleanup-fixturen ikke
treffer aktive prosessinstanser.

**Page Objects:** `HovedsidePage`, `OpprettNySakPage`, `MedlemskapPage`, `ArbeidsforholdPage`,
`LovvalgPage`, `ResultatPeriodePage`, `TrygdeavgiftPage`, `VedtakPage`
**Konstanter:** `pages/shared/constants.ts` (`USER_ID_VALID`, `FORRIGE_AAR`, `SAKSTYPER`, `SAKSTEMA`,
`BEHANDLINGSTEMA`, `BEHANDLINGSTYPE`, `AARSAK`)
**Hjelpere:** `helpers/api-helper.ts` (`waitForProcessInstances`),
`helpers/db-helper.ts` (`withDatabase`), `helpers/pg-db-helper.ts` (`withFaktureringDatabase`),
`helpers/date-helper.ts` (`TestPeriods`), `helpers/unleash-helper.ts` (`UnleashHelper`)

### Endringslogg (teknisk binding)

- 2026-06-19: Spec opprettet for MELOSYS-8148 som kombinasjon av 8123 Trigger 3 (saksbehandlingsflyt
  via ny vurdering) og 8122 brev-assertion. Scenario 1 kjørbar (mottaker=bruker), scenario 3 kjørbar
  (manuell → ingen brev), scenario 2 `test.fixme` (ingen fullmakt-fikstur). Brev-assertion korrekt
  rød til melosys-api-feature lander.
</content>
</invoke>
