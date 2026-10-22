# Koblede endringer: service-PR som krever nye e2e-tester

En koblet endring er en PR i et service-repo som får testene på `main` til å feile, og en PR her som retter testene. Ingen av dem kommer gjennom sin merge-kø alene: service-køen kjører de gamle testene mot det nye imaget, og e2e-køen kjører de nye testene mot det gamle `latest`.

Løsningen er en pin i `.github/e2e-pins.json`. e2e-PR-en pinner tjenesten til imaget paret er testet grønt mot. Tester og image byttes da i samme commit på `main`, og begge PR-ene går gjennom køene uten bypass.

## Når du ikke trenger pin

Kan testene skrives slik at de er grønne mot både gammelt og nytt image (regex for tekst, `.or()` for lokatorer), merger du e2e-PR-en først og service-PR-en etterpå. Er en backend-PR i samme endring bakoverkompatibel, merger du den først uten pin.

## Automatisk fra konsollen

Knappen i melosys-console starter workflowen «Koblet merge» (`.github/workflows/koblet-merge.yml`) på `main`. Den gjør steg 2–4 i den manuelle oppskriften for deg, uten køhopp, og åpner PR-en i steg 5. Kjør paret grønt med «E2E med brancher» først (steg 1); knappen trenger taggen `br-<run_id>`, e2e-PR-en og service-PR-ene i den rekkefølgen de skal merges.

**Bare repoer med merge-kø:** melosys-api, melosys-web, melosys-skjema-api, melosys-skjema-web, melosys-eessi og faktureringskomponenten. For andre repoer bruker du den manuelle oppskriften.

Workflowen har fem jobber:

1. **Sjekk paret.** Hver PR finnes, er ikke et utkast, har ingen konflikter, går mot default-branchen og har branchen i samme repo. En PR som står i kø, godtas.
2. **Legg pinnen i e2e-PR-en.** Workflowen committer `.github/e2e-pins.json` til e2e-branchen. Andre pinner i fila står. Er branchen pushet til i mellomtiden, stopper jobben i stedet for å overskrive.
3. **e2e-PR gjennom køen.** Workflowen venter til PR-en kan merges (opptil 30 min), sjekker at pinnen står på head, setter PR-en i kø og venter til den er merget (opptil 150 min). Tas den ut av køen, stopper kjøringen.
4. **`<repo> #<pr>` i køen**, én service-PR om gangen. Står andre PR-er i køen, venter jobben til køen er tom (opptil 60 min), og setter så PR-en bakerst i køen. Andre kan sette PR-er i kø mens jobben venter; si fra i kanalen.
5. **Fjern pinnen.** Når service-PR-ene er merget, lager workflowen branchen `fjern-pin-<tag>` fra `main` og åpner PR-en, eller gjenbruker en åpen PR fra branchen. Den fjerner bare pinner som fortsatt står på taggen. Workflowen setter ikke PR-en i kø: trykk «Merge when ready» selv. e2e-køen kjører hele suiten mot `latest` og blir grønn først når `latest` har endringene.

**Svarer ikke GitHub når en PR skal i kø**, for eksempel med en intern feil, 5xx eller rate limit, står en advarsel i sammendraget. Trykk «Merge when ready» på PR-en; jobben venter videre til PR-en er merget. Avviser GitHub forespørselen, for eksempel fordi head har endret seg, PR-en allerede er i kø eller appen mangler rettighet, stopper jobben.

**Prøv først med `dry_run`.** Hver jobb leser og sjekker som vanlig og skriver i loggen hva den ville gjort, men committer, setter i kø og åpner ingenting, og venter ikke. Kjøringen heter da «… (prøvekjøring)».

**Rettigheter.** Workflowen leser med `github.token`; alle repoene er offentlige. Før hver skriving henter den et token fra appen «Melosys CI» for det ene repoet den skriver til. Appen trenger *Contents: write* og *Pull requests: write* i melosys-e2e-tests og service-repoene. Uten dem stopper jobben ved «Hent app-token». En org-admin gir rettighetene i appens innstillinger. `dry_run` henter ikke app-token.

**Stoppe og fortsette.** Avbryt kjøringen i Actions. Det som er gjort, står: en commitet pin, en PR i kø, en merget PR. Start på nytt med samme input når du vil fortsette. Hver jobb hopper over det som er gjort, og venter på en PR som står i kø. Sjekken godtar en merget e2e-PR bare når merge-commiten pinner alle tjenestene til taggen, og en merget service-PR bare når e2e-PR-en og tjenestene foran den er merget.

