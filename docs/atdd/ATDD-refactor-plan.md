# ATDD Migration Plan — Dave Farley's Four-Layer Model

**Created:** 2026-03-20
**Revised:** 2026-05-07 — Corrected Layer 1 and 2 based on Farley's actual course examples.
**Revised:** 2026-07-07 — Reconciled with the implemented example (see reconciliation banner below).

> ## ⚠️ Reconciliation (2026-07-07) — where this doc and the built example disagree, follow the example
>
> Et komplett, kjørbart eksempel er nå implementert i `atdd/`, `features/trygdeavtale/`
> og dokumentert i [`README.md`](README.md). Under bygging viste det seg at deler av
> denne planen fulgte en tenkt design snarere enn koden. **Koden + `README.md` er
> autoritative.** Konkrete avvik:
>
> - **Importregel (Lag 2 → drivere, IKKE POM-er).** Denne planens skisse (bl.a.
>   `SakDsl` som importerer POM-er direkte, og importreglene i «Rules of Engagement»)
>   er feil og motsier sitt eget lag-diagram + Farleys `BookShoppingDsl → BookShopDriver`.
>   Riktig, implementert regel: **steg importerer kun DSL-fixturen; DSL importerer kun
>   driveren; driveren importerer POMs/helpers.** `atdd/drivers/`-laget beholdes.
> - **`Params`/alias/sekvens-maskineri (Decision 6 / §1c) er IKKE adoptert.** Det løser
>   delt-miljø-/Java-varargs-problemer denne suiten ikke har (DB renses per test;
>   playwright-bdd har typede capture-grupper). Overstyringer uttrykkes i stedet som
>   komponerbare `Og`-Given-steg (`oppgiPeriode`) med TypeScript-defaults.
> - **Ingen egen `DslContext`-klasse er adoptert.** Med kun én DSL-klasse bor delt
>   flyt-tilstand som private felt på DSL-en (scenario-scoped via fixturen). Introduser
>   DslContext først hvis/ når DSL-en splittes (en senere fase).
> - **Eksempel-scenarioene her (§1f, Example 1–2) er på HVORDAN-nivå** (wizard-gjennomgang,
>   lekket teknisk verdi `"Test"`). Den implementerte feature-en er på intent-nivå — tekniske
>   koder (enum/bestemmelse) mappes fra lesbare navn inne i DSL-en.
> - **Fase 3/4 «migrer alle tester + slett `tests/`» er overreach.** Beslutningen er
>   **sameksistens**: eksempelet er opt-in (`npm run test:bdd`), de gamle `.spec.ts`-testene
>   beholdes, og `tests/` slettes ikke. Sikt mot «nøkkel-akseptanseflyter», ikke full migrering.
> - **«Parallell kjøring»-gevinsten er irrelevant** (`workers: 1`).
> - **`npx bddgen &&`-steget er korrekt og MÅ beholdes** — generering skjer kun via
>   `bddgen` CLI, ikke av `defineBddConfig`. `npm run test:bdd` gjør dette riktig.

**Vision:** Restructure melosys-e2e-tests to follow Dave Farley's four-layer Acceptance Test Driven Development model so that tests are executable specifications written in structured text, readable by domain experts, and fully decoupled from implementation.

**Reference implementations:**
- https://github.com/davef77/atdd-course-examples (Java — BookShopping, Accounting, with Cucumber)
- https://github.com/davef77/Flight-Search-ATDD (Python — Flight Search)

---

## Table of Contents

