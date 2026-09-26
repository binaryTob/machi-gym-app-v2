'use client';
import { ExerciseEditor } from '../../../../components/exercise-editor';
import { t } from '../../../../lib/i18n';
import { useSession } from '../../../../lib/use-session';
export default function NewExercise() {
  const me = useSession('COACH');
  if (!me) return <p role="status">{t('common.loading')}</p>;
  return <><a className="back" href="/trainer/exercises">{t('catalog.back')}</a><div className="hero"><div className="eyebrow">{t('catalog.eyebrow')}</div><h1>{t('catalog.create')}</h1></div><div className="card"><ExerciseEditor /></div></>;
}
