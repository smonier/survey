package org.jahia.se.modules.surveyservice.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;

/**
 * GraphQL input type carrying a single question-option selection.
 *
 * <p>The client sends one {@code AnswerInput} per selected option. For single-choice questions
 * there is one entry per question; for multi-choice questions there is one entry per selected
 * option. The service groups entries by {@link #getQuestionPath()} to reconstruct the full
 * answer for each question.</p>
 *
 * <p><strong>Design note:</strong> the previous design used a {@code List<String> chosenOptionIds}
 * field, which graphql-java-annotations fails to deserialize silently (generic type erasure means
 * the setter receives a {@code List<Object>} but the framework cannot match it to the setter
 * signature). Using two plain {@code String} fields is the only reliable approach.</p>
 */
@GraphQLName("SurveyAnswerInput")
@GraphQLDescription("One question-option selection from a survey participant")
public class AnswerInput {

    private String questionPath;
    private String optionId;

    /**
     * JCR path of the {@code svy:question} node this answer belongs to.
     *
     * @return absolute JCR path, never {@code null}
     */
    @GraphQLField
    @GraphQLNonNull
    @GraphQLDescription("JCR path of the svy:question node")
    public String getQuestionPath() {
        return questionPath;
    }

    /**
     * Sets the question path. Called by graphql-java-annotations during input deserialization.
     *
     * @param questionPath absolute JCR path of the {@code svy:question} node
     */
    public void setQuestionPath(String questionPath) {
        this.questionPath = questionPath;
    }

    /**
     * UUID of the selected {@code svy:answerOption} node.
     *
     * @return option UUID, never {@code null}
     */
    @GraphQLField
    @GraphQLNonNull
    @GraphQLDescription("UUID of the selected svy:answerOption node")
    public String getOptionId() {
        return optionId;
    }

    /**
     * Sets the selected option UUID. Called by graphql-java-annotations during input deserialization.
     *
     * @param optionId UUID of the selected {@code svy:answerOption} node
     */
    public void setOptionId(String optionId) {
        this.optionId = optionId;
    }
}
