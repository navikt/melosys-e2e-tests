# NAV – Melosys: E2E-testinfrastruktur for komplekst distribuert system med AI-assistert utvikling

## Oppdraget

Melosys er NAVs system for medlemskap i folketrygden og trygdeavgiftsberegning for personer som jobber på tvers av landegrenser. Systemet består av over 17 mikrotjenester, Oracle- og PostgreSQL-databaser, Kafka-meldingskøer og kompleks forretningslogikk.

Teamet hadde lenge ønsket seg automatiserte E2E-tester, men omfanget og kompleksiteten hadde gjort det urealistisk å prioritere. Ved å ta i bruk Claude Code som AI-utviklingsassistent ble det mulig å bygge en fullverdig testinfrastruktur på en brøkdel av tiden det normalt ville krevd.

## Utfordringen

Å bygge E2E-tester for Melosys innebar flere krevende problemstillinger:

1. Hvordan orkestrere 17 Docker-tjenester med helsekontroller, nettverksoppsett og databaseinitialisering i et reproduserbart testmiljø?
2. Hvordan håndtere race conditions i et system med saga-mønstre, asynkrone prosesser og dynamisk UI som trigger backend-kall?
3. Hvordan sikre at hver kodeendring på tvers av ni repositories automatisk valideres med E2E-tester?

Manuell testing fanget bare sporadisk opp timing-problemer og asynkrone feil. Teamet trengte en systematisk tilnærming som ga innsikt i hva som skjedde både i frontend og backend samtidig.

## Resultatet

Med Claude Code som AI-assistent ble det bygget en komplett E2E-testinfrastruktur på omtrent to ukers effektiv arbeidstid:

1. **54 automatiserte tester** som dekker hele brukerreisen – fra saksopprettelse til vedtak – på tvers av FTRL, EU/EØS, trygdeavtaler, klagebehandling og årsavregning
2. **CI/CD med automatiske triggere** fra ni repositories – hver kodeendring kjører E2E-tester automatisk via GitHub Actions dispatch-systemet
3. **AI-drevet debugging-løkke** der Claude Code analyserer feilende tester, identifiserer rotårsak på tvers av tjenester, implementerer fix, bygger ny image og verifiserer med gjentatte kjøringer
4. **7 produksjonsfeil oppdaget og fikset** – feil som bare manifesterte seg under spesifikke timing-forhold og aldri ble fanget av manuell testing

Testinfrastrukturen inkluderer automatisk opprydding, Docker-loggmonitorering per test, feature toggle-håndtering og Page Object Model for vedlikeholdbare tester. Teamet har nå kontinuerlig tillit til at endringer på tvers av alle mikrotjenester ikke brekker eksisterende funksjonalitet.
