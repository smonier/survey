/**
 * GraphQL queries for the Survey Analytics back-office UI extension.
 *
 * All queries target jcr(workspace: LIVE) because survey responses are
 * written directly to the LIVE workspace as UGC.
 *
 * @apollo/client is a Module Federation shared singleton provided by jcontent.
 * No explicit Apollo client setup is needed — useQuery/useApolloClient hooks
 * resolve against jcontent's pre-configured client (/modules/graphql endpoint,
 * session-cookie auth).
 */
import {gql} from '@apollo/client';

/**
 * List all svy:survey nodes under a site.
 * Uses nodesByCriteria with ANCESTOR pathType so the site path is a proper GQL variable.
 *
 * Variables: { paths: ['/sites/<siteKey>'] }
 */
export const LIST_SURVEYS_QUERY = gql`
    query ListSurveys($paths: [String]) {
        jcr(workspace: LIVE) {
            nodesByCriteria(criteria: {
                nodeType: "svy:survey"
                paths: $paths
                pathType: ANCESTOR
            }) {
                nodes {
                    uuid
                    workspace
                    path
                    name
                    displayName(language: "en")
                    activeProp: property(name: "active") { value }
                    startDateProp: property(name: "startDate") { value }
                    endDateProp: property(name: "endDate") { value }
                    questions: children(typesFilter: { types: ["svy:question"] }) {
                        pageInfo { totalCount }
                    }
                    responsesNode: descendant(relPath: "responses") {
                        uuid
                        workspace
                        responseSummary: children(typesFilter: { types: ["svy:surveyResponse"] }) {
                            pageInfo { totalCount }
                            nodes {
                                uuid
                                workspace
                                completedProp: property(name: "completed") { value }
                                submittedAtProp: property(name: "submittedAt") { value }
                            }
                        }
                    }
                }
            }
        }
    }
`;

/**
 * Fetch questions and answer options for a specific survey.
 *
 * Variables: { surveyPath: String!, lang: String! }
 */
export const SURVEY_DETAIL_QUERY = gql`
    query SurveyDetail($surveyPath: String!, $lang: String!) {
        jcr(workspace: LIVE) {
            nodeByPath(path: $surveyPath) {
                uuid
                workspace
                displayName(language: $lang)
                questions: children(typesFilter: { types: ["svy:question"] }) {
                    nodes {
                        uuid
                        workspace
                        displayName(language: $lang)
                        allowMultiple: property(name: "allowMultiple") { value }
                        options: children(typesFilter: { types: ["svy:answerOption"] }) {
                            nodes {
                                uuid
                                workspace
                                displayName(language: $lang)
                            }
                        }
                    }
                }
            }
        }
    }
`;

/**
 * Fetch all responses with their vote data for the Results tab.
 * Navigates via descendant(relPath:"responses") so that a missing /responses
 * node returns null instead of throwing PathNotFoundException.
 *
 * Variables: { surveyPath: String! }
 */
export const SURVEY_RESULTS_QUERY = gql`
    query SurveyResults($surveyPath: String!) {
        jcr(workspace: LIVE) {
            nodeByPath(path: $surveyPath) {
                uuid
                workspace
                responsesNode: descendant(relPath: "responses") {
                    uuid
                    workspace
                    children(typesFilter: { types: ["svy:surveyResponse"] }) {
                        pageInfo { totalCount }
                        nodes {
                            uuid
                            workspace
                            children(typesFilter: { types: ["svy:questionResponse"] }) {
                                nodes {
                                    uuid
                                    workspace
                                    questionId: property(name: "questionPath") { value }
                                    chosenOptions: property(name: "chosenOptions") { values }
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
 * Fetch paginated respondents with their answers.
 * Navigates via descendant(relPath:"responses") so that a missing /responses
 * node returns null instead of throwing PathNotFoundException.
 * Set limit=9999 offset=0 for a full export fetch.
 *
 * Variables: { surveyPath: String!, limit: Int!, offset: Int! }
 */
/**
 * Read the stored AI analysis for a survey from the LIVE workspace.
 * The `svy:surveyAnalysis` node is created as a child named "aiAnalysis"
 * under the survey node by SaveAnalysisAction (written directly to LIVE).
 * Uses descendant(relPath:"aiAnalysis") to return null gracefully when
 * the node does not yet exist, avoiding PathNotFoundException.
 *
 * Every GenericJCRNode selection MUST include uuid + workspace so Apollo
 * Client can build a stable cache key. Omitting them triggers the
 * "Missing fields uuid,workspace" console warning and degrades caching.
 *
 * Variables: { surveyPath: String! }
 */
export const SURVEY_ANALYSIS_QUERY = gql`
    query SurveyStoredAnalysis($surveyPath: String!) {
        jcr(workspace: LIVE) {
            nodeByPath(path: $surveyPath) {
                uuid
                workspace
                aiAnalysis: descendant(relPath: "aiAnalysis") {
                    uuid
                    workspace
                    analysisJson: property(name: "svy:analysisJson") { value }
                    surveyTitle:  property(name: "svy:surveyTitle")  { value }
                    generatedAt:  property(name: "svy:generatedAt")  { value }
                }
            }
        }
    }
`;

export const SURVEY_RESPONDENTS_QUERY = gql`
    query SurveyRespondents($surveyPath: String!, $limit: Int!, $offset: Int!) {
        jcr(workspace: LIVE) {
            nodeByPath(path: $surveyPath) {
                uuid
                workspace
                responsesNode: descendant(relPath: "responses") {
                    uuid
                    workspace
                    children(
                        typesFilter: { types: ["svy:surveyResponse"] }
                        limit: $limit
                        offset: $offset
                    ) {
                        pageInfo { totalCount }
                        nodes {
                            uuid
                            workspace
                            emailProp: property(name: "email") { value }
                            submittedAtProp: property(name: "submittedAt") { value }
                            completedProp: property(name: "completed") { value }
                            answers: children(typesFilter: { types: ["svy:questionResponse"] }) {
                                nodes {
                                    uuid
                                    workspace
                                    qId: property(name: "questionPath") { value }
                                    opts: property(name: "chosenOptions") { values }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`;
