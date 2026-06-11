---
jira: MELOSYS-8141
status: bundet
date: 2026-06-11
analysis_trace_id: 5eb483b8-72b6-4cc2-80c3-8d1a8abf9f2b
---

# Autolagring av fritekst i opphørsvedtak skal tåle ufullstendig payload

## Forretningsregel

Vedtaksbrev i Melosys inneholder fritekstfelt for innledning og begrunnelse, forankret i
forvaltningsloven §§ 24–25 (begrunnelsesplikt ved enkeltvedtak). Ikke alle vedtakstyper
bruker begge feltene — opphørsvedtak ved manglende innbetaling (ftrl. § 2-15) har kun
begrunnelsesfelt. Autolagring av fritekst er en støttefunksjon som sikrer at saksbehandlers
arbeid bevares underveis; den skal aldri gi feil, uansett hvilke felt som er utfylt på
tidspunktet.

## Scenario

```gherkin
Gitt at en saksbehandler behandler opphør av frivillig medlemskap pga. manglende innbetaling
  Og vedtaket har et begrunnelsesfelt for fritekst
  Og vedtaket har ikke et innledningsfelt (innledningen er standardisert for opphørsvedtak)
 Når saksbehandler redigerer begrunnelsesfriteksten og systemet autolagrer
 Så skal autolagringen fullføres uten feil
  Og begrunnelsesfriteksten skal være bevart ved neste sidevisning
  Og det skal ikke oppstå feilmeldinger i systemet
```

## Akseptansekriterier (det fagperson signerer av på)

- [ ] Autolagring av fritekst fra opphørsvedtak-skjermen gir ikke HTTP-feil (utledet — bekreft med fagperson)
- [ ] Begrunnelsesfritekst lagres korrekt selv om innledningsfritekst ikke er utfylt (utledet — bekreft med fagperson)
- [ ] Eksisterende vedtakstyper som sender begge fritekstfelt (innvilgelse, avslag) fungerer som før (utledet — regresjonsvern)
- [ ] Feilmeldinger i systemloggen forsvinner for denne flyten (utledet — operasjonelt krav fra saken)

## Kjente avgrensninger (ikke dekket her)

- Denne spec-en dekker kun autolagrings-kontrakten, ikke innholdet eller valideringen av selve opphørsvedtaket
- Brevgenerering og brevmaler (melosys-dokgen) er utenfor scope — de har egne specs (MELOSYS-7201, MELOSYS-7339)
- Andre behandlingstyper som også kan mangle innledningsfritekst er ikke kartlagt her — en bredere gjennomgang bør vurderes som oppfølgingssak

---

## Teknisk binding

### Kontrakten som testes

- **Endepunkt:** `POST /api/behandlinger/{behandlingID}/resultat/fritekst`
  (`BehandlingsresultatController.oppdaterFritekster`, melosys-api)
- **Avsender:** `VurderingVedtakOpphoer` (melosys-web,
  `src/sider/ftrl/saksbehandling/stegKomponenter/vurderingVedtakOpphoer/`) —
  autolagrer debounced (1000 ms) ved endring av begrunnelsesfeltet, og én gang ved
  mount av steget. Kallet er fire-and-forget i UI-et: en 500 synes ikke for
  saksbehandler, kun i api-loggen (MELOSYS-8141).
- **Fiks (defence-in-depth):** api gjør `innledningFritekst` nullable i
  `LagreFritekstDto` + `BehandlingsresultatService.oppdaterFritekster`; web sender
  `innledningFritekst: ""` eksplisitt (melosys-web `feature/8141-innledningfritekst-opphoer`).

### Testfil

`tests/ftrl/ftrl-manglende-innbetaling-opphor.spec.ts` — spec-en er bundet til den
eksisterende fulle § 2-15-flyttesten (faktura → manglende innbetaling → opphørsvedtak),
ikke en ny testfil. Opphørsvedtak-steget kan bare nås gjennom hele kjeden (auto-opprettet
`MANGLENDE_INNBETALING_TRYGDEAVGIFT`-behandling), så en egen test ville dublert ~4 min
flyt uten ny dekning.

### Binding av scenariolinjene

| Gherkin-linje | Binding i testen |
|---|---|
| Gitt … behandler opphør pga. manglende innbetaling | DEL 1–4: § 2-8a-sak → faktura BESTILT → simulert manglende innbetaling → auto-opprettet behandling → steget «Manglende innbetaling» → «hele perioden» → opphørsvedtak-steget |
| Og vedtaket har et begrunnelsesfelt | `ManglendeInnbetalingPage.fyllInnBegrunnelseFritekstMedAutolagring()` — Quill-editoren under «Fritekst til begrunnelse» |
| Og vedtaket har ikke et innledningsfelt | Implisitt: skjermen rendrer kun begrunnelses-editor; payloaden mangler/tom `innledningFritekst` er selve trigger-betingelsen |
| Når … redigerer og systemet autolagrer | Editoren fylles, deretter ventes det eksplisitt på `POST /resultat/fritekst` med teksten i payloaden (debounce 1000 ms) |
| Så skal autolagringen fullføres uten feil | Respons-status asserteres `< 400` på autolagringskallet, og en respons-samler verifiserer at **ingen** `/resultat/fritekst`-kall i hele opphørsflyten feilet |
| Og begrunnelsesfriteksten skal være bevart | DB-assert: `BEHANDLINGSRESULTAT.BEGRUNNELSE_FRITEKST LIKE '%MELOSYS-8141%'` for den nye behandlingen (kolonnen lagres av autolagringen og leses ved neste sidevisning) |
| Og ingen feilmeldinger i systemet | `@expect-docker-errors`-taggen er fjernet — docker-log-fixturen feiler testen ved ERROR i melosys-api-loggen (CI). Nettverksvakten dekker lokalkjøring der api kjører på host og er usynlig for docker-log-sjekken |

### Akseptansekriterier → vern

1. **Ingen HTTP-feil:** respons-samler på `POST /resultat/fritekst` (alle kall < 400) + docker-log-sjekk uten tag.
2. **Begrunnelse lagres uten innledning:** autolagringsresponsen (BehandlingsresultatDto) + DB-assert på `BEGRUNNELSE_FRITEKST`; `INNLEDNING_FRITEKST` forblir tom/null.
3. **Regresjonsvern for vedtakstyper med begge felt:** dekkes av eksisterende suite — alle FTRL/EØS-vedtakstester fyller alle fritekstfelt via `VedtakPage.fyllInnAlleTekstfelt()` og fatter vedtak grønt.
4. **Loggstøy forsvinner:** identisk med (1) på CI — taggen fjernet betyr at enhver gjenoppstått NPE feiler suiten.

### Endringslogg (teknisk binding)

- 2026-06-11: Bundet til eksisterende test i stedet for ny `.spec.ts` — opphørssteget er
  kun nåbart via hele manglende-innbetaling-kjeden; duplisering gir null ekstra dekning.
- 2026-06-11: Vern lagt på nettverksnivå (respons-samler + eksplisitt vent på autolagring)
  i tillegg til docker-log-sjekk, fordi docker-log-fixturen ikke ser melosys-api når den
  kjører på host lokalt (smart container detection hopper stille over).
- 2026-06-11: `@expect-docker-errors` fjernet fra testen. **Merk:** endringen kan først
  merges når api-fiksen (nullable `innledningFritekst`) er i CI-imaget — uten fiks er
  testen korrekt rød (vernet biter).
