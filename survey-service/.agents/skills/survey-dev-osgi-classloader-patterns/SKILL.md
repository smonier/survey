---
name: survey-dev-osgi-classloader-patterns
description: OSGi bundle dependency patterns, classloader conflicts, and Maven configuration pitfalls when developing Jahia Java modules.
---

# Skill — Jahia OSGi Module Development Patterns

Lessons learned from survey-service when integrating third-party JARs and managing classloader constraints.

---

## OSGi Classloader Conflicts with Embedded Dependencies

**Problem:** `LinkageError: loader constraint violation when resolving method ... have different Class objects for the type org/json/JSONObject`

**Root cause:** 
- Your bundle embeds org.json (via `<Embed-Dependency>` in Maven Bundle Plugin).
- Jahia runtime also provides org.json from the webapp classloader.
- When `org.jahia.bin.ActionResult(int, String, org.json.JSONObject)` is called, the two classloaders have different `JSONObject` class objects.
- OSGi loader constraint prevents dynamic dispatch.

**Solution — Use `provided` scope instead of embedding:**

```xml
<dependency>
    <groupId>org.json</groupId>
    <artifactId>json</artifactId>
    <version>20231013</version>  <!-- Match runtime export version -->
    <scope>provided</scope>
</dependency>
```

Then remove embedding from bundle plugin:

```xml
<plugin>
    <groupId>org.apache.felix</groupId>
    <artifactId>maven-bundle-plugin</artifactId>
    <configuration>
        <instructions>
            <_dsannotations>*</_dsannotations>
            <Jahia-Depends>default,survey-module</Jahia-Depends>
            <!-- Remove: <Embed-Dependency> -->
            <!-- Remove: <Import-Package>!org.json.*,*</Import-Package> -->
        </instructions>
    </configuration>
</plugin>
```

**Why:** The webapp classloader is the parent of your bundle classloader. Importing from runtime ensures both paths resolve to the same `JSONObject` instance.

---

## OSGi Import Version Ranges

**Problem:** `BundleException: Unable to resolve survey-service: missing requirement osgi.wiring.package; (&(osgi.wiring.package=org.json)(version>=20240303.0.0)(!(version>=20240304.0.0)))`

**Root cause:** 
- Your pom.xml specifies org.json version `20240303`.
- Jahia runtime exports org.json version `20231013`.
- OSGi resolver cannot find a matching export.

**Solution — Match runtime export version:**

1. Inspect runtime exports:
   ```bash
   docker exec jahia sh -lc 'for j in /path/to/lib/*.jar; do if jar tf "$j" | grep -q "org/json/"; then unzip -p "$j" META-INF/MANIFEST.MF | grep "Export-Package"; fi; done'
   ```

2. Set your dependency to that version:
   ```xml
   <dependency>
       <groupId>org.json</groupId>
       <artifactId>json</artifactId>
       <version>20231013</version>  <!-- Match runtime -->
       <scope>provided</scope>
   </dependency>
   ```

3. Bundle Plugin automatically generates the correct import version range in the MANIFEST.

**Best practice:** Define a Maven property for runtime-provided versions:

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

## Action Endpoint Logging

**Pattern:** Add lifecycle logging to your Action subclass for visibility during debugging.

```java
@Override
public ActionResult doExecute(HttpServletRequest req, RenderContext ctx,
        Resource resource, JCRSessionWrapper session,
        Map<String, List<String>> params, URLResolver resolver) {
    try {
        log.info("SurveyAnalysisAction request: method={} uri={}", req.getMethod(), req.getRequestURI());
        
        // ... processing ...
        
        log.info("SurveyAnalysisAction success: result={}", result);
        return new ActionResult(200, null, response);
        
    } catch (Exception e) {
        log.error("SurveyAnalysisAction failed", e);
        return error(500, "Analysis failed: " + e.getMessage());
    }
}

private static ActionResult error(int status, String message) {
    JSONObject err = new JSONObject();
    err.put("success", false);
    err.put("error", message);
    return new ActionResult(status, null, err);
}
```

