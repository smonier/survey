# Context — survey-service Patterns

GraphQL extension wiring, anonymous-write JCR pattern, and CSRF approach used in `survey-service`.

---

## GraphQL extension wiring

Jahia DX GraphQL extensions require **three collaborating classes**:

### 1. `DXGraphQLExtensionsProvider` marker

```java
@Component(service = DXGraphQLExtensionsProvider.class, immediate = true)
public class SurveyGraphQLExtensionsProvider implements DXGraphQLExtensionsProvider {
    // No methods — the DXGraphQLProvider scans for this service
    // and includes all @GraphQLTypeExtension classes in the same bundle.
}
```

### 2. `@GraphQLTypeExtension` on the extension class

```java
@GraphQLTypeExtension(DXGraphQLProvider.Mutation.class)
public final class SurveyMutationsExtension {
    @GraphQLField
    @GraphQLName("survey")
    @GraphQLDescription("Survey-related mutations")
    public static SurveyMutations survey() {
        return new SurveyMutations();
    }
}
```

This adds a `survey` field to the root `Mutation` type.

### 3. Mutation resolver class

```java
public class SurveyMutations {
    @Inject @GraphQLOsgiService
    private SurveyResponseService surveyResponseService;

    @GraphQLField
    @GraphQLName("submitResponse")
    public SurveyResponsePayload submitResponse(
            @GraphQLName("surveyPath") @GraphQLNonNull String surveyPath,
            @GraphQLName("email") @GraphQLNonNull String email,
            @GraphQLName("answers") @GraphQLNonNull List<AnswerInput> answers,
            DataFetchingEnvironment env) throws Exception {
        // ...
    }
}
```

**Critical: `@GraphQLField` on every getter of every GQL type (input AND output).**

---

## `@GraphQLField` rule — always annotate all getters

`graphql-java-annotations` reflects on getters to build the schema. Any getter without `@GraphQLField` is silently omitted — producing an empty input or output type. An empty input type causes schema generation to fail; an empty output type causes runtime null results.

```java
// AnswerInput — input type
@GraphQLName("SurveyAnswerInput")
public class AnswerInput {
    @GraphQLField @GraphQLNonNull
    public String getQuestionPath() { return questionPath; }

    @GraphQLField @GraphQLNonNull
    public List<String> getChosenOptionIds() { return chosenOptionIds; }

    // Setters have NO GQL annotations
    public void setQuestionPath(String v) { this.questionPath = v; }
    public void setChosenOptionIds(List<String> v) { ... }
}

// SurveyResponsePayload — output type
public class SurveyResponsePayload {
    @GraphQLField @GraphQLNonNull
    public boolean isSuccess() { return success; }

    @GraphQLField @GraphQLNonNull
    public String getCode() { return code; }

    @GraphQLField
    public String getResponseId() { return responseId; }
}
```

---

## Anonymous write — system session in LIVE

The submit mutation must write `svy:surveyResponse` nodes even when called by an unauthenticated visitor. The approach:

```java
JCRTemplate.getInstance().doExecuteWithSystemSessionAsUser(
    null,                         // null = system user
    Constants.LIVE_WORKSPACE,     // write directly to live
    null,                         // no locale needed
    session -> {
        // create nodes, session.save()
        return result;
    }
);
```

**Why LIVE workspace directly?** — Survey responses are user-generated content (UGC), not editorial content. They don't go through the default→live publication workflow. Writing directly to LIVE means responses are immediately visible to result aggregation.

**Why system session?** — Anonymous visitors have no JCR credentials. The `survey-service` is the trusted gatekeeper: it validates input, deduplicates by email, then writes with system authority.

---

## CSRF protection

The XHR-header approach (not the OSGi whitelist `.cfg` approach):

```java
// In SurveyMutations.submitResponse():
String xhrHeader = env.getContext().get("request") instanceof HttpServletRequest req
    ? req.getHeader("X-Requested-With")
    : null;
if (!"XMLHttpRequest".equals(xhrHeader)) {
    throw new IllegalStateException("XHR header required");
}
```

The client (`SurveyForm.client.tsx`) always sends `"X-Requested-With": "XMLHttpRequest"`. Browsers block cross-origin custom headers (CORS preflight), so this alone prevents CSRF from third-party origins.

---

## GraphQL authorization YAML

Anonymous visitors need access to the `graphql` API:

