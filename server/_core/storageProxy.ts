import type { Express } from "express";
import { requireConversationMember, requireLessonAccess } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

/**
 * Object keys are namespaced by the resource that owns them. Only these two
 * private namespaces are served; anything else is refused. The proxy is a
 * convenience for objects the caller is already authorised to read, not a
 * general-purpose presign service — it must never mint a URL for a key the
 * requester has not been authorised against.
 *
 *   private/conversations/{conversationId}/{userId}/{fileName}
 *   private/courses/{courseId}/{lessonId}/{fileName}
 */
const CONVERSATION_KEY = /^private\/conversations\/(\d+)\/\d+\/[^/]+$/;
const LESSON_VIDEO_KEY = /^private\/courses\/(\d+)\/(\d+)\/[^/]+$/;

/**
 * Throws if the user may not read the object. Reuses the same authorization
 * rules as the tRPC procedures so the two paths cannot drift apart.
 */
async function authorizeStorageKey(userId: number, key: string): Promise<void> {
  const conversation = CONVERSATION_KEY.exec(key);
  if (conversation) {
    await requireConversationMember(userId, Number(conversation[1]));
    return;
  }

  const lesson = LESSON_VIDEO_KEY.exec(key);
  if (lesson) {
    await requireLessonAccess(userId, Number(lesson[2]));
    return;
  }

  throw new Error("Unknown object namespace");
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // Authenticate first. Without this, anyone who learns or guesses a storage
    // key can mint a signed URL for private chat attachments and paid lesson
    // videos, bypassing the membership/enrollment checks that gate them
    // everywhere else.
    let userId: number;
    try {
      const user = await sdk.authenticateRequest(req);
      userId = user.id;
    } catch {
      res.status(401).send("Sign in to access this file");
      return;
    }

    try {
      await authorizeStorageKey(userId, key);
    } catch {
      // Deliberately 404 rather than 403: do not disclose whether an object
      // exists to a caller who may not read it.
      res.status(404).send("Not found");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
