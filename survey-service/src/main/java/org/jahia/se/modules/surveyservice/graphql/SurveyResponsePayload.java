package org.jahia.se.modules.surveyservice.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import org.jahia.se.modules.surveyservice.services.SubmitResponseResult;

/**
 * GraphQL output type returned by the {@code survey.submitResponse} mutation.
 *
 * <p>Wraps a {@link SubmitResponseResult} and exposes its fields to the GraphQL schema.
 * All three fields are read-only; instances are created exclusively by
 * {@link SurveyMutations#submitResponse}.</p>
 */
@GraphQLName("SurveyResponsePayload")
@GraphQLDescription("Result of a survey response submission")
public class SurveyResponsePayload {

    private final boolean success;
    private final String code;
    private final String responseId;

    /**
     * Wraps a service result into the GraphQL payload.
     *
     * @param result the outcome from {@link org.jahia.se.modules.surveyservice.services.SurveyResponseService#submit}
     */
    public SurveyResponsePayload(SubmitResponseResult result) {
        this.success = result.isSuccess();
        this.code = result.getCode();
        this.responseId = result.getResponseId();
    }

    /**
     * Whether the response was accepted and written to the JCR.
     *
     * @return {@code true} on success, {@code false} on duplicate or error
     */
    @GraphQLField
    @GraphQLNonNull
    @GraphQLDescription("True when the response was accepted and persisted")
    public boolean isSuccess() {
        return success;
    }

    /**
     * Machine-readable outcome code.
     *
     * @return {@code OK} on success, {@code DUPLICATE_EMAIL} when the address was already used
     */
    @GraphQLField
    @GraphQLNonNull
    @GraphQLDescription("OK | DUPLICATE_EMAIL")
    public String getCode() {
        return code;
    }

    /**
     * JCR UUID of the created {@code svy:surveyResponse} node.
     *
     * @return the node UUID, or {@code null} when the submission was rejected
     */
    @GraphQLField
    @GraphQLDescription("JCR UUID of the created response node, null on failure")
    public String getResponseId() {
        return responseId;
    }
}