```yaml
# src/main/resources/META-INF/configurations/org.jahia.bundles.api.authorization-survey-service.yaml
survey-service:
  description: "Survey service — public response submission"
  auto_apply:
    - origin: hosted
  grants:
    - api:
        include: graphql
```

Without this, anonymous calls to the GraphQL endpoint return 401.

---

## Duplicate email detection

`SurveyResponseService.submit()` scans the `responses/` contentList for an existing `svy:surveyResponse` node with a matching email (case-insensitive):

```java
NodeIterator it = responsesNode.getNodes();
while (it.hasNext()) {
    JCRNodeWrapper existing = (JCRNodeWrapper) it.nextNode();
    if (existing.isNodeType("svy:surveyResponse")) {
        String storedEmail = existing.getPropertyAsString("email");
        if (email.equalsIgnoreCase(storedEmail)) {
            return SubmitResponseResult.duplicate();
        }
    }
}
```

This is O(n) in the number of responses. For large surveys, consider indexing by email or using a JCR-SQL2 query with a constraint. Acceptable at current scale.

---

## Result codes

`SubmitResponseResult` carries a `code` string consumed by the client:

| Code | Meaning |
|---|---|
| `OK` | Response recorded successfully |
| `DUPLICATE_EMAIL` | Email already submitted for this survey |

The GraphQL payload returns `{ success: Boolean, code: String, responseId: String }`.

---

## Lessons learned (traps encountered during development)

### 1. `graphql-java-annotations` never calls setters on INPUT objects — read raw args from `DataFetchingEnvironment`

**Root cause (confirmed via diagnostic logging):** `graphql-java-annotations` creates `AnswerInput` instances via the default constructor but **never invokes the setter methods**. Every field on every instance stays `null` regardless of what the client sent. This manifests as `answers=0` in service logs even when the client clearly sent data.

**Previous (wrong) diagnosis:** The first hypothesis was "type erasure for `List<String>` fields" — this is a real issue but not the root cause. Even replacing `List<String>` with `String` (simple scalar fields) did not help. The setters are simply never called for input objects inside lists.

**The fix:** bypass graphql-java-annotations' broken coercion entirely and read the raw argument from `DataFetchingEnvironment`:

```java
// ✅ CORRECT — read raw argument from DataFetchingEnvironment
// graphql-java always provides List<Map<String,Object>> for INPUT_OBJECT lists,
// regardless of what graphql-java-annotations does with the typed parameter.
@SuppressWarnings("unchecked")
List<Map<String, Object>> rawAnswers =
        (List<Map<String, Object>>) environment.getArgument("answers");

Map<String, List<String>> byQuestion = rawAnswers == null
        ? Collections.emptyMap()
        : rawAnswers.stream()
                .filter(m -> m != null
                        && m.get("questionPath") instanceof String
                        && m.get("optionId") instanceof String)
                .collect(Collectors.groupingBy(
                        m -> (String) m.get("questionPath"),
                        Collectors.mapping(m -> (String) m.get("optionId"), Collectors.toList())));
```

The `List<AnswerInput> answers` typed parameter can remain in the method signature (graphql-java-annotations needs it for schema generation) — just never USE it at runtime. Always read from `environment.getArgument(...)` instead.

**Diagnostic code** (add temporarily when debugging):

```java
log.info("DEBUG answers: typed list size={}, class of first={}",
    answers == null ? "null" : answers.size(),
    (answers != null && !answers.isEmpty()) ? answers.get(0).getClass().getName() : "n/a");
// If this shows correct size but getQuestionPath()==null, setters are not being called.
// If this shows correct fields, typed parameter works and raw DFE is not needed.
```

**Rule**: For any INPUT_OBJECT list argument in graphql-java-annotations, always use `DataFetchingEnvironment.getArgument("fieldName")` and cast to `List<Map<String, Object>>`. Never rely on the typed parameter for the actual data.

### 2. `graphql-java-annotations` prefixes input types with `Input` — use `InputXxx` in client mutations

`graphql-java-annotations` automatically renames input object types by prepending `Input` to the class's `@GraphQLName` value. A class annotated `@GraphQLName("SurveyAnswerInput")` appears in the schema as **`InputSurveyAnswerInput`**.

