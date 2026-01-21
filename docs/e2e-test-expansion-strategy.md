# E2E Test Expansion Strategy

This document outlines the strategy for expanding e2e test coverage in the Melosys system, based on analysis of current coverage, frontend flows, API operations, and production metrics.

## Current State (14 Tests)

| Category | Tests | Coverage Level |
|----------|-------|----------------|
| EU/EØS (Art. 12.1, 13.1, Maritime) | 5 | Good |
| FTRL (§ 2-8a Outside Treaty Countries) | 4 | Good |
| Trygdeavtale (Bilateral Agreements) | 1 | Minimal |
| Annual Settlement (Årsavregning) | 1 | Minimal |
| Tax Status Changes (Nyvurdering) | 2 | Good |
| Database Utilities | 1 | N/A |

### Current Test Files

```
tests/
├── rengjor-database.spec.ts                    # Database cleanup utility
├── eu-eos/
│   ├── eu-eos-12.1-utsent-arbeidstager-fullfort-vedtak.spec.ts
│   ├── eu-eos-13.1-arbeid-flere-land-fullfort-vedtak.spec.ts
│   ├── eu-eos-13.1-arbeid-flere-land-selvstendig-fullfort-vedtak.spec.ts
│   ├── eu-eos-arbeid-flere-land.spec.ts
│   └── eu-eos-skip-fullfort-vedtak.spec.ts
├── trygdeavtale/
│   └── trygdeavtale-fullfort-vedtak.spec.ts
└── utenfor-avtaleland/
    └── workflows/
        ├── komplett-sak-2-8a.spec.ts
        ├── komplett-sak-flere-land-flereinntektskilder.spec.ts
        ├── nyvurdering-endring-skattestatus.spec.ts
        └── arsavregning-ikke-skattepliktig.spec.ts
```

---

## Gap Analysis

### Completely Untested Major Flows

| Flow | Business Criticality | Complexity | Priority |
|------|---------------------|------------|----------|
| **Journalføring** (Document Registration) | HIGH - Core workflow entry | Medium | 🔴 Critical |
| **Search & Case Lookup** | HIGH - Used constantly | Low | 🔴 Critical |
| **Task/Oppgaver Management** | HIGH - Driver of work | Medium | 🔴 Critical |
| **Pensioner Flows** (All case types) | MEDIUM - Separate population | High | 🟡 Important |
| **Non-working Person (Ikke Yrkesaktiv)** | MEDIUM - Less common | Medium | 🟡 Important |
| **Klage (Appeal) Processing** | HIGH - Legal requirement | High | 🟡 Important |
| **SED Document Handling** | HIGH - EU integration | High | 🟡 Important |
| **Sendbrev (Send Documents)** | MEDIUM - End of flow | Medium | 🟢 Nice to have |

### Untested Process Types (from API metrics)

These process types are tracked in production metrics but have no e2e coverage:

```
MOTTAK_SED              - SED document intake
MOTTAK_SOKNAD_ALTINN    - Altinn application intake
ANMODNING_OM_UNNTAK_*   - Exception requests
JFR_*                   - Journaling processes
IVERKSETT_VEDTAK_*      - Decision implementations (partial)
```

### Missing Trygdeavtale Scenarios

Only Australia is tested. Missing bilateral agreements:
- USA
- Canada
- UK (post-Brexit)
- Other bilateral agreements

---

## Recommended Priority Order

### Tier 1: Critical (Add First)

| # | Test | Rationale |
|---|------|-----------|
| 1 | **Journalføring Complete Flow** | Entry point for most cases |
| 2 | **Search & Case Navigation** | Used in every session |
| 3 | **Task/Oppgaver Flow** | Core workflow driver |
| 4 | **EU/EØS Exception Request** | Article 16, high volume |
| 5 | **FTRL Klage (Appeal)** | Legal requirement |
| 6 | **SED Intake Flow** | Core EU integration |

### Tier 2: Important (Add Second)

