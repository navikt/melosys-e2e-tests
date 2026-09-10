---
jira: MELOSYS-8161
epic: MELOSYS-7080 — Støtte til endringer i medlemskap og trygdeavgift for tidligere år
status: verified  # Tidligere kjøringsresultater er dokumentert under Verifiseringshistorikk.
test: tests/aarsavregning/aarsavregning-uten-aar-blokkerer-ikke.spec.ts
toggles: {}  # Funksjonsbryteren endres under testen; se teknisk testoppsett.
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

## Scenario 2 — Åpen årsavregning for samme år hindrer ny opprettelse

```gherkin
Gitt en FTRL-sak (PENSJONIST) med avgiftspliktige perioder i et foregående kalenderår
  Og det finnes allerede en åpen årsavregningsbehandling på saken
  Og den åpne behandlingen er knyttet til det aktuelle foregående kalenderåret

 Når saksbehandler fatter vedtak med endring i den avgiftspliktige perioden for det foregående året

 Så skal Melosys ikke automatisk opprette en ny årsavregningsbehandling
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

- **Hva skjer med den ufullstendige behandlingen (uten år)?** Spesifikasjonen krever ikke at den avsluttes automatisk — kun at den ikke blokkerer. Avklaring av om slike behandlinger skal ryddes opp automatisk hører hjemme i en separat sak.
- **FTRL YRKESAKTIV og ikke-skattepliktige:** Samme prinsipp er allerede fikset for tilsvarende flyt (MELOSYS-8045). Denne spesifikasjonen dekker kun `OppretteÅrsavregningVedEndring`-flyten; andre generatorer er ikke vurdert her.
- **Flere foregående år i samme vedtak:** Kombinasjonen «ufullstendig behandling uten år» + «vedtak som berører flere foregående år» er ikke eksplisitt dekket her — bekreft med fagperson om det trengs egne scenarier.
- **EØS Pensjonist / Offentlig Tjenestepensjon:** Disse sakstypene kan ha tilsvarende flyt; dekkes ikke av denne spesifikasjonen uten eksplisitt avklaring.

---

## Teknisk testoppsett

Testen oppretter en vedtatt FTRL-sak for inneværende år. Deretter endres perioden til kun
forrige år gjennom en ny vurdering. Rett før vedtaket fattes, legges en eksisterende
årsavregningsbehandling inn i databasen.

### Hva scenariene dekker

- **Uten år:** Behandlingen har et behandlingsresultat, men ingen rad i `AARSAVREGNING`.
  Den skal ikke hindre automatisk opprettelse. Den gamle implementasjonen fjernet også
  slike behandlinger med `.mapNotNull { it.årsavregning }`, så dette scenarioet var grønt
  både med og uten rettingen.
- **Med år:** Behandlingen har status `IVERKSETTER_VEDTAK`, resultattypen
  `FASTSATT_TRYGDEAVGIFT` og en rad i `AARSAVREGNING` for forrige år. Den gamle sjekken
  i `OppretteÅrsavregningVedEndring` filtrerte på `IKKE_FASTSATT` og overså behandlingen.
  Da startet opprettelsen, før duplikatkontrollen i
  `AarsavregningRepository.finnAntallÅrsavregningerPåFagsakForÅr` stanset den med en
  misvisende feilmelding. Rettingen bruker `ÅrsavregningService.harAktivÅrsavregningForÅr`
  til å oppdage den eksisterende behandlingen før opprettelsen starter.

Scenario 2 etterligner perioden mellom vedtaksfatting og avsluttet iverksetting.
`ÅrsavregningVedtakService` setter resultattypen til `FASTSATT_TRYGDEAVGIFT` og statusen
til `IVERKSETTER_VEDTAK`. Testen starter ikke selve iverksettingsprosessen for denne
behandlingen, slik at tilstanden varer fram til vedtaket for ny vurdering er ferdig.

### Saksbehandlingsflyt

Den faglige beskrivelsen gjelder FTRL pensjonist. Testen bruker FTRL yrkesaktiv og
samme oppsett som scenario 1 i
`tests/utenfor-avtaleland/workflows/aarsavregning-innhentingsbrev-saksbehandlingsflyt.spec.ts`.
`harTemaOgTypeSomSkalBehandles` i `OppretteÅrsavregningVedEndring` omfatter begge sakstypene.
Pensjonistflyten gjennom brukergrensesnittet dekkes ikke av denne testen.

Verdier merket `(verbatim)` er eksakte argumenter til `selectOption` og skal brukes ordrett.
Samme nedtrekksliste kan bruke ulike koder i ulike flyter.

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

**Funksjonsbryter og fakturastatus** (`UnleashHelper`, funksjonsbryter `melosys.faktureringskomponenten.ikke-tidligere-perioder`):
- **av** under førstegangsvedtaket for inneværende år,
- sett faktura-radene til `BESTILT` via `withFaktureringDatabase` (`UPDATE faktura SET status = 'BESTILT'`)
  — avregningen ved ny vurdering går ellers ikke gjennom,
- **på** igjen før ny vurdering (`OppretteÅrsavregningVedEndring` returnerer tidlig hvis funksjonsbryteren er av).

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

### Forutsetning i databasen: årsavregning uten år

`gittÅpenÅrsavregningUtenÅr(saksnummer)` legger inn behandlingen direkte i databasen.
Den opprettes etter navigasjonen for ny vurdering og rett før
`VedtakPage.fattVedtakForNyVurdering(...)`, slik at den ekstra åpne behandlingen ikke
påvirker hvilken behandling testen åpner i brukergrensesnittet.

1. Hent saksnummeret fra `FAGSAK.SAKSNUMMER`. Databasen tømmes før hver test, og testen
   kontrollerer at det finnes nøyaktig én fagsak. `GSAK_SAKSNUMMER` er koblingen til arkivsaken.
2. Opprett en rad i `BEHANDLING` med følgende verdier:

   | Kolonne | Verdi |
   |---|---|
   | `SAKSNUMMER` | Saksnummeret fra første steg |
   | `STATUS` | `OPPRETTET` |
   | `BEH_TYPE` | `ÅRSAVREGNING` |
   | `REGISTRERT_DATO`, `ENDRET_DATO` | `SYSTIMESTAMP` |
   | `REGISTRERT_AV`, `ENDRET_AV` | `Z123456` |
   | `BEH_TEMA` | `YRKESAKTIV` |
   | `BEHANDLINGSFRIST` | `SYSDATE` |

   Saksbehandleridenten må være satt for at behandlingen skal kunne åpnes i brukergrensesnittet.
   `BEHANDLING.ID` genereres av databasen. `DatabaseHelper.execute()` returnerer antall
   berørte rader, så ID-en hentes med et etterfølgende oppslag:
   `SELECT ID FROM BEHANDLING WHERE SAKSNUMMER = :s AND BEH_TYPE = 'ÅRSAVREGNING'`.
   På dette tidspunktet finnes bare én årsavregningsbehandling på saken.
3. Opprett et `BEHANDLINGSRESULTAT` med `BEHANDLING_ID` lik ID-en fra oppslaget,
   `BEHANDLINGSMAATE = 'MANUELT'`, `RESULTAT_TYPE = 'IKKE_FASTSATT'` og
   `REGISTRERT_DATO` og `ENDRET_DATO` satt til `SYSTIMESTAMP`.
4. La `AARSAVREGNING` stå uten rad for dette behandlingsresultatet. Kontroller at antallet
   rader med `BEHANDLINGSRESULTAT_ID = :id` er null.

Hjelpefunksjonen returnerer behandlingens ID. `DatabaseHelper.execute()` bruker `autoCommit`,
slik at API-et kan lese endringene fra sin egen databaseforbindelse.

### Kontroller i scenario 1

Etter vedtaket venter testen med `waitForProcessInstances` og kontrollerer følgende:

1. En ny årsavregningsbehandling finnes for `FORRIGE_AAR`. Opprettelsen skjer asynkront,
   så testen bruker `expect.poll` på oppslaget. `AARSAVREGNING.BEHANDLINGSRESULTAT_ID`
   viser til `BEHANDLINGSRESULTAT.BEHANDLING_ID`, som også er behandlingens ID.
2. Den nye behandlingen har typen `ÅRSAVREGNING`, en status ulik `AVSLUTTET`, et
   behandlingsresultat og en rad i `AARSAVREGNING` for forrige år.
3. Prosessen `OPPRETT_NY_BEHANDLING_AARSAVREGNING` på den nye behandlingen har status `FERDIG`.
4. Det finnes minst to årsavregningsbehandlinger, og behandlingen som ble lagt inn uten år
   finnes fortsatt. Testen kontrollerer ikke statusen eller året på denne behandlingen på nytt.

Den nye årsavregningen er ennå ikke ferdigbehandlet. Derfor brukes egne databasekontroller
framfor `verifiserAarsavregningBehandling`, som som standard forventer `AVSLUTTET` og at
alle tilhørende prosesser er ferdige.

`waitForProcessInstances` kaster et unntak hvis en prosess har feilet. Testens kontroll av
Docker-loggene fanger også API-feil; testen har ikke merket `@expect-docker-errors`.
Feilmeldinger i brukergrensesnittet kontrolleres ikke direkte.

### Forutsetning og kontroller i scenario 2

`gittÅpenÅrsavregningMedÅr(saksnummer, FORRIGE_AAR)` bruker samme databaseoppsett som
scenario 1, med disse forskjellene:

- `BEHANDLING.STATUS = 'IVERKSETTER_VEDTAK'`.
- `BEHANDLINGSRESULTAT.RESULTAT_TYPE = 'FASTSATT_TRYGDEAVGIFT'`.
- En rad legges inn i `AARSAVREGNING` med `BEHANDLINGSRESULTAT_ID` lik behandlingens ID
  og `AAR = FORRIGE_AAR`. Begge kolonnene inngår i primærnøkkelen og må ha verdi.
- Testen kontrollerer at raden for året finnes før vedtaket fattes.

Etter vedtaket skal `waitForProcessInstances` fullføre uten feil. Testen kontrollerer at
ingen ny årsavregning er opprettet for året, at det fortsatt finnes nøyaktig én årsavregning
for året, og at behandlingen som ble lagt inn fortsatt finnes.

Tilbakestilling gjennom `resetEksisterendeÅrsavregning` dekkes ikke. Det tilhørende faglige
akseptansekriteriet over er fortsatt markert for avklaring.

Begge scenariene avsluttes med `waitForProcessInstances(page.request, 30)` før databasen ryddes.

### Verifiseringshistorikk

Tidligere dokumenterte kjøringer fra 2026-06-30 brukte `OPPRETTET` og
`MEDLEM_I_FOLKETRYGDEN` i scenario 2. Med det oppsettet var scenario 1 grønt både mot
master og rettingen. Scenario 2 feilet mot master og var grønt med rettingen.
De registrerte CI-kjøringene var 28441194646 med rettingen (begge scenariene grønne)
og 28441548657 med `latest` (scenario 2 feilet med feilmeldingen om en annen åpen årsavregning).

Testoppsettet ble senere endret til `IVERKSETTER_VEDTAK` og `FASTSATT_TRYGDEAVGIFT`
for å etterligne en årsavregning under iverksetting. Kjøringene over dokumenterer det tidligere
oppsettet. De er ikke en bekreftelse på at det nåværende oppsettet er kjørt.
