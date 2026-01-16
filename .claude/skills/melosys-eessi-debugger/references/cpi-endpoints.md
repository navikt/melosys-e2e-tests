# CPI Endpoints Reference

Complete list of `/eux/cpi/...` endpoints that melosys-eessi calls and must be mocked.

## Currently Implemented in melosys-mock

### BUC Operations

```kotlin
// Create new BUC
@PostMapping("/cpi/buc")
fun opprettBucCpi(@RequestParam("BuCType") bucType: String): String

// Get BUC details
@GetMapping("/cpi/buc/{bucId}")
fun hentBucCpi(@PathVariable bucId: String): JsonNode

// Set recipients
@PutMapping("/cpi/buc/{rinaSaksnummer}/mottakere")
fun settMottakereCpi(@PathVariable rinaSaksnummer: String, @RequestParam mottakere: Array<String>)

// Get possible actions
@GetMapping("/cpi/buc/{rinaSaksnummer}/muligeaksjoner")
fun hentMuligeHandlingerCpi(@PathVariable rinaSaksnummer: String): List<String>
```

### SED Operations

```kotlin
// Create new SED
@PostMapping("/cpi/buc/{rinaSaksnummer}/sed")
fun opprettSedCpi(@PathVariable rinaSaksnummer: String, @RequestBody sed: Any): String

// Get SED details
@GetMapping("/cpi/buc/{bucId}/sed/{sedId}")
fun hentSedCpi(@PathVariable bucId: String, @PathVariable sedId: String): JsonNode

// Get SED with attachments
@GetMapping("/cpi/buc/{bucId}/sed/{sedId}/filer")
fun hentSedVedleggCpi(@PathVariable bucId: String, @PathVariable sedId: String): SedMedVedlegg

// Get SED actions
@GetMapping("/cpi/buc/{rinaSaksnummer}/sed/{dokumentId}/handlinger")
fun hentSedHandlingerCpi(@PathVariable rinaSaksnummer: String, @PathVariable dokumentId: String): List<String>

// Send SED
@PostMapping("/cpi/buc/{rinaSaksnummer}/sed/{rinaDokumentId}/send")
fun sendSedCpi(@PathVariable rinaSaksnummer: String, @PathVariable rinaDokumentId: String)

// Add attachment (multipart)
@PostMapping("/cpi/buc/{rinaSaksnummer}/sed/{dokumentId}/vedlegg", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
fun leggTilVedleggCpi(
    @PathVariable rinaSaksnummer: String,
    @PathVariable dokumentId: String,
    @RequestParam("file", required = false) file: MultipartFile?,
    @RequestParam("Filnavn", required = false) filnavn: String?,
    @RequestParam("Filtype", required = false) filtype: String?
): String

// Resend SED
@PostMapping("/cpi/resend/buc/{rinaSaksnummer}/sed/{dokumentId}")
fun resendSed(@PathVariable rinaSaksnummer: String, @PathVariable dokumentId: String)

// Resend multiple SEDs
@PostMapping("/cpi/resend/liste")
fun resendSedListe(@RequestBody sedIds: String)
```

### Utility Endpoints

```kotlin
// Get RINA URL for BUC
@GetMapping("/cpi/url/buc/{rinaSaksnummer}")
fun hentRinaUrlCpi(@PathVariable rinaSaksnummer: String): String

// Get institutions
@GetMapping("/cpi/institusjoner")
fun hentInstitusjonerCpi(
    @RequestParam("BuCType", required = false) bucType: String?,
    @RequestParam("LandKode", required = false) landkode: String?
): JsonNode

// Generate PDF from SED
@PostMapping("/cpi/sed/pdf")
fun genererPdfFraSedCpi(@RequestBody sed: Any): ResponseEntity<ByteArray>
```

## Endpoints in eux-rina-api (May Need Adding)

These are endpoints from eux-rina-api that might be called but aren't yet mocked:

### Potentially Missing

```
GET  /cpi/buc/{id}/sed/{sedId}/pdf           - Get SED as PDF
PUT  /cpi/buc/{id}/sed/{sedId}               - Update SED
DELETE /cpi/buc/{id}                          - Delete BUC
PUT  /cpi/buc/{id}/sensitivsak               - Mark BUC sensitive
GET  /cpi/buc/{id}/sed/{sedId}/vedleggJson   - Get attachments as JSON
POST /cpi/buc/{id}/sed/{sedId}/vedleggJson   - Add attachment as JSON
```

## How to Add New Endpoints

1. Check eux-rina-api for the endpoint signature
2. Add to `EuxRinaApi.kt` in melosys-mock
3. Follow naming convention: `methodNameCpi`
4. Add logging with "CPI:" prefix
5. Return appropriate mock data

### Template

```kotlin
@GetMapping("/cpi/path/{param}")
fun methodNameCpi(@PathVariable param: String): ReturnType {
    log.info("CPI: Description of what this does: $param")
    return mockData
}
```

## SED Types Reference

| SED | Description |
|-----|-------------|
| A001 | Søknad om bestemmelse av lovvalg |
| A002 | Svar på A001 |
| A003 | Svar på søknad om bestemmelse av lovvalg |
| A008 | Videresending av søknad |
| A009 | Forespørsel om informasjon |
| A010 | Svar på A009 |
| X001 | Generell utveksling av informasjon |

## BUC Types Reference

| BUC | Description |
|-----|-------------|
| LA_BUC_01 | Lovvalg for utsendt arbeidstaker |
| LA_BUC_02 | Arbeid i flere land |
| LA_BUC_03 | Videresending av søknad (uses A008) |
| LA_BUC_04 | Unntak fra lovvalg |
