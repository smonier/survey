---
name: survey-dev-jahia-module-patterns
description: Common patterns, pitfalls, and solutions when developing Jahia JavaScript modules — GraphQL queries, bundle dependencies, and debugging strategies.
---

# Skill — Jahia Module Development Patterns

Lessons learned from the survey-module and survey-service implementations.

---

## GraphQL Cache Key Fields

**Problem:** Apollo Client logs `Missing fields uuid,workspace while extracting key from GenericJCRNode` warnings when querying JCR nodes without including cache key fields.

**Solution:** Always include `uuid` and `workspace` on every `GenericJCRNode` selection, even if you only use properties:

```graphql
query SurveyQuestions($path: String!, $language: String!) {
  jcr(workspace: LIVE) {
    nodeByPath(path: $path) {
      uuid              # ← Always include
      workspace        # ← Always include
      children(typesFilter: { types: ["svy:question"] }) {
        nodes {
          uuid          # ← Always include
          workspace    # ← Always include
          path
          displayName(language: $language)
          property(name: "text") { value }
        }
      }
    }
  }
}
```

**Why:** Apollo normalizes cache keys for nodes as `GenericJCRNode:<uuid>:<workspace>`. Without these fields, the normalizer logs a warning for each query result and cannot properly deduplicate cached objects.

---

## Action Endpoint Response Debugging

**Problem:** Action returns HTTP 200, but UI displays red error without clear diagnostics.

**Root causes:**
1. Hardcoded UI language in action URL path (e.g., `/cms/render/default/en{path}.action.do`) doesn't match user's jContent UI language.
2. Action fails silently, returning an HTML error page or login redirect as HTTP 200 (valid response, but not JSON).
3. Frontend fetch blindly calls `res.json()` without inspecting `res.text()` first.

**Solution:**

1. **Dynamic URL language:**
   ```typescript
   const buildActionUrl = () => {
       const ctx = window?.contextJsParameters?.contextPath || '';
       const uiLang = lang || window?.contextJsParameters?.uilang || 'en';
       const encodedPath = encodeURI(surveyPath || '');
       return `${ctx}/cms/render/default/${uiLang}${encodedPath}.surveyAnalysisAction.do`;
   };
   ```

2. **Robust fetch response handling:**
   ```typescript
   const res = await fetch(buildActionUrl(), {
       method: 'POST',
       headers: {
           'Content-Type': 'application/json',
           Accept: 'application/json',
           'X-Requested-With': 'XMLHttpRequest'
       },
       credentials: 'same-origin',
       body: JSON.stringify(payload)
   });

   const rawBody = await res.text();
   let data;
   try {
       data = JSON.parse(rawBody);
   } catch {
       const preview = (rawBody || '').trim().slice(0, 220).replace(/\s+/g, ' ');
       throw new Error(`Invalid JSON response (HTTP ${res.status}). ${preview}`);
   }

   if (!data.success) {
       throw new Error(data.error || `HTTP ${res.status}`);
   }
   ```

   This exposes the actual response body, allowing you to spot HTML render errors, CSRF failures, or permission issues immediately.

3. **Backend logging:**
   ```java
   log.info("SurveyAnalysisAction request: method={} uri={}", req.getMethod(), req.getRequestURI());
   // ... after success
   log.info("SurveyAnalysisAction success: result={}", result);
   ```

---

## Isolated GraphQL Queries

**Pattern:** When multiple components use the same GraphQL queries, extract them into a dedicated `queries.ts` file.

**File structure:**
```
src/components/Survey/Survey/
  ├── default.server.tsx      (imports from queries.ts)
  ├── SurveyForm.client.tsx   (imports from queries.ts)
  ├── queries.ts              (all gql`` definitions)
  └── types.ts
```

**Benefits:**
- Single source of truth for query definitions.
- Easier to refactor/expand query selections (e.g., adding cache key fields).
- Reduces boilerplate in component files.

**Example — queries.ts:**
```typescript
import { gql } from "graphql-tag";

export const QUESTIONS_QUERY = gql`
  query SurveyQuestions($path: String!, $language: String!) {
    jcr(workspace: LIVE) {
      nodeByPath(path: $path) {
        uuid
        workspace
        // ... rest of query
      }
    }
  }
`;

export const SUBMIT_MUTATION = /* GraphQL */ `
  mutation SubmitSurveyResponse($surveyPath: String!, $email: String!, $answers: [InputSurveyAnswerInput]!) {
    survey {
      submitResponse(surveyPath: $surveyPath, email: $email, answers: $answers) {
        success
        code
        responseId
      }
    }
  }
`;
```

---

## Testing Strategy

1. **Type checking:** `tsc --noEmit` catches query/response type mismatches early.
2. **Lint:** `eslint .` enforces code style and imports.
3. **Manual end-to-end:** Load the component in Jahia, trigger the action, inspect browser console and Jahia logs for diagnostics.

---

## Best Practices Checklist

- [ ] Always include `uuid` and `workspace` in JCR node selections.
- [ ] Use dynamic language in action URLs, not hardcoded `/en`.
- [ ] Log action request/response for debugging HTTP 200 non-JSON errors.
- [ ] Extract shared GraphQL queries to a dedicated file.
- [ ] Add `Accept: application/json` header to action requests.
- [ ] Validate JSON response before assuming shape; expose raw body in error messages.
- [ ] Run `yarn lint` and `tsc --noEmit` before building.
