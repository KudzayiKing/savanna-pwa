import type { Express, Response } from "express";
import { z } from "zod";
import { answerRecallWithGemma, embedWithEmbeddingGemma, translateWithTranslateGemma } from "./gemma";

const recallSourceSchema = z.object({
  sourceType: z.enum(["message", "story"]),
  conversationId: z.string().max(160),
  conversationTitle: z.string().max(180),
  messageId: z.string().max(160),
  senderUserId: z.string().max(160),
  storyId: z.string().max(160).nullable(),
  storyHref: z.string().max(280).nullable(),
  timestamp: z.string().max(80),
  snippet: z.string().trim().min(1).max(900),
  label: z.string().max(180),
});

const recallSchema = z.object({
  query: z.string().trim().min(1).max(700),
  conversationTitle: z.string().trim().min(1).max(180),
  fallbackAnswer: z.string().trim().min(1).max(1400),
  sources: z.array(recallSourceSchema).max(24),
});

const memorySchema = z.object({
  text: z.string().trim().min(1).max(1400),
});

const translateSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  targetLanguage: z.string().trim().min(2).max(80),
  sourceLanguage: z.string().trim().min(2).max(80).nullable().optional(),
});

function sendValidationError(res: Response, error: z.ZodError) {
  return res.status(400).json({
    error: "Invalid AI request",
    issues: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })),
  });
}

export function registerAiRoutes(app: Express) {
  app.post("/api/ai/recall-answer", async (req, res, next) => {
    const parsed = recallSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    try {
      return res.status(200).json(await answerRecallWithGemma(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/ai/memory-enrichment", async (req, res, next) => {
    const parsed = memorySchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    try {
      return res.status(200).json(await embedWithEmbeddingGemma(parsed.data.text));
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/ai/translate", async (req, res, next) => {
    const parsed = translateSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    try {
      return res.status(200).json(await translateWithTranslateGemma(parsed.data));
    } catch (error) {
      return next(error);
    }
  });
}
