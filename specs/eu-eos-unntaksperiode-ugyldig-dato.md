---
jira: NOJIRA
status: bundet
date: 2026-07-29
kilde: melosys-kode-wiki/archive/melosys-api/2026-07-28-invalid-date-unntaksperiode-kontroll-plan.md
---

# «Invalid date» skal aldri sendes til – eller velte – unntaksperiode-kontrollen

## Forretningsregel

Ved registrering av unntak fra norsk trygd (inngående A009/A010) kan saksbehandler
godkjenne unntaksperioden slik den står, avslå den, eller godkjenne med en **endret**
periode. Endring er påkrevd når registerkontrollen har gitt treff — f.eks. når SED-en
oppgir en periode over 24 måneder, som ikke kan innvilges uten videre.

Mens saksbehandler skriver den nye perioden, kontrollerer systemet fortløpende om
perioden kan godkjennes. En halvskrevet dato er en normal, forventet mellomtilstand i
den prosessen: den skal ikke gi feilmelding til saksbehandler, og den skal ikke logges
som en systemfeil hos NAV. Systemet skiller mellom **saksbehandlerens tastefeil**
(klientfeil) og **feil i systemet** (serverfeil).

## Scenario

```gherkin
Gitt at det er mottatt en A009 med en unntaksperiode på over 24 måneder
  Og registerkontrollen har gitt treff, slik at saken må behandles manuelt
 Når saksbehandler velger «Godkjenn, men endre periode»
  Og skriver en ny sluttdato tegn for tegn
 Så skal halvskrevne datoer ikke sendes til kontrollen
  Og kontrollen skal aldri svare med en systemfeil (5xx)
  Og en ugyldig dato som likevel når fram skal avvises som en klientfeil
 Når saksbehandler har skrevet en gyldig, forkortet periode og lagrer
 Så skal unntaket registreres med den endrede perioden
```

## Akseptansekriterier (det fagperson signerer av på)

- [ ] Saksbehandler får ingen feilmelding av å skrive en dato tegn for tegn (utledet — bekreft med fagperson)
- [ ] En tastefeil i datofeltet logges ikke som systemfeil hos NAV (operasjonelt krav fra prod-loggstøy 19.06.2026)
- [ ] Unntaket registreres med den perioden saksbehandler faktisk registrerte, ikke perioden fra SED-en
- [ ] Kontrollen avviser fortsatt en for lang periode (regresjonsvern for selve kontrollregelen)

## Kjente avgrensninger (ikke dekket her)

- **Debounce av live-kontrollen (T3 i planen) er ikke gjort.** Testen dokumenterer
  dagens oppførsel: ett kontrollkall per tastetrykk med parsebar dato.
- **UI-visning av kontrollfeil er ikke dekket.** Under arbeidet ble det avdekket at
  `KontrollFeilSelector` (melosys-web `src/ducks/kontroll/selectors.ts`) leser
  `data.kontrollfeilList`, mens `ExceptionMapper` svarer med `feilkoder` på 400. Det
  betyr at `unntaksperiodeKontrollfeil` i praksis alltid er tom for dette endepunktet,
  og at «Godkjenn unntaksperiode»-radioen derfor ikke deaktiveres slik koden legger opp
  til. Testen asserter derfor på HTTP-kontrakten, ikke på knappetilstand. Egen sak.
- Submit-stien (`POST /saksflyt/unntaksperioder/{id}/godkjenn`) er yup-gatet i frontend
  og har aldri hatt dette problemet — den dekkes kun som happy-path her.

---

## Teknisk binding

### Kontrakten som testes

- **Endepunkt:** `POST /api/kontroll/{behandlingID}/unntaksperiode`
  (`ValideringUnntaksperiodeController`, melosys-api)
- **Avsender:** `saksopplysninger.jsx:88-96` (melosys-web,
  `src/sider/eu_eøs/registrering/unntaksperioder/`) — `useEffect` som fyrer på hvert
  tastetrykk i Startdato/Sluttdato.
- **Bug (two-sided, latent siden 2022):**
  - web: `formatterDatoTilISO` returnerte strengen `"Invalid date"` som default, og
    guarden `if (periodeFom && periodeTom)` slapp den gjennom (truthy).
  - api: ingen `@ExceptionHandler` for `HttpMessageNotReadableException` → catch-all →
    **HTTP 500 + ERROR med stacktrace** for en ren klientinputfeil.
- **Fiks:** api [#3426](https://github.com/navikt/melosys-api/pull/3426) (T1+T4: 400 +
  INFO + sanert melding `Ugyldig format på forespørselen`), web
  [#3121](https://github.com/navikt/melosys-web/pull/3121) (T2:
  `formatterDatoTilISO(..., null)` på kallstedet).

### Testfil

`tests/eu-eos/eu-eos-unntaksperiode-ugyldig-dato.spec.ts` med POM
`pages/eu-eos/registrering-unntaksperiode.page.ts` (+ `.assertions.ts`).

