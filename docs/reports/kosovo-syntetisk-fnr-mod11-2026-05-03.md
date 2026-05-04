# Kosovo-test feiler: syntetisk FNR avvises av melosys-web mod11-validering

**Dato:** 2026-05-03
**Berørt test:** `tests/eu-eos/eu-eos-kosovo-statsborgerskap.spec.ts`
**Status:** Inkompatibilitet mellom melosys-docker-compose (mock) og melosys-web — krever fiks i melosys-web
**Ansvarlig team:** Team Melosys (web-siden)

## Sammendrag

E2E-testen `Kosovo statsborgerskap bevart i SED A008` feiler etter at testbruker-FNR-ene
i melosys-mock ble byttet til syntetisk format. Det nye Kosovo-FNR-et `17816810078`
oppfyller ikke standard mod11-checksum, og melosys-web sin `erGyldigFnr`-validering
i journalføring-flyten avviser det. Da hopper skjemaet over personoppslaget,
`brukerNavn` blir aldri satt, og `FagsakVelger` (som inneholder `select[name="sakstype"]`)
rendres aldri. Testen timer ut når den venter på sakstype-dropdown-en.

Dette er ingen feil i e2e-testen — det er en reell, brukervendt inkompatibilitet:
journalføring i melosys-web kan ikke håndtere syntetiske FNR-er, mens
melosys-skjema-api allerede støtter dem via `BRUK_SYNTETISK_FNR=true`.

## Hva endret seg

[melosys-docker-compose PR #140 (MELOSYS-8040)](https://github.com/navikt/melosys-docker-compose/commit/a91e107)
byttet ut ikke-syntetiske mock-testbrukere fordi melosys-skjema-api validerer
FNR som syntetiske i lokal-modus. Endringene som påvirker oss:

| Person | Gammelt FNR | Nytt FNR |
|---|---|---|
| TREIG SALMANSEN (Kosovo) | `17016820148` | `17816810078` |
| SIRI SANSEN | `10108012345` | `10908012327` |
| LANSEN LANSANSEN | `12128036789` | `12928056706` |
| PETRA PETRANSEN | `15099412345` | `15899434509` |
| HANS HANSEN | `01016012345` | `01816023404` |

Bare TREIG SALMANSEN er i bruk i e2e-testene per i dag.

## Bevis: mod11-validering

melosys-web validerer FNR med standard mod11-algoritme i
[`src/utils/person.js`](https://github.com/navikt/melosys-web/blob/main/src/utils/person.js):

```text
17016820148 (gammel Kosovo)         => true
17816810078 (ny syntetisk Kosovo)   => false
30056928150 (TRIVIELL KARAFFEL)     => true
```

Det nye FNR-et er konstruert ved å legge til 80 på måneds-sifrene
(jan 01 → jan 81), som er Tenor/syntetisk konvensjon. Slike FNR oppfyller
en separat syntetisk-algoritme, ikke mod11.

## Hva som faktisk skjer i UI-en

1. Saksbehandler navigerer til journalføring-side for journalpost med Kosovo-bruker.
2. melosys-web henter journalposten — backend returnerer `brukerID: "17816810078"`,
   `brukerNavn: null` (skal fylles inn av frontend etter personoppslag).
3. [`informasjon.jsx:96`](https://github.com/navikt/melosys-web/blob/main/src/sider/journalforing/komponenter/journalforingform/informasjon.jsx)
   sjekker `erGyldigFnr(brukerID)` → **false** → returner uten å hente navn.
4. `formValues.brukerNavn` forblir `null`.
5. [`journalforingform.jsx:90`](https://github.com/navikt/melosys-web/blob/main/src/sider/journalforing/komponenter/journalforingform/journalforingform.jsx):
   `visFagsakVelger = formValues?.brukerNavn || formValues?.virksomhetNavn` → **false**.
6. `FagsakVelger`-komponenten (som inneholder Sakstype/Sakstema/Behandlingstema-dropdownene)
   rendres aldri.
7. Saksbehandler ser et tomt skjema og kan ikke opprette/knytte sak for personen.

## Brukervendt konsekvens

Hvis en saksbehandler i Q-miljøer (eller produksjon, hvis syntetiske FNR-er
noensinne brukes der) prøver å journalføre en oppgave knyttet til en bruker
med syntetisk FNR, vises ingen sakstype-velger. De kan heller ikke knytte til
eksisterende sak. Saksbehandleren står fast.

I dev/lokalmiljø fungerer ikke flyten i det hele tatt med de nye syntetiske
testbrukerne.

## Foreslått fiks i melosys-web

`erGyldigFnr` i [`src/utils/person.js`](https://github.com/navikt/melosys-web/blob/main/src/utils/person.js)
bør utvides til å akseptere syntetiske FNR-er, gjerne styrt av samme miljøvariabel
melosys-skjema-api bruker (`BRUK_SYNTETISK_FNR`) eller en feature toggle.

Et enkelt mønster:

```js
const erSyntetiskFnr = (verdi) => {
  // Tenor: måned-sifre + 80
  const maaned = parseInt(verdi.substring(2, 4), 10);
  return maaned >= 81 && maaned <= 92;
};

const erGyldigFnr = (verdi) => {
  if (process.env.BRUK_SYNTETISK_FNR === "true" && erSyntetiskFnr(verdi)) {
    return erGyldigSyntetiskFnr(verdi); // egen mod11-variant
  }
  // ... eksisterende mod11
};
```

Dette berører trolig flere steder i melosys-web som validerer FNR — søk etter
`erGyldigFnr`/`erGyldigDnr`/`erGyldigFnrEllerDnr`.

## Midlertidig håndtering i e2e

Foreslår å tagge `Kosovo statsborgerskap bevart i SED A008` som `@known-error`
med referanse til den nye Jira-saken inntil melosys-web er fikset. Da blir
testen kjørt og rapportert, men feil bryter ikke CI.

## Berørte CI-kjøringer

- Run [25189236878](https://github.com/navikt/melosys-e2e-tests/actions/runs/25189236878)
  (etter mock-FNR-endring): testen feilet med `getByText('SALMANSEN TREIG')` timeout.
- Run [25284291121](https://github.com/navikt/melosys-e2e-tests/actions/runs/25284291121)
  (etter at vi oppdaterte `USER_ID_KOSOVO` i e2e til nytt FNR):
  testen kommer videre til journalføring, men feiler nå på `select[name="sakstype"]` —
  den er ikke i DOM-en.

## Verifisering — kjør lokalt

```bash
node -e "
const erGyldigFnr = (v) => {
  const vekt1 = [3,7,6,1,8,9,4,5,2];
  const vekt2 = [5,4,3,2,7,6,5,4,3,2];
  const Q1 = vekt1.reduce((s,t,i) => s + parseInt(v[i],10)*t, 0);
  const Q2 = vekt2.reduce((s,t,i) => s + parseInt(v[i],10)*t, 0);
  let k1 = 11 - (Q1 % 11); if (k1 === 11) k1 = 0;
  let k2 = 11 - (Q2 % 11); if (k2 === 11) k2 = 0;
  return k1 === parseInt(v[9],10) && k2 === parseInt(v[10],10);
};
['17016820148','17816810078','30056928150'].forEach(f => console.log(f, erGyldigFnr(f)));
"
```
