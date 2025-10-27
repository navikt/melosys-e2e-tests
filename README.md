# Melosys E2E Tests

End-to-end tests for Melosys using Playwright and TypeScript.

## 🎯 Purpose

This project provides:

1. **Workflow Recording** - Record user flows from "melosys flyt" to "vedtak" for automated testing
2. **Regression Testing** - Ensure changes don't break existing workflows
3. **Local Debugging** - Replay workflows locally without manual clicking

## 📋 Prerequisites

1. **Docker Compose Services Running**
   ```bash
   cd ../melosys-docker-compose
   make start-all
   ```
   
   Verify services are up:
   ```bash
   curl http://localhost:3000/melosys/     # Frontend
   curl http://localhost:8080/internal/health  # Backend
   ```

2. **Node.js** (v18 or later)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Playwright Browsers

```bash
npx playwright install
```

### 3. Verify Setup

```bash
# Run example test
npm test

# Open test UI (interactive mode)
npm run test:ui
```

## 🎬 Recording Workflows

### Method 1: Codegen (Recommended)

This is the easiest way to record a workflow:

```bash
npm run codegen
```

This will:
1. Open a browser with Playwright Inspector
2. Navigate to http://localhost:3000/melosys/
3. Record all your clicks, typing, navigation
4. Generate TypeScript code automatically

**Steps:**
1. Run `npm run codegen`
2. Perform your workflow in the browser (e.g., create case → fill form → submit → vedtak)
3. Copy the generated code from Playwright Inspector
4. Paste into a new test file in `tests/`
5. Add assertions and database verification

### Method 2: Manual Recording with Trace

If you want more control:

```bash
# Run test with trace
npx playwright test --trace on

# View the trace
npm run show-trace
```

### Example: Recording "Oppgave to Vedtak" Flow

```bash
# 1. Start codegen
npm run codegen

# 2. In the browser that opens:
#    - Login (if needed)
#    - Navigate to oppgave list
#    - Click on an oppgave
#    - Fill in required fields
#    - Submit
#    - Verify vedtak is created

# 3. Copy generated code
# 4. Create new test file:
cat > tests/oppgave-to-vedtak.spec.ts << 'TESTEOF'
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth-helper';
import { withDatabase } from '../helpers/db-helper';

test.describe('Oppgave to Vedtak Workflow', () => {
  test('should create vedtak from oppgave', async ({ page }) => {
    const auth = new AuthHelper(page);
    await auth.login();
    
    // PASTE YOUR RECORDED STEPS HERE
    
    // Verify in database
    await withDatabase(async (db) => {
      const vedtak = await db.queryOne(
        'SELECT * FROM VEDTAK WHERE behandling_id = :id',
        { id: 123 }
      );
      expect(vedtak).not.toBeNull();
    });
  });
});
TESTEOF
```

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/oppgave-to-vedtak.spec.ts

# Run with browser visible (headed mode)
npm run test:headed

# Debug mode (step through test)
npm run test:debug

# Interactive UI mode (best for development)
npm run test:ui
```

## 🐛 Debugging Locally

### Automatic Debugging Features

The tests are configured to automatically capture:

1. **Video** - Recorded on test failure
2. **Screenshots** - Taken on failure
3. **Trace** - Full execution trace with network, console, DOM snapshots

These are saved in `test-results/` directory.

### View Test Results

```bash
# View HTML report
npm run show-report

# View specific trace file
npm run show-trace test-results/example-workflow-chromium/trace.zip
```

### Debug Flow Without Clicking Through

Instead of manually clicking through the workflow every time:

```bash
# Run the recorded test
npm test tests/oppgave-to-vedtak.spec.ts

# If it fails, view the trace to see what happened
npm run show-trace test-results/.../trace.zip
```

The trace viewer shows:
- Every action taken
- Network requests
- Console logs
- DOM state at each step
- Screenshots

### Replay with Slow Motion

For better visibility during development:

```bash
# Edit playwright.config.ts, set slowMo higher:
launchOptions: {
  slowMo: 500,  // 500ms delay between actions
}

