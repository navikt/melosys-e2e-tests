# Kjør e2e-testene på CI

En push starter ingen testkjøring. Testene en PR påvirker kjører én gang når du setter PR-en i merge queue. Vil du se resultatet før det, starter make-målene under en kjøring, venter og skriver ut resultatet. Uten `BRANCH=<navn>` spør `ci`, `ci-affected` og `ci-grep` om branchen du står på skal brukes. `BRANCH` leses bare fra kommandolinjen, ikke fra miljøet.

Du trenger `gh` innlogget mot navikt.

## Merge queue

Workflowen «E2E før merge» (`.github/workflows/e2e-for-merge.yml`) gir sjekken `e2e-for-merge`, som ruleset-et på `main` krever.

- På en PR svarer sjekken grønt med én gang. Den kjører ingen tester, så en push koster sekunder.
- Når du trykker **Merge when ready**, lager GitHub en midlertidig commit av `main` med PR-en lagt på. Knappen i nettleseren virker; `gh pr merge` mot køen feilet med intern GitHub-feil da dette ble satt opp. Workflowen velger testene med `scripts/affected-tests.mjs` mellom `base_sha` og `head_sha` i køen, og kjører «E2E Tests» mot `latest` med det filteret. Utvalget følger de samme reglene som `make ci-affected`, beskrevet under.
- Endrer PR-en bare dokumentasjon eller verktøy, kjører ingenting, og sjekken blir grønn.
- Blir kjøringen rød, tas PR-en ut av køen. Fiks, push og sett den i kø igjen.
- Retries er på, som i `playwright.config.ts`. En flaky test stopper derfor ikke merge, men vises som flaky i jobbsammendraget.

Kjøringen i køen bruker images fra `latest` på det tidspunktet. Hele suiten tar rundt en time, et fokusert utvalg 4–12 minutter.

Ruleset-et for merge queue på `main` må ha:

- `check_response_timeout_minutes` på 120. Standardverdien 60 er kortere enn hele suiten (64–68 min målt), så en PR som kjører hele suiten ville falt ut av køen.
- `max_entries_to_build` på 1, så køen ikke starter flere e2e-stacker på 8-kjerners runnere samtidig med kjøringene fra image-bygg.
- påkrevd sjekk `e2e-for-merge`.

Merge queue virker bare på brancher med navn på høyst 15 tegn. `nais/login` avviser et OIDC-token der `sub` er over 127 byte, og i køen er `sub` `repo:navikt/melosys-e2e-tests:ref:refs/heads/gh-readonly-queue/<branch>/pr-<nr>-<sha>`. For `main` blir det 115–117 byte. En for lang branch stopper bare PR-er som kjører e2e; doc-PR-er går gjennom.

Sjekken `e2e-for-merge` er grønn på en PR før den står i kø, og betyr bare noe i køen. Merger noen med bypass på ruleset-et forbi køen, har ingen e2e-tester kjørt.

## Før du setter en PR i kø

Vil du se resultatet før du setter PR-en i kø, stå i branchen og kjør:

```bash
git fetch origin && git merge origin/main && git push
make ci-affected
```

Merge inn main først. CI tester branchen din, ikke resultatet av merge. Mangler branchen commits fra main, kan en grønn kjøring bli rød etter merge. Scriptet henter main selv og advarer når `origin/<branch>` mangler commits fra `origin/main`, men starter kjøringen likevel. Scriptet henter `origin/main` også i en klon laget med `--single-branch`. Kan main ikke hentes, sjekker scriptet ikke dette og sier ikke fra. I en grunn klon (`--depth`) kan advarselen vises selv om main er merget inn.

Advarselen gjelder bare commits i dette repoet. Kjøringen bruker images fra `latest`, og endres de etter kjøringen din, kan testene bli røde etter merge selv om main var merget inn. Har det gått tid siden sist du kjørte, kjør på nytt før du merger.

Push før du kjører. CI kjører koden på `origin`, ikke arbeidstreet ditt.

## Slik velger `make ci-affected` tester

