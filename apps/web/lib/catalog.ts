export type CatalogMedia = { id: string; type: 'THUMBNAIL' | 'IMAGE' | 'ANIMATION' | 'GIF' | 'VIDEO'; url: string; source: string; licenseName: string; attributionText: string; licenseStatus: string; active: boolean };
export type CatalogExercise = {
  id: string; name: string; slug: string; aliases: string[]; description: string;
  primaryMuscleGroup: string; secondaryMuscleGroups: string[]; equipment: string[];
  movementPattern: string; difficulty: string; performanceMode: 'WEIGHT_REPS' | 'REPS_ONLY';
  loadEntryConvention: string | null; loadMultiplier: string; instructions: string; commonMistakes: string;
  cautionNotes: string | null; active: boolean; aiEligible?: boolean; version?: number; media: CatalogMedia[];
};
export type CatalogPage = { items: CatalogExercise[]; nextCursor: string | null; hasMore: boolean };
export function mediaPreview(exercise: CatalogExercise): string | null {
  return exercise.media.find((item) => item.type === 'THUMBNAIL' && item.active)?.url ?? exercise.media.find((item) => item.active)?.url ?? null;
}
