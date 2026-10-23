# Koblede endringer: service-PR som krever nye e2e-tester

En koblet endring er en PR i et service-repo som får testene på `main` til å feile, og en PR her som retter testene. Ingen av dem kommer gjennom sin merge-kø alene: service-køen kjører de gamle testene mot det nye imaget, og e2e-køen kjører de nye testene mot det gamle `latest`.

Løsningen er en pin i Actions-variabelen `E2E_PINS` i melosys-e2e-tests. Pinnen setter tjenesten til imaget paret er testet grønt mot, `br-<run_id>` fra «E2E med brancher». Hver kjøring av E2E Tests avgjør selv om pinnen gjelder: fra testene har e2e-PR-en, til `latest` har service-PR-en. Pinnen slår seg av selv, og ingen PR trengs for å fjerne den.

## Når du ikke trenger pin

Kan testene skrives slik at de er grønne mot både gammelt og nytt image (regex for tekst, `.or()` for lokatorer), merger du e2e-PR-en først og service-PR-en etterpå. Er en backend-PR i samme endring bakoverkompatibel, merger du den først uten pin.

## Repoer uten merge-kø

Pinnen finnes bare for de seks repoene med merge-kø: melosys-api, melosys-web, melosys-skjema-api, melosys-skjema-web, melosys-eessi og faktureringskomponenten. Utløpsregelen leser service-PR-en, og det kan den bare i disse repoene.

For de andre tjenestene, for eksempel melosys-mock, melosys-trygdeavgift-beregning og melosys-dokgen, gjør du endringen slik at den ikke trenger pin:

- **Service først:** gjør service-endringen bakoverkompatibel, merge den, og merge e2e-PR-en når `latest` har den.
- **Tester for begge:** skriv testene slik at de består mot både gammelt og nytt image, merge e2e-PR-en, og så service-PR-en.

## Automatisk fra konsollen

Knappen «Koblet merge» i melosys-console starter workflowen «Koblet merge» (`.github/workflows/koblet-merge.yml`) på `main`. Kjør paret grønt med «E2E med brancher» først, uten `test_grep`. Knappen trenger taggen `br-<run_id>`, e2e-PR-en og service-PR-ene i den rekkefølgen de skal merges.

Workflowen har to jobber:

