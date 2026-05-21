# survey-service

Jahia OSGi bundle that exposes a `survey` GraphQL mutation and persists survey responses to the JCR LIVE workspace. Companion back-end service for **survey-module**.

## Responsibilities

- Validates and rate-limits submissions (one response per email per survey)
- Writes `svy:surveyResponse` / `svy:questionResponse` nodes under a `responses/` child list using a system JCR session — no guest write permissions required on content nodes
- Exposes the mutation via `graphql-dxm-provider` using `graphql-java-annotations`

## GraphQL API

```graphql
mutation SubmitSurveyResponse(
  $surveyPath: String!
  $email:      String!
  $answers:    [AnswerInput!]!
) {
  survey {
    submitResponse(surveyPath: $surveyPath, email: $email, answers: $answers) {
      success
      code          # "OK" | "DUPLICATE_EMAIL"
      responseUuid
    }
  }
}
```

`AnswerInput`:

```graphql
input AnswerInput {
  questionIdentifier: String!
  selectedOptions:    [String!]!
}
```

## Prerequisites

| Tool | Version |
|---|---|
| JDK | 11 (Jahia 8.2 baseline) |
| Maven | 3.8+ |
| Jahia | 8.2+ with `graphql-dxm-provider` ≥ 3.4 active |

## Build & deploy

```bash
mvn clean install
# copy target/survey-service-*.jar to Jahia's module deployer, or:
mvn jahia:deploy   # if the Jahia Maven plugin is configured in settings.xml
```

## Module structure

```
src/main/java/…/surveyservice/
  actions/
    SurveyAnalysisAction.java          # OSGi Action, proxies DeepSeek API
  graphql/
    SurveyMutations.java               # @GraphQLField methods (submitResponse)
    SurveyMutationsExtension.java      # Hooks mutations onto root Mutation type
    SurveyGraphQLExtensionsProvider.java
    AnswerInput.java                   # GraphQL input type
    SurveyResponsePayload.java         # GraphQL return type
  services/
    SurveyResponseService.java         # OSGi @Component, JCR persistence
    SubmitResponseRequest.java
    SubmitResponseResult.java          # result codes: OK, DUPLICATE_EMAIL
    SurveyServiceException.java
  util/
    RequestUtil.java                   # HTTP request helpers

src/javascript/
  SurveyAnalytics/
    AiAnalysis/
      AiAnalysis.jsx                   # Back-office AI analysis UI component
  graphql/
    queries.js                         # All GraphQL queries (LIST, DETAIL, RESULTS, ANALYSIS, RESPONDENTS)
```

## API authorisation

The bundle ships an API authorisation policy (`org.jahia.bundles.api.authorization-survey-service.yaml`) that grants access to the `survey` GraphQL namespace for requests originating from hosted (server-side) contexts. No additional configuration is required for standard deployments.

## Error handling

| Scenario | Behaviour |
|---|---|
| Duplicate email | Returns `code: DUPLICATE_EMAIL`, HTTP 200 |
| Survey node not found | Logs error, throws `DataFetchingException` |
| Unexpected JCR error | Logs full stack trace, wraps in `SurveyServiceException` |

## AI Analysis Feature

**Optional back-office analytics:** Back-office editors can analyze survey responses using DeepSeek AI. The analysis summarizes trends, identifies common themes, and provides insights on respondent feedback.

### How it works

1. **UI:** Back-office Analytics tab (React component `AiAnalysis.jsx`) displays survey overview, results, and an "Analyze with AI" button.
2. **Submission:** Editor clicks "Run Analysis"; UI collects survey title, questions, and aggregated vote counts.
3. **API Call:** Frontend POSTs to `SurveyAnalysisAction` endpoint (`POST /cms/render/default/{lang}{surveyPath}.surveyAnalysisAction.do`) with survey data.
4. **DeepSeek Integration:** Backend proxies request to DeepSeek API (`https://api.deepseek.com/v1/chat/completions`), sending survey context and response data.
5. **Storage:** Analysis result is stored as a `svy:analysisJson` property in a `svy:surveyAnalysis` node (child of survey) in JCR LIVE.
6. **Display:** UI fetches stored analysis via `SURVEY_ANALYSIS_QUERY` and renders formatted report with priority tags and timeline recommendations.

