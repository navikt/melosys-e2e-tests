# language: no
Egenskap: Trygdeavtale - registrering av unntak fra medlemskap
  Som saksbehandler
  ønsker jeg å registrere om et unntak fra medlemskap godkjennes eller ikke
  slik at medlemskapsperioden i folketrygden blir riktig avklart

  Scenario: Godkjent unntak gir endelig medlemskapsperiode
    Gitt en unntaksregistrering for perioden 01.01.2024 til 31.12.2025
    Når saksbehandler godkjenner unntaket etter "Australia artikkel 9 nr. 3"
    Så er unntaket registrert med endelig medlemskapsperiode

  Scenario: Ikke godkjent unntak avslutter saken uten medlemskapsperiode
    Gitt en unntaksregistrering for perioden 01.01.2024 til 31.12.2025
    Når saksbehandler ikke godkjenner unntaket
    Så er saken avsluttet uten medlemskapsperiode
