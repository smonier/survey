import React, {Suspense} from 'react';
import {registry} from '@jahia/ui-extender';
import {Loader} from '@jahia/moonstone';

// Lazy-load the shell to keep the initial bundle small
const SurveyAnalytics = React.lazy(() => import('./SurveyAnalytics'));

const makeRender = defaultTab => v => (
    <Suspense fallback={<Loader/>}>
        <SurveyAnalytics {...v} defaultTab={defaultTab}/>
    </Suspense>
);

export const registerRoutes = () => {
    // Parent entry — appears in the jcontent left nav, renders the Overview tab
    registry.add('adminRoute', 'survey-analytics', {
        targets: ['jcontent:30'],
        isSelectable: true,
        icon: window.jahia.moonstone.toIconComponent('PieChart'),
        label: 'survey-service:label',
        path: '/survey-analytics',
        defaultPath: '/survey-analytics',
        requireModuleInstalledOnSite: 'survey-service',
        render: makeRender('overview')
    });

    // Sub-item: Overview
    registry.add('adminRoute', 'survey-analytics-overview', {
        targets: ['jcontent-survey-analytics'],
        isSelectable: true,
        label: 'survey-service:menu.overview',
        requireModuleInstalledOnSite: 'survey-service',
        render: makeRender('overview')
    });

    // Sub-item: Results (charts)
    registry.add('adminRoute', 'survey-analytics-results', {
        targets: ['jcontent-survey-analytics'],
        isSelectable: true,
        label: 'survey-service:menu.results',
        requireModuleInstalledOnSite: 'survey-service',
        render: makeRender('results')
    });

    // Sub-item: Respondents (table + export)
    registry.add('adminRoute', 'survey-analytics-respondents', {
        targets: ['jcontent-survey-analytics'],
        isSelectable: true,
        label: 'survey-service:menu.respondents',
        requireModuleInstalledOnSite: 'survey-service',
        render: makeRender('respondents')
    });

    // Sub-item: AI Analysis (DeepSeek-powered report)
    registry.add('adminRoute', 'survey-analytics-ai-analysis', {
        targets: ['jcontent-survey-analytics'],
        isSelectable: true,
        label: 'survey-service:menu.aiAnalysis',
        requireModuleInstalledOnSite: 'survey-service',
        render: makeRender('aiAnalysis')
    });

    console.debug('%c survey-service routes registered', 'color: #6366f1');
};
