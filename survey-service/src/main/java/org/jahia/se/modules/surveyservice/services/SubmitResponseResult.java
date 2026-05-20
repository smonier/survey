package org.jahia.se.modules.surveyservice.services;

/**
 * Immutable outcome of a {@link SurveyResponseService#submit} call.
 *
 * <p>Carries a machine-readable {@link #getCode() code} and, on success, the JCR UUID
 * of the created response node. Business-logic rejections (e.g. duplicate email) are
 * represented here rather than as exceptions.</p>
 */
public final class SubmitResponseResult {

    /** Returned when the response was accepted and persisted successfully. */
    public static final String CODE_OK = "OK";

    /** Returned when the participant's email address was already used for this survey. */
    public static final String CODE_DUPLICATE_EMAIL = "DUPLICATE_EMAIL";

    private final boolean success;
    private final String code;
    private final String responseId;

    /**
     * Constructs a result without a response node UUID (used for rejection outcomes).
     *
     * @param success {@code false} for all rejection codes
     * @param code    one of {@link #CODE_OK}, {@link #CODE_DUPLICATE_EMAIL}
     */
    public SubmitResponseResult(boolean success, String code) {
        this(success, code, null);
    }

    /**
     * Constructs a result with a response node UUID (used for successful persistence).
     *
     * @param success    {@code true} when the node was written
     * @param code       {@link #CODE_OK}
     * @param responseId JCR UUID of the created {@code svy:surveyResponse} node
     */
    public SubmitResponseResult(boolean success, String code, String responseId) {
        this.success = success;
        this.code = code;
        this.responseId = responseId;
    }

    /**
     * Whether the submission was accepted.
     *
     * @return {@code true} on success, {@code false} on any rejection
     */
    public boolean isSuccess() { return success; }

    /**
     * Machine-readable outcome code.
     *
     * @return {@link #CODE_OK} or {@link #CODE_DUPLICATE_EMAIL}
     */
    public String getCode() { return code; }

    /**
     * JCR UUID of the persisted {@code svy:surveyResponse} node.
     *
     * @return the node UUID, or {@code null} when the submission was rejected
     */
    public String getResponseId() { return responseId; }
}
