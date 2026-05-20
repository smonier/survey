package org.jahia.se.modules.surveyservice.util;

import graphql.GraphQLContext;
import graphql.schema.DataFetchingEnvironment;
import org.jahia.modules.graphql.provider.dxm.util.ContextUtil;

import javax.servlet.http.HttpServletRequest;
import java.util.Optional;

/** Extracts the {@link HttpServletRequest} from a GraphQL {@link DataFetchingEnvironment}. */
public final class RequestUtil {

    private RequestUtil() {
    }

    /**
     * Resolves the {@link HttpServletRequest} from a GraphQL {@link DataFetchingEnvironment}.
     *
     * <p>Tries two strategies in order:
     * <ol>
     *   <li>Jahia's {@code ContextUtil.getHttpServletRequest()} (works in most DX versions)</li>
     *   <li>Direct lookup from the {@code GraphQLContext} map by type and by the
     *       {@code "httpServletRequest"} string key (fallback for newer graphql-java versions)</li>
     * </ol>
     * </p>
     *
     * @param environment the current GraphQL field resolution context
     * @return the servlet request wrapped in {@link Optional}, or {@link Optional#empty()} if not resolvable
     */
    public static Optional<HttpServletRequest> extractHttpServletRequest(DataFetchingEnvironment environment) {
        HttpServletRequest request = ContextUtil.getHttpServletRequest(environment.getContext());
        if (request != null) {
            return Optional.of(request);
        }

        GraphQLContext graphQLContext = environment.getGraphQlContext();
        if (graphQLContext != null) {
            request = graphQLContext.get(HttpServletRequest.class);
            if (request == null && graphQLContext.hasKey("httpServletRequest")) {
                request = graphQLContext.get("httpServletRequest");
            }
            if (request != null) {
                return Optional.of(request);
            }
        }

        return Optional.empty();
    }
}
