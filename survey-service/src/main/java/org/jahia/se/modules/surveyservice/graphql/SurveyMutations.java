package org.jahia.se.modules.surveyservice.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import graphql.schema.DataFetchingEnvironment;
import org.apache.commons.lang3.StringUtils;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.modules.graphql.provider.dxm.osgi.annotations.GraphQLOsgiService;
import org.jahia.se.modules.surveyservice.services.SubmitResponseRequest;
import org.jahia.se.modules.surveyservice.services.SubmitResponseResult;
import org.jahia.se.modules.surveyservice.services.SurveyResponseService;
import org.jahia.se.modules.surveyservice.services.SurveyServiceException;
import org.jahia.se.modules.surveyservice.util.RequestUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.inject.Inject;
import javax.servlet.http.HttpServletRequest;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * GraphQL mutation resolver for the {@code survey} namespace.
 *
 * <p>Exposed on the root {@code Mutation} type via {@link SurveyMutationsExtension}. A new
 * instance is created per request by that extension's static factory method; OSGi service
 * injection is performed by {@code graphql-java-annotations} using {@code @Inject @GraphQLOsgiService}.</p>
 *
 * <p><strong>Threading:</strong> not thread-safe — one instance per request, no shared mutable state.</p>
 */
@GraphQLDescription("GraphQL mutations for public survey response submission")
public class SurveyMutations {

    private static final Logger log = LoggerFactory.getLogger(SurveyMutations.class);
    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private SurveyResponseService responseService;

    /**
     * Injected by {@code graphql-java-annotations} via OSGi service lookup.
     * Called once after instantiation before any field method is invoked.
     *
     * @param responseService the active service instance; never {@code null} when the bundle is healthy
     */
    @Inject
    @GraphQLOsgiService
    public void setResponseService(SurveyResponseService responseService) {
        this.responseService = responseService;
    }

    /**
     * Submits a participant's answers for a survey. Rejects duplicate email addresses
     * within the same survey. Writes to the LIVE workspace via a system session so that
     * anonymous visitors do not need JCR write permissions.
     *
     * @param surveyPath      JCR path of the {@code svy:survey} node
     * @param email           participant's email address (used for duplicate detection)
     * @param answers         one entry per answered question
     * @param environment     GraphQL context (used for CSRF check)
     * @return payload indicating success, failure code, and the created node UUID
     */
    @GraphQLField
    @GraphQLName("submitResponse")
    @GraphQLDescription("Submit a participant's answers for a survey")
    public SurveyResponsePayload submitResponse(
            @GraphQLName("surveyPath") @GraphQLNonNull String surveyPath,
            @GraphQLName("email") @GraphQLNonNull String email,
            @GraphQLName("answers") @GraphQLNonNull List<AnswerInput> answers,
            DataFetchingEnvironment environment) {

        HttpServletRequest request = RequestUtil.extractHttpServletRequest(environment)
                .orElseThrow(() -> new DataFetchingException("Unable to resolve HTTP request from context"));

        guardXhr(request);

        String cleanEmail = StringUtils.trimToNull(email);
        if (cleanEmail == null || !EMAIL_PATTERN.matcher(cleanEmail).matches()) {
            throw new DataFetchingException("Invalid email address");
        }

        if (StringUtils.isBlank(surveyPath) || !surveyPath.startsWith("/sites/")) {
            throw new DataFetchingException("Invalid surveyPath — must be an absolute JCR path under /sites/");
        }

        // graphql-java-annotations creates AnswerInput instances via the default constructor but
        // does NOT call the setters — all fields stay null regardless of what the client sends.
        // The reliable workaround is to read the raw GraphQL argument directly from the
        // DataFetchingEnvironment: for INPUT_OBJECT arguments graphql-java always provides a
        // List<Map<String,Object>> before framework coercion is attempted.
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rawAnswers =
                (List<Map<String, Object>>) environment.getArgument("answers");

        // The client sends one entry per selected option (flat structure).
        // Group by questionPath here to reconstruct the per-question list.
        Map<String, List<String>> byQuestion = rawAnswers == null
                ? Collections.emptyMap()
                : rawAnswers.stream()
                        .filter(m -> m != null
                                && m.get("questionPath") instanceof String
                                && m.get("optionId") instanceof String)
                        .collect(Collectors.groupingBy(
                                m -> (String) m.get("questionPath"),
                                Collectors.mapping(m -> (String) m.get("optionId"), Collectors.toList())));

        List<SubmitResponseRequest.Answer> serviceAnswers = byQuestion.entrySet().stream()
                .map(e -> new SubmitResponseRequest.Answer(e.getKey(), e.getValue()))
                .collect(Collectors.toList());

        SubmitResponseRequest req = SubmitResponseRequest.builder(surveyPath, cleanEmail)
                .withAnswers(serviceAnswers)
                .withSubmittedAt(Calendar.getInstance())
                .build();

        try {
            SubmitResponseResult result = responseService.submit(req);
            return new SurveyResponsePayload(result);
        } catch (SurveyServiceException e) {
            throw new DataFetchingException("Survey submission failed: " + e.getMessage(), e);
        }
    }

    /**
     * Requires the {@code X-Requested-With: XMLHttpRequest} header as a basic same-origin guard.
     * This header is automatically added by the survey form's fetch call and cannot be set by
     * a cross-origin form submission.
     */
    private void guardXhr(HttpServletRequest request) {
        String xrw = request.getHeader("X-Requested-With");
        if (!"XMLHttpRequest".equalsIgnoreCase(StringUtils.trimToEmpty(xrw))) {
            throw new DataFetchingException("Missing X-Requested-With header");
        }
    }
}
