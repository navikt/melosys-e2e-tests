# Spec-drevet testing (v2)

Et **domenespesifikt format** for å beskrive E2E-tester, lesbart for fagpersoner og
samtidig presist nok til at en agent kan generere – og regenerere – Playwright-testen.

> **Speken råtner ikke. Koden gjør det.** Når Melosys endrer en UI-flyt feiler
> Playwright-testen, men forretningsregelen i speken står ved lag. Da regenererer vi
> testen fra speken mot den nye kodebasen – i stedet for å arkeologere i gammel testkode.

Dette er v2. v1 (mars 2026) var et engangsforsøk der specs ble *omvendt-konstruert fra
eksisterende tester* som dokumentasjon i etterkant; det stoppet opp fordi det manglet
en hensikt i øyeblikket. Det arkivet ligger i `melosys-kode-wiki` under
`archive/melosys-e2e-tests/specs-experiment-2026-03-22/`. v2 snur rekkefølgen: **speken
kommer først, fra analysen av Jira-saken, før testen finnes.**

---

## Det bærende prinsippet: to lag, én fil

v1 blandet forretning og teknikk i samme prosa ("Arbeidsflyt" lekket `radio-knapp`,
`USER_ID_VALID`, tabellnavn). Da tjener filen ingen av leserne. v2 deler filen i to lag:

| Lag | Leser | Innhold |
|---|---|---|
| **Domenelaget** (over streken) | Fagperson, saksbehandler, PO | Forretningsregel + `Gitt/Når/Så`-scenario + akseptansekriterier. Domenespråk: lovvalg, bestemmelse, dekning, vedtak, årsavregning. **Ingen** selektorer, konstanter, tabeller. |
| **Teknisk binding** (under streken) | Testagenten | Testdata, Page Objects, konstanter, assertions, toggles, mock-oppsett. Domeneleseren hopper over. |

Den viktigste gevinsten: **domenelagets «Så»-linjer ≡ Jira-akseptansekriteriene ≡
testens assertions**. Det fagpersonen godkjenner er nøyaktig det testen verifiserer.

## Formatet

Hver spec er én Markdown-fil i `specs/`, navngitt etter flyten (ikke testfilen):
`specs/ftrl-pensjonist-aarsavregning.md`. Mal:

```markdown
---
jira: MELOSYS-7828
epic: Årsavregning
status: verified            # draft → implemented → verified
test: tests/ftrl/ftrl-pensjonist-aarsavregning.spec.ts
toggles:
  melosys.arsavregning.uten.flyt: off
tags: [ftrl, pensjonist, årsavregning]
---

# <Kort, domenenært navn>

## Forretningsregel
2–4 setninger: hvilken regel/lov ligger bak? Lenk til Confluence eller saksanalyse
heller enn å gjengi en lærebok. (v1-spekene ballet ut her – hold det stramt.)

## Scenario
​```gherkin
Gitt <forutsetning i domenetermer>
  Og <flere forutsetninger>
 Når <handlingen som testes>
 Så <forventet utfall>
  Og <flere garantier>
​```

## Akseptansekriterier (det fagperson signerer av på)
- [ ] ...   speil Jira sine akseptansekriterier her

## Kjente avgrensninger (ikke dekket her)
- ... peker videre til andre specs

---

## Teknisk binding
*(for testagenten — domeneleseren kan stoppe over linjen)*
Testdata · Page Objects · konstanter · assertions · waitForProcessInstances · toggles
```

### Frontmatter-felter

| Felt | Hva | Brukt av |
|---|---|---|
| `jira` | Sak speken stammer fra | sporbarhet |
| `epic` | Epic/program | gruppering |
| `status` | `draft` \| `implemented` \| `verified` | livssyklus + drift-gate |
| `test` | Sti til Playwright-testen speken binder til | round-trip-sjekk |
| `toggles` | Feature-toggles testen forutsetter (avvik fra default) | testagent + Unleash-oppsett |
| `tags` | Frie emneknagger | søk/filtrering |

