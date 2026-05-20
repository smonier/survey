# survey-module

Jahia front-end module that renders interactive surveys and displays live results. Built with React (client components) and Vite; deployed as a standard Jahia JS template set.

Depends on **survey-service** for GraphQL mutation support and server-side response persistence.

## Features

- Editors create surveys in jContent by composing `svy:question` and `svy:answerOption` child nodes (drag-drop ordering)
- Per-question single or multiple-choice support
- Optional countdown timer with automatic hard cutoff
- Email-gated submissions — one response per email address per survey
- Live horizontal bar charts (Recharts) once the survey closes or the visitor has already submitted
- Internationalised out of the box: EN + FR

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 18 |
| Yarn | ≥ 1.22 |
| Jahia | 8.2+ with `survey-service` bundle active |

## Getting started

```bash
yarn install
yarn build
yarn jahia-deploy   # requires JAHIA_* env vars or a local .env file
```

## Adding a survey

1. In jContent, create a **Survey** (`svy:survey`) content node in any page area.
2. Add one or more **Question** (`svy:question`) children and set the `type` property (`single` or `multiple`).
3. Add **Answer Option** (`svy:answerOption`) children to each question.
4. (Optional) Set `countdown` to a future ISO date/time to enable the timer.
5. Publish the page — the form is immediately live.

## Permissions — anonymous submissions

The front-end submits responses through the `survey` GraphQL mutation exposed by `survey-service`, which uses a system JCR session internally. No extra JCR permissions are required on the survey node for anonymous visitors.

## Node structure

```
<survey-node>/              svy:survey
  <question>/               svy:question   (orderable, hidden)
    <option>/               svy:answerOption (orderable, hidden)
  responses/                jnt:contentList  (managed by survey-service)
    <uuid>/                 svy:surveyResponse
      <uuid>/               svy:questionResponse
```

## Scripts

| Script | Description |
|---|---|
| `build` | Type-check + Vite production build + pack |
| `deploy` | Push artifact to running Jahia instance |
| `dev` | Vite watch mode (local development only) |
| `format` | Prettier |
| `lint` | ESLint |
