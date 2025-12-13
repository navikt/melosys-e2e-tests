# SED Kafka Testing Options

**STATUS: ✅ IMPLEMENTED** (2025-12-11)

The new mock endpoint `POST /testdata/lag-melosys-eessi-melding` is working and triggers MOTTAK_SED successfully.

**Branch:** `feature/melosys-eessi-melding-producer` in melosys-docker-compose

---

## Problem Statement (RESOLVED)

The current SED testing flow didn't trigger `MOTTAK_SED` or `ARBEID_FLERE_LAND_NY_SAK` processes in melosys-api because:

| Component | Kafka Topic | Message Format |
|-----------|-------------|----------------|
| **melosys-mock publishes to** | `eessibasis-sedmottatt-v1-local` | `SedHendelse` |
| **melosys-api consumes from** | `teammelosys.eessi.v1-local` | `MelosysEessiMelding` |

**The gap:** These are different topics with different message formats. Normally `melosys-eessi` bridges them, but it's not in docker-compose.

---

## Option A: kafka-ui Web Interface

**Access:** http://localhost:8087

**Capabilities:**
- View topics and messages
- Manually send messages to any topic
- Monitor consumer groups and lag

**How to use:**
1. Navigate to http://localhost:8087
2. Select "local" cluster → Topics → `teammelosys.eessi.v1-local`
3. Click "Produce Message"
4. Paste valid `MelosysEessiMelding` JSON

**Assessment:** Possible for debugging/one-off tests, but tedious for automated E2E testing.

---

## Option B: Add New Mock Endpoint ✅ IMPLEMENTED

Created new endpoint in melosys-mock that publishes directly to `teammelosys.eessi.v1-local`.

### Required Changes in melosys-docker-compose/mock

**1. New Kafka Producer:**
```kotlin
// File: mock/src/main/kotlin/no/nav/melosys/melosysmock/eux/kafka/MelosysEessiMeldingProducer.kt

package no.nav.melosys.melosysmock.eux.kafka

import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.kafka.clients.producer.KafkaProducer
import org.apache.kafka.clients.producer.ProducerRecord
import org.apache.kafka.common.serialization.StringSerializer
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class MelosysEessiMeldingProducer(
    @Value("\${kafka.brokers}") private val brokersUrl: String
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val objectMapper = ObjectMapper().findAndRegisterModules()
    private val producer = KafkaProducer<String, String>(
        mapOf(
            "bootstrap.servers" to brokersUrl,
            "key.serializer" to StringSerializer::class.java.canonicalName,
            "value.serializer" to StringSerializer::class.java.canonicalName
        )
    )

    fun produserMelding(melding: MelosysEessiMeldingDto) {
        val jsonString = objectMapper.writeValueAsString(melding)
        val res = producer.send(
            ProducerRecord("teammelosys.eessi.v1-local", jsonString)
        )
        val offset = res.get().offset()
        log.info("Published MelosysEessiMelding to teammelosys.eessi.v1-local, offset: $offset")
    }
}
```

