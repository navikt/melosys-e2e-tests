---
name: nav-squash-pr-message
disable-model-invocation: true
description: |
  NAV-spesifikk squash merge commit-melding med Jira-nummer krav.
  Triggers: "/nav-squash-pr-message"
  Use when: Generating squash commit messages with NAV conventions (Jira prefix required).
---

# Squash PR Message

1. Run `gh pr view --json title,number,body`

2. Valider PR-tittel med scriptet:
   ```bash
   python ~/.claude/skills/nav-squash-pr-message/scripts/validate_pr_title.py "<title>" <pr_number>
   ```
   - Må starte med en eller flere koder: `1234`, `NOJIRA`, `TOGGLE`, `DWEB`, `G4P`, etc.
   - Kan kombineres: `1234 TOGGLE DWEB Beskrivelse` eller `1234 G4P Beskrivelse`
   - Totalt maks 72 tegn (inkludert ` (#number)` som legges til)
   - Vis feil/advarsler fra scriptet til brukeren

3. Hvis tittel er for lang (over 72 tegn):
   - Generer 2-3 kortere alternativer som beholder essensen
   - Bruk **AskUserQuestion** med multiple choice:
     - Header: "Tittel for lang"
     - Question: "Tittelen er X tegn (maks 72). Velg en kortere versjon:"
     - Options: De genererte alternativene
   - Brukeren kan også velge "Other" for å skrive egen

4. Hvis Jira-nummer mangler:
   - Bruk **AskUserQuestion** med multiple choice:
     - Header: "Jira-nummer"
     - Question: "Tittelen mangler Jira-nummer. Hva skal brukes?"
     - Options:
       - "NOJIRA" (for endringer uten Jira-sak)
       - "Angi nummer" (lar bruker skrive inn)
   - Valider på nytt etter brukerens valg

5. Create commit message following git best practices:
   - **Tittel**: `1234 [KODER] Beskrivelse (#number)` - maks 72 tegn totalt
   - Blank linje etter tittel
   - **Body** (VIKTIG - begge deler MÅ være med):
     - Første avsnitt: **Hva** som er gjort (kort oppsummering)
     - Blank linje
     - Andre avsnitt: **Hvorfor** - bakgrunn/motivasjon (ALLTID PÅKREVD!)
     - Valgfritt: Bullet points med detaljer til slutt
   - Plain text (ingen markdown)
   - Imperativ form: "Legg til", "Fiks", "Oppdater" (ikke "Legger til")

6. Copy to clipboard with `pbcopy`

## Eksempel på ferdig commit-melding

```
1234 Legg til validering av fødselsnummer (#456)

Legger til validering av fødselsnummer i skjema for ny søknad.

Brukere kunne tidligere sende inn ugyldige fødselsnummer som
førte til feil i backend-prosessering.
```

## Eksempel med flere koder og detaljer

```
7553 TOGGLE A008 CDM 4.4: Legg til formål og SED-versjon (#811)

Legger til støtte for CDM 4.4-endringer i A008 SED med nytt formål-felt og oppdatert SED-versjon bak feature toggle.

CDM 4.4-spesifikasjonen krever at A008 har et formål-felt for å skille mellom "endringsmelding" og "arbeid_flere_land". Styres av toggle for kontrollert utrulling.

Endringer:
- Nytt formål-felt i MedlemskapA008
- SED-versjon 4.4 når toggle er aktivert
- Nytt felt a008Formaal i SedDataDto
```