`make ci-affected` følger importgrafen fra filene du har endret mot `origin/main`. Bare pushede commits teller, fordi utvalget regnes fra `origin/<branch>`, som er det CI kjører. `make affected` tar også med ucommittede og usporede filer, så du ser rekkevidden før du committer. Den sender bare spec-filene som importerer en endret fil, direkte eller via andre moduler.

Er bare filer som e2e-workflowen ikke leser endret, starter `make ci-affected` ingenting og sier fra. Det gjelder dokumentasjon (`*.md` og `docs/`), `Makefile`, `scripts/ci-e2e.sh`, `scripts/affected-tests.mjs` og enhetstestene i `lib/**/*.test.ts`. Slike filer tvinger heller ikke hele suiten. En branch uten endringer mot `origin/main` starter heller ingenting. Vil du kjøre likevel, for eksempel mot nye images på `latest`, bruk `make ci`. Når du kjører branchen du står på, vises advarslene om upushede og ucommittede endringer også når ingenting startes. Andre filer under `scripts/` teller som endringer utenfor grafen, fordi CI kan bruke dem.

Den kjører hele suiten i stedet når:

- 80 % eller mer av spec-filene er påvirket. En endring i `fixtures/` eller `helpers/unleash-helper.ts` når nesten alle.
- endringene når importgrafen, men ingen spec-fil er påvirket.
- en endret fil ligger utenfor importgrafen, for eksempel `playwright.config.ts`, `package.json`, `global-setup.ts`, compose-filer eller workflows. Grafen dekker `.ts`-filer under `tests/`, `pages/`, `helpers/`, `fixtures/`, `lib/`, `utils/` og `atdd/`. Filene fra avsnittet over teller ikke.

Grafen ser bare statiske importer. Når endringen din når testene via kjøretidstilstand, som Unleash-toggler eller seedet data, kjør `make ci`.

## Andre make-mål

| Mål | Hva det gjør |
|---|---|
| `make affected` | Lister påvirkede spec-filer uten å kjøre noe |
| `make ci-affected BRANCH=min-branch` | Kjører påvirkede tester for en annen branch enn den du står på. `BRANCH` virker også for `affected`, som henter branchen først, og for `ci` og `ci-grep` |
| `make ci-affected PREVIEW=1` | Skriver ut `gh`-kommandoen som ville blitt sendt, uten å starte kjøringen. Virker også for `ci` og `ci-grep` |
| `make ci` | Kjører hele suiten mot `latest` |
| `make ci-grep GREP=8163` | Kjører tester som matcher et eget filter |
| `make ci-images ENV=melosys-api:min-tag,melosys-web:min-tag` | Kjører hele suiten mot egne images |

Egne images bygger du med «Build and Push Image»-workflowen i hvert repo. Workflow-fila må finnes på branchen du bygger fra.

## Flagg til scriptet

Make-målene kaller `scripts/ci-e2e.sh`. Kall scriptet direkte når du vil kombinere flagg:

```bash
# Påvirkede tester mot egne images
./scripts/ci-e2e.sh --affected --env melosys-api:min-tag,melosys-web:min-tag
```

| Flagg | Hva det gjør |
|---|---|
| `--affected` | Kjører bare påvirkede tester |
| `--branch <navn>` | Kjører mot en annen branch enn den du står på. Uten flagget spør scriptet i terminalen |
| `--grep <mønster>` | Eget filter |
| `--env <tagger>` | Egne images, for eksempel `melosys-api:min-tag,melosys-web:min-tag` |
| `--no-wait` | Starter kjøringen og returnerer med én gang |
| `-p`, `--preview` | Skriver ut `gh`-kommandoen som ville blitt sendt, uten å starte kjøringen |
| `--vis-filter` | Skriver ut hele filteret som sendes |
| `--retries` | Slår på retries. Standard er av, så flaky tester synes |

## Se rekkevidden før du endrer noe

```bash
node scripts/affected-tests.mjs --changed pages/vedtak/vedtak.page.ts --files
```

`--changed` later som om fila er endret og lister spec-filene som er påvirket. Er 80 % eller mer påvirket, kjører `make ci-affected` likevel hele suiten.
