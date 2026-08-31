import { describe, expect, it } from "vitest";
import type { FirebaseMessage, FirebaseMessageMemory } from "../client/src/lib/firebaseChat";
import {
  answerConversationRecall,
  inferSavannaMemoryTags,
  isSavannaFollowUpDue,
  parseSavannaInvocation,
} from "../client/src/lib/savannaRecall";

function memory(overrides: Partial<FirebaseMessageMemory>): FirebaseMessageMemory {
  return {
    id: "memory-1",
    ownerUserId: "user-a",
    sourceType: "message",
    conversationId: "conversation-1",
    conversationTitle: "Ayo Mensah",
    messageId: "message-1",
    senderUserId: "user-b",
    snippet: "send the quote tomorrow",
    tags: ["follow_up", "task"],
    followUpAt: new Date("2026-08-31T09:00:00.000Z"),
    followUpLabel: "Tomorrow",
    followUpAction: "send the quote tomorrow",
    followUpCompletedAt: null,
    sourceCreatedAt: new Date("2026-08-30T09:00:00.000Z"),
    createdAt: new Date("2026-08-30T09:00:00.000Z"),
    updatedAt: new Date("2026-08-30T09:00:00.000Z"),
    ...overrides,
  };
}

function message(overrides: Partial<FirebaseMessage>): FirebaseMessage {
  return {
    id: "chat-message-1",
    senderUserId: "user-b",
    contentType: "text",
    payload: "The designer quote is 150.",
    attachments: [],
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
    status: "read",
    deliveredTo: ["user-a", "user-b"],
    readBy: ["user-a", "user-b"],
    replyTo: null,
    reactions: {},
    savedBy: [],
    pinnedBy: [],
    memoryPrompt: null,
    ...overrides,
  };
}

describe("Savanna Recall", () => {
  it("parses @Savanna invocations without treating normal messages as commands", () => {
    expect(parseSavannaInvocation("@Savanna what prices did I save?")).toBe("what prices did I save?");
    expect(parseSavannaInvocation("hello @Savanna")).toBeNull();
  });

  it("understands plural memory tags users naturally ask for", () => {
    expect(inferSavannaMemoryTags("show me saved prices, products, links and tasks")).toEqual(
      expect.arrayContaining(["money", "product", "link", "task"]),
    );
  });

  it("keeps completed follow-ups out of due prompts and Recall answers", () => {
    const active = memory({ id: "active", messageId: "active-message", snippet: "call Tendai today", followUpLabel: "Today", followUpAction: "call Tendai today" });
    const completed = memory({
      id: "completed",
      conversationTitle: "Esi Adom",
      messageId: "completed-message",
      snippet: "send Esi the invoice tomorrow",
      followUpAction: "send Esi the invoice tomorrow",
      followUpCompletedAt: new Date("2026-08-30T12:00:00.000Z"),
    });

    expect(isSavannaFollowUpDue(active, new Date("2026-08-31T12:00:00.000Z"))).toBe(true);
    expect(isSavannaFollowUpDue(completed, new Date("2026-08-31T12:00:00.000Z"))).toBe(false);

    const answer = answerConversationRecall({
      conversationId: "recall",
      conversationTitle: "your Savanna memory",
      query: "what follow-ups are due?",
      messages: [],
      memories: [completed, active],
    });

    expect(answer.answer).toContain("call Tendai today");
    expect(answer.answer).not.toContain("send Esi the invoice");
    expect(answer.sources).toHaveLength(1);
    expect(answer.sources[0].label).toBe("Ayo Mensah");
  });

  it("returns a small source set when saved memories and chat messages both match", () => {
    const answer = answerConversationRecall({
      conversationId: "conversation-1",
      conversationTitle: "Ayo Mensah",
      query: "designer quote",
      messages: [message({ id: "chat-message-2" })],
      memories: [
        memory({
          id: "memory-quote",
          messageId: "memory-message-2",
          snippet: "Designer quoted $120 for the logo.",
          tags: ["money", "person"],
          followUpAt: null,
          followUpLabel: null,
          followUpAction: null,
        }),
      ],
    });

    expect(answer.answer).toContain("I found 2 useful matches");
    expect(answer.answer).toContain("Saved memory in Ayo Mensah");
    expect(answer.answer).toContain("Chat in Ayo Mensah");
    expect(answer.sources.map(source => source.label)).toEqual(["Ayo Mensah", "Ayo Mensah"]);
  });
});
