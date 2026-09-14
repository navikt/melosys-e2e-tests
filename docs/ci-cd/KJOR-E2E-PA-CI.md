# Kjør e2e-testene på CI

E2E-workflowen er dispatch-only, så en push starter ingen testkjøring. Make-målene under starter kjøringen for branchen du står på, venter og skriver ut resultatet.

Du trenger `gh` innlogget mot navikt.

## Før du merger en PR

Stå i branchen og kjør:

```bash
git fetch origin && git merge origin/main && git push
make ci-affected
```

Merge inn main først. CI tester branchen din, ikke resultatet av merge. Mangler branchen commits fra main, kan en grønn kjøring bli rød etter merge. Scriptet henter main selv og advarer når `origin/<branch>` mangler commits fra `origin/main`, men starter kjøringen likevel.

Push før du kjører. CI kjører koden på `origin`, ikke arbeidstreet ditt.

## Slik velger `make ci-affected` tester

`make ci-affected` følger importgrafen fra filene du har endret, mot `origin/main` og inkludert ucommittede endringer. Den sender bare spec-filene som importerer en endret fil, direkte eller via andre moduler.

Den kjører hele suiten i stedet når:

- 80 % eller mer av spec-filene er påvirket. En endring i `fixtures/` eller `helpers/unleash-helper.ts` når nesten alle.
- ingen spec-fil er påvirket.
- en endret fil ligger utenfor importgrafen, for eksempel `playwright.config.ts`, `package.json`, `global-setup.ts`, compose-filer eller workflows. Grafen dekker `.ts`-filer under `tests/`, `pages/`, `helpers/`, `fixtures/`, `lib/`, `utils/` og `atdd/`. Markdown teller ikke.

Grafen ser bare statiske importer. Når endringen din når testene via kjøretidstilstand, som Unleash-toggler eller seedet data, kjør `make ci`.

## Andre make-mål

| Mål | Hva det gjør |
|---|---|
| `make affected` | Lister påvirkede spec-filer uten å kjøre noe |
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
| `--grep <mønster>` | Eget filter |
| `--env <tagger>` | Egne images, for eksempel `melosys-api:min-tag,melosys-web:min-tag` |
| `--no-wait` | Starter kjøringen og returnerer med én gang |
| `--vis-filter` | Skriver ut hele filteret som sendes |
| `--retries` | Slår på retries. Standard er av, så flaky tester synes |

## Se rekkevidden før du endrer noe

```bash
node scripts/affected-tests.mjs --changed pages/vedtak/vedtak.page.ts --files
```

`--changed` later som om fila er endret og lister spec-filene som ville blitt kjørt.
