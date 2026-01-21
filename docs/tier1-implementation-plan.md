# Tier 1 E2E Tests - Implementation Plan

This document provides a detailed implementation plan for the 6 critical e2e tests identified in the expansion strategy.

## Overview

| # | Test | Complexity | Approach | Est. Effort |
|---|------|------------|----------|-------------|
| 1 | Journalføring | Medium | UI-based | 6-8 hours |
| 2 | Search & Navigation | Low | UI-based | 3-4 hours |
| 3 | Oppgaver Flow | Medium | UI-based | 4-5 hours |
| 4 | EU/EØS Unntak (Art. 16) | High | UI-based | 6-8 hours |
| 5 | FTRL Klage | Medium | UI-based | 5-6 hours |
| 6 | SED Intake | High | Hybrid (API + DB) | 6-8 hours |

---

## 1. Journalføring Complete Flow

### What Exists
- **Frontend**: Full implementation in `/melosys-web/src/sider/journalforing/`
- **Route**: `/journalforing/:journalpostID/:oppgaveID`
- **API**: `/api/journalforing/*` endpoints (knytt, opprett, nyvurdering)
- **Redux**: `/melosys-web/src/ducks/journalforing/`
- **Mock cleanup**: `MockHelper.clearMockData()` clears journalposter

### What to Create

```
pages/
└── journalforing/
    ├── journalforing.page.ts
    └── journalforing.assertions.ts

tests/
└── core/
    └── journalforing.spec.ts
```

### Page Object: `journalforing.page.ts`

```typescript
import { Page, Locator } from '@playwright/test';
import { BasePage } from '../shared/base.page';

export class JournalforingPage extends BasePage {
  // Locators
  private readonly brukerIdInput: Locator;
  private readonly dokumentTittel: Locator;
  private readonly mottattDatoInput: Locator;
  private readonly saksnummerDropdown: Locator;
  private readonly sakstypeDropdown: Locator;
  private readonly sakstemaDropdown: Locator;
  private readonly behandlingstemaDropdown: Locator;
  private readonly knyttTilSakRadio: Locator;
  private readonly opprettNySakRadio: Locator;
  private readonly journalførButton: Locator;

  constructor(page: Page) {
    super(page);
    // Initialize locators
  }

  // Navigation
  async gotoJournalpost(journalpostID: string, oppgaveID: string): Promise<void>;

  // Actions
  async velgKnyttTilEksisterendeSak(): Promise<void>;
  async velgOpprettNySak(): Promise<void>;
  async velgSaksnummer(saksnr: string): Promise<void>;
  async fyllSakstype(sakstype: string): Promise<void>;
  async fyllSakstema(sakstema: string): Promise<void>;
  async fyllBehandlingstema(tema: string): Promise<void>;
  async fyllBehandlingstype(type: string): Promise<void>;
  async settMottattDato(dato: string): Promise<void>;
  async journalførDokument(): Promise<void>;

  // Workflows
  async knyttTilSak(saksnr: string): Promise<void>;
  async opprettNySakOgJournalfør(config: OpprettSakConfig): Promise<void>;
}
```

### Test Scenarios

```typescript
// tests/core/journalforing.spec.ts
import { test } from '../../fixtures';

test.describe('Journalføring', () => {

  test('skal knytte dokument til eksisterende sak', async ({ page }) => {
    // 1. Create a case first (prerequisite)
    // 2. Navigate to journalpost
    // 3. Select "Knytt til eksisterende sak"
    // 4. Select the case
    // 5. Click journalfør
    // 6. Verify in database
  });

  test('skal opprette ny sak fra journalpost', async ({ page }) => {
    // 1. Navigate to journalpost
    // 2. Select "Opprett ny sak"
    // 3. Fill sakstype, sakstema, behandlingstema
    // 4. Click journalfør
    // 5. Verify case created in database
  });

  test('skal opprette ny vurdering fra journalpost', async ({ page }) => {
    // 1. Create case with completed behandling (prerequisite)
    // 2. Navigate to journalpost
    // 3. Select existing case
    // 4. Choose "Ny vurdering"
    // 5. Verify new behandling created
  });
});
```

### Mock Data Required
- Journalpost with valid brukerID and document
- Oppgave linked to journalpost
- Available via melosys-mock or needs setup