**Why:** Frontend receives HTTP 200 HTML error pages without backend logs. Request-level logging + response-level logging make it trivial to correlate UI failures with server-side root causes.

---

## ManagedService Configuration Pattern

**Pattern:** Use `@Component(service = {Action.class, ManagedService.class})` to react to OSGi configuration changes:

```java
@Component(
    service = {Action.class, ManagedService.class},
    property = {"service.pid=org.jahia.se.modules.surveyservice"},
    immediate = true
)
public class SurveyAnalysisAction extends Action implements ManagedService {
    
    private volatile String deepseekApiKey = null;
    private volatile String deepseekModel = "deepseek-chat";
    
    @Override
    public void updated(Dictionary<String, ?> props) throws ConfigurationException {
        if (props == null) return;
        deepseekApiKey = getString(props, "DEEPSEEK_API_KEY", null);
        deepseekModel = getString(props, "DEEPSEEK_MODEL", "deepseek-chat");
        
        if (deepseekApiKey == null || deepseekApiKey.isBlank()) {
            log.warn("DEEPSEEK_API_KEY not configured — feature unavailable.");
        } else {
            log.info("Configuration updated. model={}", deepseekModel);
        }
    }
}
```

**Benefits:**
- Configuration changes are applied without bundle restart.
- Volatile fields ensure visibility across threads.
- Null-safe checks prevent NPE at runtime.

---

## Testing Checklist

- [ ] Run `mvn clean compile` and verify no import errors.
- [ ] Build locally: `mvn clean package`.
- [ ] Verify bundle classpath in JAR: `unzip -p target/*.jar META-INF/MANIFEST.MF | grep Import-Package`.
- [ ] Check for embedded dependencies: `jar tf target/*.jar | grep -E "^org/json/"` should be empty.
- [ ] Deploy to Jahia and check logs for resolution errors.
- [ ] Trigger action endpoint and verify INFO logs appear in `jahia.log`.

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| `LinkageError: loader constraint violation` | Embedded org.json conflicts with webapp | Switch to `provided` scope |
| `BundleException: missing requirement osgi.wiring.package` | Version mismatch (e.g., 20240303 vs 20231013) | Align pom.xml version to runtime export |
| Action returns HTTP 200 but UI shows error | Non-JSON response body (HTML/redirect) | Log request URIs; use `res.text()` to inspect response |
| Configuration not applied | Missed `@Component(immediate = true)` | Ensure ManagedService is declared and immediate=true |
| NPE in action when config is null | Configuration file not deployed | Verify .cfg file in `META-INF/configurations/` is copied to Karaf etc/ |

---

## Debugging Workflow

1. Check bundle resolution status:
   ```bash
   docker exec jahia sh -lc 'grep "has unresolved dependencies" /var/log/jahia/jahia.log | tail'
   ```

2. If unresolved, check what's missing:
   ```bash
   docker exec jahia sh -lc 'grep "Unable to resolve" /var/log/jahia/jahia.log'
   ```

3. Verify exported packages in runtime:
   ```bash
   docker exec jahia sh -lc 'for j in /path/to/lib/*.jar; do unzip -p "$j" META-INF/MANIFEST.MF | grep -E "Export-Package|Bundle-Version"; done'
   ```

4. Trigger action and capture logs:
   ```bash
   docker exec jahia sh -lc 'tail -f /var/log/jahia/jahia.log | grep SurveyAnalysisAction'
   ```

---

## Reference

- [OSGi Loader Constraints](https://docs.osgi.org/specification/osgi.core/7.0.0/framework.loader.html)
- [Maven Bundle Plugin](https://felix.apache.org/documentation/subprojects/apache-felix-maven-bundle-plugin/)
- [Jahia Module Development](https://academy.jahia.com/documentation)
