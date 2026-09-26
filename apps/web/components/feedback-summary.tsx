import { FeedbackRecord } from '../lib/feedback';
import { enumText, t } from '../lib/i18n';

export function FeedbackSummary({ feedback, exerciseNames }: { feedback: FeedbackRecord; exerciseNames?: Record<string, string> }) {
  return <div className="feedback-summary">
    <div className="grid three"><div><span className="eyebrow">{t('feedback.effort')}</span><strong>{feedback.sessionRpe}/10</strong></div><div><span className="eyebrow">{t('feedback.perceived')}</span><strong>{enumText(feedback.perceivedState)}</strong></div><div><span className="eyebrow">{t('feedback.recovery')}</span><strong>{enumText(feedback.recoveryState)}</strong></div></div>
    {feedback.discomfortPresent ? <><h3>{t('feedback.discomfortReported')}</h3>{feedback.discomfortReports.map((report) => <div key={report.id} className="feedback-location"><strong>{enumText(report.bodyRegion)} · {report.intensity}/10</strong>{report.otherLocation && <span> · {report.otherLocation}</span>}{report.exerciseId && exerciseNames?.[report.exerciseId] && <p className="muted small">{exerciseNames[report.exerciseId]}</p>}{report.notes && <p>{report.notes}</p>}</div>)}<p className="muted small">{t('feedback.trainerNote')}</p></> : <p className="muted">{t('feedback.noDiscomfort')}</p>}
    {feedback.generalNotes && <p>{feedback.generalNotes}</p>}
  </div>;
}
