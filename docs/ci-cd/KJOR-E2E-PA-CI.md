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
- Du skriver ikke squash-meldingen selv i køen. GitHub setter tittelen fra PR-tittelen pluss `(#nummer)`, og brødteksten fra PR-beskrivelsen. Rett beskrivelsen før du setter PR-en i kø.

Kjøringen i køen bruker images fra `latest` på det tidspunktet. Hele suiten tar rundt en time, et fokusert utvalg 4–12 minutter.

Ruleset-et for merge queue på `main` må ha:

- `check_response_timeout_minutes` på 120. Standardverdien 60 er kortere enn hele suiten (64–68 min målt), så en PR som kjører hele suiten ville falt ut av køen.
- `max_entries_to_build` på 1, så køen ikke starter flere e2e-stacker på 8-kjerners runnere samtidig med kjøringene fra image-bygg.
- påkrevd sjekk `e2e-for-merge`.

Merge queue virker bare på brancher med navn på høyst 15 tegn. `nais/login` avviser et OIDC-token der `sub` er over 127 byte, og i køen er `sub` `repo:navikt/melosys-e2e-tests:ref:refs/heads/gh-readonly-queue/<branch>/pr-<nr>-<sha>`. For `main` blir det 115–117 byte. En for lang branch stopper bare PR-er som kjører e2e; doc-PR-er går gjennom.

Sjekken `e2e-for-merge` er grønn på en PR før den står i kø, og betyr bare noe i køen. Merger noen med bypass på ruleset-et forbi køen, har ingen e2e-tester kjørt.

## E2E-gate for kilderepoer

`.github/workflows/e2e-gate.yml` er en gjenbrukbar workflow et kilderepo (først melosys-api) kaller fra en PR eller fra sin egen merge queue. Den svarer på ett spørsmål: er nøyaktig denne koden testet grønt før?

1. Gaten henter git-treet til `tag` fra kilderepoet og slår opp `<image>:e2e-ok-<tree>` i GAR. Finnes markøren, er gaten grønn uten å kjøre noe.
2. Ellers starter den «E2E Tests» med `environment=<service>:<tag>`, `gate_context` og `correlation_id`, og kjøringen får tittelen `E2E Tests · <service>-<run_id>-<attempt>`. Gaten venter og poller hvert minutt.
3. Er «E2E Tests» grønn, tagger gaten imaget `e2e-ok-<tree>`. Feiler taggingen, er gaten likevel grønn, med en advarsel. Er «E2E Tests» rød, er gaten rød, og jobbsammendraget lenker til kjøringen.
4. Avbrytes gaten, for eksempel fordi labelen fjernes eller køoppføringen kastes ut, avbryter den også «E2E Tests».

Treet er nøkkelen, ikke SHA-en: merge-refen på PR-en, commiten i køen og commiten på master har samme tree når koden er den samme. Markøren sparer bare e2e-kjøringen; den gjør aldri et PR-image til et image som deployes.

Kalleren sender `service`, `image` (GAR-sti uten tag), `tag` (commit-SHA-en imaget er bygget fra) og fra merge queue `queue_ref`. Den gir `permissions: { id-token: write, contents: read }` og sender `E2E_TRIGGER_PAT` (Actions: read and write på dette repoet) under `secrets:`. Gaten gir tilbake outputs `hit`, `tree` og `run_id` (ID-en til «E2E Tests», tom ved treff).

En gate-kjøring er `workflow_dispatch` på `main`, så GitHub viser dette repoets siste commit og eieren av `E2E_TRIGGER_PAT` øverst på siden. Kilderepo, PR, PR-head og tree står i jobbsammendraget.

Gate-kjøringer sender ikke varsel til Slack; det gjør bare `repository_dispatch`-kjøringer. Svaret står i PR-en eller i køen.

### Labelen `e2e` i melosys-api

Sett labelen `e2e` på en PR i melosys-api for å kjøre hele suiten mot PR-en flettet inn i master (`.github/workflows/e2e-pr.yml` der). Sjekken er ikke påkrevd.

- Kjøringen tar rundt 75 minutter: bygg, så «E2E Tests» mot `melosys-api:<merge-sha>` og `latest` for resten.
- Er nøyaktig samme kode testet grønt før, hoppes både bygg og kjøring over.
- Når kjøringen er ferdig, kommer resultatet som en kommentar i PR-en. Checken henger på PR-headen da labelen ble satt, og vises ikke lenger på PR-siden etter en ny push. Har PR-en fått nye commits underveis, sier kommentaren det.
- Fjerner du labelen, avbrytes kjøringen. Andre labeler, som `wip`, påvirker den ikke.
- En push starter ingen ny kjøring. For en ny kjøring fjerner du labelen og setter den på nytt. Ikke bruk «Re-run jobs»: den tester den gamle merge-commiten.
- Sett labelen rett før du merger. Står master stille fra kjøringen er grønn til du merger, har commiten på master samme tree, og `deploy-dev` hopper over e2e-kjøringen etter merge. Har master flyttet seg, kjører e2e etter merge som før.
- PR-er fra Dependabot og fra forks kjører ikke.

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

`make ci-affected` følger importgrafen fra filene du har endret mot `origin/main`. Bare pushede commits teller, fordi utvalget regnes fra `origin/<branch>`, som er det CI kjører. `make list-affected` tar også med ucommittede og usporede filer, så du ser rekkevidden før du committer. Den sender bare spec-filene som importerer en endret fil, direkte eller via andre moduler.

