# Troubleshooting Guide — Survey Module & Service

Solutions to common issues encountered during development and deployment.

---

## Table of Contents

1. [OSGi Classloader Conflicts](#osgi-classloader-conflicts)
2. [Unresolved Dependencies](#unresolved-dependencies)
3. [GraphQL Cache Warnings](#graphql-cache-warnings)
4. [AI Analysis Shows HTTP 200 Error](#ai-analysis-shows-http-200-error)
5. [Module Not Registered](#module-not-registered)

---

## OSGi Classloader Conflicts

### Symptom

```
java.lang.LinkageError: loader constraint violation: when resolving method 
'void org.jahia.bin.ActionResult.<init>(int, java.lang.String, org.json.JSONObject)' 
the class loader ... and ... have different Class objects for the type org.json.JSONObject
```

Appears in error dump files; **no red UI error**, just blank page or broken feature.

### Root Cause

- Bundle embeds org.json (e.g., via `<Embed-Dependency>json</Embed-Dependency>`).
- Jahia runtime also provides org.json from the webapp classloader.
- Two different `JSONObject` class instances exist; OSGi cannot dispatch method calls across them.

### Solution

**File:** `survey-service/pom.xml`

1. Change org.json dependency to `provided` scope (not compile/runtime):

```xml
<dependency>
    <groupId>org.json</groupId>
    <artifactId>json</artifactId>
    <version>20231013</version>  <!-- Match runtime export -->
    <scope>provided</scope>
</dependency>
```

2. Remove embedding directives from maven-bundle-plugin:

```xml
<plugin>
    <groupId>org.apache.felix</groupId>
    <artifactId>maven-bundle-plugin</artifactId>
    <configuration>
        <instructions>
            <_dsannotations>*</_dsannotations>
            <Jahia-Depends>default,survey-module</Jahia-Depends>
            <!-- DELETE: <Embed-Dependency>json;groupId=org.json</Embed-Dependency> -->
            <!-- DELETE: <Import-Package>!org.json.*,*</Import-Package> -->
        </instructions>
    </configuration>
</plugin>
```

3. Rebuild and redeploy:

```bash
mvn clean package
docker cp target/*.jar jcontent-8230:/var/jahia/modules
```

---

## Unresolved Dependencies

### Symptom

```
Bundle survey-service [323] has unresolved dependencies and won't be started
BundleException: Unable to resolve survey-service [323]: 
missing requirement osgi.wiring.package; 
(&(osgi.wiring.package=org.json)(version>=20240303.0.0)(!(version>=20240304.0.0)))
```

Feature doesn't appear in UI; bundle stays unstarted in Jahia logs.

### Root Cause

Dependency version in pom.xml doesn't match runtime export version. For example:
- pom.xml specifies org.json `20240303`
- Jahia exports org.json `20231013`
- OSGi resolver cannot find matching export

### Solution

1. Check what version Jahia exports:

```bash
docker exec jcontent-8230 sh -lc 'for j in /usr/local/tomcat/webapps/ROOT/WEB-INF/lib/*.jar; do 
  if jar tf "$j" | grep -q "org/json/JSONObject.class"; then 
    unzip -p "$j" META-INF/MANIFEST.MF | grep "Export-Package"
  fi
done'
```

Output example: `Export-Package: org.json;version="20231013.0.0"`

2. Update pom.xml to match:

```xml
<dependency>
    <groupId>org.json</groupId>
    <artifactId>json</artifactId>
    <version>20231013</version>  <!-- Match runtime, not latest npm -->
    <scope>provided</scope>
</dependency>
```

3. Rebuild and redeploy.

**Best practice:** Store runtime version as Maven property:

```xml
<properties>
    <org.json.version>20231013</org.json.version>
</properties>

<dependency>
    <groupId>org.json</groupId>
    <artifactId>json</artifactId>
    <version>${org.json.version}</version>
    <scope>provided</scope>
</dependency>
```

---

## GraphQL Cache Warnings

### Symptom

```
console.js:X Missing fields uuid,workspace while extracting key from GenericJCRNode, 
data: {property(...): {...}, __typename: 'GenericJCRNode'}
```

Repeated in browser console for each query; no functional issue, but noisy.

### Root Cause

Apollo Client normalizes cache keys for JCR nodes as `GenericJCRNode:<uuid>:<workspace>`. When queries omit these fields, Apollo cannot generate keys and logs warnings.

### Solution

Always include `uuid` and `workspace` on every `GenericJCRNode` selection.

**File:** `survey-module/src/components/Survey/Survey/queries.ts`

```graphql
query SurveyQuestions($path: String!, $language: String!) {
  jcr(workspace: LIVE) {
    nodeByPath(path: $path) {
      uuid              # ← Add this
      workspace        # ← Add this
      children(typesFilter: { types: ["svy:question"] }) {
        nodes {
          uuid          # ← Add this
          workspace    # ← Add this
          path
          displayName(language: $language)
        }
      }
    }
  }
}
```

Also in back-office analytics queries:

**File:** `survey-service/src/javascript/graphql/queries.js`

```javascript
export const LIST_SURVEYS_QUERY = gql`
  query ListSurveys($paths: [String]) {
    jcr(workspace: LIVE) {
      nodesByCriteria(...) {
        nodes {
          uuid              # ← Add this
          workspace        # ← Add this
          // ... rest
        }
      }
    }
  }
`;
```

Rebuild and redeploy; warnings should disappear.

---

## AI Analysis Shows HTTP 200 Error

### Symptom

1. Click "Run Analysis" in the AI Analysis tab.
2. Loading spinner appears, completes.
3. Red error card displays: **"Invalid JSON response (HTTP 200). <!DOCTYPE html>..."** or similar.
4. No errors in Jahia logs.

### Root Cause

Action endpoint is reachable (HTTP 200), but returns non-JSON content (usually HTML error page, login redirect, or CSRF failure).

Common causes:
- Action URL uses hardcoded language (e.g., `/cms/render/default/en...`) that doesn't match jContent UI language.
- CSRF token validation blocks the request.
- Configuration (DEEPSEEK_API_KEY) is not loaded.

### Solution

1. **Verify action URL is language-aware:**

**File:** `survey-service/src/javascript/SurveyAnalytics/AiAnalysis/AiAnalysis.jsx`

```javascript
const buildActionUrl = () => {
    const ctx = window?.contextJsParameters?.contextPath || '';
    const uiLang = lang || window?.contextJsParameters?.uilang || 'en';  // ← Dynamic language
    const encodedPath = encodeURI(surveyPath || '');
    return `${ctx}/cms/render/default/${uiLang}${encodedPath}.surveyAnalysisAction.do`;
};
```

2. **Verify CSRF whitelist includes action:**

**File:** `survey-service/src/main/resources/META-INF/configurations/org.jahia.modules.jahiacsrfguard-survey-service.cfg`

```
whitelist = *.surveyAnalysisAction.do
```

3. **Verify DeepSeek configuration is set:**

**File:** `survey-service/src/main/resources/META-INF/configurations/org.jahia.se.modules.surveyservice.cfg`

```
DEEPSEEK_API_KEY=sk-...  # Must be non-empty
DEEPSEEK_MODEL=deepseek-v4-flash
```

4. **Check Jahia logs for lifecycle messages:**

```bash
docker exec jcontent-8230 sh -lc 'grep "SurveyAnalysisAction" /var/log/jahia/jahia.log | tail -n 20'
```

Look for:
- `SurveyAnalysisAction request: method=POST uri=...` (action was invoked)
- `SurveyAnalysisAction success: surveyTitle=... ` (success)
- `DeepSeek response status=200` (API call succeeded)
- `SurveyAnalysisAction failed` (error with details)

5. **Rebuild and redeploy:**

```bash
mvn -q clean package
docker cp target/*.jar jcontent-8230:/var/jahia/modules
```

If error persists, copy the exact error text from the UI red card and check if it starts with `<!DOCTYPE` (HTML redirect) or contains other markers to identify the blocker.

---

## Module Not Registered

### Symptom

Feature (e.g., Survey component) doesn't appear in jContent; no errors in logs.

### Root Cause

- Bundle is unresolved (check [Unresolved Dependencies](#unresolved-dependencies)).
- Bundle failed to start after deployment.
- Module configuration is missing or incorrect.

### Solution

1. **Verify bundle status:**

```bash
docker exec jcontent-8230 sh -lc 'grep "survey-module\|survey-service" /var/log/jahia/jahia.log | grep -E "STARTED|RESOLVED|unresolved" | tail -n 20'
```

Look for:
- `--- Start DX OSGi bundle survey-module ...` (started)
- `Registered .*javascript module.*survey-module` (registered in Jahia)
- `Registered bundle survey-module in GraalVM engine` (JS engine ready)
- `has unresolved dependencies` (unresolved)

2. **If unresolved, check what's missing:**

```bash
docker exec jcontent-8230 sh -lc 'grep "Unable to resolve" /var/log/jahia/jahia.log'
```

Fix per [Unresolved Dependencies](#unresolved-dependencies).

3. **Hard refresh jContent UI:**

```
Ctrl+Shift+R (or Cmd+Shift+R on Mac)
```

4. **Restart Jahia if needed:**

```bash
docker restart jcontent-8230
docker logs -f jcontent-8230
```

Wait for `Server startup in ... ms` before retesting.

---

## Summary Checklist

- [ ] No `LinkageError` → org.json is `provided` scope
- [ ] No `BundleException missing requirement` → pom.xml org.json matches runtime export
- [ ] No GraphQL cache warnings → queries include `uuid` and `workspace`
- [ ] AI Analysis works → action URL is dynamic, CSRF whitelist configured, DeepSeek API key set
- [ ] Modules registered → bundles are RESOLVED and STARTED, hard-refresh UI

---

## Getting Help

1. Check [Jahia Academy](https://academy.jahia.com) for module development docs.
2. Review the [Skills](/.agents/skills/) directory for specific patterns.
3. Enable verbose logging:

```bash
docker exec jcontent-8230 sh -lc 'sed -i "s/log4j.logger.org.jahia.se.modules=.*/log4j.logger.org.jahia.se.modules=DEBUG/" /var/jahia/karaf/etc/org.ops4j.pax.logging.cfg'
docker exec jcontent-8230 sh -lc 'grep "org.jahia.se.modules" /var/jahia/karaf/etc/org.ops4j.pax.logging.cfg'
```

4. Collect full error dump:

```bash
docker exec jcontent-8230 sh -lc 'ls -1 /var/log/jahia/jahia-errors | tail -n 1'
docker exec jcontent-8230 sh -lc 'cat /var/log/jahia/jahia-errors/2026_05_21/error-2026_05_21-11_11_07_166-14.txt | head -n 300'
```
