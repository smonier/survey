package org.jahia.se.modules.surveyservice.actions;

import org.jahia.bin.Action;
import org.jahia.bin.ActionResult;
import org.jahia.services.content.JCRSessionWrapper;
import org.jahia.services.render.RenderContext;
import org.jahia.services.render.Resource;
import org.jahia.services.render.URLResolver;
import org.json.JSONArray;
import org.json.JSONObject;
import org.osgi.service.cm.ConfigurationException;
import org.osgi.service.cm.ManagedService;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.http.HttpServletRequest;
import java.io.BufferedReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Dictionary;
import java.util.List;
import java.util.Map;

/**
 * Jahia Action that proxies survey analysis requests to DeepSeek.
 *
 * Endpoint: POST /cms/render/default/en{nodePath}.surveyAnalysisAction.do
 * Request body: JSON with { surveyTitle, surveyData (questions + vote counts) }
 * Response:     JSON with { success: true, analysis: {...} }
 *
 * API key is read from OSGi config org.jahia.se.modules.surveyservice.cfg.
 */
@Component(
        service  = {Action.class, ManagedService.class},
        property = {"service.pid=org.jahia.se.modules.surveyservice"},
        immediate = true
)
public class SurveyAnalysisAction extends Action implements ManagedService {

    private static final Logger log = LoggerFactory.getLogger(SurveyAnalysisAction.class);

    private static final String DEEPSEEK_DEFAULT_URL   = "https://api.deepseek.com";
    private static final String DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";
    private static final long   DEFAULT_TIMEOUT_MS     = 60_000L;

    private volatile String deepseekApiKey  = null;
    private volatile String deepseekBaseUrl = DEEPSEEK_DEFAULT_URL;
    private volatile String deepseekModel   = DEEPSEEK_DEFAULT_MODEL;
    private volatile long   timeoutMs       = DEFAULT_TIMEOUT_MS;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    @Activate
    public void activate() {
        log.info("SurveyAnalysisAction activated. model={}", deepseekModel);
    }

    @Override
    public String getName() {
        return "surveyAnalysisAction";
    }

    // ── ManagedService ────────────────────────────────────────────────────────

