'use client';
import { useParams } from 'next/navigation';
import { ExerciseDetail } from '../../../../components/exercise-detail';
export default function StudentExerciseDetail() { const { id } = useParams<{ id: string }>(); return <ExerciseDetail id={id} mode="student"/>; }
