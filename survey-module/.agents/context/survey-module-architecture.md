# Context — survey-module Architecture

Architecture decisions, data flow, and JCR storage model for the `survey-module` Jahia JS add-on.

---

## Module type

`"module-type": "module"` in `package.json` — this is an **add-on module**, not a template set. It contributes droppable content components only. It does not control page `<head>`, scripts, or CSS injection automatically; CSS is injected per-component via `<AddResources type="css" resources="dist/assets/style.css" />`.

---

## Content type hierarchy

```
svymix:component          ← module mixin (> jmix:droppableContent, jmix:accessControllableContent)
  └── svy:survey          ← main droppable component (> jnt:content, svymix:component, mix:title)
        ├── svy:question        (jmix:hiddenType, orderable)
        │     └── svy:answerOption  (jmix:hiddenType)
        └── [responses]         (jnt:contentList, hidden child)
              ├── svy:surveyResponse  (jmix:hiddenType)
              │     └── svy:questionResponse  (jmix:hiddenType)
```

**Why `jmix:hiddenType` for structural types?** — Prevents `svy:question`, `svy:answerOption`, and the response types from appearing in the content picker. Editors manage them as child items within the `svy:survey` editor form, not as standalone content.

**Why `mix:title` and not a custom `title` property?** — `mix:title` is the Jahia standard mixin that provides `jcr:title` (i18n). Using it gives editors a consistent "Title" field and participates in Jahia's built-in title-based search and display. Never add a custom `title` property when this mixin is available.

---

## Rendering pipeline

```
default.server.tsx (SSR)
  ├── useGQLQuery(QUESTIONS_QUERY)   → question + option nodes
  ├── useGQLQuery(RESULTS_QUERY)     → aggregates response counts
  ├── computes: isClosed, isNotStarted, questions[], results{}
  └── renders:
        ├── if not started → <p> with t("survey.timer-starts", {date})
        ├── if closed      → <Island component={SurveyResultsChart} clientOnly />
        └── if open        → <Island component={SurveyForm} />
```

**Why two unconditional `useGQLQuery` calls?** — React hooks cannot be called conditionally. Both queries run on every render; the results are only used in the branches where they're relevant.

**Why `clientOnly` on `SurveyResultsChart`?** — Recharts uses browser APIs (`window`, `ResizeObserver`) that are unavailable during SSR. `clientOnly` skips server rendering and hydrates directly on the client.

---

## Anonymous form submission

The `SurveyForm` island posts a GraphQL mutation to `/modules/graphql`:

```graphql
mutation SubmitSurveyResponse($surveyPath: String!, $email: String!, $answers: [InputSurveyAnswerInput]!) {
  survey {
    submitResponse(...) { success code responseId }
  }
}
```

This mutation is provided by **`survey-service`** (OSGi Java bundle). It runs as a system session in the LIVE workspace, so anonymous visitors don't need JCR write permissions.

The CSRF guard is the `X-Requested-With: XMLHttpRequest` header — checked in `SurveyMutations.java`. No CSRF token exchange needed.

---

## Duplicate detection

Two-layer approach:

1. **Client-side (localStorage)** — `svy_submitted_<surveyPath>` key set after successful submission. Immediate UX: the form switches to a "thank you" state without a network round-trip on revisit.
2. **Server-side (JCR scan)** — `SurveyResponseService` scans `responses/` for an existing node with the same email (case-insensitive). Authoritative deduplication that survives browser data clearing. Returns `DUPLICATE_EMAIL` code.

---

## Results computation

Done server-side in `default.server.tsx`:

```
RESULTS_QUERY → all svy:surveyResponse nodes
  → each svy:questionResponse { questionPath, chosenOptions[] }
  → aggregated into: results[questionPath][optionId] = count
```

The aggregated `results` object is passed as serialized JSON to the `SurveyResultsChart` Island. No client-side data fetching for results.

---

## i18n

| Layer | Location | Used for |
|---|---|---|
| CND / editor labels | `settings/resources/survey-module*.properties` | jContent field labels, tooltips, type names |
| UI strings | `settings/locales/en.json`, `fr.json` | React component text (buttons, errors, messages) |

