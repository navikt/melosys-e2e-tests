# Melosys-EESSI E2E Integration Plan

## Overview

This document describes the plan to integrate melosys-eessi into the E2E test flow for more realistic end-to-end testing of SED (Structured Electronic Documents) processing.

**Current State:** Tests bypass melosys-eessi by publishing `MelosysEessiMelding` directly to `teammelosys.eessi.v1-local` Kafka topic.

**Target State:** Tests publish `SedHendelse` to `eessibasis-sedmottatt-v1-local`, which melosys-eessi consumes, processes, and publishes to `teammelosys.eessi.v1-local`.

## Architecture

### Current Flow (Simplified)
```
E2E Test → Mock API → Kafka (teammelosys.eessi.v1-local) → melosys-api
                      ↑
                      Bypasses melosys-eessi entirely
```

### Target Flow (Real E2E)
```
E2E Test → Mock API → Kafka (eessibasis-sedmottatt-v1-local) → melosys-eessi
                                                                    ↓
                                                        Fetch SED from Mock EUX API
                                                        Identify person via Mock PDL
                                                        Create journalpost via Mock API
                                                                    ↓
                                                        Kafka (teammelosys.eessi.v1-local)
                                                                    ↓
                                                              melosys-api
```

## Components Involved

### 1. melosys-eessi (already in docker-compose)
- **Profile:** `eessi`
- **Port:** 8081
- **Consumes from:** `eessibasis-sedmottatt-v1-local` (SedHendelse messages)
- **Produces to:** `teammelosys.eessi.v1-local` (MelosysEessiMelding messages)

### 2. melosys-mock (needs updates)
- **Port:** 8083
- **Current EUX endpoints:** `/eux/cpi/buc/*` (wrong path prefix)
- **melosys-eessi expects:** `/eux/buc/*` (without `/cpi`)

### 3. sed-helper.ts (needs updates)
- **Current:** Publishes to wrong topic or uses wrong format
- **Target:** Publish SedHendelse to `eessibasis-sedmottatt-v1-local`

## Gap Analysis

### Mock Endpoint Gaps

melosys-eessi (EuxConsumer) calls these paths on `http://mock:8083/eux`:

| Endpoint | melosys-eessi expects | Mock currently has | Status |
|----------|----------------------|-------------------|--------|
| Get BUC | `/buc/{rinaSaksnummer}` | `/eux/cpi/buc/{bucID}` | ❌ Path mismatch |
| Get SED | `/buc/{rinaSaksnummer}/sed/{dokumentId}` | `/eux/cpi/buc/{bucID}/sed/{sedID}` | ❌ Path mismatch |
| Get SED with attachments | `/buc/{rinaSaksnummer}/sed/{dokumentId}/filer` | `/eux/cpi/buc/{bucID}/sed/{sedID}/filer` | ❌ Path mismatch |
| Get SED PDF | `/buc/{rinaSaksnummer}/sed/{dokumentId}/pdf` | Missing | ❌ Missing |
| **V3 BUC overview** | `/v3/buc/{rinaSaksnummer}/oversikt` | Missing | ❌ Missing |
| Get institutions | `/institusjoner` | `/eux/cpi/institusjoner` | ❌ Path mismatch |
| Send SED | `/buc/{rinaSaksnummer}/sed/{dokumentId}/send` | `/eux/cpi/buc/{rinaSaksnummer}/sed/{rinaDokumentID}/send` | ❌ Path mismatch |
| Get BUC actions | `/buc/{rinaSaksnummer}/muligeaksjoner` | `/eux/cpi/buc/{rinaSaksnummer}/muligeaksjoner` | ❌ Path mismatch |

### Required Mock Updates

1. **Add `/eux/` request mapping** that mirrors `/eux/cpi/` endpoints (simplest solution)
2. **Add V3 BUC overview endpoint:** `GET /eux/v3/buc/{rinaSaksnummer}/oversikt`
3. **Add SED PDF endpoint:** `GET /eux/buc/{rinaSaksnummer}/sed/{dokumentId}/pdf`

