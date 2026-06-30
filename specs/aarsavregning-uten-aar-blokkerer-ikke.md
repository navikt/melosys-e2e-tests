---
jira: MELOSYS-8161
epic: MELOSYS-7080 — Støtte til endringer i medlemskap og trygdeavgift for tidligere år
status: verified  # lokalt + CI rød-mot-master / grønn-mot-8161-fiks (run 28441194646 grønn fiks-image, 28441548657 rød latest). Sc.2 rød mot latest til api-fiks (PR #3408) merges. Se status-merknad.
test: tests/aarsavregning/aarsavregning-uten-aar-blokkerer-ikke.spec.ts
toggles: {}          # default-state; per-trigger-koreografi av melosys.faktureringskomponenten.ikke-tidligere-perioder er testmekanikk (se binding)
tags: [årsavregning, ny-vurdering, tidligere-år, ftrl, auto-opprettelse, regresjon]
analysis_trace_id: 2441d3f7-a196-4bbe-938a-5daf1a55252b
---

# Automatisk opprettelse av årsavregningsbehandling — ufullstendig åpen behandling uten år skal ikke blokkere

## Forretningsregel

Når Melosys fatter vedtak på en FTRL-sak med avgiftspliktige perioder i et foregående kalenderår, **skal systemet automatisk opprette en årsavregningsbehandling for det aktuelle året** (hjemmel: skatteforvaltningsforskriften § 2-13-2, jf. ftrl. § 23-3). Opprettelse skal *ikke* skje dersom det allerede finnes en åpen årsavregningsbehandling som gjelder samme år — i så fall skal den eksisterende behandlingen tilbakestilles slik at saksbehandler kan starte på nytt (MELOSYS-7826).

En åpen årsavregningsbehandling som ennå **ikke har fått fastsatt år** er ufullstendig og representerer ikke en årsavregning for noe bestemt år. En slik behandling skal ikke tolkes som en eksisterende årsavregning for det aktuelle året og skal ikke blokkere automatisk opprettelse.

