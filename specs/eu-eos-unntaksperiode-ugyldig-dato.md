---
jira: NOJIRA
status: bundet
date: 2026-07-29
kilde: melosys-kode-wiki/archive/melosys-api/2026-07-28-invalid-date-unntaksperiode-kontroll-plan.md
---

# «Invalid date» skal aldri sendes til – eller velte – unntaksperiode-kontrollen

## Forretningsregel

Ved registrering av unntak fra norsk trygd (inngående A009/A010) kan saksbehandler
godkjenne unntaksperioden slik den står, avslå den, eller godkjenne den med en endret
periode. Endring er påkrevd når registerkontrollen har gitt treff, for eksempel når
SED-en oppgir en periode over 24 måneder.

Mens saksbehandler skriver den nye perioden, kontrollerer systemet fortløpende om
perioden kan godkjennes. En halvskrevet dato er en normal mellomtilstand i den
prosessen. Den skal verken gi feilmelding til saksbehandler eller bli logget som en
systemfeil hos NAV. Systemet skiller mellom saksbehandlerens tastefeil (klientfeil) og
feil i systemet (serverfeil).

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

## Akseptansekriterier

Dette er det fagperson signerer av på:

- [ ] Saksbehandler får ingen feilmelding av å skrive en dato tegn for tegn (utledet — bekreft med fagperson)
- [ ] En tastefeil i datofeltet blir ikke logget som systemfeil hos NAV (operasjonelt krav etter loggstøy i produksjon 19.06.2026)
- [ ] Unntaket registreres med perioden saksbehandler registrerte, ikke perioden fra SED-en
- [ ] Kontrollen avviser fortsatt en for lang periode

## Kjente avgrensninger

- **Kontrollen kalles per tastetrykk.** Testen fester denne oppførselen: ett kontrollkall
  per tastetrykk med parsebar dato. Å samle kallene med debounce er ikke gjort.
- **Visningen av kontrollfeil i UI er ikke dekket.** `KontrollFeilSelector` (melosys-web,
  `src/ducks/kontroll/selectors.ts`) leser `data.kontrollfeilList`, mens `ExceptionMapper`
  svarer med `feilkoder` på 400. `unntaksperiodeKontrollfeil` er derfor alltid tom for
  dette endepunktet, og «Godkjenn unntaksperiode»-radioen blir ikke deaktivert slik koden
  legger opp til. Testen asserter på HTTP-kontrakten, ikke på knappetilstand. Egen sak.
- **Lagringen er bare dekket som normalflyt.** `POST /saksflyt/unntaksperioder/{id}/godkjenn`
  valideres med yup i frontend og har aldri hatt dette problemet.

---

## Teknisk binding

### Kontrakten som testes

- **Endepunkt:** `POST /api/kontroll/{behandlingID}/unntaksperiode`
  (`ValideringUnntaksperiodeController`, melosys-api).
- **Avsender:** `saksopplysninger.jsx` (melosys-web,
  `src/sider/eu_eøs/registrering/unntaksperioder/`) — en `useEffect` som fyrer på hvert
  tastetrykk i Startdato og Sluttdato.
- **Feilen lå i begge repoene:**
  - melosys-web: `formatterDatoTilISO` returnerte strengen `"Invalid date"` som
    standardverdi, og guarden `if (periodeFom && periodeTom)` slapp den gjennom, fordi
    strengen er truthy.
  - melosys-api: uten `@ExceptionHandler` for `HttpMessageNotReadableException` traff en
    tastefeil catch-all-håndteringen og ga HTTP 500 med stacktrace på ERROR-nivå.
