# language: no
Egenskap: Trygdeavtale - fatte vedtak om medlemskap
  Som saksbehandler
  ønsker jeg å behandle en søknad om medlemskap som gjelder et land Norge har en trygdeavtale med
  slik at søker får et vedtak om medlemskap

  Scenario: Fullføre trygdeavtale-behandling med standardperiode
    Gitt en opprettet trygdeavtale-behandling
    Når saksbehandler fatter vedtak med resultat "INNVILGET"
    Så blir behandlingen fullført og søknad innvilget

  Scenario: Fatte vedtak med eksplisitt oppgitt søknadsperiode
    Gitt en opprettet trygdeavtale-behandling
    Og søknaden gjelder perioden 01.01.2024 til 31.12.2025
    Når saksbehandler fatter vedtak med resultat "INNVILGET"
    Så blir behandlingen fullført og søknad innvilget
    Og vedtaket gjelder perioden 01.01.2024 til 31.12.2025