| # | Test | Rationale |
|---|------|-----------|
| 7 | **Pensioner EU/EØS Flow** | Different population |
| 8 | **Pensioner FTRL Flow** | Different population |
| 9 | **Non-working Person Flow** | Different treatment path |
| 10 | **Nyvurdering with Changed Decision** | Complex reassessment |
| 11 | **Multiple Trygdeavtale Countries** | USA, Canada, UK |

### Tier 3: Nice to Have (Add Third)

| # | Test | Rationale |
|---|------|-----------|
| 12 | **Sendbrev Document Generation** | End of flow verification |
| 13 | **Healthcare Expense Coverage** | Helseutgift periods |
| 14 | **Multi-year Period Handling** | Edge case coverage |
| 15 | **Failed Process Recovery** | Admin operations |

---

## Production Database Queries

To identify most-used features, run these queries against production:

### Most Common Case Types

```sql
SELECT sakstype, COUNT(*) as antall
FROM fagsak
WHERE opprettet_dato > SYSDATE - 365
GROUP BY sakstype
ORDER BY antall DESC;
```

### Most Common Treatment Themes

```sql
SELECT behandlingstema, COUNT(*) as antall
FROM behandling
WHERE opprettet_dato > SYSDATE - 365
GROUP BY behandlingstema
ORDER BY antall DESC;
```

### Most Common Process Types

```sql
SELECT prosesstype, status, COUNT(*) as antall
FROM prosessinstans
WHERE opprettet_dato > SYSDATE - 365
GROUP BY prosesstype, status
ORDER BY antall DESC;
```

### A1 Certificates by Type

```sql
SELECT a1_type, COUNT(*) as antall
FROM a1_sertifikat
WHERE utstedt_dato > SYSDATE - 365
GROUP BY a1_type
ORDER BY antall DESC;
```

### Failed Process Instances (Error Patterns)

```sql
SELECT prosesstype, COUNT(*) as antall_feilet
FROM prosessinstans
WHERE status = 'FEILET'
AND opprettet_dato > SYSDATE - 365
GROUP BY prosesstype
ORDER BY antall_feilet DESC;
```

---

## Automatic Test Flow Generation

### Option A: Data-Driven from Valid Combinations

Generate tests from `LovligeSakskombinasjoner`:

```typescript
// helpers/test-generator.ts
import { test } from '../fixtures';

interface TestCombination {
  sakstype: 'EU_EOS' | 'FTRL' | 'TRYGDEAVTALE';
  tema: string;
  provision?: string;
}

const validCombinations: TestCombination[] = [
  { sakstype: 'EU_EOS', tema: 'UTSENDT_ARBEIDSTAKER' },
  { sakstype: 'EU_EOS', tema: 'ARBEID_FLERE_LAND' },
  { sakstype: 'FTRL', tema: 'YRKESAKTIV', provision: 'FTRL_2_8_A' },
  { sakstype: 'FTRL', tema: 'PENSJONIST', provision: 'FTRL_2_8_A' },
  { sakstype: 'TRYGDEAVTALE', tema: 'YRKESAKTIV' },
  // ... add from LovligeSakskombinasjoner
];

export function generateTestsForCombinations() {
  validCombinations.forEach(combo => {
    test.describe(`Auto: ${combo.sakstype} - ${combo.tema}`, () => {
      test('complete flow to decision', async ({ page }) => {
        const flow = new FlowBuilder(page)
          .withCaseType(combo.sakstype)
          .withTheme(combo.tema)
          .withProvision(combo.provision)
          .build();

        await flow.createCase();
        await flow.fillMandatoryFields();
        await flow.processToDecision();
        await flow.verify();
      });
    });
  });
}
```

### Option B: FlowBuilder Pattern

Create a composable flow builder for test generation:

```typescript
// helpers/flow-builder.ts
import { Page } from '@playwright/test';
import { HovedsidePage } from '../pages/hovedside.page';
import { OpprettNySakPage } from '../pages/opprett-ny-sak/opprett-ny-sak.page';
import { BehandlingPage } from '../pages/behandling/behandling.page';
import { VedtakPage } from '../pages/vedtak/vedtak.page';

export class FlowBuilder {
  private page: Page;
  private caseType: string;
  private theme: string;
  private provision?: string;
  private country?: string;

  constructor(page: Page) {
    this.page = page;
  }

  withCaseType(type: string): this {
    this.caseType = type;
    return this;
  }

  withTheme(theme: string): this {
    this.theme = theme;
    return this;
  }

  withProvision(provision?: string): this {
    this.provision = provision;
    return this;
  }

  withCountry(country: string): this {
    this.country = country;
    return this;
  }

  build(): TestFlow {
    return new TestFlow(this.page, {
      caseType: this.caseType,
      theme: this.theme,
      provision: this.provision,
      country: this.country,
    });
  }
}

class TestFlow {
  private page: Page;
  private config: FlowConfig;
  private hovedside: HovedsidePage;
  private opprettNySak: OpprettNySakPage;
  private behandling: BehandlingPage;
  private vedtak: VedtakPage;

  constructor(page: Page, config: FlowConfig) {
    this.page = page;
    this.config = config;
    this.hovedside = new HovedsidePage(page);
    this.opprettNySak = new OpprettNySakPage(page);
    this.behandling = new BehandlingPage(page);
    this.vedtak = new VedtakPage(page);
  }

  async createCase(): Promise<void> {
    await this.hovedside.gotoOpprettNySak();
    await this.opprettNySak.opprettSak({
      userId: USER_ID_VALID,
      caseType: this.config.caseType,
      theme: this.config.theme,
    });
  }

  async fillMandatoryFields(): Promise<void> {
    // Dynamic field filling based on case type
    switch (this.config.caseType) {
      case 'EU_EOS':
        await this.fillEuEosFields();
        break;
      case 'FTRL':
        await this.fillFtrlFields();
        break;
      case 'TRYGDEAVTALE':
        await this.fillTrygdeavtaleFields();
        break;
    }
  }

  async processToDecision(): Promise<void> {
    await this.vedtak.fattVedtak();
  }

  async verify(): Promise<void> {
    await this.vedtak.assertions.verifiserVedtakFattet();
  }

  // ... private helper methods
}
```

### Option C: Parameterized Tests

Use Playwright's built-in parameterization:

```typescript
// tests/generated/parameterized-flows.spec.ts
import { test } from '../../fixtures';

const testCases = [
  {
    name: 'EU/EØS Utsendt Arbeidstaker - Sverige',
    sakstype: 'EU_EOS',
    tema: 'UTSENDT_ARBEIDSTAKER',
    land: 'SE',
  },
  {
    name: 'EU/EØS Arbeid Flere Land - Tyskland/Norge',
    sakstype: 'EU_EOS',
    tema: 'ARBEID_FLERE_LAND',
    land: ['DE', 'NO'],
  },
  {
    name: 'FTRL Yrkesaktiv - Afghanistan',
    sakstype: 'FTRL',
    tema: 'YRKESAKTIV',
    land: 'AF',
    provision: 'FTRL_2_8_A',
  },
  // Add more combinations...
];

for (const tc of testCases) {
  test(`${tc.name}`, async ({ page }) => {
    // Use existing page objects with parameterized data
    const hovedside = new HovedsidePage(page);
    await hovedside.gotoOpprettNySak();

    // ... rest of flow with tc parameters
  });
}
```

---

## Proposed New Test Structure