```graphql
# ❌ WRONG — the @GraphQLName value is NOT the schema type name for input objects
mutation SubmitSurveyResponse($answers: [SurveyAnswerInput]!) { ... }

# ✅ CORRECT — graphql-java-annotations prepends "Input"
mutation SubmitSurveyResponse($answers: [InputSurveyAnswerInput]!) { ... }
```

**How to verify**: run an introspection query against the live schema — never guess from the Java annotation:
```graphql
{ __type(name: "SurveyMutations") { fields { name args { name type { kind name ofType { kind name } } } } } }
```

### 2. GQL mutation list input nullability — `[InputSurveyAnswerInput]!` not `[InputSurveyAnswerInput!]!`

The Java signature:

```java
@GraphQLName("answers") @GraphQLNonNull List<AnswerInput> answers
```

The `@GraphQLNonNull` annotation applies to the **LIST**, not to each item inside it. The resulting schema type is `[SurveyAnswerInput]!` — a non-null list of nullable items. Declaring `[SurveyAnswerInput!]!` in a client mutation adds item-level non-null that does not exist in the schema; Jahia's strict graphql-java validator rejects the query with "Query did not validate".

```graphql
# ❌ WRONG — item-level non-null not present in Java-derived schema
mutation SubmitSurveyResponse($answers: [SurveyAnswerInput!]!) { ... }

# ✅ CORRECT — matches @GraphQLNonNull on the list, not on items
mutation SubmitSurveyResponse($answers: [SurveyAnswerInput]!) { ... }
```

### 2. `SurveyMutations` is not an OSGi-managed component

`SurveyMutationsExtension.survey()` calls `return new SurveyMutations()` — a plain `new`, not an OSGi service lookup. This means `@Inject @GraphQLOsgiService` annotations inside `SurveyMutations` are resolved by graphql-java-annotations at field injection time (not by OSGi DS). If a service cannot be found, injection is silently skipped and calls on the null field throw `NullPointerException` at runtime. Ensure `SurveyResponseService` is registered and active before invoking the mutation.

### 3. Every UGC node that stores children must declare `+ * (childType)` in the CND

Without an explicit child node definition, Jackrabbit refuses `addNode()` with `ConstraintViolationException`. The service silently creates the parent node (the session save succeeds for the parent) but never reaches the child `addNode()` calls — leaving orphan parent nodes with no data.

```cnd
// ❌ WRONG — svy:surveyResponse has no child definition; addNode("svy:questionResponse") is rejected
[svy:surveyResponse] > jnt:content, jmix:hiddenType
 - email (string)
 - submittedAt (date)

// ✅ CORRECT — explicit child definition allows question responses to be stored
[svy:surveyResponse] > jnt:content, jmix:hiddenType
 orderable
 - email (string)
 - submittedAt (date)
 + * (svy:questionResponse)
```

**Rule**: every CND type that stores child nodes must declare those children. Follow the chain: `svy:responseList → svy:surveyResponse → svy:questionResponse`.

### 4. Never use `jnt:contentList` as a UGC response container written in LIVE

`jnt:contentList` carries `jmix:mainResource`, `jmix:editorialContent`, and versioning child semantics (`+ * (jnt:content) = jnt:contentList version`). Writing child nodes directly to a `jnt:contentList` in the LIVE workspace fails with `ConstraintViolationException` because of those versioning constraints.

**Rule**: define a custom container type for any UGC written directly to LIVE. The container must extend `jnt:content` and `jmix:hiddenType`, list the allowed child type explicitly, and carry NO content-area mixins:

```cnd
// ✅ Correct — custom lightweight container
[svy:responseList] > jnt:content, jmix:hiddenType
  orderable
  + * (svy:surveyResponse)

// In the parent type — use the custom container, not jnt:contentList
[svy:survey] > ...
  + responses (svy:responseList) hidden
```

```java
// ✅ Correct — create with the custom type
surveyNode.addNode("responses", "svy:responseList");

// ❌ Wrong — jnt:contentList rejects direct LIVE writes
surveyNode.addNode("responses", "jnt:contentList");
```

### 4. `@GraphQLField` is required on every getter — including input types

Omitting `@GraphQLField` on any getter of `AnswerInput` causes graphql-java-annotations to silently exclude that field. If ALL getters are missing the annotation, the input type becomes empty and schema generation fails. If some are missing, the mutation receives `null` for those fields. Always annotate every getter on both input and output types.

