# Quick Start

Get started with Melosys E2E tests in 5 minutes.

---

## Setup (One Time)

```bash
# 1. Install dependencies
npm install
npx playwright install

# 2. Create .env file
cp .env.example .env
# Edit .env if needed (defaults work for Mac ARM)
```

---

## Running Tests

### Start Services First

```bash
# In melosys-docker-compose directory
cd ../melosys-docker-compose
make start-all

# Wait ~2 minutes for services to start
# Verify services are running:
curl http://localhost:3000/melosys/
```

### Run Tests

```bash
# Back to e2e-tests directory
cd ../melosys-e2e-tests

# Run all tests
npm test

# Run in UI mode (best for development)
npm run test:ui

# Run specific test
npm test tests/example-workflow.spec.ts
```

---

## Recording New Workflows

```bash
# 1. Make sure services are running
cd ../melosys-docker-compose && make start-all

# 2. Start recording
cd ../melosys-e2e-tests
npm run codegen

# 3. Perform your workflow in the opened browser
# 4. Copy generated code from Playwright Inspector
# 5. Create new test file and paste code
```

---

## Viewing Results

```bash
# HTML report (after tests run)
npm run show-report

# Trace viewer (detailed debugging)
npm run show-trace test-results/[path]/trace.zip

# Videos
npm run open-videos

# Screenshots
npm run open-screenshots
```

---

## Common Commands

```bash
# Development
npm run test:ui           # Interactive UI mode
npm run test:headed       # See browser while running
npm run test:debug        # Step through test
npm run codegen           # Record new workflow

# Running
npm test                  # Run all tests
npm test tests/my-test.spec.ts  # Run specific test

# Results
npm run show-report       # View HTML report
npm run show-trace        # View trace
npm run clean-results     # Clean old results
```

---

## Need Help?

- **Full documentation**: `README.md`
- **Troubleshooting**: `docs/guides/TROUBLESHOOTING.md`
- **Test helpers**: `docs/guides/HELPERS.md`
- **POMs**: `docs/pom/QUICK-START.md`
