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
```

## API authorisation

The bundle ships an API authorisation policy (`org.jahia.bundles.api.authorization-survey-service.yaml`) that grants access to the `survey` GraphQL namespace for requests originating from hosted (server-side) contexts. No additional configuration is required for standard deployments.

## Error handling

| Scenario | Behaviour |
|---|---|
| Duplicate email | Returns `code: DUPLICATE_EMAIL`, HTTP 200 |
| Survey node not found | Logs error, throws `DataFetchingException` |
| Unexpected JCR error | Logs full stack trace, wraps in `SurveyServiceException` |
