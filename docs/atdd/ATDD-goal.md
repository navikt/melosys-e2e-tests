We want to implement Acceptance Test Driven Development in this project.

We want to use Dave Farley's four layer model, which consists of:

1. Test Cases Layer: Executable specifications in plain text written from the perspective of an external user, focusing on WHAT the system does,
   NOT HOW it does it, using the language of the problem domain.
   - Short (typically given / when / then), asserting one outcome.
   - No selectors, URLs, clicks or technical identifiers.

2. Domain Specific Language (DSL) Layer: A language whose vocabulary is the problem domain, making it easy to write tests with precision where needed,
   while allowing details to be skipped where they are not needed.
   - Provides default values so a test states only what matters to it, and full precision where it does.
   - Handles aliasing for isolation (see below).
   - Is split by domain area rather than one large file.
   - Calls protocol drivers at the same level of abstraction as tests call the DSL.

3. Protocol Drivers and Stubs Layer: Translators and adapters that convert between the DSL and the
   actual system implementation, isolating all test infrastructure knowledge of the system.
   - Protocol drivers are the only place that knows how the system works (Playwright, HTTP, Kafka, database).
   - Every driver method either succeeds or fails the test, so each step is atomic: if control returns, it happened.
   - Assertions live here, with error messages in domain language.
   - Asynchronous work is awaited by polling with a timeout, never by fixed sleeps.
   - External systems (PDL, EUX, AAREG etc.) are replaced by simple stubs the DSL programs with the
     response a test needs. Stubs are translators, not simulations of the real system.

4. System Under Test (SUT) Layer: The actual implementation that fulfills the requirements of the test cases,
   deployed using the same tools and techniques that would be used in production.


Why this approach is especially valuable:

The most powerful benefit of the four-layer model is that it makes test cases survive change.
When a UI button is renamed, a dropdown is replaced by a search field, or an API endpoint is restructured,
only the protocol-driver layer needs updating — every test case and every DSL function remains untouched.
In a system like Melosys, where 17 services evolve and the frontend regularly adopts new components, this isolation is not a theoretical nicety but a practical necessity.
Without it, a single UI refactor can break dozens of tests that all hardcode the same selector, turning the test suite into a maintenance burden.

Equally important, the separation between test cases and the DSL creates a shared language that bridges the gap between domain experts and developers.
When a test reads e.g.

    Gitt en arbeidstaker som sendes ut av en norsk arbeidsgiver for å arbeide i Sverige i 18 måneder
    Når søknaden om medlemskap behandles
    Så skal arbeidstakeren fortsatt være medlem i folketrygden etter artikkel 12 nr. 1

and a companion scenario states that a 30-month posting is not covered by artikkel 12 nr. 1,
a domain expert can verify that the specifications state the right rule, including the 24-month limit,
without needing to understand programming or tools like Playwright.
Note that the example describes one business outcome, not a workflow of screens ("opprett behandling ... fatt vedtak").
Each specification asserts a single outcome; a good check is whether a completely different system could fulfil it.
This means tests become living documentation that the whole team can read, challenge, and extend, not just artifacts that developers maintain in isolation.

Finally, the layered approach compounds in value over time. Each new DSL function you write makes the next test cheaper to create,
because you are composing existing vocabulary rather than scripting from scratch.
The first test in a new workflow category may require building a DSL function, but the second and third tests in that category
become trivial. This turns the test suite from a linear cost where more tests automatically give more maintenance, into a platform with decreasing marginal cost,
which is exactly what you need for a long-lived system that keeps gaining new case types, integrations and regulations.


Specifications should come first:

ATDD is test-driven. New behaviour starts as an example from a domain expert, written as an executable
specification before any implementation exists. The specification decides which DSL functions we need;
the DSL decides which protocol-driver methods we need; and only then do we write just enough of the system
to make the specification pass. When the specification passes, the feature is done.


Tests are isolated from each other:

We can only trust a green suite if every test controls its own world. The DSL layer is responsible for this:

- Functional isolation: each test creates its own synthetic data (person, case, employer) through the DSL,
  instead of depending on shared fixtures or pre-loaded state.
- Temporal isolation: the DSL aliases the names and identifiers a test uses, so the same test can run twice,
  or in parallel with other tests, against the same deployed system and still see only its own data.
- The system boundary is explicit: everything outside Melosys is replaced by a stub that the test programs itself.

Cleaning the database between tests is a temporary measure while we get there, not the target.
A test that only passes after cleanup is not isolated.


Success criteria:

We have reached the goal when all of the following hold:

1. Spec first: new acceptance behaviour is merged with an executable specification that was written before
   the implementation and reviewed by a domain expert.
2. Domain language only: no test case contains selectors, URLs, clicks, database queries or technical identifiers.
   Playwright, HTTP and database code exists only in protocol drivers.
3. Single outcome: each test case asserts one business outcome and is typically given / when / then.
4. Change survives: a UI change (renamed button, replaced component) is fixed by editing protocol drivers only,
   with no change to test cases or DSL.
5. Isolation: every test creates its own data through the DSL, passes when run twice in a row against the same
   environment without cleanup, and passes when run in parallel with the rest of the suite.
6. Programmable stubs: every external system a test depends on is set up by the test through the DSL,
   not by pre-loaded mock data.
7. Deterministic: no fixed sleeps; asynchronous work is awaited by polling with a timeout. The suite has no
   known intermittent failures, and known gaps are tracked as expected failures, never silently skipped.
8. Release gate: the acceptance suite runs in CI against a production-like deployment, and a green run means
   the change is releasable.
9. Decreasing cost: a second test in an existing domain area needs no new protocol-driver code.


Final goal:

Every change to Melosys is described first as an executable specification in the language of the domain,
readable by domain experts, and is releasable when that specification and all existing ones pass against a
production-like deployment. The specifications are isolated, deterministic and independent of how the system
is built, so they survive changes to the UI and services, and each new specification is cheaper to write than the last.