    @Override
    public void updated(Dictionary<String, ?> props) throws ConfigurationException {
        if (props == null) return;
        deepseekApiKey  = getString(props, "DEEPSEEK_API_KEY", null);
        deepseekBaseUrl = getString(props, "DEEPSEEK_API_BASE_URL", DEEPSEEK_DEFAULT_URL);
        deepseekModel   = getString(props, "DEEPSEEK_MODEL", DEEPSEEK_DEFAULT_MODEL);
        timeoutMs       = getLong(props, "DEEPSEEK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);

        if (deepseekApiKey == null || deepseekApiKey.isBlank()) {
            log.warn("DEEPSEEK_API_KEY is not configured — survey analysis will be unavailable.");
        } else {
            log.info("SurveyAnalysisAction reconfigured. model={} baseUrl={}", deepseekModel, deepseekBaseUrl);
        }
    }

    // ── Action handler ────────────────────────────────────────────────────────

    @Override
    public ActionResult doExecute(HttpServletRequest req, RenderContext ctx,
            Resource resource, JCRSessionWrapper session,
            Map<String, List<String>> params, URLResolver resolver) {
        try {
            log.info("SurveyAnalysisAction request: method={} uri={}", req.getMethod(), req.getRequestURI());
            if (deepseekApiKey == null || deepseekApiKey.isBlank()) {
                return error(503, "DEEPSEEK_API_KEY is not configured on this server.");
            }

            // Read request body (survey data JSON)
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

            JSONObject input = new JSONObject(sb.toString());
            String surveyTitle = input.optString("surveyTitle", "Survey");
            JSONArray questions = input.optJSONArray("questions");
            int totalResponses  = input.optInt("totalResponses", 0);

            // Language resolution — three-level priority:
            // 1. renderContext.getUILocale()  — Jahia's server-side UI locale,
            //    derived from the authenticated user's profile. Most reliable.
            // 2. payload.lang                 — sent by the JS client as a fallback.
            // 3. "en"                         — hard default.
            String lang;
            java.util.Locale uiLocale = ctx.getUILocale();
            if (uiLocale != null && !uiLocale.getLanguage().isBlank()) {
                lang = uiLocale.getLanguage();
            } else {
                lang = input.optString("lang", "en");
            }

            log.info("SurveyAnalysisAction: uiLocale={} payloadLang={} resolvedLang={}",
                    uiLocale, input.optString("lang", "(none)"), lang);

            if (questions == null || questions.length() == 0) {
                return error(400, "No question data provided.");
            }

            String prompt = buildAnalysisPrompt(surveyTitle, questions, totalResponses, lang);

            // Log the full prompt so language injection can be verified in logs
            log.info("SurveyAnalysisAction prompt (lang={} → {}):\n---\n{}\n---",
                    lang, resolveLanguageName(lang), prompt);

            String raw    = callDeepSeek(prompt);
            String cleaned = stripCodeFences(raw);

            // Validate it's valid JSON before returning
            JSONObject analysis = new JSONObject(cleaned);

            JSONObject response = new JSONObject();
            response.put("success", true);
            response.put("analysis", analysis);
            log.info("SurveyAnalysisAction success: surveyTitle='{}' questions={} totalResponses={} lang={}",
                    surveyTitle, questions.length(), totalResponses, lang);
            return new ActionResult(200, null, response);

        } catch (Exception e) {
            log.error("SurveyAnalysisAction failed", e);
            return error(500, "Analysis failed: " + e.getMessage());
        }
    }

    // ── Prompt assembly ───────────────────────────────────────────────────────

    /**
     * Maps a BCP-47 language tag (e.g. "fr", "fr-FR", "de") to the full
     * English language name used in the prompt instruction.
     */
    private static String resolveLanguageName(String lang) {
        if (lang == null || lang.isBlank()) return "English";
        String base = lang.trim().toLowerCase().split("[-_]")[0];
        switch (base) {
            case "fr": return "French";
            case "de": return "German";
            case "es": return "Spanish";
            case "it": return "Italian";
            case "pt": return "Portuguese";
            case "nl": return "Dutch";
            case "pl": return "Polish";
            case "ru": return "Russian";
            case "ja": return "Japanese";
            case "zh": return "Chinese";
            case "ar": return "Arabic";
            case "ko": return "Korean";
            case "sv": return "Swedish";
            case "da": return "Danish";
            case "fi": return "Finnish";
            case "nb": return "Norwegian";
            case "tr": return "Turkish";
            default:   return "English";
        }
    }

    private String buildAnalysisPrompt(String surveyTitle, JSONArray questions, int totalResponses, String lang) {
        String languageName = resolveLanguageName(lang);

        StringBuilder data = new StringBuilder();
        data.append("Survey: ").append(surveyTitle).append("\n");
        data.append("Total responses: ").append(totalResponses).append("\n\n");
        data.append("Questions and results:\n");

        for (int i = 0; i < questions.length(); i++) {
            JSONObject q = questions.getJSONObject(i);
            String qText = q.optString("label", "Question " + (i + 1));
            boolean multi = q.optBoolean("allowMultiple", false);
            data.append("\nQ").append(i + 1).append(": ").append(qText);
            if (multi) data.append(" [multiple choice]");
            data.append("\n");

            JSONArray options = q.optJSONArray("options");
            if (options != null) {
                for (int j = 0; j < options.length(); j++) {
                    JSONObject opt = options.getJSONObject(j);
                    String label = opt.optString("label", "Option " + (j + 1));
                    int votes    = opt.optInt("votes", 0);
                    double pct   = totalResponses > 0 ? (votes * 100.0 / totalResponses) : 0;
                    data.append("  - ").append(label)
                        .append(": ").append(votes).append(" votes (")
                        .append(String.format("%.0f", pct)).append("%)\n");
                }
            }
        }

        return "You are a senior sales intelligence analyst. "
             + "IMPORTANT: Write the ENTIRE report — every field, every sentence — in " + languageName + ". "
             + "Do not use any other language anywhere in your response.\n\n"
             + "Analyze the following survey results and generate a structured, actionable report for a B2B sales team.\n\n"
             + data
             + "\nReturn ONLY a valid JSON object (no markdown, no code fences) with this exact structure:\n"
             + "{\n"
             + "  \"executiveSummary\": \"2-3 sentence strategic summary of what these results mean for the sales team\",\n"
             + "  \"keyFindings\": [\n"
             + "    {\"title\": \"...\", \"insight\": \"...\", \"significance\": \"high|medium|low\"}\n"
             + "  ],\n"
             + "  \"audienceSegments\": [\n"
             + "    {\"name\": \"...\", \"description\": \"...\", \"percentEstimate\": number, \"approach\": \"...\", \"characteristics\": [\"...\"]}\n"
             + "  ],\n"
             + "  \"opportunities\": [\n"
             + "    {\"title\": \"...\", \"description\": \"...\", \"priority\": \"high|medium|low\", \"action\": \"concrete next step\"}\n"
             + "  ],\n"
             + "  \"riskFlags\": [\n"
             + "    {\"flag\": \"...\", \"description\": \"...\", \"mitigation\": \"...\"}\n"
             + "  ],\n"
             + "  \"talkingPoints\": [\n"
             + "    {\"persona\": \"...\", \"points\": [\"...\"], \"objectionHandlers\": [{\"objection\": \"...\", \"response\": \"...\"}]}\n"
             + "  ],\n"
             + "  \"nextActions\": [\n"
             + "    {\"action\": \"...\", \"rationale\": \"...\", \"timeline\": \"immediate|this-week|this-month\", \"owner\": \"Sales Rep|Sales Manager|Marketing|Product\"}\n"
             + "  ]\n"
             + "}\n"
             + "Be specific, data-driven, and focus on actionable recommendations. "
             + "Base every insight on the actual vote percentages provided. "
             + "Remember: respond entirely in " + languageName + ".";
    }

    // ── DeepSeek API ──────────────────────────────────────────────────────────

    private String callDeepSeek(String userPrompt) throws Exception {
        JSONArray messages = new JSONArray();
        messages.put(new JSONObject()
                .put("role", "system")
                .put("content", "You are an expert sales analyst. Return only valid JSON."));
        messages.put(new JSONObject()
                .put("role", "user")
                .put("content", userPrompt));

        JSONObject body = new JSONObject()
                .put("model", deepseekModel)
                .put("max_tokens", 4000)
                .put("messages", messages);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(deepseekBaseUrl + "/v1/chat/completions"))
                .timeout(Duration.ofMillis(timeoutMs))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + deepseekApiKey)
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        log.info("DeepSeek response status={} model={}", response.statusCode(), deepseekModel);

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new RuntimeException("DeepSeek API HTTP " + response.statusCode() + ": " + response.body());
        }

        return new JSONObject(response.body())
                .getJSONArray("choices")
                .getJSONObject(0)
                .getJSONObject("message")
                .getString("content");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static ActionResult error(int status, String message) {
        JSONObject err = new JSONObject();
        err.put("success", false);
        err.put("error", message);
        return new ActionResult(status, null, err);
    }

    private static String stripCodeFences(String raw) {
        if (raw == null) return "{}";
        String t = raw.strip();
        if (t.startsWith("```")) {
            int nl = t.indexOf('\n');
            if (nl != -1) t = t.substring(nl + 1);
            if (t.endsWith("```")) t = t.substring(0, t.lastIndexOf("```"));
        }
        return t.strip();
    }

    private static String getString(Dictionary<String, ?> d, String key, String def) {
        Object v = d.get(key);
        if (v instanceof String) {
            String s = (String) v;
            if (!s.isBlank()) {
                return s;
            }
        }
        return def;
    }

    private static long getLong(Dictionary<String, ?> d, String key, long def) {
        Object v = d.get(key);
        if (v == null) return def;
        try { return Long.parseLong(v.toString().trim()); } catch (NumberFormatException e) { return def; }
    }
}