### Database Verification
```sql
-- Verify journalpost linked
SELECT * FROM JOURNALPOST WHERE journalpost_id = :id AND fagsak_id IS NOT NULL;

-- Verify case created
SELECT * FROM FAGSAK WHERE saksnummer = :saksnr;

-- Verify behandling created
SELECT * FROM BEHANDLING WHERE fagsak_id = :fagsakId;
```

---

## 2. Search & Case Navigation

### What Exists
- **Frontend search**: `/melosys-web/src/sider/forside/komponenter/sokskjema.jsx`
- **Results page**: `/melosys-web/src/sider/sok/sok.tsx`
- **API**: `POST /fagsaker/sok`
- **HovedsidePage**: Already has `søkEtterBruker()` method

### What to Create

```
pages/
└── sok/
    ├── sok.page.ts
    └── sok.assertions.ts

tests/
└── core/
    └── sok-og-navigasjon.spec.ts
```

### Page Object: `sok.page.ts`

```typescript
import { Page, Locator } from '@playwright/test';
import { BasePage } from '../shared/base.page';

export class SokPage extends BasePage {
  private readonly resultatListe: Locator;
  private readonly ingenResultaterMelding: Locator;
  private readonly sakLinks: Locator;

  constructor(page: Page) {
    super(page);
  }

  // Navigation
  async goto(): Promise<void>;

  // Queries
  async getResultatAntall(): Promise<number>;
  async getSaksnumre(): Promise<string[]>;

  // Actions
  async klikkSak(saksnummer: string): Promise<void>;
  async klikkSakIndex(index: number): Promise<void>;
  async klikkBehandling(saksnummer: string, behandlingIndex: number): Promise<void>;
}
```

### Test Scenarios

```typescript
// tests/core/sok-og-navigasjon.spec.ts
import { test, expect } from '../../fixtures';

test.describe('Søk og navigasjon', () => {

  test('skal søke etter person med gyldig fødselsnummer', async ({ page }) => {
    // 1. Create case for test user (prerequisite)
    // 2. Go to forside
    // 3. Enter FNR in search
    // 4. Click search
    // 5. Verify results displayed
    // 6. Verify correct case in results
  });

  test('skal søke etter organisasjon med orgnummer', async ({ page }) => {
    // 1. Create case for org (prerequisite)
    // 2. Search by org number
    // 3. Verify results
  });

  test('skal søke etter sak med saksnummer', async ({ page }) => {
    // 1. Create case (prerequisite)
    // 2. Search by saksnummer
    // 3. Verify exact match
  });

  test('skal vise ingen resultater for ukjent bruker', async ({ page }) => {
    // 1. Search for unknown FNR
    // 2. Verify "ingen saker" message
  });

  test('skal navigere til sak fra søkeresultat', async ({ page }) => {
    // 1. Create case
    // 2. Search and find
    // 3. Click case
    // 4. Verify navigation to case page
  });

  test('skal navigere til behandling fra søkeresultat', async ({ page }) => {
    // 1. Create case with behandling
    // 2. Search
    // 3. Click specific behandling
    // 4. Verify navigation to behandling page
  });
});
```

### Dependencies
- Reuse `HovedsidePage.søkEtterBruker()` for search input
- Create `SokPage` for results interaction

---

## 3. Task/Oppgaver Flow

### What Exists
- **Frontend**: `/melosys-web/src/sider/forside/forside.jsx`
- **Task lists**: `jornualforingoppgaver.tsx`, `behandlingOppgaver.tsx`
- **API**: `GET /oppgaver/oversikt`, `POST /oppgaver/plukk`, `POST /oppgaver/tilbakelegg`
- **Redux**: `/melosys-web/src/ducks/oppgaver/`

### What to Create

```
pages/
└── oppgaver/
    ├── oppgaver.page.ts
    └── oppgaver.assertions.ts

tests/
└── core/
    └── oppgaver.spec.ts
```

### Page Object: `oppgaver.page.ts`

```typescript
import { Page, Locator } from '@playwright/test';
import { BasePage } from '../shared/base.page';

export class OppgaverPage extends BasePage {
  private readonly oppgaveTeller: Locator;
  private readonly journalforingOppgaver: Locator;
  private readonly behandlingOppgaver: Locator;

  constructor(page: Page) {
    super(page);
  }

  // Queries
  async getTotalOppgaveAntall(): Promise<number>;
  async getJournalforingOppgaveAntall(): Promise<number>;
  async getBehandlingOppgaveAntall(): Promise<number>;

  // Actions
  async klikkJournalforingOppgave(navn: string): Promise<void>;
  async klikkBehandlingOppgave(navn: string): Promise<void>;
  async ventPåOppgaverLastet(): Promise<void>;
}
```