## Implementation Plan

### Phase 1: Mock Endpoint Updates (melosys-docker-compose)

**Branch:** `feature/melosys-eessi-mock-endpoints`

#### 1.1 Add EuxApiV2 Controller
Create new controller that maps to `/eux/` without `/cpi`:

```kotlin
// File: mock/src/main/kotlin/no/nav/melosys/melosysmock/eux/EuxApiV2.kt

@RestController
@RequestMapping("/eux")
class EuxApiV2(
    private val euxApi: EuxApi  // Delegate to existing implementation
) {
    @GetMapping("/buc/{bucID}")
    fun hentBuc(@PathVariable bucID: String) = euxApi.hentBuc(bucID)

    @GetMapping("/buc/{bucID}/sed/{sedID}")
    fun hentSed(@PathVariable bucID: String, @PathVariable sedID: String) = euxApi.hentSed(bucID, sedID)

    @GetMapping("/buc/{bucID}/sed/{sedID}/filer")
    fun hentSedVedlegg(@PathVariable bucID: String, @PathVariable sedID: String) = euxApi.hentSedVedlegg(bucID, sedID)

    @GetMapping("/buc/{bucID}/sed/{sedID}/pdf")
    fun hentSedPdf(@PathVariable bucID: String, @PathVariable sedID: String): ResponseEntity<ByteArray> {
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .body(EuxApiV2::class.java.getResource("/dummy.pdf").readBytes())
    }

    @PostMapping("/buc/{bucID}/sed")
    fun opprettSed(@PathVariable bucID: String, @RequestParam sedID: String) = euxApi.opprettBuc(bucID, sedID)

    @GetMapping("/institusjoner")
    fun hentInstitusjoner() = euxApi.hentInstitusjoner()

    @GetMapping("/buc/{rinaSaksnummer}/muligeaksjoner")
    fun hentMuligeHandlinger() = euxApi.hentMuligeHandlinger()

    @PostMapping("/buc/{rinaSaksnummer}/sed/{rinaDokumentID}/send")
    fun sendSed(@PathVariable rinaSaksnummer: String, @PathVariable rinaDokumentID: String) =
        euxApi.sendSed(rinaSaksnummer, rinaDokumentID)
}
```

#### 1.2 Add V3 BUC Overview Endpoint
```kotlin
// Add to EuxApiV2.kt or create new EuxApiV3.kt

@GetMapping("/v3/buc/{rinaSaksnummer}/oversikt")
fun hentBucOversiktV3(@PathVariable rinaSaksnummer: String): RinaSakOversiktV3 {
    // Load BUC and SED data, transform to V3 format
    val buc = ObjectMapper().readTree(FileUtils.hentBuc(rinaSaksnummer))
    return RinaSakOversiktV3(
        sakId = rinaSaksnummer,
        sakType = buc.get("processDefinitionName")?.asText() ?: "LA_BUC_02",
        sakTittel = "Test BUC $rinaSaksnummer",
        erSakseier = "false",
        sakseier = Organisasjon(id = "NO:NAV", navn = "NAV"),
        navinstitusjon = Organisasjon(id = "NO:NAV", navn = "NAV"),
        motparter = listOf(
            Motpart(
                formatertNavn = "DK:1000 - Denmark Social Security",
                motpartId = "DK:1000",
                motpartNavn = "Denmark Social Security",
                motpartLand = "Denmark",
                motpartLandkode = "DK"
            )
        ),
        sedListe = extractSedList(buc),
        sensitiv = false,
        cdmVersjon = "4.2"
    )
}
```

