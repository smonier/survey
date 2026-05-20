# Agents — survey-module Harness

AI coding harness for the `survey-module` Jahia JS add-on module. Read this after `CLAUDE.md` (or after the AIStartupKit harness README if working across both repos).

---

## What this module is

A **Jahia JS add-on module** (`module-type: "module"`) providing a droppable `svy:survey` component. Editors place surveys on any page managed by an existing template set. The module does **not** control page `<head>` — CSS is injected via `<AddResources>`.

JCR namespace: `svy` / `svymix`. Parent mixin: `svymix:component`.

---

## Layout

```
survey-module/
├── src/components/Survey/
│   ├── Survey/          ← main SDC: server view + client islands
│   ├── Question/        ← jmix:hiddenType (editor sub-item only)
│   └── AnswerOption/    ← jmix:hiddenType (editor sub-item only)
├── settings/
│   ├── definitions.cnd  ← namespace declarations + response/storage types
│   ├── resources/       ← CND / editor labels (.properties)
│   └── locales/         ← UI strings (en.json, fr.json)
└── .agents/             ← this harness
```

---

## Skill map

| Skill | When to use |
|---|---|
| [`survey-dev-add-question-type`](skills/survey-dev-add-question-type/SKILL.md) | Add a new question variant (e.g. text input, rating scale) |

### Context documents

| Document | When to load |
|---|---|
| [`context/survey-module-architecture.md`](context/survey-module-architecture.md) | Architecture decisions, JCR tree, component data flow, storage model |

---

## Key conventions for this module

- **`mix:title`** — title comes from `jcr:title` via this standard mixin, not a custom property.
- **`jmix:hiddenType`** — `svy:question`, `svy:answerOption`, `svy:surveyResponse`, `svy:questionResponse` are all hidden; editors manage them via jContent's child-item interface, never via the content picker.
- **Ordering** — Jahia handles child-node ordering via drag-drop when `orderable` is declared; no `displayOrder` property.
- **Anonymous form submission** — delegated to `survey-service` (OSGi Java bundle) via GraphQL mutation. The module never writes to JCR directly from client code.
- **Client islands** — `SurveyForm.client.tsx` (form + countdown) and `SurveyResults.client.tsx` (Recharts bar chart). Both use `useTranslation()` — no `lang` prop for translations. `lang` prop is passed to `SurveyResultsChart` only for `Intl.NumberFormat`.
- **CSS** — `component.module.css` for the server component, `survey.css` (plain, not CSS Modules) for client islands to avoid hydration class-name mismatch.
- **i18n** — `settings/resources/survey-module*.properties` for CND/editor labels; `settings/locales/en.json` + `fr.json` for UI strings. Both EN and FR are required.

---

## JCR tree (runtime)

```
/sites/<site>/contents/
└── <survey-node> (svy:survey, mix:title)
    ├── <question-1> (svy:question)
    │   ├── <option-a> (svy:answerOption)
    │   └── <option-b> (svy:answerOption)
    └── responses (jnt:contentList, hidden)
        └── <uuid> (svy:surveyResponse)
            └── <uuid>-q1 (svy:questionResponse)
```

---

## Companion module

`survey-service` (OSGi Java bundle) — exposes the `survey.submitResponse` GraphQL mutation. It writes `svy:surveyResponse` nodes to the LIVE workspace as a system session so anonymous visitors don't need JCR write permissions. See its own `.agents/README.md`.
