package org.jahia.se.modules.surveyservice.services;

import org.apache.commons.lang3.StringUtils;
import org.jahia.api.Constants;
import org.jahia.services.content.JCRCallback;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.content.JCRTemplate;
import org.osgi.service.component.annotations.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.jcr.NodeIterator;
import javax.jcr.PathNotFoundException;
import javax.jcr.RepositoryException;
import java.util.UUID;

/**
 * Persists survey responses to the JCR LIVE workspace as UGC.
 *
 * <p>Responses are written directly to the LIVE workspace using a system session so that
 * anonymous visitors can submit without requiring JCR write permissions. Each survey node
 * stores its responses under a {@code responses/} child list.</p>
 *
 * <p>Node structure created per submission:</p>
 * <pre>
 * &lt;surveyPath&gt;/responses/          (jnt:contentList, auto-created)
 *   &lt;uuid&gt;/                        (svy:surveyResponse)
 *     &lt;uuid&gt;/                      (svy:questionResponse, one per question answered)
 * </pre>
 */
@Component(service = SurveyResponseService.class, immediate = true)
public class SurveyResponseService {

    private static final Logger logger = LoggerFactory.getLogger(SurveyResponseService.class);

    private static final String NODE_TYPE_RESPONSE = "svy:surveyResponse";
    private static final String NODE_TYPE_QUESTION_RESPONSE = "svy:questionResponse";
    private static final String RESPONSES_CHILD = "responses";

    /**
     * Validates uniqueness by email and persists a complete survey response.
     *
     * @param request fully built submission
     * @return result with {@link SubmitResponseResult#CODE_OK} on success,
     *         {@link SubmitResponseResult#CODE_DUPLICATE_EMAIL} when the email was already used
     * @throws SurveyServiceException on unexpected JCR errors
     */
    public SubmitResponseResult submit(SubmitResponseRequest request) throws SurveyServiceException {
        try {
            if (logger.isInfoEnabled()) {
                logger.info("Submitting survey response: surveyPath={} email={} answers={}",
                        request.getSurveyPath(), request.getEmail(), request.getAnswers().size());
            }
            return JCRTemplate.getInstance().doExecuteWithSystemSessionAsUser(
                    null, Constants.LIVE_WORKSPACE, null,
                    (JCRCallback<SubmitResponseResult>) session -> execute(session, request));
        } catch (RepositoryException e) {
            logger.error("Survey response persistence failed: surveyPath={}", request.getSurveyPath(), e);
            throw new SurveyServiceException("Unable to persist survey response", e);
        }
    }

    /**
     * Performs the actual JCR write within an already-open system session.
     * Called as a {@link JCRCallback} from {@link #submit}.
     *
     * @param session active system session on the LIVE workspace
     * @param request the validated submission request
     * @return the outcome result, including the new node UUID on success
     * @throws RepositoryException if the survey node is not found or the session cannot be saved
     */
    private SubmitResponseResult execute(JCRSessionWrapper session, SubmitResponseRequest request)
            throws RepositoryException {

        JCRNodeWrapper surveyNode;
        try {
            surveyNode = session.getNode(request.getSurveyPath());
        } catch (PathNotFoundException e) {
            logger.error("Survey node not found: {}", request.getSurveyPath());
            throw new RepositoryException("Survey node not found: " + request.getSurveyPath(), e);
        }

        JCRNodeWrapper responsesFolder = getOrCreateResponsesFolder(session, surveyNode);

        if (isDuplicateEmail(responsesFolder, request.getEmail())) {
            logger.info("Duplicate email rejected: surveyPath={} email={}", request.getSurveyPath(), request.getEmail());
            return new SubmitResponseResult(false, SubmitResponseResult.CODE_DUPLICATE_EMAIL);
        }

        String responseName = "r-" + UUID.randomUUID();
        JCRNodeWrapper responseNode = responsesFolder.addNode(responseName, NODE_TYPE_RESPONSE);
        responseNode.setProperty("email", request.getEmail());
        responseNode.setProperty("submittedAt", request.getSubmittedAt());
        responseNode.setProperty("completed", true);

        for (SubmitResponseRequest.Answer answer : request.getAnswers()) {
            if (answer.getChosenOptionIds().isEmpty()) {
                continue;
            }
            String qrName = "qr-" + UUID.randomUUID();
            JCRNodeWrapper qrNode = responseNode.addNode(qrName, NODE_TYPE_QUESTION_RESPONSE);
            qrNode.setProperty("questionPath", answer.getQuestionPath());
            qrNode.setProperty("chosenOptions", answer.getChosenOptionIds().toArray(new String[0]));
        }

        session.save();

        String responseId = responseNode.getIdentifier();
        logger.info("Survey response persisted: surveyPath={} responseId={}", request.getSurveyPath(), responseId);
        return new SubmitResponseResult(true, SubmitResponseResult.CODE_OK, responseId);
    }

    /**
     * Returns the {@code responses/} child list of the survey node, creating it if absent.
     * The caller is responsible for calling {@code session.save()} after the full write.
     *
     * @param session    active JCR session (must be on the same workspace as {@code surveyNode})
     * @param surveyNode the {@code svy:survey} node
     * @return the {@code svy:responseList} child node named {@code responses}
     * @throws RepositoryException on any JCR error during node creation
     */
    private JCRNodeWrapper getOrCreateResponsesFolder(JCRSessionWrapper session, JCRNodeWrapper surveyNode)
            throws RepositoryException {
        if (surveyNode.hasNode(RESPONSES_CHILD)) {
            JCRNodeWrapper existing = surveyNode.getNode(RESPONSES_CHILD);
            // Migrate legacy jnt:contentList to svy:responseList if needed
            if (!existing.isNodeType("svy:responseList")) {
                logger.warn("Migrating responses folder from {} to svy:responseList: {}",
                        existing.getPrimaryNodeType().getName(), existing.getPath());
                existing.remove();
                session.save();
            } else {
                return existing;
            }
        }
        JCRNodeWrapper folder = surveyNode.addNode(RESPONSES_CHILD, "svy:responseList");
        if (logger.isDebugEnabled()) {
            logger.debug("Created responses folder: {}", folder.getPath());
        }
        return folder;
    }

    /**
     * Scans existing responses for a matching email address.
     * Linear scan is acceptable for typical survey volumes (hundreds to low thousands of responses).
     */
    private boolean isDuplicateEmail(JCRNodeWrapper responsesFolder, String email) throws RepositoryException {
        if (!responsesFolder.hasNodes()) {
            return false;
        }
        NodeIterator it = responsesFolder.getNodes();
        while (it.hasNext()) {
            JCRNodeWrapper node = (JCRNodeWrapper) it.nextNode();
            if (node.isNodeType(NODE_TYPE_RESPONSE)
                    && node.hasProperty("email")
                    && email.equalsIgnoreCase(node.getProperty("email").getString())) {
                return true;
            }
        }
        return false;
    }
}