#### 1.3 Add V3 DTOs
```kotlin
// File: mock/src/main/kotlin/no/nav/melosys/melosysmock/eux/dto/v3/RinaSakOversiktV3.kt

data class RinaSakOversiktV3(
    val fnr: String? = null,
    val fornavn: String? = null,
    val etternavn: String? = null,
    val foedselsdato: String? = null,
    val kjoenn: String? = null,
    val erSakseier: String? = null,
    val sakseier: Organisasjon? = null,
    val navinstitusjon: Organisasjon? = null,
    val sakTittel: String? = null,
    val sakType: String? = null,
    val sakId: String? = null,
    val internasjonalSakId: String? = null,
    val sakUrl: String? = null,
    val sistEndretDato: String? = null,
    val motparter: List<Motpart>? = null,
    val sakshandlinger: List<String>? = null,
    val sedListe: List<SedOversikt>? = null,
    val sensitiv: Boolean? = null,
    val cdmVersjon: String? = null
)

data class Motpart(
    val formatertNavn: String? = null,
    val motpartId: String? = null,
    val motpartNavn: String? = null,
    val motpartLand: String? = null,
    val motpartLandkode: String? = null
)

data class Organisasjon(
    val id: String? = null,
    val navn: String? = null
)

data class SedOversikt(
    val sedTittel: String? = null,
    val sedType: String? = null,
    val sedId: String? = null,
    val sedIdParent: String? = null,
    val status: String? = null,
    val sistEndretDato: String? = null,
    val svarsedType: String? = null,
    val svarsedId: String? = null,
    val sedHandlinger: List<String>? = null,
    val vedlegg: List<Vedlegg>? = null,
    val leveranseStatus: String? = null
)

data class Vedlegg(
    val filnavn: String? = null,
    val mimeType: String? = null
)
```

### Phase 2: Update Test Helper (melosys-e2e-tests)

#### 2.1 Create SedHendelse Publisher
Update `sed-helper.ts` to support both flows:

```typescript
// helpers/sed-helper.ts

interface SedHendelseConfig {
  bucType: string;
  sedType: string;
  rinaSakId?: string;
  rinaDokumentId?: string;
  avsenderId?: string;
  avsenderNavn?: string;
  mottakerId?: string;
  mottakerNavn?: string;
  sektorKode?: string;
}

export class SedHelper {
  /**
   * Publish SedHendelse to trigger melosys-eessi flow (recommended for real E2E)
   */
  async publishSedHendelse(config: SedHendelseConfig): Promise<SedResult> {
    const rinaSakId = config.rinaSakId || this.generateRinaSakId();
    const rinaDokumentId = config.rinaDokumentId || this.generateDokumentId();

    const response = await this.request.post(`${this.mockBaseUrl}/testdata/lagsak`, {
      data: {
        sedHendelseDto: {
          bucType: config.bucType,
          sedType: config.sedType,
          avsenderId: config.avsenderId || 'DK:1000',
          avsenderNavn: config.avsenderNavn || 'Denmark Social Security',
          mottakerId: config.mottakerId || 'NO:NAV',
          mottakerNavn: config.mottakerNavn || 'NAV',
          rinaDokumentId: rinaDokumentId,
          rinaDokumentVersjon: '1',
          sektorKode: config.sektorKode || 'LA',
          rinaSakId: rinaSakId,
        }
      },
    });

    return {
      success: response.ok(),
      rinaSakId,
      rinaDokumentId,
    };
  }

  /**
   * Publish MelosysEessiMelding directly (bypasses melosys-eessi)
   * Use for faster tests that don't need melosys-eessi validation
   */
  async publishMelosysEessiMelding(config: MelosysEessiMeldingConfig): Promise<SedResult> {
    // Existing implementation
  }
}
```

### Phase 3: Enable melosys-eessi Profile

#### 3.1 Update docker-compose commands

When running with melosys-eessi:
```bash
# In melosys-docker-compose
docker-compose --profile eessi up -d
```

#### 3.2 Update CI workflow (if needed)
```yaml
# In .github/workflows/e2e-tests.yml
- name: Start Docker Services with EESSI
  run: |
    docker compose --profile eessi up -d
```

### Phase 4: Create E2E Tests

#### 4.1 New Test File: `tests/sed/mottak-sed-via-eessi.spec.ts`