1. [The Four-Layer Model](#the-four-layer-model)
2. [What Farley's Examples Actually Show](#what-farleys-examples-actually-show)
3. [Current State — Where We Are Today](#current-state--where-we-are-today)
4. [Gap Analysis](#gap-analysis)
5. [Target Architecture](#target-architecture)
6. [Migration Phases](#migration-phases)
7. [Concrete Examples — Before & After](#concrete-examples--before--after)
8. [Design Decisions](#design-decisions)
9. [Rules of Engagement](#rules-of-engagement)

---

## The Four-Layer Model

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1 — TEST CASES (Structured text)                  │
│  Executable specifications in domain language.            │
│  NOT code. Readable by domain experts.                   │
│  Features describe capabilities (what and why).          │
│  Scenarios are concrete examples (Given / When / Then).  │
│  Gherkin (.feature files) is one well-proven option.     │
├─────────────────────────────────────────────────────────┤
│  Layer 2 — DOMAIN-SPECIFIC LANGUAGE (DSL)               │
│  Bindings + DSL classes.                                 │
│  Bindings are thin glue: they map structured text        │
│  to DSL method calls.                                    │
│  DSL classes provide domain-language methods, hold        │
│  shared state (DslContext), use defaults heavily,        │
│  and delegate all work to protocol drivers.              │
├─────────────────────────────────────────────────────────┤
│  Layer 3 — PROTOCOL DRIVERS & STUBS                     │
│  Translators/adapters that convert between the DSL       │
│  and the real system. ALL technical knowledge lives here.│
│  POMs, helpers, database queries, API calls.             │
├─────────────────────────────────────────────────────────┤
│  Layer 4 — SYSTEM UNDER TEST (SUT)                      │
│  The actual Melosys services deployed like production.    │
│  Docker Compose stack (17 services).                     │
└─────────────────────────────────────────────────────────┘
```

---

## What Farley's Examples Actually Show

Understanding the real pattern requires examining the reference implementations. Here is the complete chain from Farley's `atdd-course-examples` repo.

### Layer 1 — Test Case: `OrderBook.feature` (structured text, NOT code)

```gherkin
Feature: Add Book to Shopping-Basket
    As a book-buyer
    I would like to select a book and add it to my shopping-basket
    So that I can pay for it later

Scenario:
    Given I search for books about "Continuous Delivery"
    And I select a book by "David Farley"

    When I add my selected book to my shopping-basket

    Then I can see the book "Continuous Delivery" listed in my shopping-basket
```

Key characteristics:
1. **This is not code.** It is structured text in domain language.
2. **A domain expert wrote this.** No programming knowledge required.
3. **Gitt/Når/Så (Given/When/Then)** separates setup, action, and verification.
4. **Parameters are in quotes** — `"Continuous Delivery"`, `"David Farley"`.
5. **The feature description** explains the user story: who, what, why.
6. **This IS the specification.** The rest of the layers exist only to make this executable.

### Bindings — Thin glue between text and DSL (`AddBookToBasketSteps.java`)

> **Note:** Farley's examples use Cucumber, which calls these "step definitions." We use the format-agnostic term **bindings** — the concept is the same: thin glue that maps structured text to DSL method calls.

```java
public class AddBookToBasketSteps {
    private CucumberDsl dsl = new CucumberDsl();

    @Given("^I search for books about \"([^\"]*)\"$")
    public void i_search_for_books_about(String subject) throws Throwable {
        dsl.shopping.searchForBook(subject);
    }

    @Given("^I select a book by \"([^\"]*)\"$")
    public void i_select_a_book_by(String author) throws Throwable {
        dsl.shopping.selectBook(author);
    }

    @When("^I add my selected book to my shopping-basket$")
    public void i_add_my_selected_book_to_my_shopping_basket() throws Throwable {
        dsl.shopping.addSelectedItemToShoppingBasket();
    }

    @Then("^I can see the book \"([^\"]*)\" listed in my shopping-basket$")
    public void i_can_see_the_book_listed_in_my_shopping_basket(String title) throws Throwable {
        dsl.shopping.assertItemListedInShoppingBasket(title);
    }
}
```

Key characteristics:
1. **Each binding is a one-liner** — it just delegates to the DSL.
2. **No logic in bindings.** They are mechanical mapping from text to DSL calls.
3. **The regex captures** extract parameters from the Gherkin text.
4. **The `CucumberDsl`** class instantiates the DSL objects, similar to the `Dsl` base class in the non-Cucumber examples.

### Layer 2 — DSL Class: `BookShoppingDsl.java`

```java
public class BookShoppingDsl {
    private final Params.DslContext context = new Params.DslContext();
    private final BookShopDrivers driver;

    public BookShoppingDsl(BookShopDrivers drivers) {
        this.driver = drivers;
    }

    public void searchForBook(String... args) {
        Params params = new Params(context, args);
        String title = params.Optional("title", "Continuous Delivery");
        driver.searchForBook(title);
    }

    public void selectBook(String... args) {
        Params params = new Params(context, args);
        String author = params.Optional("author", "David Farley");
        driver.selectBook(author);
    }

    public void addSelectedItemToShoppingBasket() {
        driver.addSelectedItemToShoppingBasket();
    }

    public void assertItemListedInShoppingBasket(String... args) {
        Params params = new Params(context, args);
        String item = params.Optional("item", "Continuous Delivery");
        driver.assertListedInShoppingBasket(item);
    }
}
```

Key characteristics:
1. **It is a class** — holds shared state (`DslContext`) and delegates to drivers.
2. **Each method = one domain concept** — not multi-step orchestration.
3. **Heavy defaults** — `params.Optional("title", "Continuous Delivery")`.
4. **Assertions are DSL methods** — `assertItemListedInShoppingBasket`.
5. **Delegates to protocol drivers** — no implementation logic here.

### Another Layer 2 example — `InvoicesDsl.java`

```java
public class InvoicesDsl {
    private final Params.DslContext context;
    private final AccountingSystemProtocolDriver driver;

    public void createAuthorisedAccount(String... args) {
        Params params = new Params(context, args);
        String name = params.Alias("name");          // Creates alias in context
        String role = params.Optional("role", "Accountant");
        driver.createAuthorisedAccount(name, password, role);
    }

    public void submitInvoice(String... args) {
        Params params = new Params(context, args);
        String userName = params.Alias("name");      // Looks up alias
        String invoice = params.Optional("invoice", "anInvoice");
        String invoiceNumber = params.OptionalSequence("InvoiceNo", 1);
        List<String> items = params.OptionalList("item", new String[] {"item1"});
        driver.submitInvoice(userName, invoice, ...);
    }
}
```

Shows: aliases, sequences, list parameters — all managed by shared `DslContext`.

### Layer 3 — Protocol Driver: `BookShopDriver.java`

```java
public interface BookShopDriver {
    void searchForBook(String title);
    void selectBook(String author);
    void addSelectedItemToShoppingBasket();
    void assertListedInShoppingBasket(String item);
    void checkOut(String item, String price, Card card);
    void assertItemPurchased(String item);
}
```

Multiple implementations exist (Amazon, BookDepository, MyLocalBookStore) — the DSL doesn't know which one runs. In our case: POMs, helpers, database queries.

---

## Current State — Where We Are Today

### What maps to each layer

| Layer | What exists today | Directory |
|-------|------------------|-----------|
| **1 — Test Cases** | **Does not exist.** No structured text specifications. Tests are TypeScript code. | — |
| **2 — DSL** | **Does not exist.** No DSL classes, no bindings, no DslContext. | — |
| **3 — Protocol Drivers** | POMs, Helpers, fixtures, BasePage, assertions framework | `pages/`, `helpers/`, `fixtures/`, `utils/` |
| **4 — SUT** | Docker Compose stack (17 services, same images as prod) | `docker-compose.yml` |

### What's already strong

**Layer 4 (SUT) — Excellent.** The Docker Compose stack mirrors production: real Oracle DB, real Kafka, real Unleash, mock-oauth2 for auth. No gap here.

**Layer 3 (Protocol Drivers) — Solid.** We have:
- `pages/` — Full POM coverage for all workflows (these are protocol drivers)
- `fixtures/cleanup.ts` — auto-cleans database, mock data, Unleash toggles
- `fixtures/docker-logs.ts` — monitors all service logs for errors per test
- `fixtures/known-error.ts` — handles `@known-error` tagged tests
- `helpers/db-helper.ts` — Oracle database query/cleanup
- `helpers/mock-helper.ts` — mock service data management
- `helpers/api-helper.ts` — admin API + process instance polling
- `helpers/unleash-helper.ts` — feature toggle control
- `helpers/auth-helper.ts` — authentication
- `helpers/sed-helper.ts` — SED/EESSI message helpers
- `utils/assertions.ts` — error assertion framework
- `pages/shared/base.page.ts` — console monitoring, step transitions, dropdown polling

**Layer 2 (DSL) — Does not exist.** POMs are protocol drivers (Layer 3), not DSL. They know about UI elements — selectors, buttons, form fields. A DSL provides domain-language vocabulary independent of UI implementation.

**Layer 1 (Test Cases) — Does not exist.** Current test files are TypeScript code calling POMs directly. They are not structured text that a domain expert can read or write.

---

## Gap Analysis

### Layer 1 — No structured text specifications exist

Tests today are TypeScript code:

```typescript
await hovedside.goto();
await hovedside.klikkOpprettNySak();
await opprettSak.fyllInnBrukerID(USER_ID_VALID);
await opprettSak.velgSakstype('EU_EOS');
await opprettSak.velgBehandlingstema('ARBEID_FLERE_LAND');
```

A domain expert cannot read, write, or verify this. It requires understanding of TypeScript, async/await, POM architecture, and Playwright.

What should exist instead (example using Gherkin, which is one well-proven option):

```gherkin
# language: no
Egenskap: EU/EØS arbeid i flere land
    Som en saksbehandler
    ønsker jeg å opprette en EU/EØS-sak for arbeid i flere land
    slik at bruker får et vedtak om lovvalg

Scenario: Opprett og fullfør EU/EØS-sak med vedtak
    Gitt en ny behandling av type "EU/EØS" med tema "Arbeid i flere land"
    Og land "Estland" og "Norge" er valgt
    Og perioden er fra "01.01.2024" til "31.12.2025"

    Når saken innvilges med lovvalg "Norge"
    Og vedtak fattes

    Så er vedtaket registrert
```

### Layer 2 — No DSL exists

There are no DSL classes that:
- Provide domain-language methods (`opprettBehandling`, `innvilg`, `fattVedtak`)
- Hold shared state via `DslContext` (aliases, sequences, current case context)
- Use defaults heavily (standard bruker, standard periode, standard arbeidsgiver)
- Delegate to protocol drivers

There are no bindings mapping structured text to DSL calls.

### Layer 3 — Already solid, needs no changes

POMs, helpers, and fixtures are well-built protocol drivers. They need to stay as-is and become the implementation underneath the DSL.

---

## Target Architecture

### Directory structure

```
melosys-e2e-tests/
│
├── features/                        ← LAYER 1: Test Cases (structured text)
│   ├── eu-eos/                      Specifications in domain language.
│   │   ├── arbeid-flere-land.feature    No code. Readable by domain experts.
│   │   ├── utsendt-arbeidstaker.feature E.g. Gherkin .feature files (see Decision 1).
│   │   └── unntak/
│   │       └── artikkel-16.feature
│   ├── ftrl/
│   │   └── klage.feature
│   ├── trygdeavtale/
│   │   └── trygdeavtale-vedtak.feature
│   ├── utenfor-avtaleland/
│   │   ├── komplett-sak-2-8a.feature
│   │   └── arsavregning.feature
│   └── core/
│       ├── journalforing.feature
│       ├── oppgaver.feature
│       └── sok-og-navigasjon.feature
│
├── dsl/                             ← LAYER 2: Domain-Specific Language
│   ├── steps/                       Bindings (thin glue: text → DSL)
│   │   ├── sak.steps.ts             Gitt en ny behandling... → dsl.sak.opprettBehandling(...)
│   │   ├── behandling.steps.ts      Når saken innvilges... → dsl.behandling.innvilg(...)
│   │   └── vedtak.steps.ts          Så er vedtaket registrert → dsl.vedtak.bekreftVedtak()
│   ├── sak.dsl.ts                   DSL class: case creation vocabulary
│   ├── behandling.dsl.ts            DSL class: treatment vocabulary
│   ├── vedtak.dsl.ts                DSL class: decision vocabulary
│   ├── trygdeavgift.dsl.ts          DSL class: tax calculation vocabulary
│   ├── context.ts                   DslContext: shared state, aliases, sequences
│   ├── params.ts                    Params: named-parameter parsing with defaults
│   └── index.ts                     Barrel export + Playwright fixture setup
│
├── pages/                           ← LAYER 3a: Protocol Drivers (UI)
│   ├── shared/base.page.ts          (unchanged — POMs are drivers, not DSL)
│   ├── behandling/
│   ├── vedtak/
│   ├── trygdeavgift/
│   └── ...
│
├── helpers/                         ← LAYER 3b: Protocol Drivers (API/DB/Mock)
│   ├── db-helper.ts                 (unchanged)
│   ├── mock-helper.ts               (unchanged)
│   ├── api-helper.ts                (unchanged)
│   ├── auth-helper.ts               (unchanged)
│   └── unleash-helper.ts            (unchanged)
│
├── fixtures/                        ← LAYER 3c: Protocol Drivers (test lifecycle)
│   ├── cleanup.ts                   (unchanged)
│   ├── docker-logs.ts               (unchanged)
│   └── index.ts                     (unchanged)
│
├── utils/                           ← LAYER 3d: Protocol Drivers (assertions)
│   └── assertions.ts                (unchanged)
│
├── tests/                           ← OLD: Existing tests (kept during migration)
│   └── ...                          Still work, gradually replaced by features/
│
└── docker-compose.yml               ← LAYER 4: System Under Test (unchanged)
```

### Import rules

```
Layer 1 (features/)     → no imports — these are .feature text files
Bindings (dsl/steps/) → import from: dsl/ classes
Layer 2 (dsl/)          → import from: pages/, helpers/, fixtures/, utils/
Layer 3 (pages/, helpers/, fixtures/, utils/) → import from: each other, playwright
Layer 4                 → no imports (it's the running system)
```

### Suggested tooling: `playwright-bdd`

If Gherkin is chosen for Layer 1 (see Decision 1), [`playwright-bdd`](https://github.com/vitalets/playwright-bdd) is a strong candidate for running feature files on the Playwright runner. It provides:
- Gherkin `.feature` files as Layer 1 (with Norwegian locale support via `# language: no`)
- Bindings (step definitions) in TypeScript
- All Playwright benefits: auto-capture of traces, screenshots, videos
- Playwright fixtures (our existing cleanup, docker-logs, known-error fixtures)
- Parallel execution, retries, reporting
- No separate Cucumber runner needed

The team should evaluate this and other options during Phase 1.

---

## Migration Phases

### Phase 0: Document and Align (This Document)

- [x] Audit current codebase against the four-layer model
- [x] Identify gaps
- [x] Write this plan
- [x] Correct plan based on actual Farley examples (Layer 1 = text, not code)
- [ ] Team discussion and approval

### Phase 1: Choose Layer 1 Format + Set Up DSL Infrastructure

**Goal:** Decide on the structured text format for Layer 1 (Gherkin is the recommended option), set up the tooling, create the DSL infrastructure (`DslContext`, `Params`), and prove the pattern works with one end-to-end specification.

**Deliverables:**

#### 1a. Choose and configure Layer 1 format

Gherkin with `playwright-bdd` is the recommended option (see Decision 1). If chosen:

```bash
npm install -D playwright-bdd
```

Configure in `playwright.config.ts` to:
- Point to `features/` directory for `.feature` files
- Point to `dsl/steps/` for bindings
- Set Gherkin language to Norwegian (`# language: no`)
- Preserve existing Playwright config (traces, screenshots, slow motion, etc.)

#### 1b. `dsl/context.ts` — Shared state across DSL calls

```typescript
/**
 * Shared context across DSL method calls within a single scenario.
 * Inspired by Farley's Params.DslContext.
 */
export class DslContext {
  private aliases = new Map<string, string>();
  private sequences = new Map<string, number>();
  private state = new Map<string, unknown>();

  alias(key: string, value: string): void { this.aliases.set(key, value); }
  resolveAlias(key: string): string | undefined { return this.aliases.get(key); }
  nextSequence(name: string, start = 1): number {
    const n = this.sequences.get(name) ?? start;
    this.sequences.set(name, n + 1);
    return n;
  }
  set(key: string, value: unknown): void { this.state.set(key, value); }
  get<T>(key: string): T | undefined { return this.state.get(key) as T | undefined; }
  reset(): void { this.aliases.clear(); this.sequences.clear(); this.state.clear(); }
}
```

#### 1c. `dsl/params.ts` — Named parameter parsing with defaults

```typescript
import { DslContext } from './context';

/**
 * Parse named parameters with defaults.
 * Inspired by Farley's Params utility.
 */
export class Params {
  private parsed: Map<string, string>;
  private context: DslContext;

  constructor(context: DslContext, args: string[]) {
    this.context = context;
    this.parsed = new Map();
    for (const arg of args) {
      const i = arg.indexOf(':');
      if (i > 0) {
        this.parsed.set(arg.substring(0, i).trim().toLowerCase(), arg.substring(i + 1).trim());
      }
    }
  }

  optional(key: string, defaultValue: string): string {
    return this.parsed.get(key.toLowerCase()) ?? defaultValue;
  }

  alias(key: string): string {
    const value = this.parsed.get(key.toLowerCase());
    if (value) this.context.alias(key, value);
    return value ?? this.context.resolveAlias(key) ?? '';
  }
}
```

#### 1d. First DSL class — `dsl/sak.dsl.ts`

A class with domain-language methods for case creation, delegating to POMs:

```typescript
import { Page } from '@playwright/test';
import { DslContext } from './context';
import { AuthHelper } from '../helpers/auth-helper';
import { HovedsidePage } from '../pages/hovedside.page';
import { OpprettNySakPage } from '../pages/opprett-ny-sak/opprett-ny-sak.page';
import { waitForProcessInstances } from '../helpers/api-helper';

export class SakDsl {
  constructor(private context: DslContext, private page: Page) {}

  async opprettBehandling(type: string, tema: string, brukerFnr = '30056928150'): Promise<void> {
    if (!this.context.get('loggedIn')) {
      const auth = new AuthHelper(this.page);
      await auth.login();
      this.context.set('loggedIn', true);
    }
    const hovedside = new HovedsidePage(this.page);
    const opprettSak = new OpprettNySakPage(this.page);
    await hovedside.gotoOgOpprettNySak();
    await opprettSak.fyllInnBrukerID(brukerFnr);
    await opprettSak.velgSakstype(type);
    await opprettSak.velgSakstema('MEDLEMSKAP_LOVVALG');
    await opprettSak.velgBehandlingstema(tema);
    this.context.set('sakstype', type);
    this.context.set('brukerFnr', brukerFnr);
  }

  async settLand(land: string[]): Promise<void> { /* delegate to POM */ }
  async settPeriode(fra: string, til: string): Promise<void> { /* delegate to POM */ }

  async sendInnSak(aarsak = 'SØKNAD'): Promise<void> {
    const opprettSak = new OpprettNySakPage(this.page);
    await opprettSak.velgAarsak(aarsak);
    await opprettSak.leggBehandlingIMine();
    await opprettSak.klikkOpprettNyBehandling();
    await waitForProcessInstances(this.page.request, 30);
  }

  async åpneSak(): Promise<void> { /* navigate to case via hovedside */ }

  // Assertions
  async bekreftBehandlingOpprettet(): Promise<void> {
    const opprettSak = new OpprettNySakPage(this.page);
    await opprettSak.assertions.verifiserBehandlingOpprettet();
  }
}
```

#### 1e. First bindings — `dsl/steps/sak.steps.ts`

Thin glue mapping structured text to DSL (example assumes Gherkin/`playwright-bdd`):

```typescript
import { Given, When, Then } from 'playwright-bdd';
// DSL instances provided via fixtures

Given('en ny behandling av type {string} med tema {string}', async ({ sak }, type, tema) => {
  await sak.opprettBehandling(type, tema);
});

Given('land {string} og {string} er valgt', async ({ sak }, land1, land2) => {
  await sak.settLand([land1, land2]);
});

Given('perioden er fra {string} til {string}', async ({ sak }, fra, til) => {
  await sak.settPeriode(fra, til);
});

Given('saken er sendt inn', async ({ sak }) => {
  await sak.sendInnSak();
  await sak.åpneSak();
});

Then('behandlingen er opprettet', async ({ sak }) => {
  await sak.bekreftBehandlingOpprettet();
});
```

Each binding is a one-liner that delegates to the DSL. No logic in bindings.

#### 1f. First feature file — `features/trygdeavtale/trygdeavtale-vedtak.feature`

```gherkin
# language: no
Egenskap: Trygdeavtale - Komplett arbeidsflyt
    Som en saksbehandler
    ønsker jeg å opprette en trygdeavtale-sak og fatte vedtak
    slik at bruker får et vedtak om medlemskap

Scenario: Fullføre trygdeavtale-arbeidsflyt med vedtak
    Gitt en ny behandling av type "Trygdeavtale" med tema "Yrkesaktiv"
    Og saken er sendt inn

    Når perioden settes til "01.01.2024" og "01.01.2026" med land "Australia"
    Og arbeidsgiver "Ståles Stål AS" velges
    Og saken innvilges med bestemmelse "AUS Art 9.3"
    Og vedtak fattes med arbeidssted "Test"

    Så er vedtaket fattet
```

**Validation criteria:**
- `playwright-bdd` is configured and running
- The feature file runs end-to-end via `npx bddgen && npx playwright test`
- Bindings are one-liners delegating to DSL
- DSL delegates to existing POMs/helpers
- Traces, screenshots, videos still work
- Existing old tests still pass (coexistence)

### Phase 2: Expand DSL and Bindings

**Goal:** Add `BehandlingDsl` and `VedtakDsl` classes, expand bindings, convert 3-4 more feature files.

**Deliverables:**

#### 2a. `dsl/behandling.dsl.ts` and `dsl/vedtak.dsl.ts`

```typescript
export class BehandlingDsl {
  async settPeriodeOgLand(fra: string, til: string, land: string): Promise<void> { /* ... */ }
  async velgArbeidsgiver(navn: string): Promise<void> { /* ... */ }
  async innvilgMedBestemmelse(bestemmelse: string): Promise<void> { /* ... */ }
  async bekreftBehandlingFullfort(): Promise<void> { /* ... */ }
}

export class VedtakDsl {
  async fattVedtak(arbeidssted?: string): Promise<void> { /* ... */ }
  async bekreftVedtakFattet(): Promise<void> { /* ... */ }
}
```

#### 2b. Bindings for behandling and vedtak

```typescript
// dsl/steps/behandling.steps.ts
When('saken innvilges med bestemmelse {string}', async ({ behandling }, bestemmelse) => {
  await behandling.innvilgMedBestemmelse(bestemmelse);
});

// dsl/steps/vedtak.steps.ts
When('vedtak fattes', async ({ vedtak }) => {
  await vedtak.fattVedtak();
});

Then('er vedtaket fattet', async ({ vedtak }) => {
  await vedtak.bekreftVedtakFattet();
});
```

#### 2c. Convert 3–4 representative tests to feature files

- `features/eu-eos/arbeid-flere-land.feature`
- `features/utenfor-avtaleland/komplett-sak-2-8a.feature`
- `features/trygdeavtale/trygdeavtale-vedtak.feature` (from Phase 1)
- `features/ftrl/klage.feature`

**Validation criteria:**
- All 4 feature files run and pass
- Bindings remain one-liners
- DSL classes handle all complexity
- Old TypeScript tests still pass alongside feature files

### Phase 3: Migrate Remaining Tests

**Goal:** Convert all remaining test files to feature files.

**Approach:** One workflow category at a time:
1. `eu-eos/` (7 tests + 2 unntak)
2. `utenfor-avtaleland/` (4 tests)
3. `core/` (4 tests)
4. `ftrl/klage/` (1 test)
5. `aarsavregning-ftrl.spec.ts` (1 test)

For each test:
- Identify the domain-language scenario (what does this test verify?)
- Write the specification in the chosen Layer 1 format (e.g. `.feature` file in Norwegian)
- Add bindings if new vocabulary is needed
- Add DSL methods if new domain concepts are needed
- Verify the specification passes
- Mark the old `.spec.ts` for eventual removal

**Validation criteria:**
- All specifications pass
- Bindings cover all scenarios
- Specifications are readable by a domain expert
- Old tests can be removed once all scenarios are covered

### Phase 4: Clean Up and Enforce Boundaries

**Goal:** Remove old tests, enforce the layering, document.

**Deliverables:**
1. Remove old `tests/` directory (or archive to `test-to-keep-but-not-to-run/`)
2. Add ESLint rule preventing bindings from importing `pages/` directly (must go through DSL)
3. Update `CLAUDE.md` to describe the four-layer architecture
4. Add architectural diagram to `README.md`
5. Add unit tests for `DslContext` and `Params`

---

## Concrete Examples — Before & After

### Example 1: Trygdeavtale full workflow

**BEFORE** (TypeScript code — Layer 1 and 3 mixed):

```typescript
import { test } from '../../fixtures';
import { AuthHelper } from '../../helpers/auth-helper';
import { HovedsidePage } from '../../pages/hovedside.page';
import { OpprettNySakPage } from '../../pages/opprett-ny-sak/opprett-ny-sak.page';
import { TrygdeavtaleBehandlingPage } from '../../pages/behandling/trygdeavtale-behandling.page';
import { USER_ID_VALID } from '../../pages/shared/constants';

test('skal fullføre trygdeavtale-arbeidsflyt med vedtak', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    const hovedside = new HovedsidePage(page);
    const opprettSak = new OpprettNySakPage(page);
    await hovedside.goto();
    await hovedside.klikkOpprettNySak();
    await opprettSak.fyllInnBrukerID(USER_ID_VALID);
    await opprettSak.velgSakstype('TRYGDEAVTALE');
    // ... 20+ more POM calls mixed with infrastructure
});
```

**AFTER** — Layer 1 (structured text):

```gherkin
# language: no
Egenskap: Trygdeavtale - Komplett arbeidsflyt
    Som en saksbehandler
    ønsker jeg å opprette en trygdeavtale-sak og fatte vedtak
    slik at bruker får et vedtak om medlemskap

Scenario: Fullføre trygdeavtale-arbeidsflyt med vedtak
    Gitt en ny behandling av type "Trygdeavtale" med tema "Yrkesaktiv"
    Og saken er sendt inn

    Når perioden settes til "01.01.2024" og "01.01.2026" med land "Australia"
    Og arbeidsgiver "Ståles Stål AS" velges
    Og saken innvilges med bestemmelse "AUS Art 9.3"
    Og vedtak fattes med arbeidssted "Test"

    Så er vedtaket fattet
```

A domain expert can read this and verify: *"Yes, that is how a trygdeavtale-sak should work."*

### Example 2: EU/EØS Arbeid i Flere Land

**AFTER** — `features/eu-eos/arbeid-flere-land.feature`:

```gherkin
# language: no
Egenskap: EU/EØS 13.1 - Arbeid i flere land
    Som en saksbehandler
    ønsker jeg å behandle en sak for arbeid i flere EU/EØS-land
    slik at bruker får et vedtak om lovvalg

Scenario: Opprett og fullfør arbeid-i-flere-land til vedtak
    Gitt en ny behandling av type "EU/EØS" med tema "Arbeid i flere land"
    Og land "Estland" og "Norge" er valgt
    Og perioden er fra "01.01.2024" til "31.12.2025"
    Og saken er sendt inn

    Når lovvalg settes til "Norge"
    Og arbeidsforhold fylles inn
    Og vedtak fattes

    Så er vedtaket fattet
    Og saken er avsluttet
```

### Example 3: Comparing side-by-side with Farley's BookShopping

**Farley's OrderBook.feature:**
```gherkin
Feature: Add Book to Shopping-Basket
    As a book-buyer
    I would like to select a book and add it to my shopping-basket
    So that I can pay for it later

Scenario:
    Given I search for books about "Continuous Delivery"
    And I select a book by "David Farley"
    When I add my selected book to my shopping-basket
    Then I can see the book "Continuous Delivery" listed in my shopping-basket
```

**Our Melosys equivalent:**
```gherkin
# language: no
Egenskap: Opprett EU/EØS-sak
    Som en saksbehandler
    ønsker jeg å opprette en EU/EØS-sak for arbeid i flere land
    slik at bruker får et vedtak om lovvalg

Scenario:
    Gitt en ny behandling av type "EU/EØS" med tema "Arbeid i flere land"
    Og land "Estland" og "Norge" er valgt
    Når saken sendes inn
    Så er behandlingen opprettet
```

Same structure, same separation of concerns. The only difference is the domain.

---

## Design Decisions

### Decision 1: Layer 1 format (recommended: Gherkin feature files)

**Recommendation:** Use Gherkin `.feature` files in Norwegian as the structured text format for Layer 1. The team should evaluate and decide.

**Why Gherkin is recommended:**
- This is Farley's actual model. The `OrderBook.feature` is the canonical Layer 1 example.
- A domain expert can read, write, and verify feature files without programming knowledge.
- Feature files are the specification. Everything else exists to make them executable.
- Norwegian Gherkin (`Gitt/Når/Så`) matches the domain language of Melosys.
- Well-established tooling ecosystem (Cucumber, playwright-bdd, etc.)

**Why Norwegian matters for Layer 1:**
Layer 1 exists so that domain experts can read, challenge, and extend the specifications. Melosys domain experts think and work in Norwegian. Writing specifications in Norwegian removes a translation barrier and lets domain experts engage with the specs directly. 
Regardless of which Layer 1 format is chosen, specifications should be written in Norwegian.

**Alternatives to consider:**
- Plain-text tables or custom DSL parsed by a custom runner
- TypeScript test cases that read like specifications (less separation, but simpler tooling)
- Markdown-based specifications with a custom parser

The key requirement is that Layer 1 is **structured text in domain language**, not code. The specific format is a team decision.

### Decision 2: Tooling for running structured text (recommended: `playwright-bdd`)

**Recommendation:** If Gherkin is chosen for Layer 1, use [`playwright-bdd`](https://github.com/vitalets/playwright-bdd) to run feature files on the Playwright runner. The team should evaluate during Phase 1.

**Why `playwright-bdd` is recommended:**
- Keeps all Playwright benefits: traces, screenshots, videos, parallel execution, fixtures
- Active project (674 stars, regular releases)
- Supports Gherkin i18n (Norwegian locale)
- Generates Playwright test files from feature files — integrates with existing CI
- No separate Cucumber runner needed
- Our existing fixtures (cleanup, docker-logs, known-error) continue to work

### Decision 3: DSL is a class (following Farley's pattern)

**Choice:** DSL is implemented as classes with shared `DslContext`.

**Rationale:**
- Every Farley example uses DSL classes: `BookShoppingDsl`, `InvoicesDsl`, `FlightSearchDSL`
- Classes hold state (DslContext) enabling aliases and implicit context
- Classes group related concepts: `sak.*` for case ops, `vedtak.*` for decision ops
- Classes delegate to drivers through constructor-injected dependencies

### Decision 4: Bindings are thin glue (one-liners)

**Choice:** Bindings contain no logic — each is a one-line delegation to a DSL method.

**Rationale:**
- Farley's `AddBookToBasketSteps.java` shows this: each step just calls `dsl.shopping.someMethod()`
- Logic belongs in the DSL, not in bindings
- Bindings are mechanical mapping — easy to write and maintain
- If a binding needs more than one line, the DSL is missing a method

### Decision 5: POMs become internal protocol drivers (Layer 3)

**Choice:** Existing POMs stay as-is and become the implementation underneath DSL classes.

**Rationale:**
- POMs are well-built and handle complex UI interactions
- DSL classes delegate to POMs — they're thin orchestrators
- If a POM changes, only the DSL class is affected. Feature files and bindings are untouched.
- Incremental: we add layers on top without breaking what works

### Decision 6: Shared DslContext across all DSL instances in a scenario

**Choice:** All DSL instances in a scenario share one `DslContext`.

**Rationale:**
- `sak.opprettBehandling()` stores case info → `behandling.innvilg()` reads it
- Aliases work across DSL objects
- Matches Farley's pattern where all DSL methods share a single context

### Decision 7: Incremental migration, both styles coexist

**Choice:** Old `.spec.ts` tests continue to work alongside new `.feature` files.

**Rationale:**
- Zero-risk approach — never break existing CI
- Migrate one category at a time
- Already proven with the POM migration

---

## Rules of Engagement

### For specification authors (Layer 1)

1. **Write in domain language.** If Gherkin: use Norwegian (`Gitt`, `Når`, `Så`, `Og`).
2. **Use the language of the domain.** Write as a saksbehandler would describe the workflow.
3. **No technical details.** No mention of buttons, pages, selectors, APIs, or databases.
4. **Distinguish feature from scenario.** A feature describes a capability (what and why). A scenario is a concrete example with specific values.
5. **Scenarios have values in quotes.** Specific names, dates, types: `"EU/EØS"`, `"Arbeid i flere land"`, `"01.01.2024"`.
6. **Each scenario = one specification.** What does this test prove about the system?
7. **A domain expert should be able to read, challenge, and extend these specifications.**

### For binding authors (Layer 2 — glue)

1. **One-liners only.** Each binding delegates to exactly one DSL method call.
2. **No logic.** If you need an `if` or a loop, the DSL is missing a method.
3. **Match the specification text naturally.** If Gherkin: the expression should read like the Norwegian sentence.
4. **Reuse bindings.** Same step text = same binding across all specifications.

### For DSL class authors (Layer 2 — domain language)

1. **One method = one domain concept.** `opprettBehandling`, `innvilg`, `fattVedtak`.
2. **Heavy defaults.** Standard bruker, standard periode — only require what varies.
3. **Hold state in DslContext.** Store IDs, current state — so later methods read implicitly.
4. **Assertions are DSL methods.** `bekreftVedtakFattet()` verifies domain outcomes.
5. **Delegate to protocol drivers.** DSL methods are thin — parse params and call POMs/helpers.
6. **Hide all infrastructure.** Login, process-instance polling, page reloads — internal to DSL.

### For protocol-driver authors (Layer 3)

1. **POMs own all locator knowledge.** Selectors, CSS classes, role names — only in `pages/`.
2. **Helpers own all API/DB knowledge.** URLs, SQL, endpoints — only in `helpers/`.
3. **Fixtures own all lifecycle knowledge.** Cleanup, logging — only in `fixtures/`.
4. **Protocol drivers can be swapped.** UI redesign = change driver, not DSL or feature files.

---

*This plan builds on the successful POM migration and takes it to its logical conclusion: executable specifications in structured text that domain experts can read and verify. The key insight from Farley's examples is that Layer 1 is NOT code — it is plain text in domain language. The DSL, bindings, protocol drivers, and SUT exist only to make that text executable.*
