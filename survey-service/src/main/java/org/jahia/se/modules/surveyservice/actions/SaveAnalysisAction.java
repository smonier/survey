package org.jahia.se.modules.surveyservice.actions;

import org.jahia.api.Constants;
import org.jahia.bin.Action;
import org.jahia.bin.ActionResult;
import org.jahia.services.content.JCRNodeWrapper;
import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.render.RenderContext;
import org.jahia.services.render.Resource;
import org.jahia.services.render.URLResolver;
import org.json.JSONObject;
import org.osgi.service.component.annotations.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.http.HttpServletRequest;
import java.io.BufferedReader;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Jahia Action that persists an AI analysis result as a JCR node.
 *
 * The surveys in this environment live exclusively in the LIVE JCR workspace.
 * We therefore obtain an explicit LIVE session via {@link JCRSessionFactory}
 * and write the {@code svy:surveyAnalysis} child node there so that the
 * back-office GraphQL recall query ({@code jcr(workspace:LIVE)}) can find it
 * without a publication step.
 *
 * Endpoint: POST /cms/render/default/en{surveyPath}.saveAnalysisAction.do
 * Request body: { analysisJson: "...", surveyTitle: "...", generatedAt: "ISO-string" }
 * Response:     { success: true, storedAt: "ISO-string" }
 */
@Component(service = Action.class, immediate = true)
public class SaveAnalysisAction extends Action {

    private static final Logger log = LoggerFactory.getLogger(SaveAnalysisAction.class);

    private static final String NODE_NAME  = "aiAnalysis";
    private static final String NODE_TYPE  = "svy:surveyAnalysis";
    private static final String PROP_JSON  = "svy:analysisJson";
    private static final String PROP_TITLE = "svy:surveyTitle";
    private static final String PROP_DATE  = "svy:generatedAt";

    @Override
    public String getName() {
        return "saveAnalysisAction";
    }

    @Override
    public ActionResult doExecute(HttpServletRequest req, RenderContext ctx,
            Resource resource, JCRSessionWrapper session,
            Map<String, List<String>> params, URLResolver resolver) {
        try {
            // ── Read body ──────────────────────────────────────────────────
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = req.getReader()) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            }
            if (sb.length() == 0) {
                return error(400, "Empty request body.");
            }

            JSONObject input    = new JSONObject(sb.toString());
            String analysisJson = input.optString("analysisJson", "");
            String surveyTitle  = input.optString("surveyTitle", "");
            String generatedAt  = input.optString("generatedAt", Instant.now().toString());

            if (analysisJson.isEmpty()) {
                return error(400, "analysisJson is required.");
            }

            // ── Resolve survey path from the render resource ───────────────
            // resource.getNode() works cross-workspace for path resolution even
            // when the render session workspace differs from where the node lives.
            String surveyPath = resource.getNode().getPath();

            // ── Write to LIVE workspace ────────────────────────────────────
            // All survey content in this environment lives in LIVE only.
            // We get an explicit LIVE session for the current user so that the
            // back-office GraphQL recall query (workspace:LIVE) can read the
            // stored analysis without a publication step.
            JCRSessionWrapper liveSession = JCRSessionFactory.getInstance()
                    .getCurrentUserSession(Constants.LIVE_WORKSPACE, null);

            JCRNodeWrapper surveyNode = liveSession.getNode(surveyPath);

            JCRNodeWrapper analysisNode;
            if (surveyNode.hasNode(NODE_NAME)) {
                analysisNode = surveyNode.getNode(NODE_NAME);
                log.debug("SaveAnalysisAction: updating existing aiAnalysis node at {}", surveyPath);
            } else {
                analysisNode = surveyNode.addNode(NODE_NAME, NODE_TYPE);
                log.debug("SaveAnalysisAction: creating aiAnalysis node at {}", surveyPath);
            }

            analysisNode.setProperty(PROP_JSON,  analysisJson);
            analysisNode.setProperty(PROP_TITLE, surveyTitle);
            analysisNode.setProperty(PROP_DATE,  generatedAt);
            liveSession.save();

            log.info("SaveAnalysisAction: stored analysis for '{}' at {}/{} (LIVE workspace)",
                    surveyTitle, surveyPath, NODE_NAME);

            JSONObject response = new JSONObject();
            response.put("success",  true);
            response.put("storedAt", generatedAt);
            return new ActionResult(200, null, response);

        } catch (Exception e) {
            log.error("SaveAnalysisAction failed", e);
            return error(500, "Save failed: " + e.getMessage());
        }
    }

    private static ActionResult error(int status, String message) {
        JSONObject err = new JSONObject();
        err.put("success", false);
        err.put("error", message);
        return new ActionResult(status, null, err);
    }
}
