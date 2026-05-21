import { gql } from "graphql-tag";

/**
 * Fetches questions and answer options for a survey node.
 * Used by the server component to hydrate the form and results chart.
 */
export const QUESTIONS_QUERY = gql`
  query SurveyQuestions($path: String!, $language: String!) {
    jcr(workspace: LIVE) {
      nodeByPath(path: $path) {
        uuid
        workspace
        children(typesFilter: { types: ["svy:question"] }) {
          nodes {
            uuid
            workspace
            path
            displayName(language: $language)
            textProp: property(name: "text") {
              value
            }
            allowMultipleProp: properties(names: ["allowMultiple"]) {
              values
            }
            children(typesFilter: { types: ["svy:answerOption"] }) {
              nodes {
                uuid
                workspace
                displayName(language: $language)
                descProp: property(name: "text") {
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetches aggregated response counts for a survey's responses child node.
 * Used by the server component to render the results chart.
 */
export const RESULTS_QUERY = gql`
  query SurveyResults($responsesPath: String!) {
    jcr(workspace: LIVE) {
      nodeByPath(path: $responsesPath) {
        uuid
        workspace
        children(typesFilter: { types: ["svy:surveyResponse"] }) {
          pageInfo {
            totalCount
          }
          nodes {
            uuid
            workspace
            children(typesFilter: { types: ["svy:questionResponse"] }) {
              nodes {
                uuid
                workspace
                questionId: property(name: "questionPath") {
                  value
                }
                chosenOptions: property(name: "chosenOptions") {
                  values
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Submits a visitor's answers for a survey.
 * Executed client-side via the Jahia GraphQL endpoint.
 * Returns a success flag, a result code (OK | DUPLICATE_EMAIL), and the new response UUID.
 */
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