```typescript
import { test, expect } from '../../fixtures';
import { SedHelper, SED_SCENARIOS } from '../../helpers/sed-helper';

test.describe('SED Mottak via melosys-eessi', () => {
  test('should process A003 SED through full eessi flow', async ({ request }) => {
    const sedHelper = new SedHelper(request);

    // Publish SedHendelse (triggers melosys-eessi)
    const result = await sedHelper.publishSedHendelse({
      bucType: 'LA_BUC_02',
      sedType: 'A003',
      avsenderId: 'DK:1000',
    });

    expect(result.success).toBe(true);

    // Wait for melosys-eessi to process and publish to melosys-api
    // This takes longer than direct publishing
    const processResult = await sedHelper.waitForProcess({
      processType: 'MOTTAK_SED',
      timeoutMs: 60000,  // melosys-eessi needs more time
    });

    expect(processResult.status).toBe('COMPLETED');
    expect(processResult.processType).toBe('MOTTAK_SED');
  });

  test('should trigger ARBEID_FLERE_LAND_NY_SAK for A003', async ({ request }) => {
    const sedHelper = new SedHelper(request);

    const result = await sedHelper.publishSedHendelse({
      bucType: 'LA_BUC_02',
      sedType: 'A003',
    });

    expect(result.success).toBe(true);

    // Wait for the downstream process
    const processResult = await sedHelper.waitForProcess({
      processType: 'ARBEID_FLERE_LAND_NY_SAK',
      timeoutMs: 90000,
    });

    expect(processResult.status).toBe('COMPLETED');
  });
});
```

## Test Data Requirements

### SED JSON Files
The mock needs realistic SED JSON that matches test persons in PDL:

1. **sedA003.json** - Must contain person data (fnr, name, birthdate) that:
   - Matches a test person in PDL mock (e.g., `30056928150`)
   - Has valid period dates
   - Has correct BUC/SED type references

2. **buc_default.json** - Must contain:
   - Valid document list with SED references
   - Creator organization info
   - Status information

### PDL Mock Data
Ensure PDL mock returns valid person for the fnr in SED:
- Person exists
- Has aktørId
- Has valid citizenship info

## Verification Checklist

- [ ] melosys-eessi starts without errors (profile=eessi)
- [ ] Mock EUX endpoints respond at `/eux/buc/*`
- [ ] Mock V3 endpoint responds at `/eux/v3/buc/{id}/oversikt`
- [ ] SedHendelse published to `eessibasis-sedmottatt-v1-local` is consumed by melosys-eessi
- [ ] melosys-eessi successfully fetches SED from mock
- [ ] melosys-eessi successfully identifies person via PDL mock
- [ ] melosys-eessi publishes MelosysEessiMelding to `teammelosys.eessi.v1-local`
- [ ] melosys-api consumes message and triggers MOTTAK_SED
- [ ] ARBEID_FLERE_LAND_NY_SAK is triggered for A003 SED

## Rollback Plan

If melosys-eessi integration causes issues:
1. Tests can still use `publishMelosysEessiMelding()` to bypass melosys-eessi
2. Docker-compose can run without `--profile eessi` to exclude melosys-eessi
3. CI can be configured to use either flow

## Timeline Estimate

| Phase | Tasks | Complexity |
|-------|-------|------------|
| Phase 1 | Mock endpoint updates | Medium |
| Phase 2 | Test helper updates | Low |
| Phase 3 | Profile configuration | Low |
| Phase 4 | E2E test creation | Medium |

## References

- [SED-KAFKA-TESTING-OPTIONS.md](./SED-KAFKA-TESTING-OPTIONS.md) - Original investigation
- [PRODUCTION-METRICS-COVERAGE.md](./PRODUCTION-METRICS-COVERAGE.md) - Priority process types
- melosys-eessi source: `/Users/rune/source/nav/melosys-eessi`
- melosys-mock source: `/Users/rune/source/nav/melosys-docker-compose/mock`
