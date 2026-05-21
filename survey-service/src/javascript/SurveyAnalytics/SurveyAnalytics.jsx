import React, {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useQuery, NetworkStatus} from '@apollo/client';
import {Header, Loader, Dropdown, Button} from '@jahia/moonstone';
import {Reload} from '@jahia/moonstone/dist/icons';
import {LIST_SURVEYS_QUERY} from '../graphql/queries';
import Overview from './Overview/Overview';
import Results from './Results/Results';
import Respondents from './Respondents/Respondents';
import AiAnalysis from './AiAnalysis/AiAnalysis';
import styles from './SurveyAnalytics.module.css';

const NS = 'survey-service';
const STORAGE_KEY = 'svy-selected-survey';

// ─── Tab bar ──────────────────────────────────────────────────────────────────
const TABS = ['overview', 'results', 'respondents', 'aiAnalysis'];

const TabBar = ({active, onSelect, t}) => (
    <div className={styles.tabBar}>
        {TABS.map(tab => (
            <button
                key={tab}
                className={`${styles.tab} ${active === tab ? styles.tabActive : ''}`}
                onClick={() => onSelect(tab)}
                type="button"
            >
                {t(`${NS}:menu.${tab}`)}
            </button>
        ))}
    </div>
);

// ─── Main shell ───────────────────────────────────────────────────────────────
const SurveyAnalytics = ({defaultTab = 'overview'}) => {
    const {t} = useTranslation();
    const siteKey = window.contextJsParameters?.siteKey || '';
    const lang = window.contextJsParameters?.uilang || 'en';

    const [activeTab, setActiveTab] = useState(defaultTab);
    const [selectedSurvey, setSelectedSurvey] = useState(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });

    // Load survey list via Apollo — shared client from jcontent Module Federation
    // notifyOnNetworkStatusChange: true lets us distinguish initial load from refetch
    const {data: surveysData, loading: loadingSurveys, refetch, networkStatus} = useQuery(LIST_SURVEYS_QUERY, {
        variables: {paths: [`/sites/${siteKey}`]},
        skip: !siteKey,
        notifyOnNetworkStatusChange: true
    });

    const isRefetching = networkStatus === NetworkStatus.refetch;
    const surveys = surveysData?.jcr?.nodesByCriteria?.nodes || [];

    // Keep defaultTab in sync when jcontent nav item changes
    useEffect(() => {
        setActiveTab(defaultTab);
    }, [defaultTab]);

    // If the stored survey was deleted from the site, clear the selection
    useEffect(() => {
        if (selectedSurvey && surveys.length > 0 && !surveys.find(n => n.uuid === selectedSurvey.uuid)) {
            setSelectedSurvey(null);
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [surveys, selectedSurvey]);

    const handleSurveySelect = useCallback(value => {
        const survey = surveys.find(s => s.uuid === value);
        setSelectedSurvey(survey || null);
        if (survey) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(survey));
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [surveys]);

    const surveyOptions = surveys.map(s => ({
        label: s.displayName || s.name,
        value: s.uuid
    }));

    // toolbarRight: outlined refresh button with icon + label
    // Moonstone Button uses `label` prop (not children) for the text
    const toolbarRight = (
        <Button
            icon={<Reload className={(isRefetching || loadingSurveys) ? styles.spinning : undefined}/>}
            label={t(`${NS}:refresh`)}
            variant="outlined"
            size="default"
            isDisabled={loadingSurveys || isRefetching}
            onClick={() => refetch()}
        />
    );

    return (
        <div className={styles.root}>
            <Header
                title={t(`${NS}:label`)}
                toolbarRight={toolbarRight}
            />

            {/* Survey picker — sits between the header and the tab bar */}
            <div className={styles.pickerBar}>
                {loadingSurveys && !isRefetching ? (
                    <Loader size="small"/>
                ) : (
                    <Dropdown
                        data={surveyOptions}
                        value={selectedSurvey?.uuid || ''}
                        placeholder={t(`${NS}:picker.placeholder`)}
                        onChange={(e, item) => handleSurveySelect(item.value)}
                        size="default"
                    />
                )}
            </div>

            <TabBar active={activeTab} onSelect={setActiveTab} t={t}/>

            <div className={styles.scrollArea}>
                <div className={styles.content}>
                    {activeTab === 'overview' && (
                        <Overview
                            surveys={surveys}
                            loading={loadingSurveys && !isRefetching}
                            siteKey={siteKey}
                            onSelectSurvey={handleSurveySelect}
                            onNavigate={(survey, tab) => {
                                handleSurveySelect(survey.uuid);
                                setActiveTab(tab);
                            }}
                            t={t}
                        />
                    )}
                    {activeTab === 'results' && (
                        <Results
                            survey={selectedSurvey}
                            lang={lang}
                            t={t}
                        />
                    )}
                    {activeTab === 'respondents' && (
                        <Respondents
                            survey={selectedSurvey}
                            lang={lang}
                            t={t}
                        />
                    )}
                    {activeTab === 'aiAnalysis' && (
                        <AiAnalysis
                            survey={selectedSurvey}
                            lang={lang}
                            t={t}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default SurveyAnalytics;