## Konvensjoner for teknisk binding

Lærdom fra round-trip-testen (regenerér testen fra speken alene, diff mot originalen):

1. **Verbatim-verdier.** Flyt-spesifikke `selectOption`-argumenter merkes `(verbatim)` og
   skal brukes ordrett. Samme dropdown bruker ulike koder i ulike flyter, og POM-ens
   JSDoc-eksempler er generiske plassholdere. Uten merket "korrigerte" testagenten
   `MIDLERTIDIG_2_1_FJERDE_LEDD` (riktig her) til `MIDLERTIDIG_ARBEID_2_1_FJERDE_LEDD`
   (en *annen* flyts verdi) — en stille regresjon. Helst: referér konstanten ved sin
   kanoniske kilde (enum/POM) i stedet for å hardkode en literal som kan drifte.
2. **Stillas hører til genererings-skillen, ikke speken.** Mellomliggende guard-assertions
   (`verifiserBehandlingOpprettet`), default-timeouts og plassering av
   `waitForProcessInstances` legges inn av `pom-from-recording`-skillen som konvensjon.
   Domenelaget holdes rent for forretningsatferd — ikke testrobusthet.

Round-trip er også den beste valideringen av en spec: reproduserer en blind agent testen,
er speken generativ; divergensene som dukker opp er nyttig signal (drift, tvetydighet).

## Livssyklus

Statusfeltet driver pipelinen:

- **`draft`** — speken er destillert fra Jira-analysen. Koden finnes (kanskje)
  ikke ennå. Domenelaget kan reviewes av fagperson *før* implementasjon.
- **`implemented`** — `test:`-filen finnes og er generert/skrevet fra speken.
- **`verified`** — testen er kjørt grønn, lokalt og i CI.

## Pipelinen: Jira → spec → test → verifisering

```
Jira-sak
  └─ analyse av saken mot regelverk + kode  ──►  arbeidsdokument
        ├──────────────► feature implementeres (melosys-api / -web)
        └──► SPEC  (domenelag = akseptansekriterier · teknisk binding)   [status: draft]
               └─ testen genereres fra speken (se pom-from-recording) ──► .spec.ts   [implemented]
                     └─ når featuren er ferdig:
                          testen kjøres på tvers av feature-branchene, lokalt + CI
                               └─ grønn ──► [status: verified] ✅
```

Samme analyse ligger til grunn for både featuren og speken, så implementasjon og test er
forankret i samme forståelse av saken. Domene- og regelverkskonteksten i
Forretningsregel-seksjonen hentes fra Confluence og lovtekst.

> Stegene «analyse» og «kjør på tvers av branchene» er automatisert med agentverktøy som
> kjører på et lokalt oppsett utenfor dette repoet. **Spec-formatet er uavhengig av det** —
> specene i `specs/` leses og skrives like godt for hånd.

## Når oppdaterer jeg hva?

| Endring | Oppdater |
|---|---|
| Knapp/felt bytter navn, refaktorering | **testen** (ev. regenerer fra spec) — *ikke* speken |
| Nytt obligatorisk steg i flyten | **speken** først, så testen |
| Ny/endret forretningsregel fra regelverk | **ny/endret spec**, så test |

## Round-trip / drift-gate

Round-trip-selvsjekken (regenerér testen fra speken alene med en blank-kontekst-agent, diff mot
originalen) er en del av genereringsløpet. Drift-gaten — en automatisk CI-sjekk — er
fortsatt **planlagt**; foreløpig flagges disse manuelt:
- testfil uten tilhørende spec,
- spec hvis `test:` peker på en fil som ikke finnes,
- spec som er grønn men fortsatt `implemented` (skal heves til `verified`).

## Eksempel

`specs/ftrl-pensjonist-aarsavregning.md` — skrevet fra den eksisterende testen
`tests/ftrl/ftrl-pensjonist-aarsavregning.spec.ts` som referanse-implementasjon av formatet.
