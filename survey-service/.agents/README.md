# Agents — survey-service Harness

AI coding harness for the `survey-service` Jahia OSGi Java bundle. Read this after `CLAUDE.md` (or after the AIStartupKit harness README if working across both repos).

---

## What this module is

A **pure Java OSGi bundle** (no front-end) that provides a GraphQL extension to the Jahia DX GraphQL API. Its sole purpose is to allow **anonymous visitors** to submit survey responses without needing JCR write permissions — it writes to the LIVE workspace as a system session.

Companion module: `survey-module` (JS/React add-on) — see its own `.agents/README.md`.

---

## Layout

```
survey-service/
├── src/main/java/org/jahia/se/modules/surveyservice/
│   ├── graphql/
│   │   ├── SurveyGraphQLExtensionsProvider.java  ← OSGi marker
│   │   ├── SurveyMutationsExtension.java         ← @GraphQLTypeExtension
│   │   ├── SurveyMutations.java                  ← mutation resolvers
│   │   ├── AnswerInput.java                      ← GQL input type
│   │   └── SurveyResponsePayload.java            ← GQL output type
│   └── services/
│       ├── SurveyResponseService.java            ← OSGi DS component
│       ├── SubmitResponseRequest.java            ← immutable request model
│       ├── SubmitResponseResult.java             ← result codes
│       └── SurveyServiceException.java
└── .agents/                                       ← this harness
```

---

## Skill map

No module-specific skills yet. Use these AIStartupKit skills:

| Skill | When to use |
|---|---|
| `/jahia-osgi-module` | Maven setup, DS annotations, JCR patterns, testing |

### Context documents

| Document | When to load |
|---|---|
| [`context/survey-service-patterns.md`](context/survey-service-patterns.md) | GraphQL extension wiring, anonymous-write pattern, CSRF approach |

---

## Key invariants for this module

- **`@GraphQLField` on every getter** — both input types (`AnswerInput`) and output types (`SurveyResponsePayload`) require `@GraphQLField` on every getter. Missing it produces an empty type in the schema and breaks the entire mutation.
- **System session in LIVE** — `JCRTemplate.getInstance().doExecuteWithSystemSessionAsUser(null, Constants.LIVE_WORKSPACE, null, callback)`. Never use a user session for anonymous UGC writes. Never escalate to system for anything else.
- **CSRF guard** — `X-Requested-With: XMLHttpRequest` header checked in `SurveyMutations.java`. No CSRF config file needed (XHR-header approach, not the OSGi `.cfg` whitelist approach).
- **GraphQL authorization** — `src/main/resources/META-INF/configurations/org.jahia.bundles.api.authorization-survey-service.yaml` grants anonymous access to the `graphql` API.
- **`Jahia-Depends: default,survey-module`** — in `pom.xml`. The service depends on the module's CND definitions (`svy:survey`, `svy:surveyResponse`, etc.) being present.
- **No `@GraphQLNonNull` on setters** — only on getters. Setters are plain Java — no GQL annotations.
