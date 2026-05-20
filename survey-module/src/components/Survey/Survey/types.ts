export type Props = {
  "jcr:title"?: string;
  description?: string;
  active?: string | boolean;
  timerEnabled?: string | boolean;
  startDate?: string;
  endDate?: string;
};

export type AnswerOption = {
  id: string;
  text: string;
  description: string;
};

export type Question = {
  id: string;
  text: string;
  description: string;
  allowMultiple: boolean;
  options: AnswerOption[];
};

export type ResultCount = {
  [optionId: string]: number;
};

export type SurveyResults = {
  [questionId: string]: ResultCount;
};

export type SurveyFormProps = {
  surveyPath: string;
  questions: Question[];
  endDate: string | null;
};

export type SurveyResultsProps = {
  questions: Question[];
  results: SurveyResults;
  totalResponses: number;
  lang: string;
};
