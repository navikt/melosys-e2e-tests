---
jira: MELOSYS-8163
epic: MELOSYS-7080 — Støtte til endringer i medlemskap og trygdeavgift for tidligere år
status: implemented   # begge scenarier verifisert grønt LOKALT mot feature-branchene (2026-07-01); venter på CI-kjøring mot pushede images før verified
test: tests/eu-eos/aarsavregning-automatisk-eos-tjenesteperson-pensjonist.spec.ts
toggles: {}            # default-state generelt; toggle-overstyring for blokkerings-scenariene er testmekanikk (se binding)
tags: [årsavregning, brev, innhenting, eu-eos, tjenesteperson, pensjonist, lovvalg, saksbehandlingsflyt]
analysis_trace_id: 22c51252-8947-4eef-931e-cd718c4e16a4
---

# Automatisk årsavregning ved vedtak for EU/EØS — offentlig tjenesteperson og EØS pensjonist

## Forretningsregel

Når NAV fatter vedtak om trygdeavgift for perioder som strekker seg inn i et **tidligere
kalenderår**, skal endelig trygdeavgift for det aktuelle året fastsettes gjennom en
**årsavregningsbehandling** (skatteforvaltningsforskriften § 2-13-2).

For **EØS offentlig tjenesteperson og flyvende personell** (forordning 883/2004 art. 11 nr. 3
bokstav b) er det NAV som beregner og krever inn trygdeavgiften direkte, og vedkommende er ikke
nødvendigvis skattepliktig i Norge — Melosys må derfor innhente inntektsopplysninger aktivt ved å
sende brev til bruker eller fullmektig. Perioden som legges til grunn for brevet er
**lovvalgsperioden** (helse rettigheter dekkes), ikke en norsk medlemskapsperiode.

For **EØS pensjonist** (sakstype EU/EØS, tema trygdeavgift) er vedkommende skattepliktig i Norge og
Skatteetaten vil ha inntektsdata — det sendes derfor **ikke** innhentingsbrev. Selve
årsavregningsbehandlingen opprettes likevel automatisk slik at saksbehandler kan gjennomføre
oppgjøret når skatteoppgjøret foreligger.