## Slik gjør du det

Eksempel: melosys-web #3300 bytter en knapp, og e2e-branchen `MELOSYS-9000-ny-knapp` har testene som finner den nye knappen.

1. **Kjør paret med «E2E med brancher»** (se [KJOR-E2E-PA-CI.md](KJOR-E2E-PA-CI.md#e2e-med-brancher)). Oppdater web-branchen fra `master` først. Kjøringen må være grønn. Noter taggen `br-<run_id>`.
2. **Sjekk at web-køen er tom, og si fra i kanalen** at andre web-merger venter til #3300 er inne:

   ```bash
   gh api graphql -f query='{ repository(owner: "navikt", name: "melosys-web") { mergeQueue(branch: "master") { entries(first: 20) { nodes { position state pullRequest { number title } } } } } }'
   ```

3. **Legg pinnen i e2e-PR-en, og sett PR-en i køen.**

   ```json
   { "melosys-web": "br-39400000000" }
   ```

   Køen kjører hele suiten med de nye testene mot `br`-imaget.
4. **Sett web #3300 først i web-køen med én gang e2e-PR-en er merget.** Gaten kjører testene på `main`, som nå er de nye, mot køens image. Legg PR-en først, så bygges andre web-oppføringer på nytt oppå #3300 i stedet for å bli røde:

   ```bash
   gh api graphql -f query='mutation($id: ID!) { enqueuePullRequest(input: {pullRequestId: $id, jump: true}) { mergeQueueEntry { position } } }' \
     -f id="$(gh pr view 3300 -R navikt/melosys-web --json id -q .id)"
   ```

   Køhopp krever admin-rett i repoet, eller en egendefinert repo-rolle med den rettigheten ([GitHub changelog](https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/)). Har du ikke det, ber du en admin om å legge PR-en i kø. Uten køhopp kan web-PR-er som ligger foran #3300, bli røde; sett dem i kø igjen etter #3300.
5. **Fjern pinnen med en PR som bare sletter linja.** Køen kjører hele suiten mot `latest` og blir grønn først når `latest` har #3300. Du kan derfor ikke fjerne pinnen for tidlig.

Endrer service-PR-en seg vesentlig etter steg 1, kjører du paret på nytt og bytter taggen.

**To tjenester i samme endring:** kjør begge branchene i samme «E2E med brancher», og pin begge til samme `br-<run_id>`. Rekkefølgen på service-mergene spiller da ingen rolle.

## Slik virker pinnen

- E2E Tests leser fila fra sin egen ref i steget «Determine image tags» (`scripts/e2e-pins.mjs`).
- En tjeneste som har `latest` i kjøringen, får pin-taggen. En tjeneste under test beholder sin egen tag: gaten, dispatch etter merge og «E2E med brancher» tester alltid imaget de er startet med.
- En eksplisitt `latest` regnes ikke som under test: `environment=melosys-web:latest` får pin-taggen for web så lenge pinnen står. Vil du teste mot `latest`, er PR-en som fjerner pinnen (steg 5) veien: køen tester den uten pin.
- Hver kjøring der en pin brukes, viser en advarsel i sammendraget. En pin som ikke brukes fordi tjenesten har en annen tag enn `latest`, står som en linje i loggen til steget «Determine image tags».
- Ugyldig JSON, en ukjent tjeneste, en tag som ikke er en gyldig docker-tag og en pin til `latest` stopper plan-jobben med en melding. e2e-køen stopper derfor en ugyldig fil før den når `main`.
- Gyldige tjenester er navnene `environment`-inputen bruker, for eksempel `melosys-api`, `melosys-web`, `melosys-skjema-api`, `melosys-skjema-web` og `melosys-mock`.

## Når noe går galt

- **Du glemmer pinnen.** e2e-PR-en blir rød i køen. Bare din PR tas ut.
- **Du setter service-PR-en i kø før e2e-PR-en er merget.** Gaten kjører de gamle testene og blir rød. Bare din PR tas ut.
- **Service-PR-en droppes etter at e2e-PR-en er merget.** Reverter e2e-PR-en. Reverten fjerner testene og pinnen i samme commit og går gjennom køen.
- **Du glemmer å fjerne pinnen.** Tjenesten holdes på `br`-imaget i alle kjøringer som ikke tester den. Advarselen står i hvert sammendrag.
- **`br`-taggen er ryddet bort fra GAR.** Kjøringene blir røde når imaget hentes. Fjern pinnen, eller kjør paret på nytt og bytt taggen.