### Test Scenarios

```typescript
// tests/core/oppgaver.spec.ts
import { test, expect } from '../../fixtures';

test.describe('Oppgaver', () => {

  test('skal vise mine oppgaver på forsiden', async ({ page }) => {
    // 1. Setup: Create journalføring oppgave in mock
    // 2. Go to forside
    // 3. Verify oppgave count displayed
    // 4. Verify oppgave in list
  });

  test('skal navigere til journalføring fra oppgave', async ({ page }) => {
    // 1. Setup: Create journalføring oppgave
    // 2. Click oppgave
    // 3. Verify navigation to /journalforing/:id/:oppgaveId
  });

  test('skal navigere til behandling fra oppgave', async ({ page }) => {
    // 1. Setup: Create behandling oppgave
    // 2. Click oppgave
    // 3. Verify navigation to behandling page
  });

  test('skal vise tom liste når ingen oppgaver', async ({ page }) => {
    // 1. Ensure no oppgaver exist
    // 2. Go to forside
    // 3. Verify empty state message
  });
});
```

### Mock Data Setup
Need to create oppgaver in mock service:
- Journalføring oppgaver (journalpostID, oppgaveID)
- Behandling oppgaver (behandlingID, case details)

---

## 4. EU/EØS Exception Request (Article 16)

### What Exists
- **Frontend**: `/melosys-web/src/sider/eu_eøs/stegKomponenter/vurderingArtikkel16Anmodning/`
- **Routes**: `/EU_EOS/registrering/:saksnr/anmodningunntak`
- **Process**: `ANMODNING_OM_UNNTAK` in ProsessType
- **Redux**: `/melosys-web/src/ducks/anmodningunntak/`

### What to Create

```
pages/
└── eu-eos/
    └── unntak/
        ├── anmodning-unntak.page.ts
        └── anmodning-unntak.assertions.ts

tests/
└── eu-eos/
    └── unntak/
        └── artikkel-16-anmodning.spec.ts
```

### Page Object: `anmodning-unntak.page.ts`

```typescript
import { Page, Locator } from '@playwright/test';
import { BasePage } from '../../shared/base.page';

export class AnmodningUnntakPage extends BasePage {
  // Locators for Article 16 form
  private readonly unntaksBegrunnelse: Locator;
  private readonly periodeVelger: Locator;
  private readonly institusjonVelger: Locator;
  private readonly sendAnmodningButton: Locator;

  constructor(page: Page) {
    super(page);
  }

  // Navigation
  async gotoAnmodningUnntak(saksnr: string): Promise<void>;

  // Actions
  async fyllBegrunnelse(tekst: string): Promise<void>;
  async velgPeriode(fra: string, til: string): Promise<void>;
  async velgMottakerInstitusjon(land: string): Promise<void>;
  async sendAnmodning(): Promise<void>;

  // Complete workflow
  async sendArtikkel16Anmodning(config: UnntakConfig): Promise<void>;
}
```

### Test Scenarios

```typescript
// tests/eu-eos/unntak/artikkel-16-anmodning.spec.ts
import { test, expect } from '../../../fixtures';

test.describe('EU/EØS Artikkel 16 - Anmodning om unntak', () => {

  test('skal opprette og sende anmodning om unntak', async ({ page }) => {
    // 1. Create EU/EØS case (prerequisite)
    // 2. Navigate to case
    // 3. Start unntak workflow
    // 4. Fill exception form (Article 16)
    // 5. Select receiving institution
    // 6. Submit anmodning
    // 7. Verify process started
    // 8. Verify documents generated (orientation letter + SED A001)
  });

  test('skal håndtere svar på anmodning om unntak', async ({ page }) => {
    // 1. Setup: Case with pending unntak anmodning
    // 2. Simulate response received
    // 3. Process response
    // 4. Verify result registered
  });
});
```

### Prerequisites
- Existing EU/EØS case in correct state
- Institution data in mock (for receiver selection)
- Document templates available

### Process Flow to Test
1. AVKLAR_MYNDIGHET
2. LAGRE_ANMODNINGSPERIODE_MEDL
3. SEND_ORIENTERING_ANMODNING_UNNTAK
4. SEND_ANMODNING_OM_UNNTAK
5. OPPDATER_OPPGAVE_ANMODNING_UNNTAK_SENDT

