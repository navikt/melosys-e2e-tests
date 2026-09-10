---
jira: MELOSYS-7821
epic: MELOSYS-7819 Eksterne endringsbehov 2026
status: implemented
test: tests/core/arkivsak-token-basert-tilgang.spec.ts
toggles: {}                       # ingen avvik fra default
tags: [arkivsak, sak, joark, saf, journalføring, eessi, autentisering, token, behavior-equivalence, integrasjon]
---

# Token-basert arkivsak-tilgang — journalføring og EESSI-saksflyt uendret etter auth-bytte

## Forretningsregel

NAV krever at alle system-til-system-integrasjoner bruker token-basert autentisering
(OAuth2 / Azure AD Entra), ikke Basic auth. Basic auth mot Sak-API-et er meldt avviklet på
NAV-plattformen (ref. Slack-tråd [#C92481HSP](https://nav-it.slack.com/archives/C92481HSP/p1768225493881929)).
Melosys plikter å bytte til SAF [`saker`-query](https://confluence.adeo.no/spaces/BOA/pages/402023600/Query+saker)
(eller Entra-token mot Sak) i alle applikasjoner som i dag bruker Basic auth for
arkivsak-oppslag. Kravet gjelder både `melosys-api` og `melosys-eessi`. Bakgrunnen for at
Basic auth nå stikker seg ut er at tilgangskontrollen i melosys-eessi allerede er migrert fra
STS til Azure AD ([MELOSYS-6530](https://nav.atlassian.net/browse/MELOSYS-6530)).

Dette er en **ren autentiserings-endring**: forretnings­atferden skal være *identisk* før og
etter bytten. Arkivsak-oppslaget er forutsetningen for at en sak kan kobles til en arkivsak
(GSAK) og at dokumenter (vedtaksbrev, SED-er) kan journalføres mot riktig sak. Testen er
derfor en **behavior-equivalence-kontrakt**: den verifiserer at journalføring, arkivsak-kobling
og EESSI-saksflyt fortsatt fungerer etter at autentiseringen er byttet — ikke *hvilken*
autentiseringsmekanisme som brukes (se «Kjente avgrensninger»).

## Scenario

### Scenario 1 — Inngående EESSI-saksflyt: SED rutes, journalføres og kobles til arkivsak (melosys-eessi + melosys-api)

```gherkin
Gitt at en EU/EØS-partner sender en A003 (lovvalg i annet land) til NAV
  Og melosys må slå opp / koble saken til en arkivsak som ledd i EESSI-behandlingen
 Når SED-en mottas og behandles
 Så opprettes en behandling rutet til riktig tema (BESLUTNING_LOVVALG_ANNET_LAND) uten feilede prosesser
  Og den inngående SED-en journalføres som en INNGAAENDE EESSI-journalpost knyttet til saken
  Og saken er koblet til en arkivsak (GSAK) — beviset på at arkivsak-oppslaget mot Sak ga et brukbart resultat
  Og EESSI-saksflyten er funksjonelt uendret som følge av autentiseringsbytten
```

### Scenario 2 — Utgående journalføring: vedtaksbrev journalføres mot arkivsak (melosys-api)

```gherkin
Gitt at en saksbehandler fatter et FTRL § 2-8-vedtak (frivillig medlemskap)
  Og melosys-api må slå opp / koble saken til en arkivsak for å journalføre vedtaksbrevet
 Når vedtaket iverksettes
 Så avsluttes behandlingen med korrekt resultat (MEDLEM_I_FOLKETRYGDEN) via IVERKSETT_VEDTAK_FTRL
  Og vedtaksbrevet journalføres som en ferdigstilt UTGAAENDE journalpost til riktig mottaker
  Og saken er koblet til en arkivsak (GSAK) — beviset på at arkivsak-oppslaget mot Sak ga et brukbart resultat
  Og journalføringen og arkiveringen er funksjonelt uendret som følge av autentiseringsbytten
```

## Akseptansekriterier (det fagperson signerer av på)

Speilet fra [domenespeken](https://nav.atlassian.net/browse/MELOSYS-7821). Markert med
hvordan hvert kriterium dekkes (E2E = denne testen; **utenfor E2E** = dekkes av enhets-/
integrasjonstest i tjenesten og verifisering i Q1/Q2, jf. «Kjente avgrensninger»):

- [ ] `melosys-api` gjør ingen Basic-auth-kall mot Sak ved arkivsak-oppslag — kun token-baserte kall — *utenfor E2E*
- [ ] `melosys-eessi` gjør ingen Basic-auth-kall mot Sak ved arkivsak-oppslag — kun token-baserte kall — *utenfor E2E*
- [ ] Arkivsak-informasjon hentes korrekt via SAF `saker`-query (eller Entra-token mot Sak) — valgt spor dokumentert — *E2E verifiserer at oppslaget gir en brukbar arkivsak-kobling (GSAK); valg av spor/mekanisme er utenfor E2E*
- [ ] Journalføring og arkivering av dokumenter (vedtak, brev, SED-er) fungerer uendret etter bytten — *E2E (S1 INNGAAENDE SED-journalpost + S2 UTGAAENDE vedtaksbrev-journalpost)*
- [ ] EESSI-saksflyt (BUC-kobling, SED-journalføring) er upåvirket av autentiseringsendringen — *E2E (S1 ruting + journalføring + ingen feilede prosesser)*
- [ ] Løsningen er verifisert i testmiljø (Q1 og/eller Q2) uten feil — *utenfor E2E (krever ekte Sak/SAF med ekte token)*

## Kjente avgrensninger (ikke dekket her)

- **Selve autentiseringsmekanismen (Basic vs. token) er ikke E2E-observerbar.** I den lokale/
  CI-stacken er Sak/SAF/Joark *mocket* (melosys-mock på `:8083`), og mocken validerer ikke
  auth-headeren. E2E kan derfor verken se «Basic ble brukt» eller «token ble brukt», og kan
  ikke teste at «konfigurasjon med Basic-auth-kredentialer avvises». Det at melosys-api/eessi
  faktisk *sender* et Entra-token (og avviser Basic) hører til enhets-/integrasjonstester i
  tjenestene og til verifisering i Q1/Q2. Per spec-driven-modellen står disse `Så`-linjene
  likevel i domenelaget som fagpersonens godkjente intensjon — men de er bevisst utelatt fra
  testens assertions (se Så→assertion-mappingen i teknisk binding).
- **Oppslag vs. oppretting av arkivsak skilles ikke på dette laget.** GSAK-koblingen
  (`FAGSAK.GSAK_SAKSNUMMER`) er beviset på at Sak-integrasjonen — det auth-bytten gjelder —
  ga et brukbart resultat. Domenespeken avgrenser scope til *oppslag* (`saker`-query), ikke
  *oppretting* av ny arkivsak; den distinksjonen er ikke synlig i DB-fotavtrykket.
- **Valg mellom SAF `saker`-query og Entra-token-mot-Sak** er en teknisk beslutning som ikke er
  avklart, og som påvirker scope for [MELOSYS-8048](https://nav.atlassian.net/browse/MELOSYS-8048)
  (full utfasing av Sak-API). E2E er agnostisk til valgt spor — den verifiserer kun
  sluttilstanden (arkivsak koblet + journalført).
- **melosys-skjema-api og andre tjenester** som eventuelt bruker arkivsak er ikke vurdert — kun
  melosys-api og melosys-eessi som nevnt i Jira.

---

## Teknisk binding
*(for testagenten — domeneleseren kan stoppe over linjen)*

> **Verbatim-regel:** verdier merket `(verbatim)` er flyt-spesifikke enum-koder, tema-navn eller
> mottaker-verdier og skal brukes ordrett. Ikke «korriger» mot generiske POM-eksempler.

> **Behavior-equivalence-rasjonale.** Denne testen er en regresjonskontrakt for en
> auth-endring som er usynlig på E2E-laget. Den asserterer det *funksjonelle fotavtrykket* av et
> velfungerende arkivsak-oppslag: (a) saken kobles til en arkivsak (`FAGSAK.GSAK_SAKSNUMMER`
> satt — live-verifisert 2026-06-24: `MEL-222 → GSAK 4026375`), og (b) dokumenter journalføres
> mot saken (`sakId` på journalposten = `BEHANDLING.SAKSNUMMER`). Ingen eksisterende test
> asserterer GSAK-koblingen — den er valgt nettopp fordi den er det nærmeste E2E-observerbare
> beviset på at Sak-integrasjonen (det auth-bytten gjelder) returnerer et brukbart resultat.
> Bytter melosys-api/eessi til SAF `saker`-query eller Entra-token og *det* spor knekker (f.eks.
> at mock-/Sak-svaret ikke gir en arkivsak), faller GSAK-koblingen bort og journalføringen mister
> sin sak-tilknytning → testen blir RØD.

**Testdata-konstanter** (`pages/shared/constants.ts`)
- `USER_ID_VALID` (`30056928150`) — bruker i Scenario 2 (FTRL-mottaker).
- SED-scenario: `SED_SCENARIOS.A003_MINIMAL` (`helpers/sed-helper.ts`) — A003, LA_BUC_02, defaults.

**Scenario 1 — inngående SED (gjenbruker `helpers/sed-helper.ts` + `pages/shared/sed-mottak.assertions.ts`)**
- `sedHelper.sendSed(SED_SCENARIOS.A003_MINIMAL)` → publiserer MelosysEessiMelding på Kafka;
  mocken oppretter inngående journalpost i SAF.
- `waitForProcessInstances(request, 60)` (`helpers/api-helper.ts`) — kalles FØR DB-assertene
  (globalt poll; jf. CI-race-lærdommen i `e2e_svak_assertion_loft_pr_a_b`).
- `verifiserSedRutetTilTema({ forventetTema: 'BESLUTNING_LOVVALG_ANNET_LAND' (verbatim),
  rutingProsess: 'ARBEID_FLERE_LAND_NY_SAK' (verbatim) })` → returnerer `{ behandlingId, saksnummer }`.
  Asserterer MOTTAK_SED FERDIG, rutingsprosess FERDIG og ingen FEILET prosessinstans.
- `verifiserInngaaendeSedJournalfoert(request, { saksnummer, sedType: 'A003' (verbatim) })` →
  INNGAAENDE EESSI-journalpost (status J) med `sakId = saksnummer`, tittel inneholder «A003».

**Scenario 2 — utgående vedtak (gjenbruker FTRL §2-8-flyten fra `tests/core/vedtaksbrev-mottakertype.spec.ts`)**
- Page Objects: `HovedsidePage`, `OpprettNySakPage`, `MedlemskapPage`, `ArbeidsforholdPage`,
  `LovvalgPage`, `ResultatPeriodePage`, `TrygdeavgiftPage`, `VedtakPage` (alle eksisterer).
- Flyt (verbatim verdier fra referansetesten):
  - `hovedside.gotoOgOpprettNySak()` → `opprettSak.opprettStandardSak(USER_ID_VALID)` →
    `verifiserBehandlingOpprettet()` → `hovedside.åpneBehandling(\`${BRUKERNAVN_VALID} -\`)`.
  - `medlemskap`: `velgPeriode(TestPeriods.standardPeriod.start, .end)` · `velgLand('Afghanistan')` ·
    `velgTrygdedekning('FTRL_2_9_FØRSTE_LEDD_C_HELSE_PENSJON')` (verbatim) · `klikkBekreftOgFortsett()`.
  - `arbeidsforhold.fyllUtArbeidsforhold('Ståles Stål AS')`.
  - `lovvalg`: `velgBestemmelse('FTRL_KAP2_2_8_FØRSTE_LEDD_A')` (verbatim) · `svarJaPaaFørsteSpørsmål()` ·
    `svarJaPaaSpørsmålIGruppe('Har søker vært medlem i minst')` ·
    `svarJaPaaSpørsmålIGruppe('Har søker nær tilknytning til')` · `klikkBekreftOgFortsett()`.
  - `resultatPeriode.fyllUtResultatPeriode('INNVILGET')`.
  - `trygdeavgift`: `ventPåSideLastet()` · `velgSkattepliktig(false)` ·
    `velgInntektskilde('INNTEKT_FRA_UTLANDET')` (verbatim) · `velgBetalesAga(false)` ·
    `fyllInnBruttoinntektMedApiVent('100000')` · `klikkBekreftOgFortsett()`.
  - hent `behandlingID` fra `page.url()` (pinnes eksplisitt) → `vedtak.klikkFattVedtak()`.
- `waitForProcessInstances(page.request, 60)` etter fatt vedtak.
- `vedtak.assertions.verifiserBehandlingAvsluttet({ behandlingId, forventetResultatType:
  'MEDLEM_I_FOLKETRYGDEN' (verbatim), forventetIverksettProsess: 'IVERKSETT_VEDTAK_FTRL' (verbatim) })`.
- `verifiserVedtaksbrev(request, { mottakerFnr: USER_ID_VALID, forventetBrevkode:
  'innvilgelse_ftrl' (verbatim), forventetTittel: 'Vedtak om frivillig medlemskap' (verbatim) })`
  (`pages/shared/vedtaksbrev.assertions.ts`) → ferdigstilt (J) UTGAAENDE journalpost til USER_ID_VALID.

**Ny assertion: `verifiserArkivsakKoblet` (ny — `pages/shared/arkivsak.assertions.ts`)**
- Signatur: `verifiserArkivsakKoblet(opts: { saksnummer?: string; behandlingId?: string | number }):
  Promise<number>`.
- Slår opp `FAGSAK` (via `withDatabase`) på `SAKSNUMMER` (Scenario 1) eller via join
  `BEHANDLING.ID → FAGSAK.SAKSNUMMER` (Scenario 2), og asserterer at `GSAK_SAKSNUMMER` er
  satt (non-null) og positiv — beviset på at arkivsak-oppslaget mot Sak ga en brukbar
  arkivsak-kobling. Returnerer GSAK-nummeret.
- DB-kolonner live-verifisert 2026-06-24: `FAGSAK(SAKSNUMMER, GSAK_SAKSNUMMER NUMBER, STATUS,
  REGISTRERT_DATO)`, `BEHANDLING(ID, SAKSNUMMER, ...)`. FAGSAK har **ingen** `ID`-kolonne
  (PK = SAKSNUMMER). `BEHANDLING.SAKSNUMMER` peker på `FAGSAK.SAKSNUMMER`.

**Så-linjer → assertions**
- *S1 «behandling rutet til riktig tema uten feilede prosesser»* → `verifiserSedRutetTilTema(...)`.
- *S1 «journalføres som INNGAAENDE EESSI-journalpost»* → `verifiserInngaaendeSedJournalfoert(...)`.
- *S1 «saken er koblet til en arkivsak (GSAK)»* → `verifiserArkivsakKoblet({ saksnummer })`.
- *S1 «EESSI-saksflyt funksjonelt uendret»* → samlet sluttilstand av de tre over (ruting +
  journalføring + GSAK-kobling, ingen FEILET).
- *S2 «behandling avsluttet med korrekt resultat via IVERKSETT_VEDTAK_FTRL»* → `verifiserBehandlingAvsluttet(...)`.
- *S2 «vedtaksbrev journalført som ferdigstilt UTGAAENDE journalpost»* → `verifiserVedtaksbrev(...)`.
- *S2 «saken er koblet til en arkivsak (GSAK)»* → `verifiserArkivsakKoblet({ behandlingId })`.
- *S2 «journalføring/arkivering funksjonelt uendret»* → samlet sluttilstand av de tre over.
- *Auth-mekanisme-linjene i akseptansekriteriene* → **ingen E2E-assertion** (ikke observerbar i
  mocket stack; dekkes av enhets-/integrasjonstest + Q1/Q2).

**Asynkron-håndtering & stillas (i testen, ikke speken)**
- Importér `test`/`expect` fra `../../fixtures` (auto-cleanup nullstiller DB + mock + toggler;
  rensingen FØR hver test gjør at «nyeste» rad = denne testens — POM-konvensjonen).
- AuthHelper-login kun i Scenario 2 (Scenario 1 er ren API/DB, uten UI).
- `waitForProcessInstances` kalles FØR sluttilstands-assertene i begge scenarioer.
- Ingen toggle-avvik fra default kreves.

**Hjelpere:** `helpers/sed-helper.ts` (`SedHelper`, `SED_SCENARIOS`), `helpers/api-helper.ts`
(`waitForProcessInstances`), `helpers/db-helper.ts` (`withDatabase`), `helpers/auth-helper.ts`
(`AuthHelper`), `helpers/date-helper.ts` (`TestPeriods`).

**Run-logg**
- **Lokal grønn (2026-06-24)** mot gjeldende bygg (dvs. *før* MELOSYS-7821 er implementert —
  behavior-equivalence-baseline): 2/2 grønne, 0 docker-feil. S1 `MEL-223 → GSAK 662361` (10.5s),
  S2 `MEL-224 → GSAK 9169446`, vedtaksbrev `innvilgelse_ftrl` (37.6s). `npm run check:tests` OK;
  `tsc` rent for de nye filene (eneste tsc-feil er forhåndseksisterende i `helpers/db-helper.ts`
  + `pg-db-helper.ts`). CI-runde ikke kjørt på denne runden (separat CI-delegering kreves).
  Heves til `verified` etter grønn CI via `orchestrate-e2e-flow`.