```
tests/
├── rengjor-database.spec.ts
├── core/                              # NEW: Core functionality
│   ├── journalforing.spec.ts
│   ├── sok-og-navigasjon.spec.ts
│   └── oppgaver.spec.ts
├── eu-eos/
│   ├── utsendt-arbeidstaker/
│   │   ├── 12.1-standard.spec.ts
│   │   └── 12.1-skip.spec.ts
│   ├── arbeid-flere-land/
│   │   ├── 13.1-ansatt.spec.ts
│   │   └── 13.1-selvstendig.spec.ts
│   ├── pensjonist/                    # NEW
│   │   └── pensjonist-standard.spec.ts
│   └── unntak/                        # NEW
│       └── anmodning-unntak.spec.ts
├── ftrl/                              # RENAMED from utenfor-avtaleland
│   ├── yrkesaktiv/
│   │   ├── 2-8a-standard.spec.ts
│   │   ├── 2-8a-flere-land.spec.ts
│   │   └── 2-8a-flere-inntektskilder.spec.ts
│   ├── pensjonist/                    # NEW
│   │   └── pensjonist-standard.spec.ts
│   ├── ikke-yrkesaktiv/               # NEW
│   │   └── ikke-yrkesaktiv-standard.spec.ts
│   ├── klage/                         # NEW
│   │   └── klage-standard.spec.ts
│   └── nyvurdering/
│       └── endring-skattestatus.spec.ts
├── trygdeavtale/
│   ├── australia.spec.ts
│   ├── usa.spec.ts                    # NEW
│   ├── canada.spec.ts                 # NEW
│   └── uk.spec.ts                     # NEW
├── aarsavregning/
│   └── ikke-skattepliktig.spec.ts
└── generated/                         # NEW: Auto-generated tests
    └── parameterized-flows.spec.ts
```

---

## Metrics & Monitoring

### Current Production Metrics (Prometheus)

These metrics are tracked in production and can inform test priorities:

| Metric | Location | Purpose |
|--------|----------|---------|
| `melosys_prosessinstanser_feilet` | melosys-api | Failed process instances by type |
| `melosys_eessi_kafka_dlq_antall` | melosys-eessi | Kafka DLQ messages |
| `faktureringskomponenten_faktura_feilet` | fakturering | Failed invoices |

### Metrics Dashboard

The `melosys-console` admin dashboard shows critical metrics:
- Failed process instances (total and by type)
- Kafka DLQ messages (total and by queue type)
- Application health status
- Release information

**File locations:**
- `/melosys-api/config/src/main/kotlin/no/nav/melosys/metrics/MetrikkerNavn.kt`
- `/melosys-console/backend/config/apps/*.json`

### Future Enhancement: E2E Test Metrics

Currently no metrics are collected from e2e test runs. Potential enhancements:
- Test duration tracking
- Failure rate by test/flow
- Flakiness detection
- Coverage trends over time

---

## Implementation Checklist

### Phase 1: Core Flows (Week 1-2)
- [ ] Create `tests/core/` directory
- [ ] Implement `journalforing.spec.ts`
- [ ] Implement `sok-og-navigasjon.spec.ts`
- [ ] Implement `oppgaver.spec.ts`

### Phase 2: Missing Case Types (Week 3-4)
- [ ] Create Page Objects for pensioner flows
- [ ] Implement EU/EØS pensioner test
- [ ] Implement FTRL pensioner test
- [ ] Implement ikke-yrkesaktiv test

### Phase 3: Appeals & Exceptions (Week 5-6)
- [ ] Create Page Objects for klage
- [ ] Implement FTRL klage test
- [ ] Create Page Objects for unntak
- [ ] Implement EU/EØS unntak test

### Phase 4: Bilateral Agreements (Week 7-8)
- [ ] Add USA trygdeavtale test
- [ ] Add Canada trygdeavtale test
- [ ] Add UK trygdeavtale test

### Phase 5: Test Generation (Week 9-10)
- [ ] Implement FlowBuilder
- [ ] Create parameterized test template
- [ ] Generate tests from valid combinations
- [ ] Verify generated tests pass

---

## References

- [melosys-e2e-tests CLAUDE.md](../CLAUDE.md)
- [melosys-api LovligeSakskombinasjoner](../../melosys-api/service/src/main/java/no/nav/melosys/service/lovligekombinasjoner/LovligeSakskombinasjoner.java)
- [melosys-web Routes](../../melosys-web/src/routes/)
- [Prometheus Metrics](../../melosys-api/config/src/main/kotlin/no/nav/melosys/metrics/MetrikkerNavn.kt)