---

## 5. FTRL Klage (Appeal)

### What Exists
- **Database**: KLAGE treatment type defined
- **Backend**: BehandlingService handles klage
- **Deadline**: 70 days (vs 90 for regular)
- **Results**: KLAGE_MEDHOLD, KLAGE_AVVIST, KLAGE_OVERSENDT_TIL_KLAGEINSTANSER

### What to Create

```
pages/
└── klage/
    ├── klage.page.ts
    └── klage.assertions.ts

tests/
└── ftrl/
    └── klage/
        └── ftrl-klage.spec.ts
```

### Page Object: `klage.page.ts`

```typescript
import { Page, Locator } from '@playwright/test';
import { BasePage } from '../shared/base.page';

export class KlagePage extends BasePage {
  private readonly klageResultatDropdown: Locator;
  private readonly klageBegrunnelse: Locator;
  private readonly fattVedtakButton: Locator;

  constructor(page: Page) {
    super(page);
  }

  // Actions
  async velgKlageResultat(resultat: 'MEDHOLD' | 'AVVIST' | 'OVERSENDT'): Promise<void>;
  async fyllBegrunnelse(tekst: string): Promise<void>;
  async fattKlageVedtak(): Promise<void>;

  // Complete workflows
  async behandleKlageMedMedhold(): Promise<void>;
  async behandleKlageMedAvvisning(): Promise<void>;
  async oversendKlageTilKlageinstans(): Promise<void>;
}
```

### Test Scenarios

```typescript
// tests/ftrl/klage/ftrl-klage.spec.ts
import { test, expect } from '../../../fixtures';

test.describe('FTRL Klage', () => {

  test.beforeEach(async ({ page }) => {
    // Create FTRL case with completed behandling
    // This is the prerequisite for klage
  });

  test('skal opprette klage på eksisterende sak', async ({ page }) => {
    // 1. Navigate to case with completed vedtak
    // 2. Create new behandling with type KLAGE
    // 3. Verify klage behandling created
    // 4. Verify 70-day deadline set
  });

  test('skal behandle klage med medhold', async ({ page }) => {
    // 1. Create klage behandling
    // 2. Process through steps
    // 3. Select KLAGE_MEDHOLD
    // 4. Submit vedtak
    // 5. Verify outcome
  });

  test('skal behandle klage med avvisning', async ({ page }) => {
    // 1. Create klage behandling
    // 2. Select KLAGE_AVVIST
    // 3. Fill rejection reason
    // 4. Submit vedtak
    // 5. Verify outcome
  });

  test('skal oversende klage til klageinstans', async ({ page }) => {
    // 1. Create klage behandling
    // 2. Select KLAGE_OVERSENDT_TIL_KLAGEINSTANSER
    // 3. Submit
    // 4. Verify forwarding registered
  });
});
```

### Key Differences from Regular FTRL
- Treatment type: KLAGE instead of FØRSTEGANG
- Deadline: 70 days instead of 90
- Results: Special klage outcomes
- May skip some regular steps (medlemskap, arbeidsforhold)

---

## 6. SED Intake Flow (MOTTAK_SED)

### What Exists
- **Process**: `MOTTAK_SED` in ProsessType
- **Backend**: Full routing in `SedMottakRuting.java`
- **Integration tests**: `SedMottakTestIT.kt`
- **Mock**: `POST /testdata/lagsak` can trigger SED events
- **Kafka**: `eessibasis-sedmottatt-v1-local` topic
- **Templates**: sedA001.json, sedA003.json, etc.

### What to Create

```
helpers/
└── sed-helper.ts

tests/
└── core/
    └── sed-mottak.spec.ts
```

### Helper: `sed-helper.ts`

```typescript
import { APIRequestContext } from '@playwright/test';

export interface SedConfig {
  bucType: string;      // e.g., 'LA_BUC_04'
  sedType: string;      // e.g., 'A003'
  avsenderLand: string; // e.g., 'SE'
  mottakerLand: string; // e.g., 'NO'
  rinaDokumentId?: string;
}

export class SedHelper {
  private mockBaseUrl = 'http://localhost:8083';

  constructor(private request: APIRequestContext) {}

  async sendSed(config: SedConfig): Promise<void> {
    await this.request.post(`${this.mockBaseUrl}/testdata/lagsak`, {
      data: {
        bucType: config.bucType,
        sedType: config.sedType,
        avsenderLand: config.avsenderLand,
        mottakerLand: config.mottakerLand,
        rinaDokumentId: config.rinaDokumentId || this.generateRinaId(),
      }
    });
  }

  async waitForSedProcessed(timeout: number = 30000): Promise<void> {
    // Poll database or API until SED is processed
  }

  private generateRinaId(): string {
    return `RINA-${Date.now()}`;
  }
}
```

