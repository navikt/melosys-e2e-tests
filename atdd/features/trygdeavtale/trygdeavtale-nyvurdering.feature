# language: no
Egenskap: Trygdeavtale - nyvurdering av fattet vedtak
  Som saksbehandler
  ønsker jeg å forkorte medlemskapsperioden på en allerede innvilget trygdeavtale-sak
  slik at et nytt vedtak erstatter den opprinnelige medlemskapsperioden

  Scenario: Nyvurdering forkorter perioden og erstatter medlemskapsperioden
    Gitt en innvilget trygdeavtale-behandling for perioden 01.01.2024 til 01.01.2026
    Når saksbehandler oppretter en nyvurdering med forkortet periode til 31.12.2025
    Og fatter nytt vedtak med grunn "nye opplysninger"
    Så er nyvurderingen fullført med perioden 01.01.2024 til 31.12.2025
    Og medlemskapsperioden er erstattet med sluttdato 31.12.2025