### 5. `property(name: ...)` vs `properties(names: [...])` return different shapes — never confuse them

In Jahia's JCR GraphQL API:

| Query | Return type | Access pattern |
|---|---|---|
| `property(name: "x")` | Single `JCRProperty` object `{ value, values }` | `prop.values` |
| `properties(names: ["x"])` | **Array** of `JCRProperty` objects `[{ value, values }]` | `props[0].values` |

Using `properties(names: [...]) { values }` and then accessing `.values` on the result in TypeScript always returns `undefined` — because the result is an array, and arrays don't have a `.values` field. The symptom is vote counts showing 0 even when data is correctly stored in JCR.

```graphql
# ❌ WRONG — returns Array; .values on an array is undefined in TypeScript
chosenOptions: properties(names: ["chosenOptions"]) { values }

# ✅ CORRECT — returns single object; .values works
chosenOptions: property(name: "chosenOptions") { values }
```

Use `property(name: ...)` (singular) when you know the property name. Use `properties(names: [...])` only when you need to batch multiple properties and will iterate the result array.

### 6. Always use UUID — never node path — as the stable cross-context identifier

In Jahia, the same JCR node can have **different `path` values** depending on how it was accessed:

| Access method | Path returned by GQL `path` field |
|---|---|
| Directly via content path | `/sites/jsmod/contents/Survey/crm-day/question` |
| Via `jnt:contentReference` (render path) | `/sites/jsmod/home/page/area/ref@/ref/question` |

The `path` field mirrors how the node was resolved — not the node's canonical JCR path. If a consumer stores a path that was obtained via one access method and then tries to match it against paths from a different access method, the strings don't match and data is silently lost.

**UUID is always the same** regardless of access method.

```typescript
// ❌ WRONG — path varies by access context
const questions = rawQuestions.map((q) => ({ id: q.path, ... }));
// If the survey is placed in a page area via jnt:contentReference,
// q.path = "/sites/.../home/page/area/ref@/ref/question"
// A response submitted via direct access stores "/sites/.../contents/survey/question"
// → paths don't match → votes invisible in results

// ✅ CORRECT — UUID is stable regardless of access context
const questions = rawQuestions.map((q) => ({ id: q.uuid, ... }));
// UUID never changes — always the same JCR identifier
```

**Rule**: Use `uuid` (not `path`) as the key any time you need to match JCR nodes across different rendering or storage contexts. This applies to question IDs stored in survey responses, content references, and any cross-context identity check.

---

## Apollo Client cache key rule — always include `uuid` and `workspace`

### The problem

Apollo Client normalises the cache using a composite key per type. For Jahia's `GenericJCRNode` the key is `uuid + workspace`. If **either field is absent** from a selection set, Apollo cannot build the key and logs:

```
Missing fields uuid,workspace while extracting key from GenericJCRNode
```

This also disables cross-query deduplication and forces per-query re-fetching, hurting performance.

### The rule

Every `GenericJCRNode` selection — whether it is a top-level `nodeByPath`, a `children.nodes` list, or an aliased descendant — **must include `uuid` and `workspace`**.

```graphql
# ❌ WRONG — triggers "Missing fields" warning, breaks caching
jcr(workspace: LIVE) {
    nodeByPath(path: $surveyPath) {
        aiAnalysis: descendant(relPath: "aiAnalysis") {
            analysisJson: property(name: "svy:analysisJson") { value }
        }
    }
}

# ✅ CORRECT — every node level includes uuid + workspace
jcr(workspace: LIVE) {
    nodeByPath(path: $surveyPath) {
        uuid
        workspace
        aiAnalysis: descendant(relPath: "aiAnalysis") {
            uuid
            workspace
            analysisJson: property(name: "svy:analysisJson") { value }
        }
    }
}
```

### Checklist when writing a new query

- [ ] `nodeByPath(...)` → add `uuid workspace`
- [ ] `nodesByQuery(...).nodes` → add `uuid workspace`
- [ ] `nodesByCriteria(...).nodes` → add `uuid workspace`
- [ ] `children(...).nodes` → add `uuid workspace`
- [ ] `descendant(relPath: "...")` result → add `uuid workspace`
- [ ] `nodeInWorkspace(...)` result → add `uuid workspace`

Property nodes (`property(name: ...) { value }`) are **not** `GenericJCRNode` and do **not** need `uuid`/`workspace`.
