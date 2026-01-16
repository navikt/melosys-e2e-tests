# Database Queries for E2E Debugging

Oracle database queries for debugging E2E test failures.

## Connection

```bash
docker exec melosys-oracle bash -c "sqlplus -s MELOSYS/melosyspwd@//localhost:1521/freepdb1 << 'EOF'
<query here>
EOF"
```

## Table Structure

```
DESC PROSESSINSTANS;
DESC BEHANDLING;
DESC BEHANDLINGSRESULTAT;
```

## Process Instance Queries

### Check all process instances

```sql
SELECT
    RAWTOHEX(UUID) as UUID,
    PROSESS_TYPE,
    STATUS,
    SIST_FULLFORT_STEG,
    TO_CHAR(REGISTRERT_DATO, 'YYYY-MM-DD HH24:MI:SS') as REGISTRERT
FROM PROSESSINSTANS
ORDER BY REGISTRERT_DATO DESC
FETCH FIRST 10 ROWS ONLY;
```

### Process instance statuses

| Status | Meaning |
|--------|---------|
| KLAR | Ready to execute, not started |
| KJØRER | Currently executing |
| PÅ_VENT | Waiting (locked by another process) |
| FERDIG | Completed successfully |
| FEILET | Failed |

### Expected process types by flow

| Flow | Expected Process Types |
|------|----------------------|
| EU/EØS Vedtak | OPPRETT_SAK, IVERKSETT_VEDTAK_EOS, SEND_BREV |
| FTRL Vedtak | OPPRETT_SAK, IVERKSETT_VEDTAK_FTRL, SEND_BREV |
| Arbeid flere land | OPPRETT_SAK, MOTTA_SED, IVERKSETT_VEDTAK_EOS |

## Behandling Queries

### Check behandling status

```sql
SELECT
    ID,
    STATUS,
    BEH_TYPE,
    BEH_TEMA,
    TO_CHAR(REGISTRERT_DATO, 'YYYY-MM-DD HH24:MI:SS') as REGISTRERT
FROM BEHANDLING
ORDER BY ID DESC
FETCH FIRST 5 ROWS ONLY;
```

### Behandling statuses

| Status | Meaning |
|--------|---------|
| UNDER_BEHANDLING | In progress |
| IVERKSETTER_VEDTAK | Vedtak being created |
| AVSLUTTET | Completed |

## Behandlingsresultat Queries

### Check if vedtak was created

```sql
SELECT
    BEHANDLING_ID,
    RESULTAT_TYPE,
    BEHANDLINGSMAATE,
    FASTSATT_AV_LAND
FROM BEHANDLINGSRESULTAT;
```

### Resultat types

| Type | Meaning |
|------|---------|
| IKKE_FASTSATT | Not determined (vedtak not created) |
| FASTSATT_LOVVALGSLAND | Legislation country determined |
| AVSLAG | Rejection |

## Vedtak Metadata

```sql
SELECT * FROM VEDTAK_METADATA;
```

Empty = vedtak button was never clicked successfully.

## Lovvalgsperiode

```sql
SELECT
    BEH_RESULTAT_ID,
    TO_CHAR(FOM_DATO, 'YYYY-MM-DD') as FOM,
    TO_CHAR(TOM_DATO, 'YYYY-MM-DD') as TOM,
    LOVVALGSLAND,
    LOVVALG_BESTEMMELSE,
    INNVILGELSE_RESULTAT
FROM LOVVALG_PERIODE;
```

## Full State Check Script

Run all checks at once:

```sql
-- Process instances
SELECT 'PROSESSINSTANS' as TBL, PROSESS_TYPE, STATUS, SIST_FULLFORT_STEG FROM PROSESSINSTANS;

-- Behandling
SELECT 'BEHANDLING' as TBL, ID, STATUS, BEH_TEMA FROM BEHANDLING;

-- Result
SELECT 'RESULTAT' as TBL, BEHANDLING_ID, RESULTAT_TYPE FROM BEHANDLINGSRESULTAT;

-- Vedtak
SELECT 'VEDTAK' as TBL, COUNT(*) as CNT FROM VEDTAK_METADATA;

-- Lovvalg
SELECT 'LOVVALG' as TBL, COUNT(*) as CNT FROM LOVVALG_PERIODE;
```