### Test Scenarios

```typescript
// tests/core/sed-mottak.spec.ts
import { test, expect } from '../../fixtures';
import { SedHelper } from '../../helpers/sed-helper';

test.describe('SED Mottak', () => {

  test('skal opprette sak fra mottatt A003 SED', async ({ page, request }) => {
    const sedHelper = new SedHelper(request);

    // 1. Send SED via mock service
    await sedHelper.sendSed({
      bucType: 'LA_BUC_04',
      sedType: 'A003',
      avsenderLand: 'SE',
      mottakerLand: 'NO',
    });

    // 2. Wait for processing
    await sedHelper.waitForSedProcessed();

    // 3. Verify case created in database
    // Query FAGSAK table for new case

    // 4. Optionally: Navigate UI to verify case accessible
    // Search for case and verify details
  });

  test('skal håndtere A009 informasjonsforespørsel', async ({ request }) => {
    const sedHelper = new SedHelper(request);

    await sedHelper.sendSed({
      bucType: 'LA_BUC_04',
      sedType: 'A009',
      avsenderLand: 'DE',
      mottakerLand: 'NO',
    });

    // Verify appropriate treatment created
  });

  test('skal journalføre mottatt SED dokument', async ({ request }) => {
    // Verify SED document is journalført in archive
  });
});
```

### Testing Approach: Hybrid
1. **API trigger**: Call mock `/testdata/lagsak` to publish SED to Kafka
2. **Backend processing**: melosys-api consumes and processes
3. **Database verification**: Query to verify case/behandling created
4. **Optional UI**: Navigate to verify case is visible and correct

### SED Types to Test
- A003: Reply to application (most common)
- A009: Information request
- A001: Application
- A008: Certification of coverage

---

## Implementation Order

Recommended order based on dependencies and complexity:

### Week 1-2: Foundation
1. **Search & Navigation** (simplest, reuses existing page objects)
2. **Oppgaver Flow** (builds on forside, moderate complexity)

### Week 3-4: Core Flows
3. **Journalføring** (critical entry point, medium complexity)
4. **SED Helper + Basic Test** (infrastructure for future tests)

### Week 5-6: Complex Flows
5. **FTRL Klage** (builds on existing FTRL patterns)
6. **EU/EØS Unntak** (most complex, needs full workflow)

---

## Shared Infrastructure Needs

### New Constants (add to `constants.ts`)
```typescript
// Search test data
export const SEARCH_TEST_DATA = {
  FNR_MED_SAKER: '30056928150',
  FNR_UTEN_SAKER: '01019012345',
  ORGNR_MED_SAKER: '999999999',
};

// Klage
export const KLAGE_RESULTATER = {
  MEDHOLD: 'KLAGE_MEDHOLD',
  AVVIST: 'KLAGE_AVVIST',
  OVERSENDT: 'KLAGE_OVERSENDT_TIL_KLAGEINSTANSER',
};

// SED types
export const SED_TYPES = {
  A001: 'A001',
  A003: 'A003',
  A009: 'A009',
};
```

### Database Helper Extensions
```typescript
// Add to db-helper.ts
async verifiserJournalpostKnyttet(journalpostId: string): Promise<boolean>;
async verifiserKlageBehandlingOpprettet(fagsakId: string): Promise<boolean>;
async verifiserSedMottatt(rinaDokumentId: string): Promise<boolean>;
async hentSisteSakForBruker(fnr: string): Promise<string | null>;
```

---

## Test Data Management

### Before Each Test
- Database cleanup (handled by fixture)
- Mock data cleanup (handled by fixture)
- Unleash toggles reset (handled by fixture)

### Test-Specific Setup
- Create prerequisite cases via UI or API
- Populate mock service with required data
- Set feature toggles if needed

### Verification Strategy
- UI assertions for user-visible state
- Database queries for backend state
- API calls for process instance status
