# Koblede endringer: pin-fila `.github/e2e-pins.json`

En koblet endring er en PR i et service-repo som får testene på `main` til å feile, og en PR i melosys-e2e-tests som retter dem. Uten hjelp finnes ingen rekkefølge som går gjennom begge merge-køene: service-køen tester det nye imaget mot de gamle testene, og e2e-køen tester de nye testene mot det gamle `latest`.

Pin-fila holder tjenesten tilbake på det gamle imaget i alle andre kjøringer til de nye testene er ute, og e2e-PR-en som fjerner pinnen, bytter tester og image i samme commit.

> **Status:** E2E Tests, e2e-køen og utløpsvarselet leser pin-fila. Gaten (`e2e-gate.yml`) leser den ikke ennå; det kommer i PR 2. Til da tester gaten service-PR-en med testene på `main`, også når tjenesten har en koblet pin. Karantenepiner virker fullt ut. Sett ingen koblet pin på `main` før PR 2 og konsolldelen av PR 3 (melosys-console teller ikke hoppede kjøringer) er ute. Bakgrunnen står i planen «Koblede endringer mellom et service-repo og e2e-testene» i melosys-kode-wiki.

## Når du ikke trenger pin

Kan testene skrives slik at de går grønt mot både gammelt og nytt image (regex for tekst, `.or()` for locatorer, forventninger som godtar begge tilstander), trengs ingen pin. Legg e2e-PR-en i køen først og service-PR-en etterpå. Bakoverkompatible backend-PR-er i samme endring merges først gjennom køen, uten pin.

Pin bare den siste tjenesten i paret, den som ikke er bakoverkompatibel.

## Fila

```json
{
  "melosys-web": {
    "tag": "<sha-en som melosys-web latest peker på nå>",
    "e2e_branch": "MELOSYS-9000-ny-knapp",
    "service_pr": 3300,
    "jira": "MELOSYS-9000",
    "utloper": "2026-11-03"
  }
}
```

- **Nøkkelen** er tjenestenavnet E2E Tests bruker: `melosys-api`, `melosys-web`, `faktureringskomponenten`, `melosys-trygdeavgift-beregning`, `melosys-trygdeavtale`, `melosys-inngangsvilkar`, `melosys-eessi`, `melosys-mock`, `melosys-dokgen`, `melosys-skjema-api` eller `melosys-skjema-web`.
- **`tag`** er en commit-sha med 40 hex-tegn på tjenestens default-branch, med image i GAR. Finn den med `scripts/pin-sha.sh <tjeneste>`, som skriver sha-en bak `latest` nå. Skriptet krever docker innlogget i GAR (`gcloud auth configure-docker europe-north1-docker.pkg.dev`) og `gh` innlogget mot navikt.
- **`e2e_branch` og `service_pr`** er branchen i melosys-e2e-tests med de nye testene, og PR-nummeret i tjenesten som krever dem. Begge eller ingen. Uten dem er pinnen en **karantenepin**: tjenesten holdes tilbake, og gaten tester fra `main`. Bare tjenestene med gate kan ha `e2e_branch` og `service_pr`: melosys-api, melosys-web, melosys-skjema-api, melosys-skjema-web, melosys-eessi og faktureringskomponenten.
- **`jira`** (MELOSYS-nøkkel) og **`utloper`** (ÅÅÅÅ-MM-DD, siste dag pinnen kan stå) er påkrevd.

Tom fil, `{}` eller manglende fil betyr at alle tjenester bruker `latest`.

## Slik virker pinnene

1. **E2E Tests leser fila fra sin egen ref.** Tjenester som står i fila og ikke er under test, får `tag` i stedet for `latest`. Logglinja `📌 <tjeneste> holdes på <tag>` i «Determine image tags» og `resolvedTags` i trigger-konteksten viser det.
2. **Tjenesten under test vinner over pinnen.** En tjeneste er under test når kjøringen har en eksplisitt tag for den som ikke er `latest`: tjenesten i event-typen ved `repository_dispatch`, `tjeneste:tag` i `environment`, eller melosys-api når `environment` bare er en tag. e2e-køen sender `environment: latest`, så pinnene gjelder der.
3. **Gaten tester den koblede PR-en fra `e2e_branch`.** Kommer i PR 2.
4. **e2e-branchen må være oppdatert fra `main`.** Kommer i PR 2.
5. **En slettet e2e-branch** gjør at gaten leser pinnene fra `main` på nytt. Kommer i PR 2.
6. **Dispatch etter merge hoppes over** når tjenesten har koblet pin, `service_pr` er merget, og merge-commiten er forfar til sha-en i dispatchen. Kjøringen blir grønn uten shards og uten Slack-varsel, med notis i sammendraget, og laster opp `test-summary` med `skipped: true`. Køkjøringen har testet samme tre fra e2e-branchen. Andre dispatcher fra tjenesten, og alle med karantenepin, kjører testene. Feiler oppslaget mot GitHub, kjøres testene.
7. **Utløpte pinner** gir en advarsel i hver kjøring. `e2e-pins-utlop.yml` validerer fila hver morgen og poster i #melosys-ci når en pin har passert `utloper`, eller når fila ikke lenger er gyldig.

En fil som ikke kan leses, eller en pinnet tag som mangler i GAR, gir rød plan-jobb i E2E Tests med melding. Kjøringen faller ikke tilbake til `latest`.

## Validering før merge

Jobben `pinner` i `e2e-for-merge.yml` kjører på hver PR og hver køgruppe. Er `.github/e2e-pins.json` endret, sjekker den:

- at fila er gyldig JSON med kjente tjenester og felt som over;
- at hver `tag` finnes i GAR og ligger på tjenestens default-branch;
- at en koblet pin bare fjernes, eller får ny `service_pr` eller `e2e_branch`, når ett av disse gjelder:
  - `service_pr` er merget, og merge-commiten er med i `latest`;
  - `service_pr` er lukket uten merge;
  - PR-en (i køen: gruppen) endrer bare pin-fila.

På PR-en er `pinner` en egen sjekk som bare informerer: sjekken `e2e-for-merge` er grønn som før, så en e2e-PR som fjerner en koblet pin, kan legges klar før service-PR-en er ute. I køen gjør en rød `pinner` sjekken `e2e-for-merge` rød, så en ugyldig fil når aldri `main`.

`pinner` gir også utvalget i køen beskjed når pin-endringen ikke bytter noe image:

- **Bare nye pinner der `tag` har samme digest som `latest` nå:** pin-fila bidrar ikke med tester.
- **Fjernede eller endrede pinner der `tag` før og etter har samme digest som `latest`:** heller ingen tester.
- **Alt annet** (endret tag, karantenepin til en eldre sha, fjerning etter at tjenesten er merget): hele suiten.

Andre endrede filer i gruppen velges som før. `make ci-affected` lokalt kjører hele suiten når pin-fila er endret, fordi den ikke vet hva `latest` er.

## Steg for steg

Eksempel: web-PR #3300 bytter en knapp, og testene på `main` finner den ikke lenger. Testene er rettet på e2e-branchen `MELOSYS-9000-ny-knapp`.

1. **Bekreft paret.** Kjør web-branchen og e2e-branchen sammen med «E2E med brancher» i konsollen.
2. **Lag pin-PR-en.** På en ny branch fra `main` i melosys-e2e-tests: kjør `scripts/pin-sha.sh melosys-web` for `tag`, og legg inn pinnen med `e2e_branch`, `service_pr`, `jira` og `utloper`. Legg PR-en i køen. Den kjører ingen tester så lenge `tag` er web `latest`. Flytter en annen web-merge `latest` før køen når pin-PR-en, kjører hele suiten (ca. 68 min).
3. **Gjør e2e-PR-en klar, men ikke legg den i kø.** Oppdater `MELOSYS-9000-ny-knapp` fra `main`, så den har pinnen, og slett pinnen i branchen i samme commit. Åpne PR-en. Sjekken `pinner` er rød til steg 5, fordi PR-en fjerner pinnen før #3300 er i `latest`. Det er forventet, og den hindrer ikke køen.
4. **Legg web #3300 i køen.** Gaten kjører testene fra e2e-branchen (kommer i PR 2). Grønn kjøring gir merge; dispatch etter merge hoppes over (regel 6).
5. **Vent til web `latest` har #3300.** `scripts/pin-sha.sh melosys-web` viser sha-en bak `latest`; merge-commiten til #3300 skal være forfar til den. Feiler deploy-dev, får `latest` aldri #3300, og `pinner` stopper steg 6. Kjør deploy-dev på nytt.
6. **Legg e2e-PR-en i køen.** Den kjører de nye testene mot web `latest`. Fra denne commiten bruker alle kjøringer de nye testene og ny web.

## Når noe går galt

- **Du glemmer pinnen.** Web #3300 kjører de gamle testene i køen og blir rød. GitHub tar den ut av køen, og ingen andre merker noe. Gjør steg 2 og 3, og legg web-PR-en inn igjen.
- **`main` i melosys-e2e-tests flytter seg mens du venter.** Gaten feiler med «oppdater e2e-branchen fra main» (kommer i PR 2). Merge `main` inn i e2e-branchen og legg web-PR-en i køen igjen. Ligger e2e-PR-en allerede i e2e-køen (steg 6), vent på den i stedet: en push til branchen tar den ut av køen.
- **En annen web-PR ligger i køen samtidig.** Ligger den foran #3300, tester den fra `main`. Ligger den bak, inneholder køgruppen #3300, og den tester fra e2e-branchen.
- **Web #3300 droppes, eller koblingen trengs ikke lenger.** Fjern pinnen med en PR som bare endrer pin-fila. `pinner` godtar det, og køen kjører ingen tester så lenge `tag` er web `latest`. Byttes #3300 ut med en ny PR, endrer du `service_pr` på samme måte.
- **e2e-PR-en droppes.** Fjern pinnen med en PR som bare endrer pin-fila, eller lag en ny e2e-branch og pek pinnen på den.
- **Web #3300 må reverteres før steg 6.** Gjør pinnen om til en karantenepin først: fjern `e2e_branch` og `service_pr` i en PR som bare endrer pin-fila, og behold `tag`. Da tester revert-PR-en fra `main` mot de gamle testene, og alle andre bruker fortsatt gammel web. Fjern karantenepinnen når revert-en er i `latest`.
- **En pinnet tag er ryddet bort fra GAR.** Alle kjøringer blir røde i plan-jobben, og `e2e-pins-utlop.yml` poster i #melosys-ci. Sett ny `tag` med `scripts/pin-sha.sh`, eller fjern pinnen.

## Filer

- `lib/e2e-pins.mjs`: parser, validering, «under test», regel 6 og utvalget. Ren node uten avhengigheter, med unit-tester i `lib/e2e-pins.test.ts`.
- `.github/workflows/e2e-tests.yml`: plan-jobben bruker pinnene og hopper over dispatch etter regel 6.
- `.github/workflows/e2e-for-merge.yml`: jobben `pinner`.
- `.github/workflows/e2e-pins-utlop.yml`: daglig sjekk og Slack-varsel.
- `scripts/affected-tests.mjs`: flagget `--pinner-uten-virkning`.
- `scripts/pin-sha.sh`: sha-en bak `latest`.
