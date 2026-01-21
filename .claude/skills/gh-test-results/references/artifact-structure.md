# Artifact Structure Reference

## Directory Layout After Download

```
/tmp/gh-artifacts/
├── test-summary/
│   ├── test-summary.md          # Human-readable summary
│   └── test-summary.json        # Machine-readable results
└── playwright-results/
    ├── playwright-report/
    │   ├── index.html           # Interactive HTML report
    │   ├── test-summary.md      # Copy of summary
    │   ├── test-summary.json    # Copy of JSON
    │   ├── flaky-test-summary.md # Flaky test stability results
    │   ├── *-complete.log       # Docker logs per service
    │   ├── data/                # Traces, videos, screenshots
    │   └── trace/               # Trace viewer assets
    └── test-results/
        └── <test-name>-chromium/
            ├── trace.zip        # Playwright trace
            ├── video.webm       # Test execution video
            ├── test-failed-1.png # Screenshot at failure
            └── error-context.md  # Page state at failure
```

## Test Status Values

| Status | Meaning |
|--------|---------|
| `passed` | All attempts succeeded |
| `failed` | All attempts failed |
| `flaky` | Failed initially, passed on retry |

## Interpreting Flaky Tests

A test is marked `flaky` when:
- `totalAttempts` > 1
- `failedAttempts` > 0
- Final attempt passed

The flaky-test-summary.md shows stability across multiple workflow runs (used with repeat option).

## Common Error Patterns

### Race Condition (antallProsessert = 0)
```
Expected: 1
Received: 0
```
Async operation not complete - workflow processing didn't finish in time.

### Element Not Found
```
Timeout waiting for selector
```
UI didn't render expected element - check error-context.md for page state.

### API Timeout
Check docker logs for:
- Connection refused
- Timeout errors
- 5xx responses
