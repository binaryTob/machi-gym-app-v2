import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Db, guardProvider, originProvider } from './common';
import { AuthController, AuthService } from './auth';
import { StudentController, StudentService, DashboardController } from './students';
import { HealthController } from './health';
import { OpenApiController } from './openapi';
import { ExerciseController, ExerciseService } from './exercises';
import { PlanController, PlanService, PlanVersionController } from './plans';
import { ProgrammingController, ProgrammingService } from './programming';
import { AssignmentController, AssignmentService } from './assignments';
import { WorkoutController, WorkoutService } from './workouts';
import { FeedbackController, FeedbackService } from './feedback';
import { AnalyticsController, AnalyticsService } from './analytics';

@Module({ controllers: [AuthController, StudentController, DashboardController, HealthController, OpenApiController, ExerciseController, PlanController, PlanVersionController, ProgrammingController, AssignmentController, WorkoutController, FeedbackController, AnalyticsController], providers: [Db, Reflector, originProvider, guardProvider, AuthService, StudentService, ExerciseService, PlanService, ProgrammingService, AssignmentService, WorkoutService, FeedbackService, AnalyticsService] })
export class AppModule {}
