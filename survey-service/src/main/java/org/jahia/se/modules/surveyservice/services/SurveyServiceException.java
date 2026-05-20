package org.jahia.se.modules.surveyservice.services;

/**
 * Signals an unrecoverable failure during survey response persistence.
 *
 * <p>Thrown by {@link SurveyResponseService#submit} when a {@link javax.jcr.RepositoryException}
 * or other infrastructure error prevents the response from being written to the JCR.
 * Business-logic rejections (e.g. duplicate email) are communicated via
 * {@link SubmitResponseResult} codes, not this exception.</p>
 */
public class SurveyServiceException extends Exception {

    /**
     * Constructs an exception with a descriptive message and no cause.
     *
     * @param message human-readable description of the failure
     */
    public SurveyServiceException(String message) {
        super(message);
    }

    /**
     * Constructs an exception wrapping an underlying infrastructure error.
     *
     * @param message human-readable description of the failure
     * @param cause   the original {@link javax.jcr.RepositoryException} or similar
     */
    public SurveyServiceException(String message, Throwable cause) {
        super(message, cause);
    }
}
