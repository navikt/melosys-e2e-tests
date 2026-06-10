---
jira: MELOSYS-8128
epic: MELOSYS-6579 — Automatisk opprette årsavregningsbehandlinger på ikke skattepliktige
status: draft
test: tests/utenfor-avtaleland/workflows/arsavregning-oppgave-aar-i-beskrivelse.spec.ts
toggles:
  melosys.oppgave_nokkelord: on   # gate for nøkkelord-funksjonaliteten; PÅ i default-lista
tags: [årsavregning, oppgave, gosys, nøkkelord, oppgave-api-v2, ftrl]
---

# Skatteår som nøkkelord på årsavregningsoppgave

## Forretningsregel

Bygger på [MELOSYS-8123](aarsavregning-oppgave-skatteaar-i-beskrivelse.md) (skatteår i
beskrivelsesfeltet): i tillegg til beskrivelsen skal skatteåret settes som **nøkkelord** på
årsavregningsoppgaven, slik at saksbehandler kan filtrere/sortere på nøkkelord i Gosys.
Nøkkelordet har eksakt format `Årsavregning <år>` (f.eks. «Årsavregning 2025») og settes via
Oppgave-API v2 (`PATCH /api/v2/oppgaver/{id}`) rett etter at oppgaven er opprettet — og
re-settes etter oppdatering/rebuild av oppgaven. Feil i nøkkelord-kallet skal aldri blokkere
selve oppgaveopprettelsen. Funksjonaliteten er gated bak Unleash-togglen
`melosys.oppgave_nokkelord`.

## Scenario

```gherkin
Scenario: Årsavregningsoppgave får skatteår som nøkkelord
  Gitt at togglen melosys.oppgave_nokkelord er PÅ
   Når Melosys automatisk oppretter en årsavregningsoppgave for skatteår X
    # (uansett trigger: skattehendelse, ikke-skattepliktig-jobb eller saksbehandlingsflyt)
   Så har oppgaven nøkkelordet «Årsavregning X» i Oppgave-API v2
    Og beskrivelsesfeltet inneholder fortsatt skatteår X (8123 uendret)

Scenario: Nøkkelordet overlever oppdatering av oppgaven
  Gitt en årsavregningsoppgave med nøkkelordet «Årsavregning X»
   Når oppgaven oppdateres/rebuildes (v1-PUT erstatter hele oppgaven)
   Så re-settes nøkkelordet «Årsavregning X» av Melosys etterpå
```

## Akseptansekriterier

- [ ] Årsavregningsoppgaver opprettet av alle tre automatiske triggere (8123-scenarioene) har
      nøkkelordet `Årsavregning <skatteår>` i Oppgave-API v2
- [ ] Nøkkelordet finnes fortsatt etter at tilhørende prosessinstanser (som kan oppdatere
      oppgaven) er ferdige
- [ ] 8123-assertions (skatteår i beskrivelse, tema, oppgavetype, gjelderfelt) er uendret grønne

---

## Teknisk binding
*(for testagenten — domeneleseren kan stoppe over linjen)*

Implementert som **utvidelse av 8123-testene** i samme spec-fil — ikke egne tester. Alle tre
tester får nøkkelord-assertions i tillegg til beskrivelse-assertions.

**Backend:** melosys-api branch `8128-nokkelord-arsavregningsoppgave` (stacked på 8123).
OppgaveService setter nøkkelordet i et **separat kall** (`PATCH /api/v2/oppgaver/{id}`) rett
ETTER opprettelse/oppdatering → assertions må **polle** (`expect.poll`, 30 s), ikke
enkelt-sjekke.

**Mock:** krever mock-image med Oppgave-API v2 (melosys-docker-compose PR #148):
`GET/PATCH /api/v2/oppgaver/{id}` — samme oppgave-id-er som v1; PATCH erstatter hele
nokkelord-listen. Re-sjekken etter prosess-fullføring asserter at nøkkelordet finnes etter
oppdatering/rebuild av oppgaven (v1-PUT) — invarianten holder uavhengig av om mocken bevarer
nokkelord ved v1-PUT (mock-oppførsel fra #148-review) eller backend re-setter det.

**Assertions** (helper `verifiserNokkelordPaaOppgave` i testfila):
1. `verifiserAarsavregningsoppgaveMedSkatteaar` (8123) returnerer nå oppgave-id
2. `expect.poll` på `fetchOppgaveV2(request, oppgaveId).nokkelord` (`helpers/mock-helper.ts`,
   `GET http://localhost:8083/api/v2/oppgaver/{id}`) → `toContain('Årsavregning ${FORRIGE_AAR}')`
3. Etter siste `waitForProcessInstances`: samme poll én gang til (nøkkelord overlever
   oppdatering/rebuild)

**Toggle:** `melosys.oppgave_nokkelord` er lagt inn i default-lista i
`helpers/unleash-helper.ts` (`resetToDefaults`) som **PÅ** — alle tester kjører dermed med
nøkkelord-funksjonaliteten aktiv, og cleanup-fixturen holder staten deterministisk.

**Hjelpere:** `helpers/mock-helper.ts` (`fetchOppgaveV2`, `OppgaveV2Info` — nye)
