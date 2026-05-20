---
name: survey-dev-add-question-type
description: Add a new question variant to the survey (e.g. text input, rating scale, date picker) — CND extension, editor labels, and SurveyForm rendering update.
---

# Skill — Add a Question Type to survey-module

Use this skill when adding a new question variant beyond the existing checkbox/radio model.

---

## Step 1 — Define the variant in CND

`svy:question` already carries `allowMultiple (boolean)`. For a new structural variant:

1. Add a `type (string, choicelist[resourceBundle])` property to `svy:question` with values for each variant.
2. Or add a new child node type that extends `jnt:content, jmix:hiddenType` if the variant needs its own child structure.

Example — adding a `text` (free-text) variant via a choicelist:

```cnd
[svy:question] > jnt:content, jmix:hiddenType
 orderable
 - text (string) i18n
 - allowMultiple (boolean)
 - type (string, choicelist[resourceBundle]) = 'choice' autocreated < 'choice','text','rating'
 + * (svy:answerOption) = svy:answerOption
```

## Step 2 — Add editor labels

In `settings/resources/survey-module.properties` and `_fr.properties`:

```properties
svy_question.svy_type=Question Type
svy_question.svy_type.ui.tooltip=<b>Question Type</b> — choice: radio/checkbox options; text: free-text answer; rating: numeric scale.
svy_question.svy_type.choice=Choice (radio / checkbox)
svy_question.svy_type.text=Free text
svy_question.svy_type.rating=Rating (1–5)
```

## Step 3 — Add UI strings

In `settings/locales/en.json` and `fr.json`, add any new client-side labels under the `"survey"` namespace.

## Step 4 — Update QUESTIONS_QUERY

In `default.server.tsx`, extend the GQL query to fetch the new property:

```graphql
typeProperty: property(name: "type") { value }
```

## Step 5 — Update types.ts

Add the new field to `Question`:

```ts
export type Question = {
  ...
  type: "choice" | "text" | "rating";
};
```

## Step 6 — Update SurveyForm.client.tsx

Branch on `q.type` to render the appropriate input control.

## Step 7 — Build and deploy

```bash
yarn build && yarn jahia-deploy
```