**2. New REST Controller:**
```kotlin
// File: mock/src/main/kotlin/no/nav/melosys/melosysmock/testdata/LagMelosysEessiMeldingController.kt

package no.nav.melosys.melosysmock.testdata

import io.swagger.annotations.Api
import io.swagger.annotations.ApiModelProperty
import no.nav.melosys.melosysmock.eux.kafka.MelosysEessiMeldingProducer
import org.slf4j.LoggerFactory
import org.springframework.web.bind.annotation.*
import java.time.LocalDate
import kotlin.random.Random

@RestController
@RequestMapping("/testdata")
@Api("Test data generators for MelosysEessiMelding")
class LagMelosysEessiMeldingController(
    private val producer: MelosysEessiMeldingProducer
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @PostMapping("/lag-melosys-eessi-melding")
    fun lagMelosysEessiMelding(@RequestBody request: MelosysEessiMeldingRequestDto) {
        val melding = MelosysEessiMeldingDto(
            sedId = request.sedId ?: randomId(),
            sequenceId = request.sequenceId ?: 1,
            rinaSaksnummer = request.rinaSaksnummer ?: randomId(),
            avsender = AvsenderDto(
                avsenderID = request.avsenderId ?: "DK:1000",
                landkode = request.landkode ?: "DK"
            ),
            journalpostId = request.journalpostId ?: randomId(),
            aktoerId = request.aktoerId ?: "1111111111111",
            statsborgerskap = request.statsborgerskap?.map { StatsborgerskapDto(it) }
                ?: listOf(StatsborgerskapDto(request.landkode ?: "DK")),
            arbeidssteder = emptyList(),
            arbeidsland = request.arbeidsland?.map { ArbeidslandDto(it) } ?: emptyList(),
            periode = if (request.periodeFom != null && request.periodeTom != null) {
                PeriodeDto(request.periodeFom, request.periodeTom)
            } else null,
            lovvalgsland = request.lovvalgsland ?: "DK",
            artikkel = request.artikkel ?: "13_1_a",
            erEndring = request.erEndring ?: false,
            midlertidigBestemmelse = request.midlertidigBestemmelse ?: false,
            x006NavErFjernet = request.x006NavErFjernet ?: false,
            bucType = request.bucType ?: "LA_BUC_02",
            sedType = request.sedType ?: "A003",
            sedVersjon = request.sedVersjon ?: "1"
        )

        producer.produserMelding(melding)
        log.info("Created MelosysEessiMelding: sedId=${melding.sedId}, sedType=${melding.sedType}, bucType=${melding.bucType}")
    }

    private fun randomId() = Random.nextLong(1, 999999999).toString()
}

// DTOs matching MelosysEessiMelding structure
data class MelosysEessiMeldingRequestDto(
    val sedId: String? = null,
    val sequenceId: Int? = null,
    val rinaSaksnummer: String? = null,
    val avsenderId: String? = null,
    val landkode: String? = null,
    val journalpostId: String? = null,
    val aktoerId: String? = null,
    val statsborgerskap: List<String>? = null,
    val arbeidsland: List<String>? = null,
    val periodeFom: LocalDate? = null,
    val periodeTom: LocalDate? = null,
    val lovvalgsland: String? = null,
    val artikkel: String? = null,
    val erEndring: Boolean? = null,
    val midlertidigBestemmelse: Boolean? = null,
    val x006NavErFjernet: Boolean? = null,
    val bucType: String? = null,
    val sedType: String? = null,
    val sedVersjon: String? = null
)

data class MelosysEessiMeldingDto(
    val sedId: String,
    val sequenceId: Int,
    val rinaSaksnummer: String,
    val avsender: AvsenderDto,
    val journalpostId: String,
    val dokumentId: String? = null,
    val gsakSaksnummer: Long? = null,
    val aktoerId: String,
    val statsborgerskap: List<StatsborgerskapDto>,
    val arbeidssteder: List<Any> = emptyList(),
    val arbeidsland: List<ArbeidslandDto> = emptyList(),
    val periode: PeriodeDto? = null,
    val lovvalgsland: String,
    val artikkel: String? = null,
    val erEndring: Boolean = false,
    val midlertidigBestemmelse: Boolean = false,
    val x006NavErFjernet: Boolean = false,
    val ytterligereInformasjon: String? = null,
    val bucType: String,
    val sedType: String,
    val sedVersjon: String,
    val svarAnmodningUnntak: Any? = null,
    val anmodningUnntak: Any? = null
)

data class AvsenderDto(val avsenderID: String, val landkode: String)
data class StatsborgerskapDto(val landkode: String)
data class ArbeidslandDto(val land: String, val arbeidssted: String? = null)
data class PeriodeDto(val fom: LocalDate, val tom: LocalDate)
```

**Usage from E2E tests:**
```bash
curl -X POST http://localhost:8083/testdata/lag-melosys-eessi-melding \
  -H "Content-Type: application/json" \
  -d '{
    "sedType": "A003",
    "bucType": "LA_BUC_02",
    "rinaSaksnummer": "12345678",
    "lovvalgsland": "DK",
    "periodeFom": "2025-01-01",
    "periodeTom": "2026-12-31"
  }'
```

**Effort:** 2-3 hours

---

## Option C: Run melosys-eessi Locally

Run melosys-eessi as a separate process alongside docker-compose.

**Steps:**
```bash
# Terminal 1: Start docker-compose
cd melosys-docker-compose
make start-all

# Terminal 2: Start melosys-eessi
cd melosys-eessi
mvn spring-boot:run -Dspring-boot.run.profiles=local-mock
```

**Assessment:** Works but requires:
- melosys-eessi repo cloned
- PostgreSQL schema setup for melosys-eessi
- Manual process management
- More memory usage

**Effort:** 4-6 hours initial setup

---

## Sample MelosysEessiMelding JSON

### Minimal A003 (Work in Multiple Countries)