- **Fiks:** [melosys-api #3426](https://github.com/navikt/melosys-api/pull/3426) svarer 400
  med meldingen `Ugyldig format på forespørselen` og logger på INFO.
  [melosys-web #3121](https://github.com/navikt/melosys-web/pull/3121) sender
  `formatterDatoTilISO(..., null)` på kallstedet.

### Testfil

`tests/eu-eos/eu-eos-unntaksperiode-ugyldig-dato.spec.ts`, med POM-en
`pages/eu-eos/registrering-unntaksperiode.page.ts` og tilhørende `.assertions.ts`.

Testen er ikke bundet til en eksisterende flyt: ingen annen test når skjermen
«Registrering av unntaksperioder». A009 og A010 registreres normalt helt automatisk
(`tests/core/sed-mottak.spec.ts`), og skjermen vises bare når registerkontrollen har
gitt treff.

### Slik framtvinges den manuelle skjermen

`UfmKontrollsett.REGELSETT_A009` inneholder `periodeOver24MånederOgEnDag`. Regelen er
implementert som «over 2 år og minst én dag» (`PeriodeRegler.periodeOver2ÅrOgEnDag`), der
hele måneder ikke teller: en periode på 30 måneder gir ikke treff. Testen sender derfor en
SED-periode på nøyaktig `fom + 2 år + 1 dag`. Treffet lagres som kontrollresultat, og
`BestemBehandlingsmåteSed` oppretter en oppgave i stedet for å godkjenne automatisk.

### Binding av scenariolinjene

| Gherkin-linje | Binding i testen |
|---|---|
| Gitt … A009 med periode over 24 måneder | `SedHelper.sendSed({sedType:'A009', landkode:'DE', periodeFom: i dag, periodeTom: i dag + 2 år + 1 dag})` |
| Og registerkontrollen har gitt treff | `verifiserRegisterkontrolltreff('Periodelengde er mer enn 24 måneder')` — treffpanelet «Treff ved automatisk kontroll» |
| Når … velger «Godkjenn, men endre periode» | `velgGodkjennMenEndrePeriode()`. Forhåndsutfyllingen trigger første kontroll, som asserteres til 400 på SED-perioden |
| Og skriver ny sluttdato tegn for tegn | `skrivSluttdatoTegnForTegn('05.MM.YYYY')` — `pressSequentially`, ingen blur. Dag `05` sikrer at minst ett tastetrykk («0») er uparsebart uansett årstid |
| Så skal halvskrevne datoer ikke sendes | `verifiserIngenUgyldigDatoSendt` avviser enhver request-body med `Invalid date`, og pinner feilen. `verifiserUgyldigeTastetrykkStoppet(antallSendt, dato)` supplerer med at færre kontrollkall enn tastetrykk sendes |
| Og kontrollen skal aldri svare 5xx | `verifiserIngenServerfeil(kall)` over alle observerte kontrollkall |
| Og en ugyldig dato skal avvises som klientfeil | `verifiserApiAvviserUgyldigDato` — direkte `POST` med `{"periodeTom":"Invalid date"}` gir 400, `message = "Ugyldig format på forespørselen"`, uten `Invalid date` eller `no.nav.melosys` i responsen |
| Når … gyldig forkortet periode og lagrer | `settPeriode(fom, fom + 12 md)`, kontroll asserteres til 204, deretter `lagre()`, som venter på `POST /saksflyt/unntaksperioder/{id}/godkjenn` |
| Så skal unntaket registreres med endret periode | `EuEosUtpekingAssertions.verifiserRegistrertUnntakIverksatt({lovvalgsland:'DE', medlLovvalgsland:'DEU'})` og `verifiserEndretPeriodeLagret(fom, tom)` mot `LOVVALG_PERIODE` |

### Akseptansekriterier → vern

1. **Ingen feilmelding ved skriving:** ingen request-body med `Invalid date`, og ingen 5xx i
   noen av kontrollkallene. Alle kall må være besvart før statusene vurderes, ellers ville et
   kall uten svar telle som «ingen serverfeil».
2. **Ingen systemfeil i logg:** testen kjører uten `@expect-docker-errors`, så
   docker-log-fixturen feiler hvis melosys-api logger ERROR. Direktekallet i del C treffer
   INFO-stien (`HttpMessageNotReadableException` → 400), ikke ERROR-stien.
3. **Registrert periode = saksbehandlers periode:** databaseassert på
   `LOVVALG_PERIODE.FOM_DATO` og `TOM_DATO`.
4. **Kontrollregelen består:** SED-perioden på 2 år og 1 dag asserteres til 400, den
   forkortede på 12 måneder til 204.

### Mutasjonsverifisering

2026-07-29: web-fiksen ble midlertidig reversert (`git revert --no-commit` på melosys-web
`nojira-invalid-date-unntaksperiode`, Vite HMR), og testen ble kjørt på nytt. Den feilet som
forventet, med 10 kontrollkall for 10 tastetrykk, hvorav to med
`{"periodeTom":"Invalid date"}`. Fiksen ble deretter gjenopprettet, og testen er grønn.