Er bare filer som e2e-workflowen ikke leser endret, starter `make ci-affected` ingenting og sier fra. Det gjelder dokumentasjon (`*.md` og `docs/`), `Makefile`, `scripts/ci-e2e.sh`, `scripts/affected-tests.mjs` og enhetstestene i `lib/**/*.test.ts`. Slike filer tvinger heller ikke hele suiten. En branch uten endringer mot `origin/main` starter heller ingenting. Vil du kjøre likevel, for eksempel mot nye images på `latest`, bruk `make ci`. Når du kjører branchen du står på, vises advarslene om upushede og ucommittede endringer også når ingenting startes. Andre filer under `scripts/` teller som endringer utenfor grafen, fordi CI kan bruke dem.

Den kjører hele suiten i stedet når:

- 80 % eller mer av spec-filene er påvirket. En endring i `fixtures/` eller `helpers/unleash-helper.ts` når nesten alle.
- endringene når importgrafen, men ingen spec-fil er påvirket.
- en endret fil ligger utenfor importgrafen, for eksempel `playwright.config.ts`, `package.json`, `global-setup.ts`, compose-filer eller workflows. Grafen dekker `.ts`-filer under `tests/`, `pages/`, `helpers/`, `fixtures/`, `lib/`, `utils/` og `atdd/`. Filene fra avsnittet over teller ikke.

Grafen ser bare statiske importer. Når endringen din når testene via kjøretidstilstand, som Unleash-toggler eller seedet data, kjør `make ci`.

## Andre make-mål

| Mål | Hva det gjør |
|---|---|
| `make list-affected` | Lister påvirkede spec-filer uten å kjøre noe. Tar med ucommittede filer, men ikke med `BRANCH=`, som regner fra `origin/<branch>` |
| `make ci` | Kjører hele suiten mot `latest` |
| `make ci-grep GREP=8163` | Kjører tester som matcher et eget filter |
| `make ci-images ENV=melosys-api:min-tag,melosys-web:min-tag` | Kjører hele suiten mot egne images |

Egne images bygger du med «Build and Push Image»-workflowen i hvert repo. Workflow-fila må finnes på branchen du bygger fra.

## Variabler

`ci`, `ci-affected`, `ci-grep` og `ci-images` tar de samme variablene, og du kan kombinere dem:

```bash
make ci-affected ENV=melosys-api:min-tag RETRIES=1
```

| Variabel | Flagg til `scripts/ci-e2e.sh` | Hva det gjør |
|---|---|---|
| `BRANCH=<navn>` | `--branch <navn>` | Kjører mot en annen branch enn den du står på. Uten spør scriptet i terminalen. Virker også for `list-affected`, som henter branchen først |
| `ENV=<tagger>` | `--env <tagger>` | Egne images, for eksempel `melosys-api:min-tag,melosys-web:min-tag`. Påkrevd for `ci-images` |
| `SHARDS=<1–8>` | `--shards <1–8>` | Antall shards. Uten sendes ingenting, og workflowen ber om 3. Se [Sharding](#sharding) |
| `PREVIEW=1` | `--preview` | Skriver ut `gh`-kommandoen som ville blitt sendt, uten å starte kjøringen |
| `RETRIES=1` | `--retries` | Slår på retries. Standard er av, så flaky tester synes |
| `VIS_FILTER=1` | `--vis-filter` | Skriver ut hele filteret som sendes |
| `NO_WAIT=1` | `--no-wait` | Starter kjøringen og returnerer med én gang |

Variablene leses bare fra kommandolinjen. En `BRANCH` eller `ENV` eksportert i skallet styrer ikke CI.

## Sharding

E2E Tests deler testene på 3 shards som standard, også når kjøringen startes fra et image-bygg eller fra merge queue. Plan-jobben fordeler spec-filene etter varigheten fra forrige fulle kjøring på main, og hver shard kjører sin del mot sin egen stack. Skjema-testene havner i samme shard.

- Shardene skal i snitt ha minst 5 minutter estimert testtid, fordi oppsettet av en stack tar rundt 4,5 minutter. Et lite utvalg, som de påvirkede testene i merge queue, kjører derfor på færre shards eller på én.
- `run_bdd` og `collect_coverage` kjører alltid på én shard.
- Velg antall selv med `SHARDS=` på make-målene, for eksempel `make ci SHARDS=1`, eller med `-f shards=N` på `gh workflow run`.

Med én shard ser kjøringen ut som før sharding: jobben `e2e-tests` laster opp `test-summary` og de andre artefaktene.

Med flere shards laster hver shard opp artefaktene sine med suffiks, for eksempel `test-summary-shard-2` og `docker-logs-shard-2`. Jobben «Slå sammen shards» slår sammen blob-rapportene til én rapport og laster den opp som `test-summary` og `playwright-report` (HTML). Den summerer også Prometheus-metrikkene fra shardene. Konsollen, Slack-varslet og plan-jobben leser `test-summary` som før. Mangler rapporten fra en shard, feiler jobben og sier hvilken. Docker-logganalysen står i hver shard-jobb.

## Se rekkevidden før du endrer noe

```bash
node scripts/affected-tests.mjs --changed pages/vedtak/vedtak.page.ts --files
```

`--changed` later som om fila er endret og lister spec-filene som er påvirket. Er 80 % eller mer påvirket, kjører `make ci-affected` likevel hele suiten.
