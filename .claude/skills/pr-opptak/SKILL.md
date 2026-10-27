---
name: pr-opptak
description: |
  Legg video av e2e-testene en PR påvirker inn i PR-beskrivelsen i melosys-e2e-tests, med
  `make pr-opptak PR=<n>`. Bruk denne etter at du har opprettet en PR i dette repoet, og på nytt
  etter nye commits før review. Triggers: "pr-opptak", "opptak i PR-en", "video av testene i
  PR-beskrivelsen", "legg ved opptak", "record the e2e tests for the PR".
---

# Opptak i PR-beskrivelsen

`make pr-opptak PR=<n>` kjører testene PR-en påvirker på CI med video, og legger ett opptak per
test i PR-beskrivelsen, mellom `<!-- e2e-opptak:start -->` og `<!-- e2e-opptak:end -->`. En ny
kjøring bytter bare ut den seksjonen.

## Når

- Etter at du har opprettet en PR i dette repoet.
- På nytt etter nye commits, før PR-en går til review.
- Aldri som del av dispatch-kjøringer, `e2e`-labelen eller merge queue. Opptaket er for den som
  leser PR-en, ikke en sjekk.

## Slik

```bash
make pr-opptak PR=<n>              # påvirkede tester på CI, venter til kjøringen er ferdig
make pr-opptak PR=<n> LOKAL=1      # mot stacken som kjører lokalt, uten CI
make pr-opptak PR=<n> RUN=<id>     # gjenbruk en kjøring startet med VIDEO=1
make pr-opptak PR=<n> TORRT=1      # alt unntatt å endre beskrivelsen
```

Krever gh 2.99 eller nyere med personlig innlogging og ffmpeg. `GH_TOKEN` og `GITHUB_TOKEN` må
ikke være satt. Flere enn `MAKS` opptak (standard 20, høyst 50) avvises; snevre da inn med
`make ci-grep GREP=<mønster> VIDEO=1` og bruk `RUN=<id>`.

## Sjekk etterpå

Åpne PR-en og se at seksjonen har ett opptak per påvirket test, og at oppsummeringslinjen
stemmer med kjøringen. Scriptet feiler selv hvis antallet opplastede opptak ikke stemmer.

Mer i `docs/ci-cd/KJOR-E2E-PA-CI.md`, avsnittet «Opptak i PR-beskrivelsen».
