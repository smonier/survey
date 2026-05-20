package org.jahia.se.modules.surveyservice.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.DXGraphQLProvider;

/**
 * Extends the DX GraphQL root {@code Mutation} type with a {@code survey} namespace field.
 *
 * <p>This class is discovered by the DX GraphQL provider through the companion
 * {@link SurveyGraphQLExtensionsProvider} OSGi marker service. It does not need to be
 * registered as an OSGi component itself.</p>
 *
 * <p>Because the field method is {@code static}, a new {@link SurveyMutations} instance is
 * created on every request. OSGi service injection into {@link SurveyMutations} is handled
 * by {@code graphql-java-annotations} via {@code @Inject @GraphQLOsgiService}.</p>
 */
@GraphQLTypeExtension(DXGraphQLProvider.Mutation.class)
public final class SurveyMutationsExtension {

    private SurveyMutationsExtension() {
    }

    /**
     * Exposes the {@code survey} mutation namespace on the GraphQL root {@code Mutation} type.
     *
     * @return a new {@link SurveyMutations} instance for the current request
     */
    @GraphQLField
    @GraphQLName("survey")
    @GraphQLDescription("Survey-related mutations")
    public static SurveyMutations survey() {
        return new SurveyMutations();
    }
}
