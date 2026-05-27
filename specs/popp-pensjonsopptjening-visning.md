---
jira: MELOSYS-8073
epic: MELOSYS-7343 Fastsette pensjonsopptjening og overføre til pensjonsopptjenings-register (POPP)
status: implemented
test: tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts
toggles:
  melosys.vis_pensjonsopptjening_popp: on   # api (underscores) — påslås av testen
  melosys.vis-pensjonsopptjening-popp: on   # web (hyphens) — påslås av testen
tags: [popp, pensjonsopptjening, årsavregning, lese-integrasjon]
---

# Visning av eksisterende pensjonsopptjening (PGI) fra POPP under årsavregning

## Forretningsregel

For personer som ikke er skattepliktige til Norge, men som betaler trygdeavgift for
pensjonsdelen til NAV, har NAV plikt til å fastsette pensjonsgivende inntekt (PGI) —
hjemlet i [Forskrift 2017-02-13-179](https://lovdata.no/pro/#document/SF/forskrift/2017-02-13-179)
om beregning av pensjonsgivende inntekt. Under overgangsperioden kan PGI for samme person
og samme skatteår allerede ligge i POPP med kilde *Skatt* eller *Avgiftssystemet*, og skal
inngå i beregningsgrunnlaget for årsavregningen. Melosys er valgt som ansvarlig for
helhetsbildet (Alternativ 2 i [Confluence 791031817](https://confluence.adeo.no/spaces/TEESSI/pages/791031817)):
saksbehandler skal kunne se hva som allerede er registrert i POPP — med kilde — slik at
riktig PGI-grunnlag brukes og dobbeltregistrering unngås. Skatteforvaltningsloven åpner
normalt for endringer **5 år tilbake i tid**, og visningen begrenses til dette intervallet,
med unntak for eldre årsavregninger der visningen strekkes tilbake til avregningsåret.

> Søsterhistorier: lese-integrasjonen (denne) er teknisk enabler for
> [MELOSYS-8064](https://jira.adeo.no/browse/MELOSYS-8064) (UI-skissen). Skrive-siden
> (sending av PGI etter årsavregning) er allerede dekket i
> [MELOSYS-7631](https://jira.adeo.no/browse/MELOSYS-7631) og er **ikke** del av denne speken.

## Scenario

### Scenario 1 — Bare Skatt som kilde (typisk førstegangs årsavregning, ingen Melosys-PGI ennå)

```gherkin
Gitt at saksbehandler behandler en årsavregning for en person
  Og personen ikke er skattepliktig til Norge og betaler trygdeavgift for pensjonsdelen
  Og POPP inneholder pensjonsopptjening for inntektsåret og tidligere år utelukkende med kilde Skatt
  Og Melosys har ikke overført PGI for denne personen for dette inntektsåret ennå
 Når saksbehandler åpner årsavregningsbehandlingen
 Så vises seksjonen «Pensjonsopptjening» under «Fra register» i sidemenyen
  Og hver oppføring viser år, PGI-beløp og kilde «Skatt»
  Og det vises oppføringer for inntil 5 år tilbake fra inntektsåret
  Og oppføringene er sortert med nyeste år øverst
```

### Scenario 2 — Delt grunnlag: Skatt og Avgiftssystemet for samme år

```gherkin
Gitt at saksbehandler behandler en årsavregning for en person
  Og POPP inneholder pensjonsopptjening for inntektsåret med kilde Skatt registrert 01.05.2026
  Og POPP inneholder pensjonsopptjening for samme inntektsår med kilde Avgiftssystemet oppdatert 12.05.2026
  Og Melosys har ikke overført PGI for dette inntektsåret ennå
 Når saksbehandler åpner årsavregningsbehandlingen
 Så vises seksjonen «Pensjonsopptjening» med separate rader for hvert kilde-beløp for det aktuelle året
  Og hver rad viser når kilden ble registrert i POPP og når den sist ble oppdatert
  Og det fremgår tydelig at samme år har bidrag fra to ulike kilder med ulike tidsstempler
  Og saksbehandler kan se samlet bilde av hva som er registrert i POPP for dette inntektsåret
```

### Scenario 3 — Alle tre kilder: Melosys har allerede overført PGI

```gherkin
Gitt at saksbehandler behandler en årsavregning for en person
  Og POPP inneholder pensjonsopptjening for inntektsåret med kilde Skatt og Avgiftssystemet
  Og Melosys har tidligere overført PGI for dette inntektsåret, som nå er registrert med kilde Melosys i POPP
 Når saksbehandler åpner årsavregningsbehandlingen
 Så vises seksjonen «Pensjonsopptjening» med rader for alle tre kilder for det aktuelle året
  Og saksbehandler ser at Melosys-PGI allerede er overført og kan ta hensyn til dette i beregningen
```

### Scenario 4 — Ingen pensjonsopptjening registrert i POPP

```gherkin
Gitt at saksbehandler behandler en årsavregning for en person
  Og POPP inneholder ingen pensjonsopptjening for denne personen for inntektsåret eller de foregående 5 år
 Når saksbehandler åpner årsavregningsbehandlingen
 Så vises seksjonen «Pensjonsopptjening» under «Fra register» i sidemenyen
  Og det vises en informasjonsmelding om at ingen pensjonsopptjening er funnet
  Og seksjonen er tom — ingen rader
```

### Scenario 5 — Årsavregning for år eldre enn 5 år tilbake

```gherkin
Gitt at saksbehandler behandler en årsavregning for et inntektsår som er eldre enn 5 år tilbake i tid
  Og POPP inneholder pensjonsopptjening tilbake til det aktuelle inntektsåret
 Når saksbehandler åpner årsavregningsbehandlingen
 Så vises pensjonsopptjening så langt tilbake som inntektsåret det avregnes for
  Og visningen er ikke begrenset til 5 år
```

## Akseptansekriterier (det fagperson signerer av på)

- [ ] Saksbehandler ser seksjonen «Pensjonsopptjening» under «Fra register» i sidemenyen for alle årsavregningsbehandlinger.
- [ ] Seksjonen viser år, PGI-beløp og kilde for hvert oppslag — der kilde kan være *Skatt*, *Avgiftssystemet* eller *Melosys*.
- [ ] Hver rad viser i tillegg når kilden ble registrert i POPP og når den sist ble oppdatert (dd.MM.yyyy). Dette er spesielt viktig når samme inntektsår har bidrag fra flere kilder, slik at saksbehandler ser hvilken kilde som er nyest.
- [ ] Manglende tidsstempel rendres som «—» (em-dash), ikke som tom celle eller «null».
- [ ] Samme inntektsår kan ha flere rader dersom POPP inneholder bidrag fra mer enn én kilde.
- [ ] Standard visning dekker inntil 5 år tilbake fra inntektsåret; ved eldre årsavregninger vises data tilbake til avregningsåret.
- [ ] Nyeste år vises øverst. Tidsstempler påvirker IKKE radsorteringen (sortering = år desc, så kilde-prioritet).
- [ ] Dersom POPP ikke inneholder pensjonsopptjening for personen, vises en tydelig informasjonsmelding (ikke en feil, og ikke blank side).
- [ ] Visningen er tilgjengelig selv når Melosys ikke har overført PGI for inntektsåret ennå — Skatt/Avgiftssystemet-data leses uavhengig av Melosys-overføring.

*Utledet — bekreft med fagperson:*
- [ ] Det er ingen handlingsknapper i seksjonen — dette er ren lesevisning, ikke et vedtakssteg.
- [ ] Melosys lagrer ikke POPP-data lokalt; visningen er alltid et live-oppslag mot POPP.

## Kjente avgrensninger (ikke dekket her)

- **Fastsetting og overføring av PGI til POPP** — å *sende* PGI etter årsavregning dekkes
  av [MELOSYS-7631](https://jira.adeo.no/browse/MELOSYS-7631). Denne speken dekker kun
  lese-siden.
- **Håndtering av dobbeltregistrering / korrigering** — hva saksbehandler *gjør* med
  informasjonen (f.eks. velger å overskrive Avgiftssystemets PGI med Melosys-verdi) er
  ikke del av denne historien.
- **Innkrevingsstatus og manglende innbetaling** — om bruker faktisk har betalt
  trygdeavgiften er ikke del av visningen her.
- **Pensjonister/uføretrygdede** — grensedragning mot disse gruppene er ikke avklart og
  behandles separat.
- **Fremtidige kilde-verdier fra POPP** — speken forutsetter kilde-enum *Skatt*,
  *Avgiftssystemet* og *Melosys*. Andre kilde-verdier som POPP eventuelt leverer avklares
  med Pensjonsteamet og kan kreve oppdatering av denne speken.

---

## Teknisk binding
*(for testagenten — domeneleseren kan stoppe over linjen)*

> **Verbatim-regel:** verdier merket `(verbatim)` er flyt-spesifikke selektorer, enum-koder
> eller mock-payloads og skal brukes ordrett. Ikke "korriger" mot generiske eksempler.

> **Status: draft.** Feature er i UX-Design ([MELOSYS-8073](https://jira.adeo.no/browse/MELOSYS-8073))
> og venter på avklaring med Pensjonsteamet. Endepunkts-prefix, kilde-enum og mock-shape
> nedenfor reflekterer **utkastet** i Jira-saken og må reconcile-es mot faktisk bygg (jf.
> mønsteret i `specs/statistikk-antall-fagsaker.md` sin endringslogg). Domenelaget over
> streken er stabilt.

**Backend-kontrakt (verbatim — fra utkast)**
- Endepunkt: `GET /api/behandling/{behandlingId}/pensjonsopptjening` (verbatim — sjekkes mot
  faktisk rutemønster ved bygg; alternativ kandidat `/api/aarsavregning/{id}/...`).
- Respons:
  ```json
  {
    "inntektsAr": 2024,
    "behandletAr": 2024,
    "perioder": [
      { "aar": 2024, "pgi": 540000, "kilde": "SKATT", "inntektType": "SUM_PI", "inntektTypeDekode": "Sum pensjonsgivende inntekt", "registrert": "2025-05-01", "oppdatert": "2025-05-12" },
      { "aar": 2024, "pgi": 420000, "kilde": "SKATT", "inntektType": "FL_PGI_LOENN", "inntektTypeDekode": "Fastland pensjonsgivende inntekt av lønnsinntekt", "registrert": "2025-05-01", "oppdatert": "2025-05-12" },
      { "aar": 2024, "pgi": 120000, "kilde": "AVGIFTSSYSTEMET", "inntektType": "SUM_PI", "inntektTypeDekode": "Sum pensjonsgivende inntekt", "registrert": "2025-05-01", "oppdatert": "2025-05-12" }
    ]
  }
  ```
- Kilde-enum (verbatim): `SKATT`, `AVGIFTSSYSTEMET`, `MELOSYS`.
- InntektType-enum (verbatim — fra `no.nav.popp.domain.codestable.InntektTypeCode`): API filtrerer
  responsen til kun PGI-relevante typer + SUM_PI: `SUM_PI`, `FL_PGI_LOENN`,
  `FL_PGI_LOENN_PD`, `FL_PGI_NAERING`, `FL_PGI_NAERING_FFF`, `KSL_PGI_LOENN`,
  `KSL_PGI_LOENN_PD`, `KSL_PGI_NAERING`, `KSL_PGI_NAERING_FFF`, `SVA_PGI_LOENN`,
  `SVA_PGI_LOENN_PD`, `SVA_PGI_NAERING`, `SVA_PGI_NAERING_FFF`. Andre koder
  (INN_*, SJO_*, UTE_*, DIP_*, RED_INT, AI, PI66, PGI_NAV) filtreres bort.
- Sortering: `aar desc, kildePrioritet asc (SKATT < MELOSYS < AVGIFTSSYSTEMET),
  inntektTypePrioritet asc (SUM_PI = 0, andre = 1), inntektType asc`.
  SUM_PI vises som hovedrad per kilde/år; resterende PGI-typer er breakdown.
- `inntektTypeDekode` er rå-dekoden fra POPP. UI har sin egen oversettelse fra
  kode → norsk beskrivelse (forward-kompatibel hvis dekoden mangler).
- Tidsstempler (`registrert`, `oppdatert`): ISO LocalDate (`yyyy-MM-dd`) eller `null`. Mappet fra
  POPP `changeStamp.createdDate` / `updatedDate` via `ZoneId.of("Europe/Oslo")`. Web formaterer
  til `dd.MM.yyyy` for visning, og rendrer null som «—» (em-dash, U+2014).
- Tom liste (`perioder: []`) ≡ "ingen pensjonsopptjening" — ikke 404.
- Feature toggle: `melosys.vis-pensjonsopptjening-popp` (verbatim — påslås i testen via
  `UnleashHelper.enableFeature`; av default kan skjule seksjonen helt).

**UI-binding (forventet — bygg bekrefter)**
- Sidemeny-lenke: `data-testid="aarsavregning-sidemeny-pensjonsopptjening"` (verbatim,
  forventet) — under «Fra register»-gruppe i årsavregningsbehandlingens venstre meny.
- Seksjons-overskrift: tekst «Pensjonsopptjening» (verbatim — h2/h3).
- Rad-selektor: `data-testid="popp-rad"` (verbatim, forventet) — én rad per `perioder`-element.
- Celler per rad (seks kolonner — `År`, `PGI`, `Kilde`, `Type`, `Registrert`, `Oppdatert`):
  - År: `data-testid="popp-rad-aar"` (verbatim, forventet)
  - PGI-beløp: `data-testid="popp-rad-pgi"` (verbatim, forventet) — vist formatert
    (tusenskille tolereres ved sammenligning, jf. `StatistikkPage.lesAntallFagsaker`).
  - Kilde: `data-testid="popp-rad-kilde"` (verbatim, forventet) — vist som *Skatt* /
    *Avgiftssystemet* / *Melosys* (norske visningsnavn, ikke enum-koden).
  - Type: inntektType-kode (f.eks. `SUM_PI`, `FL_PGI_LOENN`) som synlig tekst.
    Wrappes i Aksel `Tooltip` (eller `<abbr title>`-fallback) med norsk beskrivelse fra
    `INNTEKT_TYPE_BESKRIVELSE`-map; faller tilbake til API-`inntektTypeDekode` hvis
    koden ikke er kjent.
  - Registrert / Oppdatert: dd.MM.yyyy fra `Utils.dato.formatterDatoTilNorsk(iso, false, "—")`.
    Null/manglende verdi rendres som «—» (em-dash, U+2014).
- Tom-tilstand: `data-testid="popp-ingen-data"` (verbatim, forventet) — vises når
  `perioder` er tom; meldingstekst: «Ingen pensjonsopptjening er registrert i POPP for
  denne personen» (verbatim, forventet — bygg kan reconcile).

**Mock-data (POPP via melosys-mock)**
- Mock-seed endepunkt (verbatim, forventet): `POST http://localhost:8083/testdata/popp/pensjonsopptjening`
  med body `{ "fnr": "<fnr>", "perioder": [ { "aar": <int>, "pgi": <long>, "kilde": "<enum>" } ] }`.
  Bygg kan velge annet seed-shape — reconcile-es.
- Hver test seeder POPP-tilstanden FØR navigering til årsavregningsbehandlingen.
- `clearMockData(page.request)` (cleanup-fixturen) nullstiller — testen forutsetter ren baseline.

**Page Object: `PensjonsopptjeningPage` (ny — `pages/behandling/pensjonsopptjening.page.ts`)**
- `goto(behandlingId: string)` — naviger til sidemeny-seksjonen for gitt årsavregning.
- `klikkSidemeny()` — klikk «Pensjonsopptjening»-lenken under «Fra register».
- `lesRader(): Promise<PoppRad[]>` — returnerer alle rader som
  `{ aar, pgi, kilde, registrert, oppdatert }` (kilde og datoer som visningsnavn).
- `erTomVisning(): Promise<boolean>` — true hvis tom-tilstand vises.
- `assertions: PensjonsopptjeningAssertions`:
  - `verifiserSeksjonVises()`
  - `verifiserAlleRaderHarKilde(kilde: 'Skatt' | 'Avgiftssystemet' | 'Melosys')`
  - `verifiserAntallRaderForAar(aar: number, antall: number)`
  - `verifiserRaderInneholderKilder(aar: number, kilder: string[])`
  - `verifiserNyesteÅrØverst()` — første rad har `aar` ≥ alle øvrige.
  - `verifiserAarIntervall(fraAar: number, tilAar: number)` — alle rader ligger innenfor.
  - `verifiserTomMelding()` — tom-tilstand med tekst.
  - `verifiserRadHarTidsstempler(aar, kilde, { registrert, oppdatert })` — verifiser
    `dd.MM.yyyy`-formatert visning per kilde-rad. Null forventes som «—».

**Testdata-konstanter (legges i `pages/shared/constants.ts` ved første testkjøring)**
- `POPP_KILDE` (verbatim): `{ SKATT: 'SKATT', AVGIFTSSYSTEMET: 'AVGIFTSSYSTEMET', MELOSYS: 'MELOSYS' }`
- `POPP_KILDE_VISNING` (verbatim): `{ SKATT: 'Skatt', AVGIFTSSYSTEMET: 'Avgiftssystemet', MELOSYS: 'Melosys' }`
- `USER_ID_VALID` (`30056928150`) brukes som bruker — samme som FTRL-pensjonist-flyten.
- `FORRIGE_AAR` (allerede definert) — brukes som inntektsår i scenarioer 1–4.

**Forutsetning: eksisterende årsavregning-behandling**
- Hvert testscenario forutsetter at en årsavregning-behandling finnes for `USER_ID_VALID`.
  Gjenbruk mønsteret fra `tests/ftrl/ftrl-pensjonist-aarsavregning.spec.ts` (pensjonist-flyt
  → vedtak → auto-opprettet årsavregning) ELLER seed direkte via en mock-/admin-rute hvis
  bygg leverer det. Etter `ventPåBehandlingslenke(...)` må testen **klikke** lenken og vente
  på `networkidle` for å åpne årsavregningsbehandlingen — referansetesten verifiserer kun
  synlighet, men POPP-visningen lever inne i behandlingen og krever navigering inn.
- For scenario 5 (eldre årsavregning) trenger vi en behandling med `inntektsÅr` ≥ 6 år
  tilbake — sannsynligvis krever det en seed-rute (gjeldende pensjonist-auto-flyt setter
  inntektsår = `FORRIGE_AAR`). Testen markeres derfor `test.fixme(...)` med en TODO inntil
  bygg leverer seed-veien.

**Asynkron-håndtering & stillas (legges i testen, ikke speken)**
- `waitForProcessInstances(page.request, 30)` etter saksopprettelse.
- Importér `test`/`expect` fra `../../fixtures` (auto-cleanup nullstiller mock og toggler).
- `UnleashHelper.enableFeature('melosys.vis-pensjonsopptjening-popp')` per test som
  forutsetter at seksjonen vises (default-fixture slår alle på, men hvis denne toggle
  ikke er i default-listen må den eksplisitt slås på).

**Assertions (Så-linjer → kode)**
- *S1 «vises seksjonen»* → `assertions.verifiserSeksjonVises()`.
- *S1 «kilde Skatt»* → `assertions.verifiserAlleRaderHarKilde('Skatt')`.
- *S1 «inntil 5 år tilbake»* → `assertions.verifiserAarIntervall(FORRIGE_AAR - 4, FORRIGE_AAR)`.
- *S1 «nyeste år øverst»* → `assertions.verifiserNyesteÅrØverst()`.
- *S2 «separate rader for hvert kilde»* → `assertions.verifiserAntallRaderForAar(FORRIGE_AAR, 2)` +
  `assertions.verifiserRaderInneholderKilder(FORRIGE_AAR, ['Skatt', 'Avgiftssystemet'])`.
- *S3 «rader for alle tre kilder»* → `assertions.verifiserAntallRaderForAar(FORRIGE_AAR, 3)` +
  `assertions.verifiserRaderInneholderKilder(FORRIGE_AAR, ['Skatt', 'Avgiftssystemet', 'Melosys'])`.
- *S4 «tom — ingen rader»* → `assertions.verifiserTomMelding()` + `lesRader()` returnerer `[]`.
- *S5 «ikke begrenset til 5 år»* → `assertions.verifiserAarIntervall(GAMMELT_AAR, GAMMELT_AAR)` der
  `GAMMELT_AAR = inneværende år − 8` (eller annet > 5 tilbake) — speken sier at visningen
  utvides til avregningsåret når det er eldre enn 5 år.

**Hjelpere:** `helpers/api-helper.ts` (`waitForProcessInstances`), `helpers/unleash-helper.ts`
(`UnleashHelper`), `helpers/mock-helper.ts` (`clearMockData` allerede gjort av fixture).

**Endringslogg — reconciled mot bygg (2026-05-26, peers melosys-api-claude + melosys-web):**
1. **API-rute:** foreslått `/api/behandling/{id}/pensjonsopptjening` → faktisk
   **`/api/behandlinger/{id}/pensjonsopptjening`** (flertall). Singular returnerer 404.
2. **Toggle:** speken hadde `melosys.vis-pensjonsopptjening-popp` (hyphens). Faktisk er
   **BÅDE** `melosys.vis_pensjonsopptjening_popp` (api, underscores) **OG**
   `melosys.vis-pensjonsopptjening-popp` (web, hyphens) registrert i Unleash — begge
   må enables. Testen slår på begge.
3. **UI-selectors:** speken hadde `data-testid`-baserte selektorer. Faktisk **ingen
   testid-er** i melosys-web (følger eksisterende stil — Fakturainformasjon m.fl. har
   heller ikke testid). Bruker tekst-/role-baserte selektorer i POM:
   - sidemeny-lenke: `getByRole('link', { name: 'Pensjonsopptjening' })`
   - seksjons-overskrift: `getByRole('heading', { name: 'Pensjonsopptjening', level: 2 })`
   - rader: `getByRole('table')` + `getByRole('row')` + `getByRole('cell')`
4. **Sidemeny:** panel-basert, **ingen URL-endring** ved klikk (kun aktiv-state-bytte).
5. **Tom-melding (verbatim fra bygg):** «Ingen pensjonsopptjening registrert i POPP for personen.»
   (speken hadde «Ingen pensjonsopptjening er registrert i POPP for denne personen» —
   reconcile).
6. **Feil-tilstand (oppdaget i bygg):** «Kunne ikke hente pensjonsopptjening fra POPP.»
   (warning-alert ved 5xx).
7. **Mock-seed:** speken antok `POST /testdata/popp/pensjonsopptjening`. **Finnes ikke** —
   melosys-mock returnerer kanonisk data (`kilde="MOCK"`, FL_PGI_LOENN + SUM_PI, siste 5 år)
   for alle fnrs untatt `00000000000` (→ 404 PERSON_IKKE_FUNNET). Test-strategi:
   - Scenario 1: kjør mot reell mock (kilde="MOCK", verifiser at seksjonen rendres og
     år/kilde er populated — ikke assert «Skatt»).
   - Scenario 2/3/4: stubber `/api/behandlinger/*/pensjonsopptjening`-responsen via
     `page.route()` for å teste UI-rendering deterministisk på Skatt/Avgiftssystemet/
     Melosys-kombinasjoner. Langsiktig **følgesak** trengs: seed-rute eller per-fnr
     stubbing i melosys-mock.
   - Scenario 5: fortsatt `test.fixme` (krever eldre årsavregning).
8. **Kilde-enum fra mock:** kun `"MOCK"` returneres i dag — `SKATT`/`AVGIFTSSYSTEMET`/
   `MELOSYS` er navn fra plan/spec, uavklart med Pensjonsteamet. Backend passerer kilde-
   strengen uendret. UI viser «Ukjent kilde → rå-verdien».
9. **Branch-status (2026-05-26):** melosys-api på `master`, full build grønn, app på 8080.
   melosys-web har POPP-arbeidet uncommitted på `master` (ikke på egen branch ennå).
10. **UI-arkitektur — pivotert under e2e-runde:** opprinnelig la melosys-web POPP-menypunktet
    inn i legacy menypanelet (`LinkGroupsFactory`). E2E-kjøring avdekket at menypanelet ikke
    rendres for FTRL+PENSJONIST+ÅRSAVREGNING med default toggle `melosys.pensjonist=ON`
    (`url.ts:155-214` returnerer false). melosys-web pivoterte til **direkte rendring** av
    seksjonen i `sider/aarsavregning/saksbehandling.tsx` rett etter `<EnkelStegvelger>`,
    gated kun på `melosys.vis-pensjonsopptjening-popp`. POM-en speiler dette: ingen
    sidemeny-klikk, bare `ventPåSeksjon()` som anker på h2.
11. **Lokal grønn (2026-05-26):** Scenario 1 mot reell mock (kilde="MOCK"), Scenarios 2/3/4
    via `page.route`-stubbing av API-responsen. 4/4 grønne, 1 fixme. 0 docker-feil.
    Total kjøretid ~2 min. CI-runde ikke kjørt på denne runden (lokalt først per Rune).
