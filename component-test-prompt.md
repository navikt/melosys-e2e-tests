# Nano Banana Pro Prompt: Component/Integration Testing Architecture

## Context

This prompt visualizes melosys-api's component/integration testing strategy:
- **Real dependencies**: Oracle database in Docker
- **In-memory**: Kafka (embedded)
- **Mocked**: All 22 external services via melosys-mock

## Dark 3D Isometric Prompt

```
Create a clean technical architecture diagram showing component/integration testing for a Java API service.

Center composition: A prominent box labeled "melosys-api" with subtitle "System Under Test" in the center, styled with a bright blue gradient (#3B82F6 to #1D4ED8) and glowing border indicating it's the focus.

Left side (Real Dependencies):
- Docker container icon containing "Oracle Database" with warm orange coloring (#F97316)
- Single arrow from melosys-api to Oracle Database
- A green checkmark badge with text "REAL" near Oracle Database

Inside melosys-api:
- Small embedded box labeled "Kafka (In-Memory)" with bright green accent (#22C55E)
- NO arrows to/from Kafka - it is fully contained within melosys-api

Right side (Mocked Services):
- A large dashed-border box with Docker container icon, labeled "melosys-mock" (showing it runs in Docker), containing multiple smaller service boxes arranged in a clean grid layout (4 columns x 6 rows):
  Row 1: "PDL", "MEDL", "SAF", "Joark"
  Row 2: "Dokprod", "Dokdist", "Dokkat", "Oppgave"
  Row 3: "Sak", "Aareg", "EREG", "Inntekt"
  Row 4: "Utbetal", "Sigrun", "EUX/RINA", "Melosys-EESSI"
  Row 5: "Azure AD", "STS", "ABAC", "Tilgangsmaskinen"
  Row 6: "Kodeverk", "Inngangsvilkår" (centered in last row)
- Muted gray colors (#6B7280) for mocked services with subtle glow
- NO arrows or connections between the service boxes inside melosys-mock - they are independent
- Single arrow from melosys-api pointing to the melosys-mock container box (not to individual services)
- NO warning badges or labels saying "MOCKED" - the dashed border and gray color already indicate mocked status

Bottom legend:
- Blue box = "System under test"
- Orange box with Docker icon = "Real dependency (Docker)"
- Gray dashed box with Docker icon = "Mocked services (Docker)"
- Green box = "Embedded/In-memory"

Style: Clean isometric 3D technical diagram with soft glowing effects and subtle shadows.
Color palette: Bright blues, greens, and oranges against dark background for high contrast.
Typography: Modern sans-serif (like Inter or SF Pro) in white/light gray, clear labels.
16:9 widescreen format with space for title at top reading "Component/Integration Testing" in white.
Dark background (#111827 or #1F2937) with subtle dot grid pattern.
All elements should have slight glow/bloom effect for modern dark-mode aesthetic.
```

## All 22 Mocked External Services

| Category | Services |
|----------|----------|
| Person Data | PDL (Person Data Lake), MEDL (Medlemskap) |
| Document Services | SAF (Søk og Finn), Joark (Journal/Arkiv), Dokprod, Dokdist, Dokkat |
| Task/Case | Oppgave, Sak |
| Employment/Org | Aareg (Arbeidsregister), EREG (Enhetsregister) |
| Financial | Inntekt, Utbetal, Sigrun (Skatt) |
| EU Integration | EUX/RINA, Melosys-EESSI |
| Auth/Access | Azure AD, STS, ABAC, Tilgangsmaskinen |
| Reference Data | Kodeverk, Inngangsvilkår |

## Why This Is Component/Integration Testing

| Aspect | Unit Test | Component Test (This) | E2E Test |
|--------|-----------|----------------------|----------|
| Database | Mocked | Real (Docker) | Real |
| Kafka | Mocked | In-memory | Real |
| External APIs | Mocked | Mocked (22 services) | Real |
| Speed | Fast | Medium | Slow |
| Confidence | Low | Medium-High | High |
