# E2E Failure Analysis Workflow Diagram

```mermaid
graph TB
    subgraph "1️⃣ E2E Test Execution"
        A[E2E Tests Workflow Starts] --> B[Run Playwright Tests]
        B --> C[Generate test-summary.json]
        C --> D[Set Outputs: has-failures, has-flaky]
        D --> E[Upload test-summary Artifact]
    end

    subgraph "2️⃣ Automatic Analysis Trigger"
        E --> F{Tests Failed or Flaky?}
        F -->|Yes| G[Analyze E2E Failures Workflow Triggers]
        F -->|No| H[Skip Analysis]
    end

    subgraph "3️⃣ Failure Analysis"
        G --> I[Download test-summary Artifact]
        I --> J[Parse test-summary.json]
        J --> K{For each failed/flaky test}
        K --> L{Does issue exist?}
        L -->|Yes| M[Add Comment with New Failure]
        L -->|No| N[Create New Issue]
        N --> O[Labels: e2e-failure, needs-triage]
        M --> P[Issue Updated]
        O --> P
    end

    subgraph "4️⃣ Issue Content"
        P --> Q[Issue Contains:]
        Q --> R[- Test file path<br/>- Error message<br/>- Stack trace<br/>- Workflow run link]
        Q --> S[- Docker errors<br/>- Image tags<br/>- Attempt counts]
        Q --> T[- Instructions:<br/>'Add copilot-analyze label']
    end

    subgraph "5️⃣ Copilot Analysis (Optional)"
        T --> U{Developer adds<br/>copilot-analyze label?}
        U -->|Yes| V[Copilot Analyze Workflow Triggers]
        U -->|No| W[Manual Triage]
        V --> X[Add @copilot Comment with:<br/>- Analysis instructions<br/>- Search navikt/melosys-api<br/>- Search navikt/melosys-web<br/>- Classify issue type<br/>- Suggest fixes]
        X --> Y[Copilot Analyzes and Responds]
        Y --> Z[Developer Reviews<br/>Copilot's Suggestions]
    end

    style A fill:#4CAF50,stroke:#2E7D32,color:#fff
    style B fill:#4CAF50,stroke:#2E7D32,color:#fff
    style G fill:#FF9800,stroke:#EF6C00,color:#fff
    style N fill:#F44336,stroke:#C62828,color:#fff
    style M fill:#2196F3,stroke:#1565C0,color:#fff
    style V fill:#9C27B0,stroke:#6A1B9A,color:#fff
    style Y fill:#9C27B0,stroke:#6A1B9A,color:#fff
```

## Flow Description

### 1. E2E Test Execution
- Tests run via GitHub Actions
- Playwright generates `test-summary.json` with results
- Workflow sets outputs and uploads artifact

### 2. Automatic Analysis Trigger
- Workflow completion triggers analysis workflow
- Only proceeds if there are failures or flaky tests

### 3. Failure Analysis
- Downloads test results from artifact
- Processes each failed/flaky test
- Creates or updates GitHub issues
- Applies labels for categorization

### 4. Issue Content
- Comprehensive failure information
- Links to workflow run for debugging
- Docker log errors for context
- Image tags for reproducibility
- Instructions for next steps

### 5. Copilot Analysis (Optional)
- Developer adds `copilot-analyze` label
- Workflow triggers Copilot analysis
- Copilot searches relevant repositories
- Provides classification and recommendations
- Developer applies suggested fixes

## Key Features

✅ **Automatic Detection** - No manual issue creation needed
✅ **Deduplication** - Updates existing issues instead of creating duplicates
✅ **Rich Context** - Includes errors, logs, and environment details
✅ **AI Analysis** - Copilot helps classify and suggest fixes
✅ **Manual Trigger** - Can re-analyze any workflow run
