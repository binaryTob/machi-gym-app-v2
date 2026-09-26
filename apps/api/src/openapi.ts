import { Controller, Get } from '@nestjs/common';
import { acceptInvitationSchema, activityCreateSchema, assignmentSchema, cancelWorkoutSchema, constraintSchema, draftVersionEditSchema, emailSchema, exerciseCreateSchema, exerciseMediaSchema, exerciseStatusSchema, exerciseUpdateSchema, feedbackSubmitSchema, finishWorkoutSchema, loginSchema, newPlanVersionSchema, noteSchema, planArchiveSchema, planCloneSchema, planCreateSchema, planEditSchema, planRevisionSchema, programmedExerciseCreateSchema, programmedExerciseEditSchema, readinessSchema, reorderSchema, resetPasswordSchema, scheduleWorkoutSchema, setPerformanceSchema, skipWorkoutSchema, startWorkoutSchema, studentCreateSchema, studentProfileSchema, studentSelfProfileSchema, voidPlanVersionSchema, weightSchema, workoutCreateSchema, workoutEditSchema } from '@machi-gym/contracts';
import { Public } from './common';

// Keep the converter's very deep conditional types out of the API typecheck;
// transport schemas remain the single source for generated request bodies.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const converter = require('zod-to-json-schema') as { zodToJsonSchema: (schema: unknown, options: { target: string }) => unknown };
const body = (schema: unknown): { required: boolean; content: { 'application/json': { schema: unknown } } } => ({ required: true, content: { 'application/json': { schema: converter.zodToJsonSchema(schema, { target: 'openApi3' }) } } });
const path = (name: string) => [{ name, in: 'path', required: true, schema: { type: 'string' } }];
const json = { '200': { description: 'Successful response (data + meta envelope)' }, '400': { description: 'Validation error' }, '401': { description: 'Unauthenticated' }, '403': { description: 'Not authorized' } };

