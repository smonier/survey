import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useTranslation } from "react-i18next";
import type { SurveyResultsProps } from "./types.js";
import "./survey.css";

const PALETTE = ["#4f46e5", "#7c3aed", "#a855f7", "#ec4899", "#f97316", "#eab308", "#22c55e", "#14b8a6"];

export default function SurveyResultsChart({ questions, results, totalResponses, lang }: SurveyResultsProps) {
  const { t } = useTranslation();

  return (
    <div className="survey-results">
      <h3 className="survey-results__title">{t("survey.results-title")}</h3>
      <p className="survey-results__total">
        {t("survey.results-total", { count: totalResponses })}
      </p>

      {questions.map((q) => {
        const qResults = results[q.id] ?? {};
        const data = q.options.map((opt, i) => ({
          name: opt.text,
          votes: qResults[opt.id] ?? 0,
          color: PALETTE[i % PALETTE.length],
        }));
        const maxVotes = Math.max(...data.map((d) => d.votes), 1);

        return (
          <div key={q.id} className="survey-results__question">
            <h4 className="survey-results__question-text">{q.text}</h4>
            <ResponsiveContainer width="100%" height={Math.max(data.length * 48, 120)}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
              >
                <XAxis type="number" domain={[0, maxVotes]} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={160}
                  tick={{ fontSize: 14 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value: number) => [
                    t("survey.results-votes", { count: value }),
                    t("survey.results-count"),
                  ]}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />
                <Bar dataKey="votes" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 13 }}>
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
