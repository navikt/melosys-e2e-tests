# SaksopplysningKilde Race Condition - OptimisticLockingException

**Dato:** 2025-12-08
**Status:** Uløst
**Alvorlighetsgrad:** Medium (forårsaker flaky tester)
**Berørt test:** `eu-eos-skip-fullfort-vedtak.spec.ts`
**GitHub Actions Run:** [#20035039158](https://github.com/navikt/melosys-e2e-tests/actions/runs/20035039158)

## Symptom

Testen `skal fullføre EU/EØS-skip-arbeidsflyt med vedtak` feiler sporadisk med følgende feil i Docker-loggene:

```
[16:32:38.046] e7f832ea-c8fb-4868-92b0-a07888a89df8 | n.n.m.t.g.u.ExceptionMapper | ERROR |
API kall feilet: Row was updated or deleted by another transaction (or unsaved-value mapping was incorrect) : [no.nav.melosys.domain.SaksopplysningKilde#31]
```

Playwright-testen får timeout når den venter på vedtak-API-responsen:

```
page.waitForResponse: Timeout 60000ms exceeded while waiting for event 'response'
  at pages/behandling/eu-eos-behandling.page.ts:427
```

## Rotårsak

### Hibernate OptimisticLockingException

Feilen er en **Hibernate OptimisticLockingException** som oppstår når to tråder forsøker å oppdatere samme `SaksopplysningKilde`-rad samtidig.

### Entitetsstruktur

```
Behandling (Kotlin)
  └── @OneToMany(cascade = ALL)
      saksopplysninger: MutableSet<Saksopplysning>
          └── @OneToMany(cascade = ALL)
              kilder: Set<SaksopplysningKilde>
```

**Viktig:** `SaksopplysningKilde` mangler `@Version`-annotering, noe som gjør at Hibernate bruker rad-nivå sammenligning for optimistisk låsing.

### Konflikterende Prosesser

Når "Fatt vedtak" klikkes for EU/EØS-saker, kjører følgende parallelt:

#### Tråd 1: HTTP Request Thread (synkron)

```
VedtakController.fattVedtak()
  → VedtaksfattingFasade.fattVedtak() [@Transactional]
    → EosVedtakService.fattVedtak()
      → behandlingService.endreStatus(IVERKSETTER_VEDTAK)
        → publiserer BehandlingEndretStatusEvent
          → SaksoppplysningEventListener.lagrePersonopplysninger() [SYNKRON!]
            → saksopplysningerService.lagrePersonopplysninger()
              → Modifiserer behandling.saksopplysninger
```

#### Tråd 2: saksflytThreadPoolTaskExecutor (asynkron)

```
EosVedtakService.fattVedtak()
  → prosessinstansService.opprettProsessinstansIverksettVedtakEos()
    → publiserer ProsessinstansOpprettetEvent
      → ProsessinstansOpprettetListener [@Async, AFTER_COMMIT]
        → ProsessinstansBehandler.behandleProsessinstans()
          → HentRegisteropplysninger.utfoer()
            → RegisteropplysningerService.hentOgLagreOpplysninger()
              → behandling.getSaksopplysninger().removeIf(...) [KONFLIKT!]
              → behandlingService.lagre(behandling)
```

### Sekvensdiagram

```
┌─────────────┐     ┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ HTTP Thread │     │ SaksopplysningEvent │     │ Async Saksflyt   │     │ Database        │
│ (Tråd 1)    │     │ Listener            │     │ (Tråd 2)         │     │                 │
└──────┬──────┘     └──────────┬──────────┘     └────────┬─────────┘     └────────┬────────┘
       │                       │                         │                        │
       │ endreStatus()         │                         │                        │
       │───────────────────────>                         │                        │
       │                       │                         │                        │
       │ publiser event        │                         │                        │
       │───────────────────────>                         │                        │
       │                       │                         │                        │
       │                       │ lagrePersonopplysninger │                        │
       │                       │─────────────────────────────────────────────────>│
       │                       │                         │                        │
       │ opprettProsessinstans │                         │                        │
       │─────────────────────────────────────────────────>                        │
       │                       │                         │                        │
       │ COMMIT                │                         │                        │
       │─────────────────────────────────────────────────────────────────────────>│
       │                       │                         │                        │
       │                       │                         │ hentOgLagreOpplysninger│
       │                       │                         │───────────────────────>│
       │                       │                         │                        │
       │                       │                         │     KONFLIKT!          │
       │                       │                         │<───────────────────────│
       │                       │                         │ OptimisticLockException│
       └                       └                         └                        └
```

## Berørte Filer i melosys-api

| Fil | Beskrivelse |
|-----|-------------|
| `domain/.../SaksopplysningKilde.java` | Entitet uten `@Version` |
| `domain/.../Saksopplysning.java` | Parent med `cascade = ALL` |
| `domain/.../Behandling.kt` | Rot-entitet med saksopplysninger |
| `service/.../SaksoppplysningEventListener.java` | Synkron event listener |
| `service/.../RegisteropplysningerService.kt` | Asynkron oppdatering |
| `saksflyt/.../EosVedtakService.kt` | Orkestrerer vedtak-flyt |

## Hvorfor Testen Er Flaky

Testen passerer på retry fordi timing varierer:
- Noen ganger fullfører Tråd 1 før Tråd 2 starter → ingen konflikt
- På CI med ressurskonkurranse overlapper trådene oftere → konflikt

Skip/sokkel-arbeidsflyten er spesielt utsatt fordi den innebærer flere saksopplysning-oppdateringer enn enklere flyter.

## Anbefalte Løsninger (melosys-api)

### Alternativ 1: Legg til @Version (Enklest)

```java
// SaksopplysningKilde.java
@Entity
public class SaksopplysningKilde {
    @Version
    private Long version;
    // ...
}
```

**Fordeler:** Enkel endring, eksplisitt optimistisk låsing
**Ulemper:** Løser ikke rotårsaken, bare gjør feilen mer forutsigbar

### Alternativ 2: Gjør Event Listener Asynkron (Anbefalt)

```java
// SaksoppplysningEventListener.java
@Async
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void lagrePersonopplysninger(BehandlingEndretStatusEvent event) {
    // ...
}
```

**Fordeler:** Eliminerer overlapp ved å kjøre sekvensielt etter commit
**Ulemper:** Krever verifisering av at rekkefølge ikke påvirker forretningslogikk

### Alternativ 3: Pessimistisk Låsing

```java
// BehandlingRepository
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT b FROM Behandling b WHERE b.id = :id")
Optional<Behandling> findByIdWithLock(@Param("id") Long id);
```

**Fordeler:** Garantert serialisert tilgang
**Ulemper:** Kan påvirke ytelse, potensielle deadlocks

### Alternativ 4: Retry-mekanisme

```java
// RegisteropplysningerService.kt
@Retryable(
    value = [OptimisticLockingFailureException::class],
    maxAttempts = 3,
    backoff = Backoff(delay = 100)
)
fun hentOgLagreOpplysninger(behandling: Behandling) {
    // ...
}
```

**Fordeler:** Håndterer transiente konflikter gracefully
**Ulemper:** Maskerer problemet i stedet for å løse det

## Midlertidig Workaround i E2E-tester

Ingen god workaround fra E2E-siden. Testen er korrekt - feilen er i backend.

Mulige tiltak:
1. Tagge testen med `@known-error` til backend-fix er på plass
2. Øke antall retries i Playwright-konfigurasjon
3. Legge til ekstra ventetid før "Fatt vedtak" (ikke anbefalt - maskerer problemet)

## Referanser

- [GitHub Actions Run #20035039158](https://github.com/navikt/melosys-e2e-tests/actions/runs/20035039158)
- [Hibernate OptimisticLockException Documentation](https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#locking-optimistic)
- [Spring @TransactionalEventListener](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)

## Oppfølging

- [ ] Opprett Jira-sak for melosys-api
- [ ] Diskuter løsningsalternativ med teamet
- [ ] Implementer valgt løsning
- [ ] Verifiser at E2E-test er stabil etter fix
- [ ] Fjern denne dokumentasjonen når løst