### Configuration

Set these properties in `org.jahia.se.modules.surveyservice.cfg`:

```properties
DEEPSEEK_API_KEY=sk-<your-api-key>
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
DEEPSEEK_TIMEOUT_MS=60000
```

**Required:** `DEEPSEEK_API_KEY` must be non-empty for the AI Analysis feature to work.

### GraphQL Queries

**Back-office analytics UI uses these queries:**

```graphql
# Fetch all surveys for a site
query ListSurveys($paths: [String]) {
  jcr(workspace: LIVE) {
    nodesByCriteria(criteria: {nodeType: "svy:survey", paths: $paths, pathType: ANCESTOR}) {
      nodes { uuid workspace displayName ... }
    }
  }
}

# Fetch survey questions and answer options
query SurveyDetail($surveyPath: String!, $lang: String!) {
  jcr(workspace: LIVE) {
    nodeByPath(path: $surveyPath) {
      uuid workspace
      questions: children(typesFilter: {types: ["svy:question"]}) {
        nodes { uuid workspace displayName allowMultiple
          options: children(typesFilter: {types: ["svy:answerOption"]}) {
            nodes { uuid workspace displayName }
          }
        }
      }
    }
  }
}

# Fetch aggregated response counts
query SurveyResults($surveyPath: String!) {
  jcr(workspace: LIVE) {
    nodeByPath(path: $surveyPath) {
      uuid workspace
      responsesNode: descendant(relPath: "responses") {
        uuid workspace
        children(typesFilter: {types: ["svy:surveyResponse"]}) {
          pageInfo { totalCount }
          nodes {
            uuid workspace
            children(typesFilter: {types: ["svy:questionResponse"]}) {
              nodes { uuid workspace questionId chosenOptions }
            }
          }
        }
      }
    }
  }
}

# Fetch stored AI analysis
query SurveyStoredAnalysis($surveyPath: String!) {
  jcr(workspace: LIVE) {
    nodeByPath(path: $surveyPath) {
      uuid workspace
      aiAnalysis: descendant(relPath: "aiAnalysis") {
        uuid workspace
        analysisJson: property(name: "svy:analysisJson") { value }
        surveyTitle: property(name: "svy:surveyTitle") { value }
        generatedAt: property(name: "svy:generatedAt") { value }
      }
    }
  }
}
```

### Endpoint

```
POST /cms/render/default/{language}{surveyPath}.surveyAnalysisAction.do
```

**Request body:**

```json
{
  "surveyTitle": "Customer Satisfaction Survey",
  "surveyData": {
    "questions": [
      {"id": "q1", "text": "How satisfied are you?", "type": "rating"},
      {"id": "q2", "text": "Would you recommend us?", "type": "choice"}
    ],
    "voteCounts": {
      "q1": {"1": 10, "2": 25, "3": 45, "4": 30, "5": 50},
      "q2": {"Yes": 140, "No": 20}
    },
    "totalResponses": 160
  }
}
```

**Response:**

```json
{
  "success": true,
  "analysis": {
    "overallSentiment": "Positive",
    "keythemes": ["Product quality", "Delivery speed", "Customer support"],
    "recommendations": [
      {"priority": "high", "timeline": "immediate", "action": "Address shipping delays mentioned by 15% of respondents"},
      {"priority": "medium", "timeline": "this-week", "action": "Improve product documentation"}
    ]
  }
}
```

### Troubleshooting

| Issue | Solution |
|---|---|
| "Missing DEEPSEEK_API_KEY" | Set `DEEPSEEK_API_KEY` in `.cfg` file and restart bundle |
| "Invalid JSON response (HTTP 200)" | Check survey path encoding, verify contextPath in jContent URL |
| Analysis button disabled | Ensure bundle is ACTIVE, check browser console for fetch errors |
| DeepSeek API timeout | Increase `DEEPSEEK_TIMEOUT_MS` in config (default 60000) |