Key naming in `.properties`: `ns_typeName=Label` (type), `ns_typeName.propertyName=Label` (field), `ns_typeName.propertyName.ui.tooltip=...` (tooltip). **No `.label` suffix anywhere.**

```properties
# ✅ Correct — property key uses the local property name (no namespace prefix in second segment)
svy_survey.description=Description
svy_survey.active=Active
svy_question.text=Description
svy_answerOption.text=Option Text

# ❌ Wrong — namespace prefix must NOT be repeated on the property name
svy_survey.svy_description=Description   ← breaks: Jahia ignores the key entirely
svy_question.svy_text=Description        ← breaks
```

`useTranslation()` from `react-i18next` works in both `.server.tsx` and `.client.tsx`. Locale is injected automatically — do not pass a `lang` prop to Islands for translation purposes. Pass `lang` only for `Intl` / `toLocaleString` number/date formatting.

---

## GraphQL query constraints (Jahia-specific)

Jahia's graphql-java rejects any selection set where the **same field name appears more than once**, even with different aliases. "Query did not validate" in server logs is the symptom.

```graphql
# ❌ Fails — `property` appears twice in the same selection set
desc: property(name: "text", language: $language) { value }
allowMultiple: property(name: "allowMultiple") { value }

# ✅ Works — use `property` (singular) once and `properties` (plural) for any additional fields
description: property(name: "text", language: $language) { value }
allowMultipleProp: properties(names: ["allowMultiple"]) { value }
```

`property` and `properties` are distinct field names — no conflict. For node titles use `displayName` (resolves `jcr:title` via `mix:title` from the session locale) instead of `property(name: "jcr:title")`.

---

## CSS conventions

- `component.module.css` — CSS Modules, scoped to the server component. Class names are transformed at build time.
- `survey.css` — Plain CSS (not CSS Modules), imported directly in client islands. Required because CSS Module class name hashing differs between server and client bundles, causing hydration mismatches.

---

## Lessons learned (traps encountered during development)

These are bugs that recurred and must not be repeated.

### 1. `<AddResources>` — always `resources`, never `url`, always `buildModuleFileUrl()`

```tsx
// ❌ WRONG — prop name is wrong, TypeScript error, resource never loads
<AddResources type="css" url="dist/assets/style.css" />
<AddResources type="css" url={buildModuleFileUrl("dist/assets/style.css")} />

// ❌ WRONG — bare string does not resolve to the module-scoped URL at runtime
<AddResources type="css" resources="dist/assets/style.css" />

// ✅ CORRECT — prop name is `resources`, value is buildModuleFileUrl(...)
<AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} key="survey-module-css" />
```

The `key` prop is required when the same component may be placed more than once on a page — Jahia deduplicates resource injections by key.

### 2. CSS custom properties must be in `:root`

```css
/* ❌ WRONG — tokens scoped to a component class cascade into Islands via CSS vars
   BUT: Islands are hydrated as independent DOM subtrees. Tokens on .survey-wizard
   are only visible to children inside that element, which breaks if the Island
   root isn't that element, and prevents global overrides. */
.survey-wizard { --svy-accent: #4F46E5; }

/* ✅ CORRECT — define tokens in :root for global cascade */
:root { --svy-accent: #4F46E5; }
```

### 3. Every `var()` must have a fallback

```css
/* ❌ WRONG — if the variable is not defined (Island hydrated before :root loads), renders transparent/invisible */
background: var(--svy-accent);

/* ✅ CORRECT — fallback ensures the component is always visible */
background: var(--svy-accent, #4F46E5);
```

### 4. `displayName` requires an explicit `language` argument

```graphql
# ❌ WRONG — returns the system node name (e.g. "j:question_0") not the i18n title
displayName

# ✅ CORRECT — resolves jcr:title from mix:title in the requested locale
displayName(language: $language)
```

Without `language: $language`, `displayName` falls back to the JCR node name, not the editor-contributed title. Pass `$language: String!` to the query and populate it from `currentResource.getLocale().getLanguage()`.

### 5. `property` vs `properties` field name and response shape

