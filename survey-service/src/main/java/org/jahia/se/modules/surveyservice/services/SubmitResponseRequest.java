package org.jahia.se.modules.surveyservice.services;

import java.util.Calendar;
import java.util.Collections;
import java.util.List;

/**
 * Immutable value object carrying a validated survey response submission.
 * Build via {@link #builder(String, String)}.
 */
public final class SubmitResponseRequest {

    private final String surveyPath;
    private final String email;
    private final List<Answer> answers;
    private final Calendar submittedAt;

    private SubmitResponseRequest(Builder b) {
        this.surveyPath = b.surveyPath;
        this.email = b.email;
        this.answers = Collections.unmodifiableList(b.answers);
        this.submittedAt = b.submittedAt != null ? (Calendar) b.submittedAt.clone() : Calendar.getInstance();
    }

    /**
     * @return absolute JCR path of the {@code svy:survey} node, e.g. {@code /sites/mySite/home/survey}
     */
    public String getSurveyPath() { return surveyPath; }

    /**
     * @return the participant's email address, trimmed and lower-case-comparable
     */
    public String getEmail() { return email; }

    /**
     * @return unmodifiable list of per-question answers; may be empty if no questions were answered
     */
    public List<Answer> getAnswers() { return answers; }

    /**
     * @return a defensive copy of the submission timestamp
     */
    public Calendar getSubmittedAt() { return (Calendar) submittedAt.clone(); }

    /**
     * Creates a new builder for the given survey and participant email.
     *
     * @param surveyPath absolute JCR path of the {@code svy:survey} node
     * @param email      participant's email address (validated before calling this)
     * @return a mutable builder
     */
    public static Builder builder(String surveyPath, String email) {
        return new Builder(surveyPath, email);
    }

    /**
     * Immutable value object carrying one question's selected answer option identifiers.
     */
    public static final class Answer {
        private final String questionPath;
        private final List<String> chosenOptionIds;

        /**
         * @param questionPath    absolute JCR path of the {@code svy:question} node
         * @param chosenOptionIds UUIDs of the selected {@code svy:answerOption} nodes
         */
        public Answer(String questionPath, List<String> chosenOptionIds) {
            this.questionPath = questionPath;
            this.chosenOptionIds = Collections.unmodifiableList(chosenOptionIds);
        }

        /** @return absolute JCR path of the {@code svy:question} node */
        public String getQuestionPath() { return questionPath; }

        /** @return unmodifiable list of selected option UUIDs */
        public List<String> getChosenOptionIds() { return chosenOptionIds; }
    }

    /**
     * Fluent builder for {@link SubmitResponseRequest}.
     * Not thread-safe; use within a single thread.
     */
    public static final class Builder {
        private final String surveyPath;
        private final String email;
        private List<Answer> answers = Collections.emptyList();
        private Calendar submittedAt;

        private Builder(String surveyPath, String email) {
            this.surveyPath = surveyPath;
            this.email = email;
        }

        /**
         * @param answers one entry per answered question; {@code null} entries are ignored by the service
         * @return this builder
         */
        public Builder withAnswers(List<Answer> answers) {
            this.answers = answers;
            return this;
        }

        /**
         * @param submittedAt submission timestamp; defaults to {@link Calendar#getInstance()} if not set
         * @return this builder
         */
        public Builder withSubmittedAt(Calendar submittedAt) {
            this.submittedAt = submittedAt;
            return this;
        }

        /**
         * Builds the immutable request.
         *
         * @return a new {@link SubmitResponseRequest}
         */
        public SubmitResponseRequest build() {
            return new SubmitResponseRequest(this);
        }
    }
}