1. **Sjekk paret.** Hver PR finnes, er åpen, er ikke et utkast, har ingen konflikter, går mot default-branchen, har branchen i samme repo og står ikke i merge-køen. En køkjøring som har startet, ser ikke en pin som settes etterpå.
2. **Skriv pinnen i E2E_PINS.** For hver service-PR kjører jobben `scripts/e2e-pins.mjs set` (se [Skriveren](#skriveren)). Sammendraget viser rekkefølgen du merger i.

Workflowen setter ingenting i kø. Merge selv med **Merge when ready**, i rekkefølgen sammendraget viser:

1. e2e-PR-en. e2e-køen kjører de nye testene mot `br`-imaget, fordi køens commit har `(#<e2e_pr>)` i emnet.
2. Hver service-PR, når PR-en foran er merget og køen i service-repoet er tom. En annen PR foran i køen har ikke endringen og blir rød mot de nye testene. Si fra i kanalen at andre merger i repoet venter.

**Prøv først med `dry_run`.** Jobbene leser og sjekker som vanlig, og skriveren viser verdien den ville skrevet, men variabelen endres ikke. Kjøringen heter da «… (prøvekjøring)». En prøvekjøring leser `E2E_PINS` slik den var da jobben startet, fordi `github.token` ikke kan lese variabler. Med flere service-PR-er viser den derfor hver pin for seg, uten pinnene foran den.

**Rettigheter.** Workflowen leser PR-er og kjøringer med `github.token`; alle repoene er offentlige. Bare skrivingen av variabelen bruker et token fra app-en Melosys CI, avgrenset til melosys-e2e-tests. App-en trenger *Variables: write*. Uten den svarer GitHub `403 Resource not accessible by integration`, og jobben stopper før noe er skrevet. En prøvekjøring henter ikke app-token.

**Én skriving om gangen.** API-et har ingen sammenlign-og-skriv for variabler, så skrivejobben har concurrency-gruppen `e2e-pins-variabel`, og hele workflowen har en gruppe per tag. GitHub beholder bare én ventende kjøring per gruppe: starter en ny ekte kjøring mens én kjører og én venter, avbrytes den som venter, og pinnen for den er ikke skrevet. Start den på nytt. En prøvekjøring står utenfor begge gruppene og avbryter ingenting.

**Feiler skrivingen for én av flere service-PR-er**, står pinnene for tjenestene foran den. Rett feilen og start på nytt med samme input: en pin som står fra før, skrives ikke på nytt.

## Skriveren

`scripts/e2e-pins.mjs` setter og fjerner pinner. Workflowen bruker den, og du kan kjøre den selv med ditt eget gh-token:

```bash
GH_TOKEN=$(gh auth token) node scripts/e2e-pins.mjs set melosys-web br-39400000000 388 3300
GH_TOKEN=$(gh auth token) node scripts/e2e-pins.mjs fjern melosys-web
```

`set` krever `gh` og docker logget inn i GAR (`gcloud auth configure-docker europe-north1-docker.pkg.dev`). Før den skriver, sjekker den dette:

- e2e-PR-en og service-PR-en er åpne.
- `br-<run_id>` er en grønn kjøring av «E2E med brancher» med hele suiten, mot head-commitene PR-ene har nå.
- Ingen pin fra et annet par gjelder for tjenesten. En utløpt eller forlatt pin ryddes bort.

Flagg:

- `--erstatt`: bytt tag og service-PR for en pin fra samme e2e-PR, for eksempel når service-PR-en er erstattet.
- `--tving`: overskriv en pin fra et annet par.
- `--dry-run`: vis verdien uten å skrive.

`gh variable set E2E_PINS -R navikt/melosys-e2e-tests` skriver variabelen uten noen av sjekkene. Kjøringene validerer verdien selv, og en ugyldig verdi slår av alle pinnene med en feilmelding. Skriv ikke for hånd mens «Koblet merge» skriver.

Verdien er ett JSON-objekt, én pin per tjeneste:

```json
{ "melosys-web": { "tag": "br-39400000000", "e2e_pr": 388, "service_pr": 3300, "satt": "2026-10-23T08:00:00Z" } }
```

## Slik virker pinnen

Steget «Determine image tags» i E2E Tests leser `vars.E2E_PINS` og avgjør hver pin for seg:

- **Under test:** har tjenesten en annen tag enn `latest` i kjøringen, beholder den taggen. Gaten, dispatch etter merge og «E2E med brancher» tester alltid imaget de er startet med.
- **Ikke startet:** ingen commit i historikken har emne som slutter på `(#<e2e_pr>)`, eller e2e-PR-en er revertert. Kjøringen bruker `latest`.
- **Aktiv:** testene har e2e-PR-en, og service-PR-en er åpen, eller `latest` er bygd før merge-commiten. Kjøringen bruker pin-taggen og viser en advarsel i sammendraget.
- **Utløpt:** revisjonen på `latest` (labelen `org.opencontainers.image.revision`) har merge-commiten til service-PR-en. Kjøringen bruker `latest`.
- **Forlatt:** service-PR-en er lukket uten merge, eller finnes ikke. Kjøringen bruker `latest` og viser en advarsel.

Statusen per pin står i `pinner` i `trigger-context.json`, som konsollen viser.

Andre regler:

- En eksplisitt `latest` regnes ikke som under test: `environment=melosys-web:latest` får pin-taggen for web så lenge pinnen er aktiv.
- Startregelen ser etter `(#<e2e_pr>)` i emnet. Squash-merge gjennom køen gir alltid det. En rebase-merge forbi køen gir ikke det, og pinnen starter ikke.
- Feiler et oppslag mot GitHub eller GAR, beholdes en aktiv pin en kort tid med en advarsel: et døgn etter at service-PR-en er merget, eller tre dager etter at pinnen ble satt hvis selve PR-oppslaget feiler.
- En utløpt pin kan stå i variabelen. Den er en linje i loggen, og neste `set` rydder den bort.

## Når noe går galt

- **Du setter service-PR-en i kø før e2e-PR-en er merget.** Gaten kjører de gamle testene og blir rød. Bare din PR tas ut.
- **e2e-PR-en revertes.** Revert-commiten slår av startregelen. Fjern pinnen også: `node scripts/e2e-pins.mjs fjern <tjeneste>`.
- **Service-PR-en lukkes eller erstattes.** Pinnen er forlatt, og kjøringene blir røde mot `latest`. Revert e2e-PR-en, eller kjør «E2E med brancher» på nytt med den nye service-PR-en og bytt med `set --erstatt <tjeneste> <ny br-tag> <e2e_pr> <ny service_pr>`.
- **Service-PR-en revertes etter merge.** `latest` er forbi merge-commiten, så pinnen er utløpt, og testene feiler mot et image uten endringen. Revert e2e-PR-en også.
- **En pin står aktiv i mer enn tre dager.** Hver kjøring viser en advarsel. Sjekk om service-PR-en står fast.
- **`br`-taggen er ryddet bort fra GAR.** GAR beholder versjoner i minst 90 dager. Kjøringene blir røde når imaget hentes. Fjern pinnen, eller kjør paret på nytt og bytt taggen.