```graphql
# property (singular) → { value: string }
textProp: property(name: "text") { value }

# properties (plural) → { values: string[] }
allowMultipleProp: properties(names: ["allowMultiple"]) { values }
```

Do NOT use `{ value }` on `properties` (it returns `values`). Do NOT use `{ values }` on `property` (it returns `value`). Both `property` and `properties` can coexist in the same selection set — they are distinct field names. The failure mode is `undefined` data silently, no GraphQL error.

### 6. Duplicate field names in a GQL selection set → "Query did not validate"

Jahia's graphql-java rejects selection sets where the same field name appears more than once. Use aliases or the alternate singular/plural form:

```graphql
# ❌ FAILS — `property` appears twice → "Query did not validate" in server logs
desc: property(name: "text") { value }
allow: property(name: "allowMultiple") { value }

# ✅ WORKS — one `property`, one `properties`
desc: property(name: "text") { value }
allow: properties(names: ["allowMultiple"]) { values }
```

### 7. `useGQLQuery` always queries the DEFAULT/EDIT workspace — use `jcr(workspace: LIVE)` explicitly

The Jahia GraphQL endpoint (`/modules/graphql`) and `useGQLQuery` always resolve bare `jcr { }` against the **DEFAULT (EDIT) workspace**, regardless of:
- Whether the user is logged in or anonymous
- Whether the rendering context is LIVE or EDIT
- Whether the caller is server-side or client-side

For any content that lives in the LIVE workspace (published content, UGC written directly to LIVE), `nodeByPath` with bare `jcr { }` will throw `PathNotFoundException` even if the node visibly exists.

```graphql
# ❌ WRONG — queries DEFAULT workspace; anonymous users get PathNotFoundException,
#           published-only content returns null for everyone
query SurveyQuestions($path: String!) {
  jcr {
    nodeByPath(path: $path) { ... }
  }
}

# ✅ CORRECT — explicitly targets LIVE workspace where published content lives
query SurveyQuestions($path: String!) {
  jcr(workspace: LIVE) {
    nodeByPath(path: $path) { ... }
  }
}
```

**Rule for survey-module**: always use `jcr(workspace: LIVE)` in `useGQLQuery` calls. Survey questions and responses are published/UGC content — they only exist in LIVE. Edit-mode previewing of draft questions is done through jContent's content editor, not through the rendered component.

### 8. `graphql-java-annotations` prefixes input types with `Input` — always introspect before writing a mutation

`graphql-java-annotations` automatically renames input object types by prepending `Input` to the `@GraphQLName` value. A Java class annotated `@GraphQLName("SurveyAnswerInput")` appears in the live schema as **`InputSurveyAnswerInput`**.

```graphql
# ❌ WRONG — @GraphQLName value is NOT the schema type name for input objects
mutation SubmitSurveyResponse($answers: [SurveyAnswerInput]!) { ... }

# ✅ CORRECT
mutation SubmitSurveyResponse($answers: [InputSurveyAnswerInput]!) { ... }
```

**Rule**: always introspect before writing a mutation that uses input types:
```graphql
{ __type(name: "SurveyMutations") { fields { name args { name type { kind name ofType { kind name } } } } } }
```

### 8. GQL mutation input list nullability — `[Type]!` not `[Type!]!`

When a Java mutation parameter is declared as `@GraphQLNonNull List<AnswerInput> answers`, the graphql-java schema type is `[SurveyAnswerInput]!` — a non-null LIST of nullable items.

```graphql
# ❌ WRONG — adds item-level non-null, rejected by graphql-java strict validation
mutation SubmitSurveyResponse($answers: [SurveyAnswerInput!]!) { ... }

# ✅ CORRECT — matches the Java-derived schema: non-null list, nullable items
mutation SubmitSurveyResponse($answers: [SurveyAnswerInput]!) { ... }
```

The `@GraphQLNonNull` annotation in Java applies to the LIST ITSELF, not to each individual item inside it. To make individual items non-null you would need `@GraphQLNonNull` on the generic type parameter, which graphql-java does not support via annotations — it would require a custom `GraphQLInputType`.