Ny testfil, ikke bundet til en eksisterende flyt: ingen annen test når
«Registrering av unntaksperioder»-skjermen. A009/A010 registreres normalt **helt
automatisk** (`tests/core/sed-mottak.spec.ts`); skjermen vises kun når
registerkontrollen har gitt treff.

### Slik framtvinges den manuelle skjermen

`UfmKontrollsett.REGELSETT_A009` inneholder `periodeOver24MånederOgEnDag`. Regelen er
implementert som «over 2 år **og** minst én dag» (`PeriodeRegler.periodeOver2ÅrOgEnDag`
— hele måneder teller *ikke*, så en 30-måneders periode gir **ikke** treff). Testen
sender derfor en SED-periode på nøyaktig `fom + 2 år + 1 dag`. Treffet lagres som
kontrollresultat, og `BestemBehandlingsmåteSed` oppretter oppgave i stedet for å
godkjenne automatisk.

### Binding av scenariolinjene

| Gherkin-linje | Binding i testen |
|---|---|
| Gitt … A009 med periode over 24 måneder | `SedHelper.sendSed({sedType:'A009', landkode:'DE', periodeFom: i dag, periodeTom: i dag + 2 år + 1 dag})` |
| Og registerkontrollen har gitt treff | `verifiserRegisterkontrolltreff('Periodelengde er mer enn 24 måneder')` — treffpanelet «Treff ved automatisk kontroll» |
| Når … velger «Godkjenn, men endre periode» | `velgGodkjennMenEndrePeriode()`; forhåndsutfyllingen trigger første kontroll, som asserteres til **400** på SED-perioden |
| Og skriver ny sluttdato tegn for tegn | `skrivSluttdatoTegnForTegn('05.MM.YYYY')` — `pressSequentially`, ingen blur. Dag `05` sikrer at minst ett tastetrykk («0») er uparsebart uansett årstid |
| Så skal halvskrevne datoer ikke sendes | `verifiserUgyldigeTastetrykkStoppet(antallSendt, dato)` — færre kontrollkall enn tastetrykk + `verifiserIngenUgyldigDatoSendt` (ingen payload med `Invalid date`) |
| Og kontrollen skal aldri svare 5xx | `verifiserIngenServerfeil(kall)` over alle observerte kontrollkall |
| Og en ugyldig dato skal avvises som klientfeil | `verifiserApiAvviserUgyldigDato` — direkte `POST` med `{"periodeTom":"Invalid date"}` → **400**, `message = "Ugyldig format på forespørselen"`, ingen lekkasje av `Invalid date`/`no.nav.melosys` |
| Når … gyldig forkortet periode og lagrer | `settPeriode(fom, fom+12md)` → kontroll asserteres til **204** → `lagre()` (venter på `POST /saksflyt/unntaksperioder/{id}/godkjenn`) |
| Så skal unntaket registreres med endret periode | `EuEosUtpekingAssertions.verifiserRegistrertUnntakIverksatt({lovvalgsland:'DE', medlLovvalgsland:'DEU'})` + `verifiserEndretPeriodeLagret(fom, tom)` på `LOVVALG_PERIODE` |

### Akseptansekriterier → vern

1. **Ingen feilmelding ved skriving:** ingen `Invalid date`-payload + ingen 5xx i noen av kontrollkallene.
2. **Ingen systemfeil i logg:** testen kjører uten `@expect-docker-errors`, så docker-log-fixturen feiler ved ERROR i melosys-api. Direktekallet i Del C treffer nå INFO-stien (`HttpMessageNotReadableException` → 400), ikke ERROR-stien.
3. **Registrert periode = saksbehandlers periode:** DB-assert på `LOVVALG_PERIODE.FOM_DATO/TOM_DATO`.
4. **Kontrollregelen består:** SED-perioden (2 år + 1 dag) asserteres til 400, den forkortede (12 md) til 204.

### Mutasjonsverifisering

2026-07-29: web-fiksen ble midlertidig reversert (`git revert --no-commit` på
melosys-web `nojira-invalid-date-unntaksperiode`, Vite HMR) og testen ble kjørt på nytt.
Den feilet som forventet — 10 kontrollkall for 10 tastetrykk, hvorav to med
`{"periodeTom":"Invalid date"}`. Fiksen ble deretter gjenopprettet og testen er grønn.

### Endringslogg (teknisk binding)

- 2026-07-29: Spec + test opprettet. Assertion på deaktivert «Godkjenn unntaksperiode»-radio
  ble forkastet etter live-verifisering: `unntaksperiodeKontrollfeil` populeres aldri
  (se avgrensninger), så UI-tilstanden er ikke et gyldig signal på kontrollresultatet.
- 2026-07-29: Periodelengde endret fra 30 md til `2 år + 1 dag` etter at 30 md **ikke**
  ga kontrolltreff — `periodeOver2ÅrOgEnDag` ser kun på år og dager, ikke måneder.
