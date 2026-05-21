# Survey System

A complete Jahia survey solution comprising two modules working in tandem: **survey-module** (React front-end) and **survey-service** (Java/GraphQL back-end).

## Architecture

```
┌─────────────────────────────────────┐
│  Jahia jContent                     │
│  • Editors create survey content    │
│  • Content is stored in JCR LIVE    │
└──────────────┬──────────────────────┘
               │
               ├─────────────────────────────────────┐
               │                                     │
       ┌───────▼────────┐              ┌─────────────▼──────┐
       │ survey-module  │              │ survey-service     │
       │ (React/Vite)   │◄────────────►│ (OSGi/GraphQL)    │
       └────────────────┘              └────────────────────┘
            • Form UI                       • Mutations
            • Results Chart                 • JCR Persistence
            • Client-side state             • Permission gating
```

## Modules

### [survey-module](survey-module/README.md)

**Front-end React template set** – renders interactive survey forms and live results charts.

**Key responsibilities:**
- Displays questions and answer options fetched from JCR content
- Collects visitor responses with email validation
- Submits answers via the `survey` GraphQL mutation (exposed by `survey-service`)
- Renders aggregated response counts as horizontal bar charts (Recharts)
- Manages countdown timer and disables submissions when the survey closes

**Tech stack:** Node.js, React, TypeScript, Vite, Recharts, i18next, CSS Modules

### [survey-service](survey-service/README.md)

**Back-end OSGi bundle** – exposes GraphQL mutations and persists survey responses to JCR.

**Key responsibilities:**
- Validates and rate-limits submissions (one email per survey)
- Writes `svy:surveyResponse` and `svy:questionResponse` nodes to the `responses/` child list under the survey node
- Uses a system JCR session for persistence – anonymous visitors require no extra permissions
- Exposes the `survey.submitResponse` mutation via `graphql-dxm-provider`

**Tech stack:** Java 11, Maven, OSGi, Jahia GraphQL API

## Workflow

1. **Content Creation** — Editor creates a survey in jContent with questions and answer options.
2. **Front-end Rendering** — `survey-module` fetches the survey structure via `QUESTIONS_QUERY` and renders a form.
3. **Submission** — Visitor fills the form and submits; `survey-module` calls `survey.submitResponse` mutation.
4. **Persistence** — `survey-service` validates the email, checks for duplicates, and writes the response to JCR LIVE.
5. **Results Display** — After submission (or when the survey closes), `survey-module` fetches results via `RESULTS_QUERY` and displays charts.
6. **AI Analysis (Optional)** — Back-office editors can run DeepSeek analysis on responses; `survey-service` proxies the analysis request via `SurveyAnalysisAction` and stores results as a `svy:surveyAnalysis` node in JCR.

## Setup

### Prerequisites

| Component | Tool | Version |
|---|---|---|
| Both | Jahia | 8.2+ |
| survey-module | Node.js | ≥ 18 |
| survey-module | Yarn | ≥ 1.22 |
| survey-service | JDK | 11+ |
| survey-service | Maven | 3.8+ |

### Quick Start

1. **Build and deploy survey-service first** (GraphQL mutations must be available):
   ```bash
   cd survey-service
   mvn clean install
   mvn jahia:deploy   # or copy target/*.jar to Jahia's module deployer
   ```

2. **Build and deploy survey-module**:
   ```bash
   cd survey-module
   yarn install
   yarn build
   yarn jahia-deploy
   ```

3. **Verify** — In the Jahia Administration panel, confirm both bundles are active.

## Configuration

### Environment variables (survey-module)

Create a `.env` file at the `survey-module/` root for deployment:

```
JAHIA_URL=https://your-jahia-instance.com
JAHIA_USERNAME=jahia_admin
JAHIA_PASSWORD=<password>
```

### API authorisation (survey-service)

The bundle ships with an authorisation policy that grants GraphQL access to the `survey` namespace for hosted contexts. No additional configuration is required.

## Content Type Definitions

Both modules ship with Jahia custom node type definitions (`.cnd` files):

- `survey-module/settings/definitions.cnd` — `svy:survey`, `svy:question`, `svy:answerOption` types
- `survey-service` uses the same types via the shared definitions

## Development

### survey-module

```bash
yarn dev           # Start Vite dev server (watch mode)
yarn build         # Production build
yarn lint          # ESLint
yarn format        # Prettier
```

### survey-service

```bash
mvn clean compile  # Compile and check for errors
mvn clean install  # Full build + unit tests
```

## Testing

- **survey-module:** ESLint, TypeScript type checking, visual testing in Jahia
- **survey-service:** JUnit tests (see `src/test/` if present); manual integration testing via GraphQL playground

## Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| Form not submitting | `survey-service` bundle inactive | Check Jahia admin > Bundles; ensure survey-service is deployed and running |
| "Duplicate email" error | Visitor has already submitted to this survey | Clear browser local storage for that survey path, or use a different email |
| Responses not persisting | Permission issues on `responses/` node | `survey-service` uses system session; check logs for JCR errors |
| Results chart not displaying | `RESULTS_QUERY` returns null | Verify at least one response has been submitted and that the responses node exists |

## References

- [survey-module README](survey-module/README.md) — Front-end setup, component usage, scripts
- [survey-service README](survey-service/README.md) — GraphQL API, Maven build, module structure
- [Jahia Documentation](https://academy.jahia.com) — Content types, permissions, GraphQL API
