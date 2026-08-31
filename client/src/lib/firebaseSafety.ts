import type { AppUser } from "@/lib/userProfile";
import { addDoc, collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebase";

export type SafetyReportInput = {
  reporter: AppUser | null;
  targetDomain: "profile" | "story" | "story_comment" | "community_post" | "storefront" | "product" | "course" | "message" | "payment";
  targetId: string;
  reason: "spam" | "impersonation" | "scam" | "harassment" | "unsafe_content" | "other";
  evidenceScope: "none" | "selected_item" | "user_submitted";
  detail?: string;
};

export async function createFirebaseSafetyReport(input: SafetyReportInput) {
  if (!input.reporter) throw new Error("Sign in to send a safety report");
  await addDoc(collection(getFirestoreDb(), "safetyReports"), {
    reporterUserId: input.reporter.id,
    targetDomain: input.targetDomain,
    targetId: input.targetId,
    reason: input.reason,
    evidenceScope: input.evidenceScope,
    detail: input.detail?.trim() || null,
    status: "new",
    createdAt: serverTimestamp(),
  });
}

export async function createFirebaseBlock(blocker: AppUser | null, blockedUserId: string) {
  if (!blocker) throw new Error("Sign in to block an account");
  const cleanedId = blockedUserId.trim();
  if (!cleanedId) throw new Error("Choose an account to block");
  if (cleanedId === blocker.id) throw new Error("You cannot block yourself");

  await setDoc(doc(getFirestoreDb(), "users", blocker.id, "blockedUsers", cleanedId), {
    blockedUserId: cleanedId,
    createdAt: serverTimestamp(),
  });
}

export async function listFirebaseBlockedUserIds(user?: AppUser | null) {
  if (!user) return [];
  const snapshot = await getDocs(collection(getFirestoreDb(), "users", user.id, "blockedUsers"));
  return snapshot.docs.map(item => {
    const data = item.data();
    return typeof data.blockedUserId === "string" ? data.blockedUserId : item.id;
  });
}
