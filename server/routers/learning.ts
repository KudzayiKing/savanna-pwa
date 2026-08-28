import { z } from "zod";
import {
  createCourse,
  createCourseEnrollment,
  createCourseLesson,
  createCourseModule,
  getCourseBySlug,
  getLessonVideoUrl,
  getMyCourses,
  listPublicCourses,
  listPublicPreviewLessons,
  updateLessonProgress,
  uploadCourseLessonVideo,
} from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const courseInput = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2400).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  priceMinor: z.number().int().min(0),
  visibility: z.enum(["draft", "public", "paused"]),
  storefrontId: z.number().int().positive().nullable().optional(),
});

export const learningRouter = router({
  courses: router({
    list: publicProcedure.input(z.object({ query: z.string().trim().max(120).optional() }).optional()).query(({ input }) => listPublicCourses(input?.query)),
    previewLessons: publicProcedure.input(z.object({ query: z.string().trim().max(120).optional() }).optional()).query(({ input }) => listPublicPreviewLessons(input?.query)),
    detail: publicProcedure.input(z.object({ slug: z.string().trim().min(1).max(100) })).query(({ ctx, input }) => getCourseBySlug(ctx.user?.id ?? null, input.slug)),
    mine: protectedProcedure.query(({ ctx }) => getMyCourses(ctx.user.id)),
    create: protectedProcedure.input(courseInput).mutation(({ ctx, input }) => createCourse(ctx.user.id, input)),
    addModule: protectedProcedure.input(z.object({ courseId: z.number().int().positive(), title: z.string().trim().min(2).max(180), description: z.string().trim().max(1000).nullable().optional(), sortOrder: z.number().int().min(0) })).mutation(({ ctx, input }) => createCourseModule(ctx.user.id, input)),
    addLesson: protectedProcedure.input(z.object({ courseId: z.number().int().positive(), moduleId: z.number().int().positive(), title: z.string().trim().min(2).max(180), summary: z.string().trim().max(1000).nullable().optional(), sortOrder: z.number().int().min(0), isPreview: z.boolean() })).mutation(({ ctx, input }) => createCourseLesson(ctx.user.id, input)),
    uploadLessonVideo: protectedProcedure.input(z.object({ lessonId: z.number().int().positive(), fileName: z.string().trim().min(1).max(255), base64Data: z.string().min(1).max(11_200_000), byteSize: z.number().int().positive().max(8 * 1024 * 1024) })).mutation(({ ctx, input }) => uploadCourseLessonVideo(ctx.user.id, input)),
    enroll: protectedProcedure.input(z.object({ courseId: z.number().int().positive() })).mutation(({ ctx, input }) => createCourseEnrollment(ctx.user.id, input.courseId)),
    lessonVideo: protectedProcedure.input(z.object({ lessonId: z.number().int().positive() })).query(({ ctx, input }) => getLessonVideoUrl(ctx.user.id, input.lessonId)),
    updateProgress: protectedProcedure.input(z.object({ lessonId: z.number().int().positive(), watchedSeconds: z.number().int().min(0), completed: z.boolean() })).mutation(({ ctx, input }) => updateLessonProgress(ctx.user.id, input)),
  }),
});