@Controller('openapi.json')
export class OpenApiController {
  @Get() @Public() spec(): Record<string, unknown> {
    return { openapi: '3.0.3', info: { title: 'Machi Gym API', version: '1.0.0' }, servers: [{ url: '/api/v1' }], paths: {
      '/auth/login': { post: { summary: 'Create opaque session', requestBody: body(loginSchema), responses: json } },
      '/auth/logout': { post: { summary: 'Revoke session', responses: json } },
      '/auth/forgot-password': { post: { summary: 'Generic reset request', requestBody: body(emailSchema), responses: json } },
      '/auth/reset-password': { post: { summary: 'Consume reset token', requestBody: body(resetPasswordSchema), responses: json } },
      '/auth/accept-invitation': { post: { summary: 'Accept one-time invitation', requestBody: body(acceptInvitationSchema), responses: json } },
      '/auth/mfa/enroll': { post: { summary: 'Begin owner MFA enrollment', responses: json } },
      '/auth/mfa/verify': { post: { summary: 'Verify MFA enrollment', responses: json } },
      '/me': { get: { summary: 'Current membership', responses: json } },
      '/student-invitations': { post: { summary: 'Create student and one-time invitation', requestBody: body(studentCreateSchema), responses: json } },
      '/students': { get: { summary: 'Assigned student roster', responses: json } },
      '/students/{id}': { get: { summary: 'Scoped student profile', parameters: path('id'), responses: json } },
      '/students/{id}/profile': { patch: { summary: 'Edit student planning facts', parameters: path('id'), requestBody: body(studentProfileSchema), responses: json } },
      '/students/{id}/profile/confirm-ready': { post: { summary: 'Coach reviews profile', parameters: path('id'), requestBody: body(readinessSchema), responses: json } },
      '/students/{id}/constraints': { post: { parameters: path('id'), requestBody: body(constraintSchema), responses: json } },
      '/students/{id}/external-activities': { post: { parameters: path('id'), requestBody: body(activityCreateSchema), responses: json } },
      '/students/{id}/weight-measurements': { post: { parameters: path('id'), requestBody: body(weightSchema), responses: json } },
      '/students/{id}/notes': { post: { parameters: path('id'), requestBody: body(noteSchema), responses: json } },
      '/students/{id}/reset-link': { post: { parameters: path('id'), summary: 'Trainer issues manual reset link', responses: json } },
      '/student/me/profile': { get: { responses: json }, patch: { requestBody: body(studentSelfProfileSchema), responses: json } },
      '/student/me/constraints': { post: { requestBody: body(constraintSchema), responses: json } },
      '/student/me/external-activities': { post: { requestBody: body(activityCreateSchema), responses: json } },
      '/student/home': { get: { responses: json } },
      '/trainer/dashboard': { get: { responses: json } },
      '/exercises': { get: { summary: 'Organization-scoped filtered catalog with cursor pagination', responses: json }, post: { summary: 'Create canonical exercise (trainer/admin)', requestBody: body(exerciseCreateSchema), responses: json } },
      '/exercises/{id}': { get: { parameters: path('id'), summary: 'Exercise detail; active only for students', responses: json }, patch: { parameters: path('id'), requestBody: body(exerciseUpdateSchema), responses: json } },
      '/exercises/{id}/status': { patch: { parameters: path('id'), requestBody: body(exerciseStatusSchema), responses: json } },
      '/exercises/{id}/media': { post: { parameters: path('id'), requestBody: body(exerciseMediaSchema), responses: json } },
      '/exercises/{id}/media/{mediaId}/verify': { post: { parameters: [...path('id'), ...path('mediaId')], responses: json } },
      '/training-plans': { get: { summary: 'Reusable organization plans', responses: json }, post: { summary: 'Create draft plan', requestBody: body(planCreateSchema), responses: json } },
      '/training-plans/{id}': { get: { parameters: path('id'), responses: json }, patch: { parameters: path('id'), requestBody: body(planEditSchema), responses: json } },
      '/training-plans/{id}/versions': { post: { parameters: path('id'), requestBody: body(newPlanVersionSchema), responses: json } },
      '/training-plans/{id}/duplicate': { post: { parameters: path('id'), requestBody: body(planCloneSchema), responses: json } },
      '/training-plans/{id}/archive': { post: { parameters: path('id'), requestBody: body(planArchiveSchema), responses: json } },
      '/plan-versions/{id}': { get: { parameters: path('id'), responses: json }, patch: { parameters: path('id'), requestBody: body(draftVersionEditSchema), responses: json } },
      '/plan-versions/{id}/publish': { post: { parameters: path('id'), requestBody: body(planRevisionSchema), responses: json } },
      '/plan-versions/{id}/void': { post: { parameters: path('id'), requestBody: body(voidPlanVersionSchema), responses: json } },
      '/plan-versions/{id}/workouts': { post: { parameters: path('id'), requestBody: body(workoutCreateSchema), responses: json } },
      '/plan-versions/{id}/workouts/reorder': { post: { parameters: path('id'), requestBody: body(reorderSchema), responses: json } },
      '/workout-templates/{id}': { patch: { parameters: path('id'), requestBody: body(workoutEditSchema), responses: json } },
      '/workout-templates/{id}/duplicate': { post: { parameters: path('id'), requestBody: body(planRevisionSchema), responses: json } },
      '/workout-templates/{id}/remove': { post: { parameters: path('id'), requestBody: body(planRevisionSchema), responses: json } },
      '/workout-templates/{id}/exercises': { post: { parameters: path('id'), requestBody: body(programmedExerciseCreateSchema), responses: json } },
      '/workout-templates/{id}/exercises/reorder': { post: { parameters: path('id'), requestBody: body(reorderSchema), responses: json } },
      '/programmed-exercises/{id}': { patch: { parameters: path('id'), requestBody: body(programmedExerciseEditSchema), responses: json } },
      '/programmed-exercises/{id}/remove': { post: { parameters: path('id'), requestBody: body(planRevisionSchema), responses: json } },
      '/students/{id}/plan-assignment': { get: { parameters: path('id'), responses: json }, post: { parameters: path('id'), requestBody: body(assignmentSchema), responses: json } },
      '/students/{id}/plan-assignment/replace': { post: { parameters: path('id'), requestBody: body(assignmentSchema), responses: json } },
      '/students/{id}/plan-assignment/end': { post: { parameters: path('id'), responses: json } },
      '/student/me/plan': { get: { summary: 'Read-only current published version assigned to authenticated student', responses: json } },
      '/student/me/workouts': { get: { summary: 'Student occurrence history', responses: json } },
      '/students/{studentId}/workout-sessions': { get: { parameters: path('studentId'), summary: 'Assigned trainer session list', responses: json }, post: { parameters: path('studentId'), requestBody: body(scheduleWorkoutSchema), summary: 'Schedule from pinned published version', responses: json } },
      '/workout-sessions/{id}': { get: { parameters: path('id'), summary: 'Authorized occurrence, execution, technique and previous actual sets', responses: json } },
      '/workout-sessions/{id}/start': { post: { parameters: path('id'), requestBody: body(startWorkoutSchema), responses: json } },
      '/workout-sessions/{id}/sets/{setId}': { put: { parameters: [...path('id'), ...path('setId')], requestBody: body(setPerformanceSchema), responses: json } },
      '/workout-sessions/{id}/finish': { post: { parameters: path('id'), requestBody: body(finishWorkoutSchema), responses: json } },
      '/workout-sessions/{id}/cancel': { post: { parameters: path('id'), requestBody: body(cancelWorkoutSchema), responses: json } },
      '/workout-sessions/{id}/skip': { post: { parameters: path('id'), requestBody: body(skipWorkoutSchema), responses: json } },
      '/workout-sessions/{id}/feedback': { get: { parameters: path('id'), summary: 'Scoped eligibility, 24-hour deadline, early safety facts and immutable feedback', responses: json }, post: { parameters: path('id'), summary: 'Submit once, with retry-safe structured discomfort reports', requestBody: body(feedbackSubmitSchema), responses: json } },
      '/students/{id}/feedback-signals': { get: { parameters: path('id'), summary: 'Assigned trainer/admin factual recent recovery and discomfort signals', responses: json } },
      '/health': { get: { responses: json } },
    } };
  }
}