*Kilde: [MELOSYS-7826](https://jira.adeo.no/browse/MELOSYS-7826), faglig avklaring bekreftet av Yvonne Jacobs (referert i MELOSYS-8045): «ny ÅRSAVREGNING SKAL opprettes når åpen mangler år».*

## Scenario 1 — Automatisk opprettelse når eksisterende årsavregningsbehandling mangler år

```gherkin
Gitt en FTRL-sak (PENSJONIST) med avgiftspliktige perioder i et foregående kalenderår
  Og det finnes allerede en åpen årsavregningsbehandling på saken
  Og den åpne behandlingen har ikke fått fastsatt et år ennå

 Når saksbehandler fatter vedtak med endring i den avgiftspliktige perioden for det foregående året

 Så skal Melosys automatisk opprette en ny årsavregningsbehandling for det foregående kalenderåret
  Og den nye behandlingen skal knyttes til korrekt kalenderår
  Og den ufullstendige behandlingen (uten år) skal ikke ha hindret opprettelsen
  Og det skal ikke vises en misvisende feilmelding rettet mot manuell saksbehandling
```

## Scenario 2 — Normal blokkering gjelder fortsatt — åpen behandling MED år for samme år

```gherkin
Gitt en FTRL-sak (PENSJONIST) med avgiftspliktige perioder i et foregående kalenderår
  Og det finnes allerede en åpen årsavregningsbehandling på saken
  Og den åpne behandlingen er knyttet til det aktuelle foregående kalenderåret

 Når saksbehandler fatter vedtak med endring i den avgiftspliktige perioden for det foregående året

 Så skal Melosys IKKE automatisk opprette en ny årsavregningsbehandling
  Og den eksisterende årsavregningsbehandlingen for det aktuelle året skal tilbakestilles
  Og saksbehandler skal behandle den tilbakestilte behandlingen på nytt
```

## Akseptansekriterier (det fagperson signerer av på)

- [ ] Når det finnes en åpen årsavregningsbehandling uten fastsatt år, skal automatisk opprettelse for et foregående kalenderår gjennomføres uten feil
- [ ] Den nyopprettede årsavregningsbehandlingen skal ha korrekt kalenderår satt
- [ ] En ufullstendig behandling uten år skal ikke anses som en eksisterende årsavregning for noe bestemt år og skal ikke blokkere ny opprettelse
- [ ] Saksbehandler skal ikke se en feilmelding som gir inntrykk av at det finnes en åpen årsavregning de må håndtere manuelt, når det ikke er tilfelle
- [ ] Dersom det finnes en åpen årsavregningsbehandling med år satt til det aktuelle foregående kalenderåret, gjelder fremdeles eksisterende regel: ingen ny opprettes, den eksisterende tilbakestilles *(utledet — bekreft med fagperson at denne regelen er uendret)*

## Kjente avgrensninger (ikke dekket her)

- **Hva skjer med den ufullstendige behandlingen (uten år)?** Speken krever ikke at den avsluttes automatisk — kun at den ikke blokkerer. Avklaring av om slike behandlinger skal ryddes opp automatisk hører hjemme i en separat sak.
- **FTRL YRKESAKTIV og ikke-skattepliktige:** Samme prinsipp er allerede fikset for tilsvarende flyt (MELOSYS-8045). Denne speken dekker kun `OppretteÅrsavregningVedEndring`-flyten; andre generatorer er ikke vurdert her.
- **Flere foregående år i samme vedtak:** Kombinasjonen «ufullstendig behandling uten år» + «vedtak som berører flere foregående år» er ikke eksplisitt scenariosatt her — bekreft med fagperson om det trengs egne scenarier.
- **EØS Pensjonist / Offentlig Tjenestepensjon:** Disse sakstypene kan ha tilsvarende flyt; dekkes ikke av denne speken uten eksplisitt avklaring.

---

## Teknisk binding
*(for testagenten — domeneleseren kan stoppe over linjen)*

> **Verbatim-regel:** verdier merket `(verbatim)` er flyt-spesifikke `selectOption`-argumenter
> og skal brukes **ordrett**. Ikke "korriger" dem mot eksempelverdier i POM-ens JSDoc — samme
> dropdown bruker ulike koder i ulike flyter.

> **Status-merknad (les denne før du tolker «rød/grønn») — oppdatert 2026-06-30 etter lokal kjøring:**
> 1. **Fiksen er implementert** på melosys-api-branch `8161-aarsavregning-uten-aar`: gaten i
>    `OppretteÅrsavregningVedEndring` byttet fra `finnÅrsavregningerPåFagsak(..., IKKE_FASTSATT)` til
>    den nye `ÅrsavregningService.harAktivÅrsavregningForÅr` (sjekker ALLE aktive ÅRSAVREGNING-er
>    defensivt, 8045-mønster). Apien har egne tester: unit (`ÅrsavregningServiceTest`,
>    `OppretteÅrsavregningVedEndringTest`) + IT mot ekte DB (`ÅrsavregningDuplikatGateIT`).
> 2. **To scenarier, ulik rød/grønn-profil — viktig:**
>    - **Scenario 1 (uten år):** en *ren* «uten år»-behandling (uten `aarsavregning`-rad) faller bort
>      i `.mapNotNull { it.årsavregning }` i den GAMLE gaten OG gir `null` defensivt i den NYE → begge
>      gir `harAktiv = false` → opprettelse går videre. Denne er derfor **grønn mot BÅDE master og
>      fiks** og tester *ikke* selve fiksen. Den er en regresjon for domenets scenario 1.
>    - **Scenario 2 (den faktiske feilstien fiksen lukker):** en aktiv (ikke-AVSLUTTET) ÅRSAVREGNING
>      **MED år** men med `RESULTAT_TYPE != IKKE_FASTSATT` (testen bruker `MEDLEM_I_FOLKETRYGDEN`).
>      Den gamle gaten filtrerte på IKKE_FASTSATT og **bommet** på den, mens den nedstrøms SQL-guarden
>      (`finnAntallÅrsavregningerPåFagsakForÅr`, kun `status != AVSLUTTET`) **telte** den → opprettelse
>      startet → SQL-guarden kastet den misvisende `FunksjonellException`-en. **Verifisert RØD lokalt
>      2026-06-30** mot master-gaten (reproduserte nøyaktig «Det finnes en annen åpen
>      årsavregningsbehandling for samme år…» fra `ÅrsavregningService.opprettÅrsavregning:91`).
>      Mot fiksen er gate og SQL-guard enige → blokkerer rent → **GRØNN**. Speiler api-IT-en
>      `ÅrsavregningDuplikatGateIT` på e2e-nivå (full saksbehandlingsflyt).
> 3. **Lærdom (MELOSYS-8161):** den opprinnelige «ren uten år»-e2e-en var grønn mot master og testet
>    derfor ikke fiksen. Det avdekkes KUN ved å kjøre testen lokalt mot base/main FØR man melder grønt
>    (se HARD GATE i `orchestrate-e2e-flow`). `erAktiv()` er `true` for `OPPRETTET`/`UNDER_BEHANDLING`
>    (kun `AVSLUTTET`/`MIDLERTIDIG_LOVVALGSBESLUTNING` er inaktive), så en OPPRETTET-injeksjon fanges
>    av den nye gaten.

### Bug-mekanikk (for den som binder/verifiserer)

Feil sitter i `melosys-api` `saksflyt/.../OppretteÅrsavregningVedEndring.opprettÅrsavregning()`:

```kotlin
val harAktivÅrsavregningforÅr =
    årsavregningService.finnÅrsavregningerPåFagsak(saksnummer, potensieltÅr, IKKE_FASTSATT).isNotEmpty()
if (!harAktivÅrsavregningforÅr) { opprettArsavregningsBehandlingProsessflyt(...) }
```

`finnÅrsavregningerPåFagsak` (`service/.../ÅrsavregningService.kt`) gjør `.mapNotNull { it.årsavregning }`
— en åpen ÅRSAVREGNING-behandling **uten `aarsavregning`-rad** («uten år») forsvinner her. Den
parallelle, allerede fiksede flyten (MELOSYS-8045, `ÅrsavregningIkkeSkattepliktigeProsessGenerator`)
definerer den kanoniske tolkningen i `hentÅrFraBehandlingDefensivt`:

> «Returnerer null hvis åpen ÅRSAVREGNING-behandling mangler aarsavregning-rad (`hentÅrsavregning()`
> kaster) … slik at ny ÅRSAVREGNING blir opprettet for året per fag-avklaring.»

Den misvisende feilmeldingen (når den utløses) kastes i `ÅrsavregningService.opprettÅrsavregning()`
via `AarsavregningRepository.finnAntallÅrsavregningerPåFagsakForÅr` (SQL teller `aarsavregning`-rader
med `a.aar = :aar` på ikke-AVSLUTTET ÅRSAVREGNING-behandlinger): *«Det finnes en annen åpen
årsavregningsbehandling for samme år på saken. Vurder hvilken behandling du vil fortsette med …»* —
misvisende fordi opprettelsen er automatisk, ikke saksbehandlerinitiert.

### Definisjon: «årsavregningsbehandling uten år»

= en `BEHANDLING` med `BEH_TYPE = 'ÅRSAVREGNING'`, status ≠ `AVSLUTTET`, som har et
`BEHANDLINGSRESULTAT` men **ingen `AARSAVREGNING`-rad** (`AARSAVREGNING.BEHANDLINGSRESULTAT_ID`
peker ikke på behandlingsresultatet). Dette er nøyaktig tilstanden en saksbehandler etterlater når
en årsavregning opprettes manuelt og året ennå ikke er valgt på selve årsavregningssiden (jf.
manuell-opprettelse-scenariet i 8148-speken: «Året velges først på selve årsavregningssiden — på
opprettelsestidspunktet er det ikke valgt»).

### Trigger (kjørbar) — saksbehandlingsflyt via ny vurdering, samme mønster som 8148 scenario 1

Endringen som berører tidligere år gjøres som **ny vurdering** (NV): førstegangsvedtaket gjelder
*inneværende* år, NV endrer perioden til *kun forrige år* slik at `OppretteÅrsavregningVedEndring`
(NV-grenen, `årMedEndringer = {forrige år}`) auto-oppretter årsavregningen.

> **Kilde for de eksakte verdiene:** Selve trinn-for-trinn-oppskriften (førstegangsverdier + NV-verdier)
> er **byte-for-byte den verifiserte 8148 scenario 1** i
> `tests/utenfor-avtaleland/workflows/aarsavregning-innhentingsbrev-saksbehandlingsflyt.spec.ts`
> (`opprettVedtattSakInneværendeÅr` + NV-blokken). `tests/aarsavregning/komplett-sak-nyvurdering-periode-endres-til-kun-tidligere-aar.spec.ts`
> er kun referert for NV-trigger-**formen** (endre periode til kun forrige år → auto-årsavregning) —
> den bruker *andre* førstegangsverdier (`velgFlereLandIkkeKjentHvilke()` + `ARBEIDSINNTEKT`, ingen
> `velgBetalesAga`) og er **ikke** fasiten for verdiene under. Bruk 8148-verdiene ordrett.

**Felles forutsetning (førstegangsvedtak, inneværende år)** — `opprettVedtattSakInneværendeÅr`-mønsteret:
- bruker: `USER_ID_VALID` (`30056928150`, "TRIVIELL KARAFFEL")
- `OpprettNySakPage.opprettStandardSak(USER_ID_VALID)` (FTRL / MEDLEMSKAP_LOVVALG / YRKESAKTIV / SØKNAD)
- `MedlemskapPage`: `velgPeriode(...)` med **`TestPeriods.currentYearPeriod`** ·
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
- **AV** under førstegangsvedtaket for inneværende år,
- sett faktura-radene til `BESTILT` via `withFaktureringDatabase` (`UPDATE faktura SET status = 'BESTILT'`)
  — NV-avregningen går ellers ikke gjennom,
- **PÅ** igjen før ny vurdering (`OppretteÅrsavregningVedEndring` returnerer tidlig hvis toggle er av).

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
- `VedtakPage.fattVedtakForNyVurdering('FEIL_I_BEHANDLING')` **(verbatim)** · `waitForProcessInstances(page.request, 30)`

> **Domene-merknad:** Domenelaget sier «FTRL (PENSJONIST)», men `harTemaOgTypeSomSkalBehandles` i
> `OppretteÅrsavregningVedEndring` behandler **både** FTRL YRKESAKTIV og FTRL PENSJONIST identisk for
> denne regelen (begge → `true`). Den kjørbare triggeren bruker FTRL **YRKESAKTIV** fordi det er den
> eneste fullt POM-dekkede, verifiserte flyten i repoet (8148 scenario 1). Regelen som testes
> («uten år blokkerer ikke») er sakstype-uavhengig innenfor scope.

### Precondition (kjørbar) — injiser «åpen årsavregning uten år»

Den kanoniske «uten år»-tilstanden konstrueres deterministisk via DB-injeksjon (det finnes ingen
verifisert UI-sti for å lage en manuell, ufullført årsavregning på en *eksisterende* FTRL-sak; å
gjette en slik UI-flyt bryter med spec-from-analysis-regelen om å ikke gjette UI). Injeksjonen er
skjemagrunnet mot live Oracle (alle NOT NULL-kolonner + FK-enum-verdier verifisert 2026-06-30 — det
finnes ingen ekstra NOT NULL-kolonner utover de under):

- les saksnummer fra **`FAGSAK.SAKSNUMMER`** (IKKE `GSAK_SAKSNUMMER` — det er arkivsak-koblingen):
  `SELECT SAKSNUMMER FROM FAGSAK` (cleanup-fixturen gir nøyaktig én fagsak per test → én rad),
- `INSERT INTO BEHANDLING (SAKSNUMMER, STATUS, BEH_TYPE, REGISTRERT_DATO, ENDRET_DATO, BEH_TEMA, BEHANDLINGSFRIST)`
  `VALUES (:s, 'OPPRETTET', 'ÅRSAVREGNING', SYSTIMESTAMP, SYSTIMESTAMP, 'YRKESAKTIV', SYSDATE)`
  (`BEHANDLING.ID` har sekvens-default → **ikke** sett i INSERT). `DatabaseHelper.execute()` returnerer
  kun `rowsAffected` (ingen out-binds), så `RETURNING ID` kan **ikke** brukes — hent ID-en via
  select-back: `SELECT ID FROM BEHANDLING WHERE SAKSNUMMER = :s AND BEH_TYPE = 'ÅRSAVREGNING'`. På
  injeksjonstidspunktet (før NV-vedtaket) er dette den **eneste** ÅRSAVREGNING-behandlingen på saken
  (førstegang = FØRSTEGANG, NV = NY_VURDERING) → entydig select-back.
- `INSERT INTO BEHANDLINGSRESULTAT (BEHANDLING_ID, BEHANDLINGSMAATE, RESULTAT_TYPE, REGISTRERT_DATO, ENDRET_DATO)`
  `VALUES (:id, 'MANUELT', 'IKKE_FASTSATT', SYSTIMESTAMP, SYSTIMESTAMP)`,
- **ingen** `AARSAVREGNING`-rad → behandlingen er «uten år».

**Plassering (viktig):** injiser **etter at all UI-navigasjon for NV-en er ferdig**, rett **før**
`VedtakPage.fattVedtakForNyVurdering(...)` (som fyrer `OppretteÅrsavregningVedEndring`). Da unngås all
risiko for at den ekstra åpne behandlingen påvirker `opprettNyVurdering`-UI-en — preconditionen
trenger kun å eksistere i det øyeblikket vedtaket fattes. (Saksnummeret leses tidligere, rett etter at
den vedtatte saken finnes.)

Helper i testfila: `gittÅpenÅrsavregningUtenÅr(saksnummer): Promise<number>` (returnerer injisert
behandlingId). Bruker `DatabaseHelper.execute()` (autoCommit) for INSERTs slik at api-en (egen
connection) ser dem. Etter injeksjon **verifiseres** preconditionen via DB (ÅRSAVREGNING-behandling
finnes, ingen AARSAVREGNING-rad: `SELECT COUNT(*) FROM AARSAVREGNING WHERE BEHANDLINGSRESULTAT_ID = :id`
skal være 0) slik at en mislykket injeksjon feiler ved et tydelig, merket punkt — ikke som en
forvirrende nedstrøms-feil.

> **DB-injeksjon — bekreftet:** dette er den eneste injeksjonen av en hel `BEHANDLING` i repoet (øvrige
> tester kun `UPDATE`/`SELECT`). **Verifisert ende-til-ende lokalt 2026-06-30** (begge scenarier kjørt
> mot levende stack). Hibernate-cache er ikke et problem: gaten kaller `fagsakService.hentFagsak` på
> nytt (ny transaksjon) og re-leser `behandlinger` fra DB, så den injiserte behandlingen er synlig.
> `scenario 2`-injeksjonen (status `OPPRETTET`) fanges av `harAktivÅrsavregningForÅr` fordi
> `erAktiv()` = `!(erAvsluttet() || erMidlertidigLovvalgsbeslutning())` → `true` for `OPPRETTET`.

### Assertions (binder «Så»-linjene i scenario 1)

Etter NV-vedtaket + `waitForProcessInstances`:

1. **«auto-opprette en ny årsavregningsbehandling for det foregående kalenderåret» + «knyttes til
   korrekt kalenderår»:** finn ÅRSAVREGNING-behandlingen som **har** en `AARSAVREGNING`-rad med
   `AAR = FORRIGE_AAR` (den injiserte uten-år-behandlingen har ingen slik rad → ekskluderes av
   JOIN-en). `BEHANDLINGSRESULTAT` har `BEHANDLING_ID` som PK, og `AARSAVREGNING.BEHANDLINGSRESULTAT_ID`
   er derfor behandlingens ID direkte, så JOIN-en er:
   `SELECT b.ID FROM BEHANDLING b JOIN AARSAVREGNING a ON a.BEHANDLINGSRESULTAT_ID = b.ID WHERE b.BEH_TYPE='ÅRSAVREGNING' AND a.AAR = :aar AND b.ID <> :utenÅrId`.
   Auto-opprettelsen er asynkron → `expect.poll` på dette oppslaget. Assert deretter fokusert:
   `BEH_TYPE='ÅRSAVREGNING'`, `STATUS != 'AVSLUTTET'` (åpen), et `BEHANDLINGSRESULTAT` finnes, og
   `AARSAVREGNING.AAR = FORRIGE_AAR`.
   > **Ikke** `verifiserAarsavregningBehandling` her: den defaulter `forventetStatus` til `AVSLUTTET`
   > og krever at **alle** prosessinstanser er FERDIG. Den nye årsavregningen er nettopp auto-opprettet
   > i flyten og ennå ikke saksbehandlet → den er åpen (status `OPPRETTET` *eller* `UNDER_BEHANDLING`,
   > jf. `aarsavregning.assertions.ts`) og kan ha prosesser som ikke er FERDIG ennå. Status pinnes
   > derfor ikke til en bestemt åpen verdi.
2. **«den ufullstendige behandlingen (uten år) skal ikke ha hindret opprettelsen»:** assert at det nå
   finnes **≥ 2** ÅRSAVREGNING-behandlinger på saken — den injiserte uten-år (uten AARSAVREGNING-rad,
   fortsatt åpen) **og** den nye med-år. Den injiserte behandlingen skal fortsatt finnes (ble ikke
   feilaktig avsluttet).
3. **«ikke en misvisende feilmelding rettet mot manuell saksbehandling»:** `waitForProcessInstances`
   kaster på feilede prosessinstanser — den misvisende `FunksjonellException` ville feilet
   `OPPRETT_NY_BEHANDLING_AARSAVREGNING`-prosessflyten. I tillegg fanger docker-log-fixturen et evt.
   `FunksjonellException` i api-loggen (ikke `@expect-docker-errors`-tagget). Bærende bevis er at den
   nye årsavregningen (assertion 1) faktisk ble opprettet.

Avslutt testen med `waitForProcessInstances(page.request, 30)` slik at cleanup-fixturen ikke treffer
aktive prosessinstanser.

### Scenario 2 (kjørbar — DEKKER FIKSEN) — aktiv årsavregning MED år, resultattype ≠ IKKE_FASTSATT

Dette er den faktiske feilstien 8161 lukker, og den eneste av de to scenariene som faktisk skiller
fiks fra master. Precondition (helper `gittÅpenÅrsavregningMedÅr(saksnummer, FORRIGE_AAR)`): injiser
en åpen (status `OPPRETTET`, dvs. `erAktiv()=true`) ÅRSAVREGNING **med** `AARSAVREGNING`-rad
`AAR = FORRIGE_AAR`, men `RESULTAT_TYPE = 'MEDLEM_I_FOLKETRYGDEN'` **(verbatim — må være ≠ IKKE_FASTSATT)**:

- `INSERT INTO BEHANDLINGSRESULTAT (..., RESULTAT_TYPE, ...) VALUES (:id, 'MANUELT', 'MEDLEM_I_FOLKETRYGDEN', ...)`
- `INSERT INTO AARSAVREGNING (BEHANDLINGSRESULTAT_ID, AAR) VALUES (:id, :aar)` (begge NOT NULL; `BEHANDLINGSRESULTAT_ID` = behandlingens ID).

Kjør samme NV-trigger som scenario 1. **Forventet atferd:**
- **mot master (gammel gate `finnÅrsavregningerPåFagsak(..., IKKE_FASTSATT)`):** den år-satte
  behandlingen filtreres bort av IKKE_FASTSATT-filteret → `harAktiv=false` → opprettelse starter →
  SQL-guarden (`finnAntallÅrsavregningerPåFagsakForÅr`, teller alle ikke-AVSLUTTET) treffer →
  `opprettÅrsavregning` kaster den misvisende `FunksjonellException`-en → `OPPRETT_NY_BEHANDLING_AARSAVREGNING`
  feiler → **RØD**.
- **mot fiks (ny gate `harAktivÅrsavregningForÅr`):** gaten ser den aktive år-satte behandlingen →
  `harAktiv=true` → ingen ny opprettes, ingen feil → **GRØNN**.

**Assertions (binder scenario 2):**
- `waitForProcessInstances` rett etter vedtaket — **bærende rød/grønn-diskriminator** (kaster på den
  feilede `OPPRETT_NY_BEHANDLING_AARSAVREGNING`-prosessen mot master).
- nøyaktig **én** ÅRSAVREGNING for `FORRIGE_AAR` (den injiserte) — ingen duplikat.
- den injiserte behandlingen finnes fortsatt.

> «Tilbakestilles» (`resetEksisterendeÅrsavregning`, MELOSYS-7826) er pre-eksisterende atferd og ikke
> bundet her — domenelagets scenario-2-AC er markert «utledet/bekreft», så vi binder kun
> «ingen ny + ingen misvisende feil» (det 8161 faktisk endrer).

**Page Objects:** `HovedsidePage`, `OpprettNySakPage`, `MedlemskapPage`, `ArbeidsforholdPage`,
`LovvalgPage`, `ResultatPeriodePage`, `TrygdeavgiftPage`, `VedtakPage`
**Konstanter:** `pages/shared/constants.ts` (`USER_ID_VALID`, `FORRIGE_AAR`)
**Hjelpere:** `helpers/api-helper.ts` (`waitForProcessInstances`),
`helpers/db-helper.ts` (`withDatabase`, ny `execute` — autoCommit-DML for precondition-injeksjon),
`helpers/pg-db-helper.ts` (`withFaktureringDatabase`), `helpers/date-helper.ts` (`TestPeriods`),
`helpers/unleash-helper.ts` (`UnleashHelper`)

### Endringslogg (teknisk binding)

- 2026-06-30: Spec opprettet for MELOSYS-8161 fra godkjent domenespec (analysis_trace_id
  2441d3f7-…). Trigger gjenbruker den verifiserte 8148 scenario 1 NV→tidligere-år-flyten. Precondition
  («åpen årsavregning uten år») injiseres via DB (skjemagrunnet mot live Oracle). Scenario 1 kjørbar
  (aksept-/regresjonstest av målatferd), scenario 2 `test.fixme` (pre-eksisterende blokkeringsregel,
  AC markert «utledet/bekreft»). **Ikke CI-verifisert**: ingen 8161-fix-branch i melosys-api ennå, og
  full stack (web:3000) nede ved skriving. Statisk analyse: ren «uten år» kan allerede være håndtert
  i `OppretteÅrsavregningVedEndring` (mapNotNull-bortfall) → testen kan bli grønn mot main; flagget i
  status-merknaden.
- 2026-06-30 (assertion-robusthet): byttet ut `verifiserAarsavregningBehandling(forventetStatus:'OPPRETTET',
  …)` med en fokusert DB-assertion (`STATUS != 'AVSLUTTET'` + behandlingsresultat + `AARSAVREGNING.AAR`
  + `OPPRETT_NY_BEHANDLING_AARSAVREGNING` FERDIG). Grunn: flyt-auto-opprettede (NV) årsavregninger er
  åpne og kan være `OPPRETTET` *eller* `UNDER_BEHANDLING` med ikke-FERDIG prosesser; den delte helperen
  defaulter til `AVSLUTTET` + krever alle prosesser FERDIG → ville feilet av feil grunn. La til en
  gjenbrukbar `DatabaseHelper.execute()` (autoCommit) for precondition-injeksjonen (Oracle-helperen
  manglet committende DML; mirrorer `pg-db-helper`).
- 2026-06-30 (round-trip): blind-agent regenererte testen fra speken alene; folde inn funn (spec-feil
  rettet, testen var allerede korrekt): (a) `RETURNING ID` er ikke mulig med `execute()` → speket sier
  nå INSERT + select-back; (b) navngitt `FAGSAK.SAKSNUMMER` eksplisitt (ikke `GSAK_SAKSNUMMER`);
  (c) pinnet dato-verdier (`SYSTIMESTAMP`/`SYSDATE`); (d) pinnet injeksjons-plassering (etter NV-UI,
  rett før fatte vedtak); (e) klargjort at førstegangsverdiene er 8148s (ikke komplett-NV-testens) og
  rettet path-drift (`tests/utenfor-avtaleland/workflows/...`); (f) lagt inn JOIN-fakta
  `AARSAVREGNING.BEHANDLINGSRESULTAT_ID = BEHANDLING.ID` i assertion 1. Agenten beholdt
  `forventetStatus:'OPPRETTET'` ordrett (mot gammel spec) — bekrefter at status-over-pinningen var en
  reell felle, allerede fjernet i assertion-robusthet-endringen over.
- 2026-06-30 (KRITISK — testet faktisk fiksen): kjørte testen lokalt og oppdaget at den opprinnelige
  «ren uten år»-varianten var **grønn også mot master** → testet ikke fiksen. Leste den faktiske
  melosys-api-fiksen (branch `8161-aarsavregning-uten-aar`: ny `harAktivÅrsavregningForÅr`-gate +
  api-IT `ÅrsavregningDuplikatGateIT`). Endret scenario 2 fra `test.fixme` til en **kjørbar** test som
  injiserer den FAKTISKE feilstien: aktiv ÅRSAVREGNING MED år men `RESULTAT_TYPE='MEDLEM_I_FOLKETRYGDEN'`
  (≠ IKKE_FASTSATT). **Verifisert lokalt:** scenario 2 RØD mot master-gaten (reproduserte
  `FunksjonellException: «Det finnes en annen åpen årsavregningsbehandling...»` fra
  `ÅrsavregningService.opprettÅrsavregning:91`), GRØNN mot 8161-fiks-gaten. Scenario 1 (uten år) grønn
  begge veier. **Bekreftet i CI:** fiks-image grønn (run 28441194646, 2 passed), latest rød på
  scenario 2 med eksakt ticket-feil (run 28441548657). Lærdom (lokal-først HARD GATE): kjør testen
  lokalt RØD-mot-base FØR du melder grønt — en test som er grønn mot base tester ikke fiksen. Kodifisert
  i `orchestrate-e2e-flow` + `muninn-delegation-handler`.
