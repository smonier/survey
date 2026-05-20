package org.jahia.se.modules.surveyservice.graphql;

import org.jahia.modules.graphql.provider.dxm.DXGraphQLExtensionsProvider;
import org.osgi.service.component.annotations.Component;

/**
 * Registers this bundle's {@code @GraphQLTypeExtension} classes with the DX GraphQL provider.
 */
@Component(service = DXGraphQLExtensionsProvider.class, immediate = true)
public class SurveyGraphQLExtensionsProvider implements DXGraphQLExtensionsProvider {
    // Marker — no implementation required.
}
