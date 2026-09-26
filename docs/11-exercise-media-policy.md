# Exercise Media and Catalog Policy (Phase 2)

## Ownership

The catalog is **organization-owned**. Exercise identity is a required ID scoped to one organization, with a unique slug inside that organization. Trainer edits cannot change another organization's description, safety note, or media. Phase 3 plans, Phase 4 session snapshots, and later AI proposals must resolve canonical IDs and cannot write arbitrary exercise-name strings as references.

The curated seed definition contains 22 Spanish exercises spanning major muscle groups, bodyweight, barbell, dumbbell, machine, cable, and kettlebell movements. Each workspace receives its own exercise rows. Running the seed twice does not overwrite trainer edits. A future global read-only library with per-workspace overrides would require its own explicit design and is not silently introduced here.

## Media provenance

All six assets in `apps/web/public/media/exercises/` were created for this project as SVG illustrations. They are licensed as original Machi Gym artwork; the verified media rows retain `source=PROJECT_ORIGINAL`, license name, attribution, verifying membership, and verification time. The static illustrations and one animated SVG are **visual placeholders**, not qualified technique demonstrations or medical guidance. Instructions remain readable without media. No media was copied from openGym, another repository, or a third-party asset site.

New exercise media is unpublished. Phase 2 only accepts URL values on the bundled asset manifest enforced by both Zod and a PostgreSQL check; a trainer may select one of those existing files and explicitly verify it before publication. Remote URLs, unregistered uploads, third-party GIFs, and videos cannot be injected. The model represents thumbnails, images, GIFs, animation, and videos and permits multiple assets per exercise, but GIF/video delivery requires a later verified asset registration, rights review, storage, and moderation flow. Do not weaken the asset allowlist to accommodate an arbitrary remote URL.

Only active, verified media is visible to students. Inactive exercises are hidden from the student catalog but retained for future historical plan/session references. Deactivation, exercise edits, and media changes require server-side Trainer/Admin authorization within the active organization.

## Search and classification

Exercise names and synonyms use Unicode normalization for accent-insensitive search. Primary and secondary muscles, equipment, and movement patterns are typed enums; a later visual muscle map can map enum codes to areas without changing exercise identity. `WEIGHT_REPS` exercises declare an entry convention and volume multiplier. `REPS_ONLY` exercises cannot have an external-load convention. Time- or distance-based work is not misrepresented as repetition-based exercise.