# Then run headed
npm run test:headed
```

## 📁 Project Structure

```
melosys-e2e-tests/
├── tests/                      # Test files
│   ├── example-workflow.spec.ts
│   └── oppgave-to-vedtak.spec.ts
├── helpers/                    # Helper utilities
│   ├── auth-helper.ts         # Authentication
│   ├── db-helper.ts           # Database verification
│   └── page-objects/          # Page object models
├── playwright.config.ts       # Playwright configuration
├── package.json
└── README.md
```

## 🛠️ Configuration

### Environment Variables

Create a `.env` file for custom configuration:

```bash
# Database connection (optional)
DB_USER=MELOSYS
DB_PASSWORD=melosys
DB_CONNECT_STRING=localhost:1521/freepdb1

# Base URL (optional, defaults to localhost:3000)
BASE_URL=http://localhost:3000
```

### Playwright Config

Edit `playwright.config.ts` to customize:

- Trace recording options
- Video recording
- Screenshot settings
- Browser options
- Timeouts

## 🔍 Database Verification

Use the database helper to verify data after workflows:

```typescript
import { withDatabase } from '../helpers/db-helper';

test('should create behandling', async ({ page }) => {
  // ... perform workflow ...
  
  // Verify database state
  await withDatabase(async (db) => {
    const behandling = await db.queryOne(
      'SELECT * FROM BEHANDLING WHERE id = :id',
      { id: 123 }
    );
    
    expect(behandling).not.toBeNull();
    expect(behandling.STATUS).toBe('OPPRETTET');
  });
});
```

## 📊 CI/CD Integration

### GitHub Actions

Add to your `.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Start Docker Compose
        run: |
          cd melosys-docker-compose
          docker compose up -d
          
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd melosys-e2e-tests
          npm ci
      
      - name: Install Playwright
        run: |
          cd melosys-e2e-tests
          npx playwright install --with-deps
      
      - name: Run tests
        run: |
          cd melosys-e2e-tests
          npm test
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: melosys-e2e-tests/playwright-report/
```

## 💡 Tips & Best Practices

### Recording

1. **Keep workflows focused** - One workflow per test file
2. **Use meaningful names** - `oppgave-to-vedtak.spec.ts` not `test1.spec.ts`
3. **Add comments** - Explain what each section of the workflow does
4. **Test edge cases** - Record both happy path and error scenarios

### Maintenance

1. **Use data-testid** - Ask frontend team to add stable test IDs
2. **Page objects** - Extract common actions into page object classes
3. **Fixtures** - Create reusable test data and setup
4. **Assertions** - Always verify expected state, don't just run actions

### Debugging

1. **Run in UI mode** - Best for development (`npm run test:ui`)
2. **Check traces** - First thing to check when test fails
3. **Slow motion** - Use `slowMo` option to see what's happening
4. **Screenshots** - Automatically captured on failure

## 🆘 Troubleshooting

### Tests fail with "timeout"

**Solution:** Increase timeout in `playwright.config.ts`:
```typescript
use: {
  actionTimeout: 30000,  // 30 seconds
}
```

### Can't connect to services

**Solution:** Verify Docker Compose is running:
```bash
cd ../melosys-docker-compose
docker ps
curl http://localhost:3000/melosys/
```

### Database connection fails

**Solution:** Check Oracle is running and credentials are correct:
```bash
docker logs melosys-oracle
```

Update `.env` with correct credentials.

### Recorded test breaks after UI changes

**Solution:** 
1. Re-record the affected workflow with `npm run codegen`
2. Or update selectors to use stable `data-testid` attributes

## 📚 Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Test Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [Oracle Node.js Driver](https://oracle.github.io/node-oracledb/)

## 🤝 Contributing

1. Record your workflow with codegen
2. Add database verification
3. Add meaningful assertions
4. Test locally before committing
5. Verify traces are helpful for debugging

---

**Happy Testing! 🎭**
