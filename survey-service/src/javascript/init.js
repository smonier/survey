import i18next from 'i18next';
import {registerRoutes} from './SurveyAnalytics/registerRoutes';

import en from '../main/resources/javascript/locales/en.json';
import fr from '../main/resources/javascript/locales/fr.json';

const NS = 'survey-service';

const registerResources = () => {
    const bundles = [
        ['en', en],
        ['fr', fr]
    ];

    bundles.forEach(([lang, resource]) => {
        const nsData = resource[NS];
        if (nsData && !i18next.hasResourceBundle(lang, NS)) {
            i18next.addResourceBundle(lang, NS, nsData, true, true);
        }
    });
};

export default async function () {
    registerResources();
    await i18next.loadNamespaces(NS);
    registerRoutes();
}
