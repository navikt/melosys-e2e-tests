// Generated from CI run 27886483545 (real titles+durations). DO NOT hand-edit.
window.DATASETS = {
 "green": {
  "status": "passed",
  "duration": 2936867.8449999997,
  "startTime": "2026-06-20T23:02:29.461Z",
  "tags": {
   "melosys-api": "latest",
   "melosys-web": "latest",
   "faktureringskomponenten": "latest",
   "melosys-trygdeavgift-beregning": "latest",
   "melosys-trygdeavtale": "latest",
   "melosys-inngangsvilkar": "latest",
   "melosys-eessi": "latest",
   "melosys-mock": "latest",
   "melosys-dokgen": "latest"
  },
  "tests": [
   {
    "title": "skal opprette og fullføre årsavregning behandling",
    "file": "tests/aarsavregning/aarsavregning-ftrl.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 28555
   },
   {
    "title": "skal opprette årsavregning for ikke-skattepliktig bruker",
    "file": "tests/aarsavregning/aarsavregning-ikke-skattepliktig.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 54026
   },
   {
    "title": "skattehendelse uten fullmektig sender innhentingsbrev til bruker",
    "file": "tests/aarsavregning/aarsavregning-innhentingsbrev-automatisk.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 44534
   },
   {
    "title": "ikke-skattepliktig-jobben uten fullmektig sender innhentingsbrev til bruker",
    "file": "tests/aarsavregning/aarsavregning-innhentingsbrev-automatisk.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 44585
   },
   {
    "title": "skattehendelse med fullmektig sender innhentingsbrev til fullmektig",
    "file": "tests/aarsavregning/aarsavregning-innhentingsbrev-automatisk.spec.ts",
    "status": "skipped",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 0
   },
   {
    "title": "ikke-skattepliktig-jobben med fullmektig sender innhentingsbrev til fullmektig",
    "file": "tests/aarsavregning/aarsavregning-innhentingsbrev-automatisk.spec.ts",
    "status": "skipped",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 0
   },
   {
    "title": "skattehendelse for skatteår X gir årsavregningsoppgave med X i beskrivelsen",
    "file": "tests/aarsavregning/aarsavregning-oppgave-skatteaar-i-beskrivelse-og-nokkelord.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 44653
   },
   {
    "title": "ikke-skattepliktig-jobben for skatteår X gir årsavregningsoppgave med X i beskrivelsen",
    "file": "tests/aarsavregning/aarsavregning-oppgave-skatteaar-i-beskrivelse-og-nokkelord.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 43870
   },
   {
    "title": "saksbehandlingsflyt som berører tidligere år X gir årsavregningsoppgave med X i beskrivelsen",
    "file": "tests/aarsavregning/aarsavregning-oppgave-skatteaar-i-beskrivelse-og-nokkelord.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 62734
   },
   {
    "title": "skal fullføre pensjonistbehandling og opprette årsavregning for samme sak",
    "file": "tests/aarsavregning/eos-pensjonist-aarsavregning-direkte-grunnlag-beregn.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 53657
   },
   {
    "title": "skal fullføre pensjonistbehandling og årsavregning med innbetalt avvik",
    "file": "tests/aarsavregning/eos-pensjonist-aarsavregning-innbetalt-avvik-beregn.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 73851
   },
   {
    "title": "skal beregne endelig trygdeavgift i uten-grunnlag-flyten (OPPLYSNINGER_ENDRET)",
    "file": "tests/aarsavregning/eos-pensjonist-aarsavregning-uten-grunnlag.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 49971
   },
   {
    "title": "skal oppgi endelig trygdeavgift manuelt med obligatorisk begrunnelse (MANUELL_ENDELIG_AVGIFT)",
    "file": "tests/aarsavregning/eos-pensjonist-aarsavregning-uten-grunnlag.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 44689
   },
   {
    "title": "skal automatisk opprette årsavregning etter vedtak på pensjonist-sak",
    "file": "tests/aarsavregning/ftrl-pensjonist-aarsavregning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 21844
   },
   {
    "title": "komplett førstegangsbehandling, automatisk opprettet årsavregning, nv annulerer også åpen årsavregning",
    "file": "tests/aarsavregning/komplett-sak-nyvurdering-annullering-lukker-aapne-aarsavregninger.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 47363
   },
   {
    "title": "skal fullføre sak med flere land, ikke-skattepliktig og arbeidsinntekt fra Norge. Så NV med skattepliktig, avregning skal bli riktig",
    "file": "tests/aarsavregning/komplett-sak-nyvurdering-periode-endres-til-kun-tidligere-aar.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 63518
   },
   {
    "title": "Scenario 1 — seksjonen vises med 5 år SKATT-rader (seeded)",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 24526
   },
   {
    "title": "Scenario 2 — delt grunnlag: Skatt og Avgiftssystemet samme år (seeded)",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 23987
   },
   {
    "title": "Scenario 3 — alle tre kilder med ulike tidsstempler per kilde (seeded)",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 23453
   },
   {
    "title": "Scenario 4 — ingen pensjonsopptjening: tom-melding vises (seeded tom)",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 22372
   },
   {
    "title": "Scenario 6 — flere inntektTyper per kilde rendres med dekode-beskrivelse",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 23383
   },
   {
    "title": "Scenario 5 — årsavregning eldre enn 5 år: visning utvides til avregningsåret",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "skipped",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 0
   },
   {
    "title": "skal vise oppgave-seksjon på forsiden",
    "file": "tests/core/oppgaver.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 9490
   },
   {
    "title": "skal vise behandling-oppgave etter opprettelse av sak",
    "file": "tests/core/oppgaver.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11835
   },
   {
    "title": "skal kunne navigere til behandling fra oppgave",
    "file": "tests/core/oppgaver.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 12162
   },
   {
    "title": "skal vise oppgave-antall",
    "file": "tests/core/oppgaver.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 12060
   },
   {
    "title": "skal håndtere tom oppgaveliste",
    "file": "tests/core/oppgaver.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 9397
   },
   {
    "title": "skal trigge MOTTAK_SED prosess ved mottak av A003",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 8717
   },
   {
    "title": "skal opprette fagsak ved mottak av A003 fra Sverige",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7372
   },
   {
    "title": "skal håndtere A009 og automatisk registrere unntak fra norsk trygd (REGISTRERT_UNNTAK)",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7902
   },
   {
    "title": "skal håndtere A010 og automatisk registrere unntak fra norsk trygd – øvrige (REGISTRERT_UNNTAK)",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7367
   },
   {
    "title": "skal håndtere A001 søknad fra Danmark",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7313
   },
   {
    "title": "skal håndtere tilpasset SED konfigurasjon",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7327
   },
   {
    "title": "skal verifisere at SED fører til oppgave i systemet",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 9205
   },
   {
    "title": "skal håndtere flere SED-typer i sekvens",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 8302
   },
   {
    "title": "skal verifisere prosessinstanser i databasen",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7308
   },
   {
    "title": "skal trigge MOTTAK_SED via melosys-eessi flow",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7421
   },
   {
    "title": "skal opprette fagsak via full eessi-flow med A003 fra Sverige",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7851
   },
   {
    "title": "skal håndtere A009 informasjonsforespørsel via eessi",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 6826
   },
   {
    "title": "skal sammenligne direkte vs eessi-flow @comparison",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7816
   },
   {
    "title": "skal søke etter person med gyldig fødselsnummer og finne sak",
    "file": "tests/core/sok-og-navigasjon.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11936
   },
   {
    "title": "skal vise ingen resultater for ukjent bruker",
    "file": "tests/core/sok-og-navigasjon.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 8726
   },
   {
    "title": "skal navigere til sak fra søkeresultat",
    "file": "tests/core/sok-og-navigasjon.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11514
   },
   {
    "title": "skal søke etter sak med saksnummer",
    "file": "tests/core/sok-og-navigasjon.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11751
   },
   {
    "title": "skal kunne navigere tilbake til forsiden fra søkeresultater",
    "file": "tests/core/sok-og-navigasjon.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11703
   },
   {
    "title": "skal produsere korrekt, distinkt vedtaksbrev for FTRL- og trygdeavtale-mottaker",
    "file": "tests/core/vedtaksbrev-mottakertype.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 57475
   },
   {
    "title": "skal fullføre sak og verifisere at årsavregning ikke kan opprettes",
    "file": "tests/eu-eos/eu-eos-art11-3b-medlemskap-offentlig-tjenesteperson.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 25343
   },
   {
    "title": "skal iverksette vedtak og verifisere MEDL-periode, A009 SED og utgående journalpost",
    "file": "tests/eu-eos/eu-eos-art12-iverksetting-mottaker-kjede.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 47113
   },
   {
    "title": "skal forkorte lovvalgsperiode via nyvurdering og overføre ny periode til MEDL",
    "file": "tests/eu-eos/eu-eos-art12-nyvurdering-medlemskap-overforing.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 88065
   },
   {
    "title": "skal fullføre EU/EØS-arbeidsflyt med vedtak",
    "file": "tests/eu-eos/eu-eos-art12-utsendt-arbeidstaker-fullfort-vedtak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 46790
   },
   {
    "title": "skal fullføre \"Arbeid i flere land\" arbeidsflyt med vedtak",
    "file": "tests/eu-eos/eu-eos-art13-arbeid-flere-land-fullfort-vedtak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 26430
   },
   {
    "title": "skal fullføre \"Arbeid i flere land\" med selvstendig næringsvirksomhet og SED-dokument",
    "file": "tests/eu-eos/eu-eos-art13-arbeid-flere-land-selvstendig-fullfort-vedtak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 36080
   },
   {
    "title": "skal nyvurdere en registrert annet-land-sak og re-registrere unntaket",
    "file": "tests/eu-eos/eu-eos-inngaaende-a003-annet-land-nyvurdering.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 15680
   },
   {
    "title": "skal godkjenne at et annet land er utpekt og registrere unntak (uten SED)",
    "file": "tests/eu-eos/eu-eos-inngaaende-a003-annet-land-utpekt-registrert-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11410
   },
   {
    "title": "skal godkjenne utpeking av Norge og svare utland med A012",
    "file": "tests/eu-eos/eu-eos-inngaaende-a003-norge-utpekt-a012.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 14046
   },
   {
    "title": "Kosovo statsborgerskap bevart i SED A008",
    "file": "tests/eu-eos/eu-eos-kosovo-statsborgerskap.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 37519
   },
   {
    "title": "skal annullere sak med sendt vedtak og avvise MEDL-perioden",
    "file": "tests/eu-eos/eu-eos-nyvurdering-annuller-medlemskap-avvis.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 52163
   },
   {
    "title": "Scenario 1: SED sendes til EESSI-land og papir til Færøyene",
    "file": "tests/eu-eos/eu-eos-papir-a1-til-ikke-eessi-land.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 37653
   },
   {
    "title": "Scenario 2: SED sendes til EESSI-land og papir til Færøyene og Grønland",
    "file": "tests/eu-eos/eu-eos-papir-a1-til-ikke-eessi-land.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 38003
   },
   {
    "title": "Scenario 3 (regresjon): Kun EESSI-land — ingen papir-A1 til FO/GL",
    "file": "tests/eu-eos/eu-eos-papir-a1-til-ikke-eessi-land.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 37582
   },
   {
    "title": "Scenario 4: Kun Færøyene + Grønland — papir-A1 sendes til begge",
    "file": "tests/eu-eos/eu-eos-papir-a1-til-ikke-eessi-land.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 27954
   },
   {
    "title": "skal vise infomelding når inntekten er under minstebeløpet",
    "file": "tests/eu-eos/eu-eos-pensjonist-trygdeavgift.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 27450
   },
   {
    "title": "skal vise tabell med asterisk (*) for 25%-regel",
    "file": "tests/eu-eos/eu-eos-pensjonist-trygdeavgift.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 27237
   },
   {
    "title": "skal vise *** for sammenslåtte inntektskilder",
    "file": "tests/eu-eos/eu-eos-pensjonist-trygdeavgift.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 28532
   },
   {
    "title": "skal vise tabell ved ordinær beregning",
    "file": "tests/eu-eos/eu-eos-pensjonist-trygdeavgift.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 27178
   },
   {
    "title": "skal videresende søknad til Sverige",
    "file": "tests/eu-eos/eu-eos-sed-a008-videresend-soeknad.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 37440
   },
   {
    "title": "skal fullføre EU/EØS-skip-arbeidsflyt med vedtak",
    "file": "tests/eu-eos/eu-eos-skip-fullfort-vedtak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 28384
   },
   {
    "title": "mottar A002 (innvilgelse) - skal fatte vedtak automatisk",
    "file": "tests/eu-eos/unntak/eu-eos-anmodning-unntak-nyvurdering-svar.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 34933
   },
   {
    "title": "mottar A011 (avslag) - skal kreve manuell ny vurdering",
    "file": "tests/eu-eos/unntak/eu-eos-anmodning-unntak-nyvurdering-svar.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 35004
   },
   {
    "title": "direkte til - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 32506
   },
   {
    "title": "direkte til art.13(1)(a) - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 33164
   },
   {
    "title": "direkte til art.13(1)(a) med TWFA - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 32623
   },
   {
    "title": "via full behandling - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 36407
   },
   {
    "title": "direkte til CDM 4.3 - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 32977
   },
   {
    "title": "direkte til art.13(1)(a) CDM 4.3 - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 32475
   },
   {
    "title": "skal opprette manglende-innbetaling-behandling automatisk og fatte opphørsvedtak",
    "file": "tests/ftrl/ftrl-manglende-innbetaling-opphor.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 48410
   },
   {
    "title": "25%-regelen begrenser avgiften",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 35426
   },
   {
    "title": "ordinær beregning uten begrensning (80000 kr/md)",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 35299
   },
   {
    "title": "25%-regelen med Full dekning — pliktig medlem",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 34298
   },
   {
    "title": "inntekt under minstebeløpet — avgift 0 kr",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 36027
   },
   {
    "title": "Confluence Eksempel 1 — flere skatteforhold og inntekter, 25%-regel på alle perioder",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 83209
   },
   {
    "title": "25%-regelen for FTRL Pensjonist",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 32780
   },
   {
    "title": "skal innvilge pliktig medlemskap § 2-2, fatte vedtak og opprette fakturaserie",
    "file": "tests/ftrl/ftrl-yrkesaktiv-2-2-forstegang.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 34365
   },
   {
    "title": "skal fullføre trygdeavtale-arbeidsflyt med vedtak",
    "file": "tests/trygdeavtale/trygdeavtale-fullfort-vedtak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 27906
   },
   {
    "title": "skal forkorte periode via nyvurdering og erstatte MEDL-perioden in-place",
    "file": "tests/trygdeavtale/trygdeavtale-nyvurdering.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 35282
   },
   {
    "title": "skal registrere godkjent unntak med endelig MEDL-periode",
    "file": "tests/trygdeavtale/trygdeavtale-unntaksregistrering.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 23646
   },
   {
    "title": "skal avslutte saken uten lovvalgsperiode ved ikke godkjent unntak",
    "file": "tests/trygdeavtale/trygdeavtale-unntaksregistrering.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 23474
   },
   {
    "title": "skal fullføre komplett saksflyt med § 2-8 første ledd bokstav a (arbeidstaker)",
    "file": "tests/utenfor-avtaleland/komplett-sak-2-8a.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 36719
   },
   {
    "title": "FULL_DEKNING_FTRL",
    "file": "tests/utenfor-avtaleland/komplett-sak-2-8a.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 36954
   },
   {
    "title": "skal fullføre komplett saksflyt med § 2-8 første ledd bokstav b (student)",
    "file": "tests/utenfor-avtaleland/komplett-sak-2-8b-student.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 35872
   },
   {
    "title": "skal fullføre sak med flere land, pensjon-dekning, deretter NV som annulleres",
    "file": "tests/utenfor-avtaleland/komplett-sak-flere-land-arbeidsinntekt-nyvurdering-annullering.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 55569
   },
   {
    "title": "skal fullføre sak med flere land, ikke-skattepliktig og arbeidsinntekt fra Norge. Så NV med skattepliktig, avregning skal bli riktig",
    "file": "tests/utenfor-avtaleland/komplett-sak-flere-land-arbeidsinntekt.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 47101
   },
   {
    "title": "skal fullføre komplett saksflyt - delevis skattepliktig - med flere inntektskilder",
    "file": "tests/utenfor-avtaleland/komplett-sak-flere-land-flereinntektskilder.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 64493
   },
   {
    "title": "skal endre skattestatus fra ikke-skattepliktig til skattepliktig via nyvurdering",
    "file": "tests/utenfor-avtaleland/nyvurdering-endring-skattestatus.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 59559
   },
   {
    "title": "skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering",
    "file": "tests/utenfor-avtaleland/nyvurdering-endring-skattestatus.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 61861
   }
  ]
 },
 "fail": {
  "status": "failed",
  "duration": 2936867.8449999997,
  "startTime": "2026-06-20T23:02:29.461Z",
  "tags": {
   "melosys-api": "latest",
   "melosys-web": "latest",
   "faktureringskomponenten": "latest",
   "melosys-trygdeavgift-beregning": "latest",
   "melosys-trygdeavtale": "latest",
   "melosys-inngangsvilkar": "latest",
   "melosys-eessi": "latest",
   "melosys-mock": "latest",
   "melosys-dokgen": "latest"
  },
  "tests": [
   {
    "title": "skal opprette og fullføre årsavregning behandling",
    "file": "tests/aarsavregning/aarsavregning-ftrl.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 28555
   },
   {
    "title": "skal opprette årsavregning for ikke-skattepliktig bruker",
    "file": "tests/aarsavregning/aarsavregning-ikke-skattepliktig.spec.ts",
    "status": "flaky",
    "totalAttempts": 2,
    "failedAttempts": 1,
    "duration": 54026
   },
   {
    "title": "skattehendelse uten fullmektig sender innhentingsbrev til bruker",
    "file": "tests/aarsavregning/aarsavregning-innhentingsbrev-automatisk.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 44534
   },
   {
    "title": "ikke-skattepliktig-jobben uten fullmektig sender innhentingsbrev til bruker",
    "file": "tests/aarsavregning/aarsavregning-innhentingsbrev-automatisk.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 44585
   },
   {
    "title": "skattehendelse med fullmektig sender innhentingsbrev til fullmektig",
    "file": "tests/aarsavregning/aarsavregning-innhentingsbrev-automatisk.spec.ts",
    "status": "skipped",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 0
   },
   {
    "title": "ikke-skattepliktig-jobben med fullmektig sender innhentingsbrev til fullmektig",
    "file": "tests/aarsavregning/aarsavregning-innhentingsbrev-automatisk.spec.ts",
    "status": "skipped",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 0
   },
   {
    "title": "skattehendelse for skatteår X gir årsavregningsoppgave med X i beskrivelsen",
    "file": "tests/aarsavregning/aarsavregning-oppgave-skatteaar-i-beskrivelse-og-nokkelord.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 44653
   },
   {
    "title": "ikke-skattepliktig-jobben for skatteår X gir årsavregningsoppgave med X i beskrivelsen",
    "file": "tests/aarsavregning/aarsavregning-oppgave-skatteaar-i-beskrivelse-og-nokkelord.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 43870
   },
   {
    "title": "saksbehandlingsflyt som berører tidligere år X gir årsavregningsoppgave med X i beskrivelsen",
    "file": "tests/aarsavregning/aarsavregning-oppgave-skatteaar-i-beskrivelse-og-nokkelord.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 62734
   },
   {
    "title": "skal fullføre pensjonistbehandling og opprette årsavregning for samme sak",
    "file": "tests/aarsavregning/eos-pensjonist-aarsavregning-direkte-grunnlag-beregn.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 53657
   },
   {
    "title": "skal fullføre pensjonistbehandling og årsavregning med innbetalt avvik",
    "file": "tests/aarsavregning/eos-pensjonist-aarsavregning-innbetalt-avvik-beregn.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 73851
   },
   {
    "title": "skal beregne endelig trygdeavgift i uten-grunnlag-flyten (OPPLYSNINGER_ENDRET)",
    "file": "tests/aarsavregning/eos-pensjonist-aarsavregning-uten-grunnlag.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 49971
   },
   {
    "title": "skal oppgi endelig trygdeavgift manuelt med obligatorisk begrunnelse (MANUELL_ENDELIG_AVGIFT)",
    "file": "tests/aarsavregning/eos-pensjonist-aarsavregning-uten-grunnlag.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 44689
   },
   {
    "title": "skal automatisk opprette årsavregning etter vedtak på pensjonist-sak",
    "file": "tests/aarsavregning/ftrl-pensjonist-aarsavregning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 21844
   },
   {
    "title": "komplett førstegangsbehandling, automatisk opprettet årsavregning, nv annulerer også åpen årsavregning",
    "file": "tests/aarsavregning/komplett-sak-nyvurdering-annullering-lukker-aapne-aarsavregninger.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 47363
   },
   {
    "title": "skal fullføre sak med flere land, ikke-skattepliktig og arbeidsinntekt fra Norge. Så NV med skattepliktig, avregning skal bli riktig",
    "file": "tests/aarsavregning/komplett-sak-nyvurdering-periode-endres-til-kun-tidligere-aar.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 63518
   },
   {
    "title": "Scenario 1 — seksjonen vises med 5 år SKATT-rader (seeded)",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 24526
   },
   {
    "title": "Scenario 2 — delt grunnlag: Skatt og Avgiftssystemet samme år (seeded)",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 23987
   },
   {
    "title": "Scenario 3 — alle tre kilder med ulike tidsstempler per kilde (seeded)",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 23453
   },
   {
    "title": "Scenario 4 — ingen pensjonsopptjening: tom-melding vises (seeded tom)",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 22372
   },
   {
    "title": "Scenario 6 — flere inntektTyper per kilde rendres med dekode-beskrivelse",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 23383
   },
   {
    "title": "Scenario 5 — årsavregning eldre enn 5 år: visning utvides til avregningsåret",
    "file": "tests/aarsavregning/popp-pensjonsopptjening-visning.spec.ts",
    "status": "skipped",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 0
   },
   {
    "title": "skal vise oppgave-seksjon på forsiden",
    "file": "tests/core/oppgaver.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 9490
   },
   {
    "title": "skal vise behandling-oppgave etter opprettelse av sak",
    "file": "tests/core/oppgaver.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11835
   },
   {
    "title": "skal kunne navigere til behandling fra oppgave",
    "file": "tests/core/oppgaver.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 12162
   },
   {
    "title": "skal vise oppgave-antall",
    "file": "tests/core/oppgaver.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 12060
   },
   {
    "title": "skal håndtere tom oppgaveliste",
    "file": "tests/core/oppgaver.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 9397
   },
   {
    "title": "skal trigge MOTTAK_SED prosess ved mottak av A003",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 8717,
    "dockerErrors": [
     {
      "service": "faktureringskomponenten",
      "errors": [
       {
        "timestamp": "2026-06-20T22:30:01Z",
        "message": "WARN AuditorAwareFilter: missing Nav-User-Id header"
       }
      ]
     }
    ]
   },
   {
    "title": "skal opprette fagsak ved mottak av A003 fra Sverige",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7372
   },
   {
    "title": "skal håndtere A009 og automatisk registrere unntak fra norsk trygd (REGISTRERT_UNNTAK)",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7902
   },
   {
    "title": "skal håndtere A010 og automatisk registrere unntak fra norsk trygd – øvrige (REGISTRERT_UNNTAK)",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7367
   },
   {
    "title": "skal håndtere A001 søknad fra Danmark",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7313
   },
   {
    "title": "skal håndtere tilpasset SED konfigurasjon",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7327
   },
   {
    "title": "skal verifisere at SED fører til oppgave i systemet",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 9205
   },
   {
    "title": "skal håndtere flere SED-typer i sekvens",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 8302
   },
   {
    "title": "skal verifisere prosessinstanser i databasen",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7308
   },
   {
    "title": "skal trigge MOTTAK_SED via melosys-eessi flow",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7421
   },
   {
    "title": "skal opprette fagsak via full eessi-flow med A003 fra Sverige",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7851
   },
   {
    "title": "skal håndtere A009 informasjonsforespørsel via eessi",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 6826
   },
   {
    "title": "skal sammenligne direkte vs eessi-flow @comparison",
    "file": "tests/core/sed-mottak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 7816
   },
   {
    "title": "skal søke etter person med gyldig fødselsnummer og finne sak",
    "file": "tests/core/sok-og-navigasjon.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11936
   },
   {
    "title": "skal vise ingen resultater for ukjent bruker",
    "file": "tests/core/sok-og-navigasjon.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 8726
   },
   {
    "title": "skal navigere til sak fra søkeresultat",
    "file": "tests/core/sok-og-navigasjon.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11514
   },
   {
    "title": "skal søke etter sak med saksnummer",
    "file": "tests/core/sok-og-navigasjon.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11751
   },
   {
    "title": "skal kunne navigere tilbake til forsiden fra søkeresultater",
    "file": "tests/core/sok-og-navigasjon.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11703
   },
   {
    "title": "skal produsere korrekt, distinkt vedtaksbrev for FTRL- og trygdeavtale-mottaker",
    "file": "tests/core/vedtaksbrev-mottakertype.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 57475
   },
   {
    "title": "skal fullføre sak og verifisere at årsavregning ikke kan opprettes",
    "file": "tests/eu-eos/eu-eos-art11-3b-medlemskap-offentlig-tjenesteperson.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 25343
   },
   {
    "title": "skal iverksette vedtak og verifisere MEDL-periode, A009 SED og utgående journalpost",
    "file": "tests/eu-eos/eu-eos-art12-iverksetting-mottaker-kjede.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 47113
   },
   {
    "title": "skal forkorte lovvalgsperiode via nyvurdering og overføre ny periode til MEDL",
    "file": "tests/eu-eos/eu-eos-art12-nyvurdering-medlemskap-overforing.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 88065
   },
   {
    "title": "skal fullføre EU/EØS-arbeidsflyt med vedtak",
    "file": "tests/eu-eos/eu-eos-art12-utsendt-arbeidstaker-fullfort-vedtak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 46790
   },
   {
    "title": "skal fullføre \"Arbeid i flere land\" arbeidsflyt med vedtak",
    "file": "tests/eu-eos/eu-eos-art13-arbeid-flere-land-fullfort-vedtak.spec.ts",
    "status": "failed",
    "totalAttempts": 3,
    "failedAttempts": 3,
    "duration": 26430,
    "error": "expect(received).toBe(expected)\n\nExpected: 'AVSLUTTET'\nReceived: 'UNDER_BEHANDLING'\n  at verifiserBehandlingSluttilstand (pages/shared/behandling.assertions.ts:142:18)",
    "dockerErrors": [
     {
      "service": "melosys-api",
      "errors": [
       {
        "timestamp": "2026-06-20T22:41:03Z",
        "message": "ORA-00001: unique constraint (MELOSYS.PK_LOVVALG) violated"
       }
      ]
     }
    ]
   },
   {
    "title": "skal fullføre \"Arbeid i flere land\" med selvstendig næringsvirksomhet og SED-dokument",
    "file": "tests/eu-eos/eu-eos-art13-arbeid-flere-land-selvstendig-fullfort-vedtak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 36080
   },
   {
    "title": "skal nyvurdere en registrert annet-land-sak og re-registrere unntaket",
    "file": "tests/eu-eos/eu-eos-inngaaende-a003-annet-land-nyvurdering.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 15680
   },
   {
    "title": "skal godkjenne at et annet land er utpekt og registrere unntak (uten SED)",
    "file": "tests/eu-eos/eu-eos-inngaaende-a003-annet-land-utpekt-registrert-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 11410
   },
   {
    "title": "skal godkjenne utpeking av Norge og svare utland med A012",
    "file": "tests/eu-eos/eu-eos-inngaaende-a003-norge-utpekt-a012.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 14046
   },
   {
    "title": "Kosovo statsborgerskap bevart i SED A008",
    "file": "tests/eu-eos/eu-eos-kosovo-statsborgerskap.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 37519
   },
   {
    "title": "skal annullere sak med sendt vedtak og avvise MEDL-perioden",
    "file": "tests/eu-eos/eu-eos-nyvurdering-annuller-medlemskap-avvis.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 52163
   },
   {
    "title": "Scenario 1: SED sendes til EESSI-land og papir til Færøyene",
    "file": "tests/eu-eos/eu-eos-papir-a1-til-ikke-eessi-land.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 37653
   },
   {
    "title": "Scenario 2: SED sendes til EESSI-land og papir til Færøyene og Grønland",
    "file": "tests/eu-eos/eu-eos-papir-a1-til-ikke-eessi-land.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 38003
   },
   {
    "title": "Scenario 3 (regresjon): Kun EESSI-land — ingen papir-A1 til FO/GL",
    "file": "tests/eu-eos/eu-eos-papir-a1-til-ikke-eessi-land.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 37582
   },
   {
    "title": "Scenario 4: Kun Færøyene + Grønland — papir-A1 sendes til begge",
    "file": "tests/eu-eos/eu-eos-papir-a1-til-ikke-eessi-land.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 27954
   },
   {
    "title": "skal vise infomelding når inntekten er under minstebeløpet",
    "file": "tests/eu-eos/eu-eos-pensjonist-trygdeavgift.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 27450
   },
   {
    "title": "skal vise tabell med asterisk (*) for 25%-regel",
    "file": "tests/eu-eos/eu-eos-pensjonist-trygdeavgift.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 27237
   },
   {
    "title": "skal vise *** for sammenslåtte inntektskilder",
    "file": "tests/eu-eos/eu-eos-pensjonist-trygdeavgift.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 28532
   },
   {
    "title": "skal vise tabell ved ordinær beregning",
    "file": "tests/eu-eos/eu-eos-pensjonist-trygdeavgift.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 27178
   },
   {
    "title": "skal videresende søknad til Sverige",
    "file": "tests/eu-eos/eu-eos-sed-a008-videresend-soeknad.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 37440
   },
   {
    "title": "skal fullføre EU/EØS-skip-arbeidsflyt med vedtak",
    "file": "tests/eu-eos/eu-eos-skip-fullfort-vedtak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 28384
   },
   {
    "title": "mottar A002 (innvilgelse) - skal fatte vedtak automatisk",
    "file": "tests/eu-eos/unntak/eu-eos-anmodning-unntak-nyvurdering-svar.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 34933
   },
   {
    "title": "mottar A011 (avslag) - skal kreve manuell ny vurdering",
    "file": "tests/eu-eos/unntak/eu-eos-anmodning-unntak-nyvurdering-svar.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 35004
   },
   {
    "title": "direkte til - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 32506
   },
   {
    "title": "direkte til art.13(1)(a) - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 33164
   },
   {
    "title": "direkte til art.13(1)(a) med TWFA - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 32623
   },
   {
    "title": "via full behandling - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 36407
   },
   {
    "title": "direkte til CDM 4.3 - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 32977
   },
   {
    "title": "direkte til art.13(1)(a) CDM 4.3 - skal sende anmodning om unntak",
    "file": "tests/eu-eos/unntak/eu-eos-utsendt-arbeidstaker-anmodning-unntak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 32475
   },
   {
    "title": "skal opprette manglende-innbetaling-behandling automatisk og fatte opphørsvedtak",
    "file": "tests/ftrl/ftrl-manglende-innbetaling-opphor.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 48410
   },
   {
    "title": "25%-regelen begrenser avgiften",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 35426
   },
   {
    "title": "ordinær beregning uten begrensning (80000 kr/md)",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 35299
   },
   {
    "title": "25%-regelen med Full dekning — pliktig medlem",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 34298
   },
   {
    "title": "inntekt under minstebeløpet — avgift 0 kr",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 36027
   },
   {
    "title": "Confluence Eksempel 1 — flere skatteforhold og inntekter, 25%-regel på alle perioder",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 83209
   },
   {
    "title": "25%-regelen for FTRL Pensjonist",
    "file": "tests/ftrl/ftrl-trygdeavgift-25-prosent-regel.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 32780
   },
   {
    "title": "skal innvilge pliktig medlemskap § 2-2, fatte vedtak og opprette fakturaserie",
    "file": "tests/ftrl/ftrl-yrkesaktiv-2-2-forstegang.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 34365
   },
   {
    "title": "skal fullføre trygdeavtale-arbeidsflyt med vedtak",
    "file": "tests/trygdeavtale/trygdeavtale-fullfort-vedtak.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 27906
   },
   {
    "title": "skal forkorte periode via nyvurdering og erstatte MEDL-perioden in-place",
    "file": "tests/trygdeavtale/trygdeavtale-nyvurdering.spec.ts",
    "status": "failed",
    "totalAttempts": 3,
    "failedAttempts": 3,
    "duration": 35282,
    "error": "TimeoutError: locator.click: Timeout 30000ms exceeded.\nwaiting for getByRole('button', { name: 'Fatt vedtak' })"
   },
   {
    "title": "skal registrere godkjent unntak med endelig MEDL-periode",
    "file": "tests/trygdeavtale/trygdeavtale-unntaksregistrering.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 23646
   },
   {
    "title": "skal avslutte saken uten lovvalgsperiode ved ikke godkjent unntak",
    "file": "tests/trygdeavtale/trygdeavtale-unntaksregistrering.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 23474
   },
   {
    "title": "skal fullføre komplett saksflyt med § 2-8 første ledd bokstav a (arbeidstaker)",
    "file": "tests/utenfor-avtaleland/komplett-sak-2-8a.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 36719
   },
   {
    "title": "FULL_DEKNING_FTRL",
    "file": "tests/utenfor-avtaleland/komplett-sak-2-8a.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 36954
   },
   {
    "title": "skal fullføre komplett saksflyt med § 2-8 første ledd bokstav b (student)",
    "file": "tests/utenfor-avtaleland/komplett-sak-2-8b-student.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 35872
   },
   {
    "title": "skal fullføre sak med flere land, pensjon-dekning, deretter NV som annulleres",
    "file": "tests/utenfor-avtaleland/komplett-sak-flere-land-arbeidsinntekt-nyvurdering-annullering.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 55569
   },
   {
    "title": "skal fullføre sak med flere land, ikke-skattepliktig og arbeidsinntekt fra Norge. Så NV med skattepliktig, avregning skal bli riktig",
    "file": "tests/utenfor-avtaleland/komplett-sak-flere-land-arbeidsinntekt.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 47101
   },
   {
    "title": "skal fullføre komplett saksflyt - delevis skattepliktig - med flere inntektskilder",
    "file": "tests/utenfor-avtaleland/komplett-sak-flere-land-flereinntektskilder.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 64493
   },
   {
    "title": "skal endre skattestatus fra ikke-skattepliktig til skattepliktig via nyvurdering",
    "file": "tests/utenfor-avtaleland/nyvurdering-endring-skattestatus.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 59559
   },
   {
    "title": "skal endre skattestatus fra skattepliktig til ikke-skattepliktig via nyvurdering",
    "file": "tests/utenfor-avtaleland/nyvurdering-endring-skattestatus.spec.ts",
    "status": "passed",
    "totalAttempts": 1,
    "failedAttempts": 0,
    "duration": 61861
   }
  ]
 }
};
