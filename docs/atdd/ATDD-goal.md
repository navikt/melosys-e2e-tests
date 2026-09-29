We want to implement Acceptance Test Driven Development in this project.

We want to use Dave Farley's four layer model, which consists of:

1. Test Cases Layer: Executable specifications in plain text written from the perspective of an external user, focusing on WHAT the system does,
   NOT HOW it does it, using the language of the problem domain.

2. Domain Specific Language (DSL) Layer: A shared language between the test cases that make it easy to write tests with precision where needed,
   while allowing detailed to be skipped where they are not needed.

3. Protocol Drivers and Stubs Layer: Translators and adapters that convert between the DSL and the
   actual system implementation, isolation all test infrastructure knowledge of the system.

4. System Under Test (SUT) Layer: The actual implementation that fulfills the requirements of the test cases,
   deployed using the same tools and techniques that would be used in production.


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


Why this approach is especially valuable:

The most powerful benefit of the four-layer model is that it makes test cases survive change.
When a UI button is renamed, a dropdown is replaced by a search field, or an API endpoint is restructured,
only the protocol-driver layer needs updating — every test case and every DSL function remains untouched.
In a system like Melosys, where 17 services evolve and the frontend regularly adopts new components, this isolation is not a theoretical nicety but a practical necessity.
Without it, a single UI refactor can break dozens of tests that all hardcode the same selector, turning the test suite into a maintenance burden.

Equally important, the separation between test cases and the DSL creates a shared language that bridges the gap between domain experts and developers.
When a test reads e.g. "opprett en EU/EØS-behandling for arbeid i flere land og fatt vedtak," a domain expert can verify
that the specification matches the real workflow without needing to understand programming or tools like Playwright.
This means tests become living documentation that the whole team can read, challenge, and extend, not just artifacts that developers maintain in isolation.

Finally, the layered approach compounds in value over time. Each new DSL function you write makes the next test cheaper to create,
because you are composing existing vocabulary rather than scripting from scratch.
The first test in a new workflow category may require building a DSL function, but the second and third tests in that category
become trivial. This turns the test suite from a linear cost where more tests automatically give more maintenance, into a platform with decreasing marginal cost,
which is exactly what you need for a long-lived system that keeps case types, integrations and regulations.


Course examples are available here:
https://github.com/davef77/atdd-course-examples
https://github.com/davef77/Flight-Search-ATDD