```json
{
  "sedId": "doc-a003-001",
  "sequenceId": 1,
  "rinaSaksnummer": "12345678",
  "avsender": {
    "avsenderID": "DK:1000",
    "landkode": "DK"
  },
  "journalpostId": "JP-001",
  "aktoerId": "1111111111111",
  "statsborgerskap": [{"landkode": "DK"}],
  "arbeidssteder": [],
  "arbeidsland": [{"land": "NO"}],
  "periode": {
    "fom": "2025-01-01",
    "tom": "2026-12-31"
  },
  "lovvalgsland": "DK",
  "artikkel": "13_1_a",
  "erEndring": false,
  "midlertidigBestemmelse": false,
  "x006NavErFjernet": false,
  "bucType": "LA_BUC_02",
  "sedType": "A003",
  "sedVersjon": "1"
}
```

### Required Fields for MOTTAK_SED

Based on `MelosysEessiMelding.kt` error() calls:
- `sedId` - Unique SED identifier
- `sedType` - SED type (A003, A009, etc.)
- `sedVersjon` - Version (usually "1")
- `journalpostId` - Reference to journalpost
- `aktoerId` - Person's aktør ID
- `rinaSaksnummer` - RINA case number
- `lovvalgsland` - Country code (DK, SE, etc.)
- `periode` - Period with fom/tom dates
- `bucType` - BUC type (LA_BUC_02, etc.)
- `avsender` - With avsenderID and landkode
- `statsborgerskap` - List of citizenships

---

## Recommendation ✅ COMPLETED

**Option B (New Mock Endpoint) has been implemented** in branch `feature/melosys-eessi-melding-producer`:

**Commits:**
1. `ccb57da` - Add MelosysEessiMelding producer
2. `cb8e923` - Add mock journalpost creation
3. `c7b0da6` - Fix endpoint path (`/api` prefix)
4. `0400442` - Add SED grunnlag and related endpoints

**Why Option B was chosen:**

1. Fastest to implement (2-3 hours)
2. Easiest to use in E2E tests (simple HTTP call)
3. No external dependencies
4. Swagger UI for manual testing
5. Can coexist with existing SedHendelse flow

**Implementation order:**
1. Create PR to melosys-docker-compose with new endpoint ✅
2. Rebuild mock: `mvn install -f mock/pom.xml` ✅
3. Update sed-helper.ts in E2E tests to use new endpoint ✅
4. Verify MOTTAK_SED triggers ✅

---

## E2E Test Helper Usage (Updated 2025-12-12)

The `sed-helper.ts` has been updated to use the new endpoint. Example usage:

```typescript
import { test, expect } from '../../fixtures';
import { SedHelper, SED_SCENARIOS } from '../../helpers/sed-helper';

test('should process incoming A003 SED', async ({ request }) => {
  const sedHelper = new SedHelper(request);

  // Option 1: Use predefined scenarios
  const result = await sedHelper.sendSed(SED_SCENARIOS.A003_MINIMAL);

  // Option 2: Custom configuration
  const result2 = await sedHelper.sendSed({
    sedType: 'A003',
    bucType: 'LA_BUC_02',
    landkode: 'SE',
    lovvalgsland: 'SE',
    fnr: '30056928150',
  });

  expect(result.success).toBe(true);
  console.log(`SED sent: sedId=${result.sedId}, journalpostId=${result.journalpostId}`);

  // Wait for process to complete using E2E Support API
  const response = await request.get(
    'http://localhost:8080/internal/e2e/process-instances/await?timeoutSeconds=60&expectedInstances=1',
    { failOnStatusCode: false }
  );

  const data = await response.json();
  expect(data.status).toBe('COMPLETED');
});
```

**Available SED Scenarios:**
- `A003_MINIMAL` - Basic A003, all defaults
- `A003_FRA_SVERIGE` - A003 from Sweden (LA_BUC_02)
- `A003_MED_PERSON` - A003 with specific fnr
- `A009_FRA_TYSKLAND` - Information request from Germany
- `A001_FRA_DANMARK` - Application from Denmark
- `A003_UNNTAK_FRA_SVERIGE` - Exception request (LA_BUC_04)

**Process Types Triggered:**
- `MOTTAK_SED` - Always triggered for incoming SED
- `ARBEID_FLERE_LAND_NY_SAK` - For work in multiple countries
- `ANMODNING_OM_UNNTAK_MOTTAK_NY_SAK` - For exception requests

---

## References

- `melosys-api/integrasjonstest/src/test/kotlin/no/nav/melosys/itest/SedMottakTestIT.kt` - Example tests
- `melosys-api/domain/src/main/kotlin/no/nav/melosys/domain/eessi/melding/MelosysEessiMelding.kt` - Message format
- `melosys-docker-compose/mock/src/main/kotlin/no/nav/melosys/melosysmock/eux/kafka/EessiSedMottattProducer.kt` - Existing producer pattern