Disse to sakstypene utvides til å følge den samme automatikken som allerede gjelder for FTRL-saker
([MELOSYS-7827](https://nav.atlassian.net/browse/MELOSYS-7827)/[7828](https://nav.atlassian.net/browse/MELOSYS-7828)/[8148](https://nav.atlassian.net/browse/MELOSYS-8148)),
jf. epiken MELOSYS-7080. Frem til de respektive sakstypenes egen årsavregningsflyt er ferdigstilt
([MELOSYS-7599](https://nav.atlassian.net/browse/MELOSYS-7599) m.fl.) vises en **blokkerende
melding** i årsavregningsflyten som forteller saksbehandler at årsavregning ikke støttes enda for
denne sakstype/-tema-kombinasjonen.

*Søsteroppgave: [MELOSYS-8148](https://nav.atlassian.net/browse/MELOSYS-8148) (samme
brev-mekanikk for FTRL) — brukes som implementasjonsmønster.*

## Scenario A — EØS offentlig tjenesteperson (art. 11.3b): automatisk årsavregning med innhentingsbrev

```gherkin
Gitt at jeg er saksbehandler og behandler en EØS-sak
     med sakstype/tema/behandlingstema EU/EØS – Medlemskap og lovvalg – Offentlig tjenesteperson eller flyvende personell
     og lovvalgsbestemmelse er forordning 883/2004 art. 11 nr. 3 bokstav b
  Og vedtaket gjelder en periode som helt eller delvis faller i et tidligere kalenderår
  Og det finnes ingen åpen årsavregningsbehandling for dette tidligere kalenderåret fra før
 Når jeg fatter vedtak (førstegangsbehandling eller ny vurdering/manglende innbetaling)
  Så oppretter Melosys automatisk én årsavregningsbehandling for det tidligere kalenderåret
   Og årsavregningsbehandlingens år er satt til det aktuelle tidligere kalenderåret
   Og Melosys sender automatisk ett innhentingsbrev til bruker eller brukers fullmektig
   Og perioden som er flettet inn i brevet er hentet fra lovvalgsperioden (helse rettigheter dekkes) for det aktuelle året
  Og når jeg åpner den automatisk opprettede årsavregningsbehandlingen
  Så vises en melding om at årsavregning ikke er støttet enda for denne sakstypen
   Og jeg kan ikke bekrefte årsavregningssteget eller fatte årsavregningsvedtak
```

## Scenario B — EØS pensjonist: automatisk årsavregning uten innhentingsbrev

```gherkin
Gitt at jeg er saksbehandler og behandler en EØS-sak
     med sakstype/tema/behandlingstema EU/EØS – Trygdeavgift – Pensjonist
  Og vedtaket gjelder en periode som helt eller delvis faller i et tidligere kalenderår
  Og det finnes ingen åpen årsavregningsbehandling for dette tidligere kalenderåret fra før
 Når jeg fatter vedtak (førstegangsbehandling eller ny vurdering/manglende innbetaling)
  Så oppretter Melosys automatisk én årsavregningsbehandling for det tidligere kalenderåret
   Og det sendes ikke noe innhentingsbrev
  Og når jeg åpner den automatisk opprettede årsavregningsbehandlingen (før pensjonist-togglen er satt i produksjon)
  Så vises en melding om at årsavregning ikke er støttet enda for denne sakstypen
```

## Akseptansekriterier (det fagperson signerer av på)

**EØS offentlig tjenesteperson (art. 11.3b) — scenario A:**
- [ ] Ved vedtak som berører et tidligere kalenderår opprettes årsavregningsbehandling automatisk etter ferdigstilling
- [ ] Årsavregningsbehandlingens år er korrekt satt til det aktuelle tidligere kalenderåret
- [ ] Det sendes automatisk ett innhentingsbrev
- [ ] Perioden flettet inn i brevet er lovvalgsperioden (helse rettigheter dekkes) for det aktuelle kalenderåret — ikke en norsk medlemskapsperiode
- [ ] Det vises en blokkerende melding i årsavregningsflyten: *"Melosys støtter ikke årsavregning for denne kombinasjonen av sakstype/-tema. Støtte vil bli gjort tilgjengelig senere."*
- [ ] Saksbehandler kan ikke bekrefte årsavregningssteget eller fatte årsavregningsvedtak så lenge meldingen vises

**EØS pensjonist — scenario B:**
- [ ] Ved vedtak som berører et tidligere kalenderår opprettes årsavregningsbehandling automatisk etter ferdigstilling
- [ ] Det sendes *ikke* innhentingsbrev
- [ ] Det vises en blokkerende melding i årsavregningsflyten med samme tekst som over, gitt at `MELOSYS_ÅRSAVREGNING_EØS_PENSJONIST`-togglen er av (pre-prod-simulering — i dette testmiljøet er togglen normalt PÅ, se binding)

## Kjente avgrensninger (ikke dekket her)

- **Scenario C (flere tidligere kalenderår), D/E/F (åpen/avsluttet årsavregning-gating)** er ikke
  egne kjørbare scenarier i denne speken. Duplikat-gaten (`harAktivÅrsavregningForÅr`) er verifisert
  **sakstype-agnostisk** i [MELOSYS-8161](https://nav.atlassian.net/browse/MELOSYS-8161) (spørring
  på år, ikke sakstype) — samme gate brukes av `OppretteÅrsavregningVedEndring` for alle sakstyper.
  Å re-kjøre D/E/F for EU/EØS spesifikt ville testet identisk kode-sti som 8161 allerede dekker.
  Scenario C (fler-år) er heller ikke isolert dekket for EU/EØS av samme grunn — logikken som
  itererer `årMedEndringer` er felles med FTRL.
- **Grunnlagskopiering** ("tidligere fastsatt grunnlag er kopiert over") asserteres ikke eksplisitt
  — begge testscenariene har ikke noe forhåndsfastsatt trygdeavgiftsgrunnlag for det tidligere året
  (perioden ligger utelukkende i fortiden allerede på førstegangsbehandlingen), så det er intet
  grunnlag å kopiere i disse to kjørbare scenariene. Dekkes indirekte av eksisterende
  `eos-pensjonist-aarsavregning-direkte-grunnlag-beregn.spec.ts`.
- **Fullmektig-mottaker for tjenesteperson-brevet**: ingen e2e-fikstur for `FULLMEKTIG_SØKNAD`
  finnes ennå (samme avgrensning som 8122/8148) — scenario A tester kun bruker-som-mottaker.
- **Avkobling av blokkerende melding når begge togglene settes PÅ i produksjon**: selve
  sluttilstanden (melding forsvinner helt) er ikke i scope her — kun at meldingen vises korrekt i
  dagens (pre-prod) toggle-tilstand.
- **Selve gjennomføringen av årsavregningsbehandlingen** (fastsetting, differanseberegning, vedtak)
  for disse to sakstypene er egne epos, ikke dekket av denne speken.

---

## Teknisk binding
*(for testagenten — domeneleseren kan stoppe over linjen)*

> **Verbatim-regel:** verdier merket `(verbatim)` er flyt-spesifikke `selectOption`/tekst-argumenter
> og skal brukes **ordrett**. Ikke "korriger" dem mot eksempelverdier i POM-ens JSDoc — samme
> dropdown/tekstvalg bruker ulike koder i ulike flyter.

> **Status-merknad (2026-07-01):** Skrevet parallelt med at melosys-api-claude og melosys-web
> implementerer MELOSYS-8163 på hver sin side (bekreftet via hivemind). Per nå:
> - Auto-opprett-logikken for begge sakstypene (`OppretteÅrsavregningVedEndring.kt` linje 47-52)
>   er **allerede i main** — auto-opprettelsesdelen av scenario A og B kan derfor være grønn
>   allerede før feature-branchen lander.
> - Brevperiode-mapperen (`InnhentingAvInntektsopplysningerMapper.kt`) leser i dag hardkodet
>   `medlemskapsperioder` i stedet for `Behandlingsresultat.finnAvgiftspliktigPerioder()` — bekreftet
>   gap av melosys-api-claude. Ingen ny prosessdata-parameter trengs (transparent for e2e, samme
>   `PROSESSINSTANS`-mønster som 8122/8148); brevet **sendes** allerede i dag, men perioden i `DATA`
>   kan være feil (medlemskapsperiode i stedet for lovvalgsperiode) til mapper-fiksen lander.
>   Assertionen for "riktig periode" er derfor bundet **format-robust** (brevmal-treff + FERDIG),
>   ikke en eksakt dato-diff mot `DATA` — se «Assertions» under.
> - Toggle `MELOSYS_ÅRSAVREGNING_EØS_TJENESTEPERSON = "melosys.arsavregning.eos_tjenesteperson"`
>   (bekreftet navn fra melosys-api-claude) og den blokkerende meldingen i melosys-web finnes
>   **ikke i main ennå** — blokkerings-delen av scenario A og B er derfor forventet **rød mot main**
>   til begge branchene lander. `UnleashHelper.disableFeature()` oppretter togglen automatisk om den
>   ikke finnes (`createFeatureIfNotExists`), så testen kan skrives mot togglenavnet uten å vente på
>   at backend legger den i `ToggleName.kt`.
> - Branch-navn (api): `8163-arsavregning-eos-tjenesteperson` (meldt av melosys-api-claude, pushes
>   snart). Branch-navn (web): `feature/8163-arsavregning-eos-melding` (bekreftet av melosys-web).
> - **Bekreftet av melosys-web (hivemind 2026-07-01):** meldingsteksten er **eksakt** ordrett fra
>   Jira (merk bindestrek i «sakstype/-tema»): *"Melosys støtter ikke årsavregning for denne
>   kombinasjonen av sakstype/-tema. Støtte vil bli gjort tilgjengelig senere."* Elementet har
>   `data-testid="aarsavregning-ikke-stottet-sakstype"` (ny komponent
>   `ÅrsavregningIkkeStøttetSakstypeMelding` i
>   `src/sider/aarsavregning/stegKomponenter/vurderingAarsavregning/komponenter/aarsavregningsmeldinger.tsx`).
>   Blokkeringsmekanikken er **ikke** en disabled-knapp på årsavregningssteget — hele
>   bekreft-underskjemaet (inkl. årsvelgeren `#aarVelger`) skjules når meldingen vises. (På det
>   senere Vedtak-steget er «Fatt vedtak» i stedet synlig men `disabled` — ikke bundet i denne
>   speken siden scenariene stopper på årsavregningssteget.)

### Felles mønster med MELOSYS-8148

Trigger-shapen (FØRSTEGANG med periode utelukkende i et tidligere år → trygdeavgift-steget viser
kun varselet «tidligere år skal fastsettes på årsavregning» → «Bekreft og send»/«Fatt vedtak» →
`OppretteÅrsavregningVedEndring` auto-oppretter årsavregningen) er identisk med
`setupPensjonistUtenGrunnlagMedAutoAarsavregning` i
`tests/aarsavregning/pensjonist-aarsavregning-setup.ts` — denne speken bruker samme shape for
tjenesteperson-sakstypen (ny hjelpefunksjon, se under) i stedet for ny vurdering, siden det unngår
den ekstra NV-runden og faktura-koreografien som 8148 trengte for FTRL.

### Scenario A (kjørbar) — tjenesteperson, FØRSTEGANG med periode i tidligere år

**Saksopprettelse:**
- bruker: `USER_ID_VALID` (`30056928150`, "TRIVIELL KARAFFEL")
- `HovedsidePage.gotoOgOpprettNySak()` · `OpprettNySakPage`: `fyllInnBrukerID(USER_ID_VALID)` ·
  `velgOpprettNySak()` · `velgSakstype(SAKSTYPER.EU_EOS)` ·
  `velgSakstema(SAKSTEMA.MEDLEMSKAP_LOVVALG)` ·
  `velgBehandlingstema(BEHANDLINGSTEMA.ARBEID_TJENESTEPERSON_ELLER_FLY)` ·
  `velgAarsak(AARSAK.SØKNAD)`
- Søknadsperiode: **`TestPeriods.previousYearPeriod`** (hele forrige kalenderår — i motsetning til
  `eu-eos-art11-3b-offentlig-tjenesteperson-trygdeavgift.spec.ts` som bruker
  `fullCurrentYearPeriod` nettopp for å UNNGÅ tidligere-år-varselet; her er det poenget) ·
  `velgArbeidsland(EU_EOS_LAND.BULGARIA)`
- `leggBehandlingIMine()` · `klikkOpprettNyBehandling()` · `assertions.verifiserBehandlingOpprettet()`
- `waitForProcessInstances(page.request, 30)` · `hovedside.goto()`

**Behandlingsflyt:**
- Åpne behandlingen (lenke matcher `${USER_ID_VALID}.*Medlemskap og lovvalg.*Offentlig`)
- `EuEosBehandlingPage.klikkBekreftOgFortsett()` (Medlemskap-steget)
- `velgArbeidsgiverOgFortsett('Ståles Stål AS')` (Arbeidsforhold)
- `velgLovvalgsbestemmelse(EU_EOS_LOVVALG.ART_11_3_B)` **(verbatim)** · deretter
  `klikkBekreftOgFortsett({ waitForContent: page.getByText(/tidligere år skal fastsettes på årsavregning/i).first(), verifyHeadingChange: true })`
  — samme «tomt steg»-mønster som
  `EuEosPensjonistBehandlingPage.klikkBekreftOgFortsettTilTomtTrygdeavgiftSteg()`, men på den
  generiske `EuEosBehandlingPage` (ingen egen pensjonist-only-metode finnes for denne sakstypen).
  > Antakelse markert for lokal verifisering: at trygdeavgift-steget for
  > `ARBEID_TJENESTEPERSON_ELLER_FLY` med periode utelukkende i tidligere år viser nøyaktig samme
  > varseltekst som FTRL/pensjonist-varianten. Bekreftes/korrigeres ved første lokale kjøring
  > (round-trip-gaten fanger evt. avvik).
- `TrygdeavgiftPage.klikkBekreftOgFortsett()` — **ikke** `ventPåSideLastet()` først (tomt steg har
  ingen `Skattepliktig`-gruppe å vente på, samme grunn som pensjonist-uten-grunnlag-fixturen hopper
  over den)
- `VedtakPage.klikkFattVedtak()` · `waitForProcessInstances(page.request, 60)`

**Finn auto-opprettet årsavregning:** `hovedside.goto()` ·
`hovedside.åpneAarsavregningForSaksnummer(saksnummer)` (saksnummeret hentes fra URL etter
saksopprettelse, samme `hentSaksnummerFraUrl`-mønster som i `pensjonist-aarsavregning-setup.ts` —
gjenbruk funksjonen derfra, eller dupliser lokalt om `MEL-`-prefikset ikke gjelder for denne
sakstype-URL-en; bekreft mønster ved lokal kjøring) · les `behandlingID` fra URL
(`page.waitForURL(/behandlingID=\d+/)`)

**Assertions (binder «Så»-linjene):**
- `verifiserAarsavregningBehandling(behandlingId, { forventetStatus: 'UNDER_BEHANDLING', forventetResultatType: 'IKKE_FASTSATT', forventetAar: <forrige år> })`
  (`pages/behandling/aarsavregning.assertions.ts`) — samme mønster som `eos-pensjonist-aarsavregning-uten-grunnlag.spec.ts`:
  auto-opprettet men ikke saksbehandlet årsavregning er `UNDER_BEHANDLING`/`IKKE_FASTSATT`, ikke
  `AVSLUTTET`.
- Innhentingsbrev: `verifiserInnhentingsbrevSendt([USER_ID_VALID, '1111111111111'], siden)` —
  samme helper og robusthetsmønster som 8122/8148 (`hentDbTidspunkt()` rett før vedtaket fanges som
  `siden`). **Ikke** en eksakt periode-dato-assert mot `DATA` (se status-merknad over — mapper-gapet).
- Blokkerende melding (delvis avhengig av toggle som ikke finnes i main ennå, se status-merknad):
  `unleash.disableFeature('melosys.arsavregning.eos_tjenesteperson')` FØR behandlingen åpnes ·
  forvent tekst `/Melosys støtter ikke årsavregning for denne kombinasjonen av sakstype.{0,2}tema/i`
  synlig · `AarsavregningAssertions`-utvidelse eller lokal `expect(...).toBeVisible()` for både
  meldingen og at `Bekreft og fortsett`-knappen er deaktivert/skjult. **Eksakt selector ikke
  bekreftet av melosys-web ved spec-skriving** — oppdater ved lokal kjøring/round-trip når web-siden
  finnes (se status-merknad).

### Scenario B (kjørbar) — pensjonist, uten grunnlag, blokkerende melding

Gjenbruker `setupPensjonistUtenGrunnlagMedAutoAarsavregning` fra
`tests/aarsavregning/pensjonist-aarsavregning-setup.ts` **uendret** for saksopprettelse +
auto-opprettelse (allerede verifisert grønn av eksisterende `eos-pensjonist-aarsavregning-uten-grunnlag.spec.ts`
og brukt negativt i `aarsavregning-innhentingsbrev-saksbehandlingsflyt.spec.ts` scenario 4 for
å bevise fravær av brev). Denne speken legger **kun til** blokkerings-assertionen som 8163 introduserer:

- `const unleash = new UnleashHelper(request); await unleash.disableFeature('melosys.arsavregning.eos_pensjonist');`
  **FØR** `setupPensjonistUtenGrunnlagMedAutoAarsavregning(page)` kalles — simulerer pre-prod-tilstand
  (i dette testmiljøet er togglen normalt PÅ per default, se `helpers/unleash-helper.ts` linje 356;
  cleanup-fixturen resetter til default FØR testen, så eksplisitt disable må skje i selve testen).
- Etter at fikstur-funksjonen returnerer `{ aarsavregning, vedtak, behandlingId }` (siden `hovedside.åpneAarsavregningForSaksnummer`
  allerede har navigert dit): assert samme blokkerende meldingstekst som scenario A.
- **Ingen brev-assertion i denne speken** — det er allerede dekket negativt av 8148 scenario 4.

### Assertions — fellesnevner

Avslutt hver test med `waitForProcessInstances(page.request, 30)` slik at cleanup-fixturen ikke
treffer aktive prosessinstanser.

**Page Objects:** `HovedsidePage`, `OpprettNySakPage`, `EuEosBehandlingPage`, `TrygdeavgiftPage`,
`VedtakPage`, `AarsavregningPage` (+ `assertions`), `EuEosPensjonistBehandlingPage` (via
gjenbrukt fikstur)
**Konstanter:** `pages/shared/constants.ts` (`USER_ID_VALID`, `SAKSTYPER`, `SAKSTEMA`,
`BEHANDLINGSTEMA`, `AARSAK`, `EU_EOS_LAND`, `EU_EOS_LOVVALG`)
**Hjelpere:** `helpers/api-helper.ts` (`waitForProcessInstances`), `helpers/db-helper.ts`
(`withDatabase`, `hentDbTidspunkt`), `helpers/date-helper.ts` (`TestPeriods`),
`helpers/unleash-helper.ts` (`UnleashHelper`),
`tests/aarsavregning/pensjonist-aarsavregning-setup.ts` (`setupPensjonistUtenGrunnlagMedAutoAarsavregning`),
`pages/behandling/aarsavregning.assertions.ts` (`verifiserAarsavregningBehandling`),
brev-helperen `verifiserInnhentingsbrevSendt` (samme modul/mønster som i
`aarsavregning-innhentingsbrev-automatisk.spec.ts`)

### Endringslogg (teknisk binding)

- 2026-07-01: Spec opprettet for MELOSYS-8163, delegert via hivemind fra melosys-2 (run:c9f7424f).
  Bundet parallelt med at melosys-api-claude og melosys-web implementerer feature-branchene.
  Bekreftet med melosys-api-claude: toggle-navn `melosys.arsavregning.eos_tjenesteperson`, og at
  brevperiode-gapet er isolert til `InnhentingAvInntektsopplysningerMapper.kt` (ingen ny
  prosessdata-parameter). Web-branch og eksakt meldings-selector ikke bekreftet ved skriving —
  markert som antakelse, oppdateres ved lokal kjøring/round-trip.
- 2026-07-01 (lokal kjøring mot main): Begge scenariene kjørt lokalt. Antakelsene i scenario A
  (tomt trygdeavgift-steg via `waitForContent`-mønster, `verifiserAarsavregningBehandling`) stemte
  på første forsøk. Auto-opprettelsen og innhentingsbrevet er **allerede grønt mot main** for begge
  sakstyper: scenario A ga `ÅRSAVREGNING/UNDER_BEHANDLING/IKKE_FASTSATT/år 2025` +
  `OPPRETT_OG_DISTRIBUER_BREV` FERDIG. Begge scenariene feilet deretter **eksakt og kun** på den
  blokkerende meldingen mot main, som forventet.
- 2026-07-01 (verifisert mot feature-branchene): melosys-api-claude pushet
  `8163-arsavregning-eos-tjenesteperson` (toggle + mapper-fiks) og melosys-web pushet
  `feature/8163-arsavregning-eos-melding` (selve meldingskomponenten). Kjørte lokalt mot begge
  friskt restartet. **Scenario B (pensjonist) VERIFISERT GRØNT** end-to-end, inkl. den nye
  blokkerende meldingen og at bekreft-underskjemaet (`Bekreft og fortsett`-knappen — IKKE
  `#aarVelger`, som alltid rendres uansett blokkering) er skjult. Rettet to bindingsfeil underveis:
  (1) `#aarVelger`-antakelsen var feil — byttet til å assertere fravær av «Bekreft og
  fortsett»-knappen; (2) la til en poll+reload-retry i `verifiserBlokkerendeMelding` for å tåle at
  melosys-web sin featuretoggle-cache kun hentes én gang per SPA-økt (rammeverk-mount), som kan
  ligge bak melosys-api sin egen Unleash-poll-interval.
- 2026-07-01 (funn, rapportert til melosys-web): **Scenario A (tjenesteperson) blokkert av en
  konkret, deterministisk gap i melosys-web** — ikke et timing-problem. `src/url/url.ts` sin
  `skalViseIngenFlyt()` har en ubetinget blokk (`behandlingstema ===
  ARBEID_TJENESTEPERSON_ELLER_FLY && behandlingstype === ÅRSAVREGNING → return true`) som **alltid**
  ruter en tjenesteperson-årsavregning til `/EU_EOS/behandling/...` (den gamle generiske
  `IngenFlytBehandling`/`IngenFlytÅrsavregningMelding`-fallback-siden), uavhengig av toggle-state —
  i motsetning til pensjonist-blokken rett under som sjekker `erPensjonistToggleEnabled_EØS`. Den
  auto-opprettede årsavregningen når derfor **aldri** frem til `/EU_EOS/aarsavregning/...` der den
  nye `ÅrsavregningIkkeStøttetSakstypeMelding`-komponenten lever. Bekreftet ved kodelesning (ikke
  bare observasjon) — reproduserbart 100 % lokalt, saksbehandler havner på en generisk
  «Fullmektig»-sidepanel-side. Rapportert til melosys-web med fil/linje + forslag (gjør blokken
  toggle-bevisst som pensjonist, eller fjern den helt siden wizarden nå har sin egen intern
  blokkering). Status forblir `implemented` til denne routing-fiksen lander; scenario B er allerede
  `verified`.
- 2026-07-01 (fikset av melosys-web, verifisert lokalt): melosys-web fjernet den hardkodede
  blokken helt (commit `13d82a28a`, branch `feature/8163-arsavregning-eos-melding`) — sporet
  gjennom at `skalViseIngenFlyt()` uten den korrekt faller gjennom til `return false` for denne
  kombinasjonen uansett toggle-state, slik at `lagUrl` alltid ruter til `/EU_EOS/aarsavregning/...`.
  Lagt til regresjonstest i `url.test.ts` (web-repoet). **Begge scenarier (A + B) VERIFISERT GRØNT
  LOKALT** mot friskt restartet melosys-web (13d82a28a) + melosys-api
  (8163-arsavregning-eos-tjenesteperson): 2 passed, 59.5s. Gjenstår: CI-kjøring mot pushede
  feature-images (delegert egen CI-runde fra melosys-2, run:c9f7424f) før status heves til
  `verified`.
