import { useAuth } from "@/_core/hooks/useAuth";
import { AnimatedCheckCheckIcon, AnimatedCheckIcon, AnimatedPlusIcon, AnimatedSearchIcon, AnimatedSendIcon, MobileNavIcon } from "@/components/AnimatedNavIcons";
import { MicIcon, type ChatIconHandle } from "@/components/AnimatedChatIcons";
import { CommunityVisibilitySelect } from "@/components/CommunityVisibilitySelect";
import { ConversationHeader } from "@/components/ConversationHeader";
import { SafetyActions } from "@/components/SafetyActions";
import { SavannaShell } from "@/components/SavannaShell";
import { StoryComposer } from "@/components/StoriesPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/useMobile";
import { startLogin } from "@/const";
import {
  FIREBASE_MESSAGE_REACTIONS,
  getConversationPeerId,
  useFirebaseChatMutations,
  useFirebaseConversations,
  useFirebaseMessageMemories,
  useFirebaseMessages,
  type FirebaseConversationKind,
  type FirebaseConversationListItem,
  type FirebaseMessage,
  type FirebaseMessageMemory,
  type FirebaseMessageReactionKey,
  type FirebaseMessageStatus,
} from "@/lib/firebaseChat";
import { useFirebaseCommunityMutations, type FirebaseCommunityVisibility } from "@/lib/firebaseCommunities";
import { useFirebaseStories } from "@/lib/firebaseStories";
import { answerConversationRecall, isSavannaFollowUpDue, parseSavannaInvocation, type SavannaRecallAnswer, type SavannaRecallSource } from "@/lib/savannaRecall";
import { isSameUser, normalizeUsername, searchUserProfilesByUsername, type AppUser } from "@/lib/userProfile";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, CalendarClock, ChevronDown, ChevronUp, FileText, Heart, Loader2, MessageCircle, Paperclip, Pin, Reply, Search, StopCircle, Users, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/mpeg", "audio/mp4", "audio/webm", "video/mp4", "video/webm"];
const reactionGlyphs: Record<FirebaseMessageReactionKey, string> = {
  heart: "Love",
  thumbs_up: "+1",
  laugh: "Ha",
  pray: "Thx",
};

type ConversationListItem = FirebaseConversationListItem;
type CreationMode = FirebaseConversationKind | "community";

const previewConversations: ConversationListItem[] = [];
const desktopPreviewMessages: never[] = [];

type PresenceSnapshot = {
  headline: string;
  subline: string;
  online: boolean;
  typing: boolean;
  groupActivityCount: number;
};

function initialCommunityForm() {
  return {
    name: "",
    description: "",
    city: "",
    visibility: "public" as FirebaseCommunityVisibility,
  };
}

function conversationTitle(conversation: Pick<ConversationListItem, "kind" | "title">) {
  return conversation.title || (conversation.kind === "group" ? "Group chat" : "Private chat");
}

function hashId(id: string) {
  return id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function isPreviewConversationId(id: string) {
  return id.startsWith("preview-");
}

function getConversationPresence(conversation: Pick<ConversationListItem, "id" | "kind" | "title">, index = 0): PresenceSnapshot {
  if (conversation.kind === "group") {
    return {
      headline: "38 people active",
      subline: "Group activity is moving now",
      online: true,
      typing: false,
      groupActivityCount: 38,
    };
  }

  if (conversation.kind === "merchant_support") {
    return {
      headline: "Active 2m ago",
      subline: "Shop support is nearby",
      online: false,
      typing: false,
      groupActivityCount: 18,
    };
  }

  const snapshots: PresenceSnapshot[] = [
    { headline: "Online", subline: "Here now", online: true, typing: false, groupActivityCount: 12 },
    { headline: "Typing...", subline: "Writing back", online: true, typing: true, groupActivityCount: 12 },
    { headline: "Active 2m ago", subline: "Recently around", online: false, typing: false, groupActivityCount: 9 },
  ];
  return snapshots[Math.abs(hashId(conversation.id) + index) % snapshots.length];
}

function PrivateAttachment({ url, fileName, mimeType }: { url: string | null; fileName: string; mimeType: string }) {
  if (!url) return <span className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#fff2e9] px-3 py-2 text-xs text-[#8a5b39]">Attachment unavailable</span>;
  if (mimeType.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl bg-black/5 dark:bg-white/10">
        <img src={url} alt={fileName} className="max-h-72 w-full object-cover" loading="lazy" />
      </a>
    );
  }
  if (mimeType.startsWith("video/")) {
    return (
      <video controls playsInline className="mt-2 max-h-80 w-full rounded-xl bg-black/10">
        <source src={url} type={mimeType} />
      </video>
    );
  }
  if (mimeType.startsWith("audio/")) {
    return (
      <div className="mt-2 rounded-xl bg-[#D9A441]/10 p-2">
        <audio controls preload="metadata" className="h-9 w-full">
          <source src={url} type={mimeType} />
        </audio>
      </div>
    );
  }
  return <a href={url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-xl bg-[#D9A441]/10 px-3 py-2 text-xs font-medium text-[#9a6410] hover:bg-[#D9A441]/20"><FileText className="size-4" /><span className="max-w-44 truncate">{fileName}</span><span className="text-[#5f6861]">{mimeType.split("/")[1]?.toUpperCase()}</span></a>;
}

function DeliveryIcon({ status, className }: { status: FirebaseMessageStatus; className?: string }) {
  if (status === "read") return <AnimatedCheckCheckIcon className="text-[#22C55E]" size={13} aria-label="Read" />;
  if (status === "delivered") return <AnimatedCheckCheckIcon className={className ?? "text-current"} size={13} aria-label="Delivered" />;
  if (status === "failed") return <X className="size-3 text-[#FF5B6B]" aria-label="Failed" />;
  return <AnimatedCheckIcon className={className ?? "text-current"} size={13} aria-label="Sent" />;
}

function DesktopStoryRail({ items, onCreateStory }: { items: Array<{ id: string | number; label: string }>; onCreateStory: () => void }) {
  return (
    <div className="savanna-desktop-story-rail" aria-label="Stories">
      <div className="flex gap-3 overflow-x-auto pb-1">
        <button type="button" onClick={onCreateStory} className="flex w-11 shrink-0 flex-col items-center gap-1 text-left">
          <span aria-label="Add to your Story" className="savanna-brand-token grid size-11 place-items-center rounded-full text-xs font-semibold">
            <AnimatedPlusIcon size={18} />
          </span>
          <span className="max-w-11 truncate text-center text-[10px] text-[#5f6861]">Your</span>
        </button>
        {items.map(item => (
          <div key={item.id} className="flex w-11 shrink-0 flex-col items-center gap-1">
            <span aria-label={`${item.label}'s Story`} className="savanna-brand-token grid size-11 place-items-center rounded-full text-xs font-semibold">
              {item.label.slice(0, 1).toUpperCase()}
            </span>
            <span className="max-w-11 truncate text-center text-[10px] text-[#5f6861]">{item.label.split(" ")[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const conversations = useFirebaseConversations(user);
  const messageMemories = useFirebaseMessageMemories(user);
  const isMobile = useIsMobile();
  const desktopStories = useFirebaseStories(user, !isMobile);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const isPreviewConversation = Boolean(selectedConversationId && isPreviewConversationId(selectedConversationId));
  const chatMutations = useFirebaseChatMutations(user);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<FirebaseMessage | null>(null);
  const [activeMessageActions, setActiveMessageActions] = useState<string | null>(null);
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [threadSearchIndex, setThreadSearchIndex] = useState(0);
  const [groupTitle, setGroupTitle] = useState("");
  const [inviteeSearch, setInviteeSearch] = useState("");
  const [selectedInvitees, setSelectedInvitees] = useState<AppUser[]>([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [locallyCreatedConversations, setLocallyCreatedConversations] = useState<ConversationListItem[]>([]);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [sendPulse, setSendPulse] = useState(0);
  const [recording, setRecording] = useState(false);
  const chatPreviewMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("chatPreview") : null;
  const [chatFilter, setChatFilter] = useState<string>("all");
  const [mobileDetail, setMobileDetail] = useState(chatPreviewMode === "detail");
  const messageQuery = useFirebaseMessages(
    selectedConversationId,
    user,
    isAuthenticated && selectedConversationId !== null && !isPreviewConversation && (!isMobile || mobileDetail),
  );
  const messages = isPreviewConversation ? { ...messageQuery, data: desktopPreviewMessages, isLoading: false } : messageQuery;
  const detailHistoryPushed = useRef(false);
  const [newChatOpen, setNewChatOpen] = useState(chatPreviewMode === "drawer");
  const [creationMode, setCreationMode] = useState<CreationMode>("direct");
  const [communityForm, setCommunityForm] = useState(initialCommunityForm);
  const [savannaAnswers, setSavannaAnswers] = useState<Record<string, SavannaRecallAnswer[]>>({});
  const [customTabs, setCustomTabs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("savanna-message-tabs") ?? "[]"); } catch { return []; }
  });
  const [tabMembership, setTabMembership] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem("savanna-message-tab-membership") ?? "{}"); } catch { return {}; }
  });
  const attachmentInput = useRef<HTMLInputElement>(null);
  const micIcon = useRef<ChatIconHandle>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const recordingStream = useRef<MediaStream | null>(null);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const mobileThreadRef = useRef<HTMLDivElement | null>(null);
  const mobileComposerRef = useRef<HTMLFormElement | null>(null);
  const actionHideTimer = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const pendingOpenMessageId = useRef<string | null>(null);
  const lastAutoScrolledMessageId = useRef<string | null>(null);
  const autoScrollRetryTimer = useRef<number | null>(null);
  const handledInviteCode = useRef<string | null>(null);
  const normalizedUsernameSearch = normalizeUsername(conversationSearch);
  const isUsernameSearch = conversationSearch.trim().startsWith("@") && normalizedUsernameSearch.length >= 2;
  const normalizedInviteeSearch = normalizeUsername(inviteeSearch);
  const isInviteeSearch = inviteeSearch.trim().startsWith("@") && normalizedInviteeSearch.length >= 2;
  const usernameResults = useQuery({
    queryKey: ["firebase", "username-search", normalizedUsernameSearch, user?.id ?? "guest"],
    queryFn: () => searchUserProfilesByUsername(conversationSearch, user),
    enabled: Boolean(user && isUsernameSearch),
  });
  const inviteeResults = useQuery({
    queryKey: ["firebase", "invitee-search", normalizedInviteeSearch, user?.id ?? "guest"],
    queryFn: () => searchUserProfilesByUsername(inviteeSearch, user),
    enabled: Boolean(user && newChatOpen && creationMode !== "community" && isInviteeSearch),
  });
  const communityMutations = useFirebaseCommunityMutations(user);
  const scrollMobileThreadToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const thread = mobileThreadRef.current;
    if (!thread) return;
    thread.scrollTo({ top: thread.scrollHeight, behavior });
  }, []);
  const scrollThreadToMessage = useCallback((messageId: string, behavior: ScrollBehavior = "smooth") => {
    const message = messageRefs.current[messageId];
    if (!message) return false;
    const thread = (
      message.closest(".savanna-mobile-message-thread, .savanna-desktop-message-thread")
      ?? mobileThreadRef.current
    ) as HTMLElement | null;
    if (!thread) return false;
    const messageRect = message.getBoundingClientRect();
    const threadRect = thread.getBoundingClientRect();
    const centeredTop = thread.scrollTop + messageRect.top - threadRect.top - Math.max(16, (thread.clientHeight - messageRect.height) / 2);
    thread.scrollTo({ top: Math.max(0, centeredTop), behavior });
    return true;
  }, []);

  useEffect(() => {
    if (!selectedConversationId || !conversations.data?.length) return;
    if (!conversations.data.some(conversation => conversation.id === selectedConversationId)) setSelectedConversationId(null);
  }, [conversations.data, selectedConversationId]);
  useEffect(() => { setReplyTo(null); }, [selectedConversationId]);
  useEffect(() => { lastAutoScrolledMessageId.current = null; }, [selectedConversationId]);
  useEffect(() => {
    setThreadSearchOpen(false);
    setThreadSearchQuery("");
    setThreadSearchIndex(0);
  }, [selectedConversationId]);
  useEffect(() => () => {
    if (actionHideTimer.current) window.clearTimeout(actionHideTimer.current);
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    if (autoScrollRetryTimer.current) window.clearTimeout(autoScrollRetryTimer.current);
    mediaRecorder.current?.stop();
    recordingStream.current?.getTracks().forEach(track => track.stop());
  }, []);
  useEffect(() => {
    if (import.meta.env.DEV && !isMobile && chatPreviewMode === "desktop" && previewConversations[0]) setSelectedConversationId(previewConversations[0].id);
  }, [chatPreviewMode, isMobile]);
  useEffect(() => {
    if (import.meta.env.DEV && isMobile && chatPreviewMode === "detail" && previewConversations[0]) setSelectedConversationId(previewConversations[0].id);
  }, [chatPreviewMode, isMobile]);
  useEffect(() => {
    if (!isMobile || !mobileDetail) return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    const syncViewportHeight = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        root.style.setProperty("--savanna-visual-viewport-height", `${Math.round(viewport?.height ?? window.innerHeight)}px`);
        frame = 0;
      });
    };
    syncViewportHeight();
    viewport?.addEventListener("resize", syncViewportHeight);
    viewport?.addEventListener("scroll", syncViewportHeight);
    window.addEventListener("resize", syncViewportHeight);
    window.addEventListener("orientationchange", syncViewportHeight);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", syncViewportHeight);
      viewport?.removeEventListener("scroll", syncViewportHeight);
      window.removeEventListener("resize", syncViewportHeight);
      window.removeEventListener("orientationchange", syncViewportHeight);
      root.style.removeProperty("--savanna-visual-viewport-height");
    };
  }, [isMobile, mobileDetail]);
  useEffect(() => {
    if (!isMobile || !mobileDetail) return;
    const composer = mobileComposerRef.current;
    if (!composer) return;
    const root = document.documentElement;
    const syncComposerHeight = () => {
      root.style.setProperty("--savanna-mobile-composer-height", `${Math.ceil(composer.getBoundingClientRect().height)}px`);
    };
    syncComposerHeight();
    const observer = new ResizeObserver(syncComposerHeight);
    observer.observe(composer);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--savanna-mobile-composer-height");
    };
  }, [isMobile, mobileDetail, replyTo?.id, attachment?.name]);
  useEffect(() => {
    const pendingConversationId = sessionStorage.getItem("savanna-open-conversation");
    if (!pendingConversationId) return;
    const pendingMessageId = sessionStorage.getItem("savanna-open-message");
    const pendingMeta = sessionStorage.getItem("savanna-open-conversation-meta");
    if (pendingMeta && !user) return;
    sessionStorage.removeItem("savanna-open-conversation");
    sessionStorage.removeItem("savanna-open-message");
    sessionStorage.removeItem("savanna-open-conversation-meta");
    pendingOpenMessageId.current = pendingMessageId;
    if (pendingMeta && user) {
      try {
        const parsed = JSON.parse(pendingMeta) as { id?: string; title?: string; peerUserId?: string; kind?: FirebaseConversationKind };
        const peerUserId = parsed.peerUserId;
        if (parsed.id === pendingConversationId && peerUserId) {
          setLocallyCreatedConversations(current => [
            {
              id: pendingConversationId,
              kind: parsed.kind ?? "direct",
              title: parsed.title ?? "Private chat",
              mutedUntil: null,
              lastMessageAt: new Date(),
              previewMessage: "",
              previewStatus: "sent",
              memberIds: [user.id, peerUserId].sort(),
            },
            ...current.filter(item => item.id !== pendingConversationId),
          ]);
        }
      } catch {
        // Ignore stale handoff metadata; the conversation query will still load.
      }
    }
    setSelectedConversationId(pendingConversationId);
    if (isMobile) setMobileDetail(true);
  }, [isMobile, user]);
  useEffect(() => {
    if (!pendingOpenMessageId.current || messages.isLoading) return;
    const messageId = pendingOpenMessageId.current;
    pendingOpenMessageId.current = null;
    window.setTimeout(() => scrollToMessage(messageId), 120);
  }, [messages.data, messages.isLoading]);
  useEffect(() => { localStorage.setItem("savanna-message-tabs", JSON.stringify(customTabs)); }, [customTabs]);
  useEffect(() => { localStorage.setItem("savanna-message-tab-membership", JSON.stringify(tabMembership)); }, [tabMembership]);
  useEffect(() => {
    if (creationMode === "direct") setSelectedInvitees(current => current.slice(0, 1));
    if (creationMode === "community") {
      setSelectedInvitees([]);
      setInviteeSearch("");
    }
  }, [creationMode]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite");
    if (!code || handledInviteCode.current === code) return;
    handledInviteCode.current = code;
    chatMutations.joinInvite.mutate(code, {
      onSuccess: conversationId => {
        setSelectedConversationId(conversationId);
        if (isMobile) setMobileDetail(true);
        params.delete("invite");
        const queryString = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${queryString ? `?${queryString}` : ""}`);
        toast.success("Joined group");
      },
      onError: error => toast.error(error.message),
    });
  }, [isMobile, user]);

  // The open conversation is a full-screen view on mobile, so the OS back
  // gesture needs a history entry of its own to unwind instead of leaving
  // /messages entirely.
  useEffect(() => {
    if (!isMobile || !mobileDetail) return;
    if (!detailHistoryPushed.current) {
      window.history.pushState({ savannaChatDetail: true }, "");
      detailHistoryPushed.current = true;
    }
    const onPopState = () => {
      detailHistoryPushed.current = false;
      setMobileDetail(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isMobile, mobileDetail]);

  const closeMobileDetail = useCallback(() => {
    if (detailHistoryPushed.current) {
      detailHistoryPushed.current = false;
      window.history.back();
      return;
    }
    setMobileDetail(false);
  }, []);

  const conversationSource: ConversationListItem[] = useMemo(() => {
    const real = conversations.data ?? [];
    const localOnly = locallyCreatedConversations.filter(local => !real.some(item => item.id === local.id));
    if (real.length || localOnly.length) return [...localOnly, ...real];
    return chatPreviewMode ? previewConversations : [];
  }, [chatPreviewMode, conversations.data, locallyCreatedConversations]);
  const filteredConversations = conversationSource.filter(conversation => conversationTitle(conversation).toLowerCase().includes(conversationSearch.toLowerCase()));
  const filteredChatList = filteredConversations.filter(conversation => chatFilter === "all" || conversation.kind === chatFilter || tabMembership[chatFilter]?.includes(conversation.id));
  const desktopStoryItems = desktopStories.data?.length ? desktopStories.data.slice(0, 8).map(story => ({ id: story.id, label: story.authorName })) : import.meta.env.DEV ? previewConversations.map(conversation => ({ id: conversation.id, label: conversationTitle(conversation) })) : [];
  const selected = conversationSource.find(conversation => conversation.id === selectedConversationId) ?? (isPreviewConversation ? previewConversations.find(conversation => conversation.id === selectedConversationId) : undefined);
  const selectedPresence = selected ? getConversationPresence(selected, filteredChatList.findIndex(conversation => conversation.id === selected.id)) : null;
  const selectedSavannaAnswers = selectedConversationId ? savannaAnswers[selectedConversationId] ?? [] : [];
  const threadSearchMatches = useMemo(() => {
    const query = threadSearchQuery.trim().toLowerCase();
    if (!query) return [];
    return (messages.data ?? []).filter(message => {
      const attachmentText = message.attachments.map(item => `${item.fileName} ${item.mimeType}`).join(" ");
      return `${message.payload} ${attachmentText}`.toLowerCase().includes(query);
    });
  }, [messages.data, threadSearchQuery]);
  const activeThreadSearchMessageId = threadSearchMatches[threadSearchIndex]?.id ?? null;
  const pinnedMessages = useMemo(() => (
    (messages.data ?? []).filter(message => message.pinnedBy.length).slice(-3).reverse()
  ), [messages.data]);
  const latestMessageId = messages.data?.[Math.max(0, (messages.data?.length ?? 0) - 1)]?.id ?? "";
  const latestUnreadIncomingMessageId = useMemo(() => {
    if (!user?.id) return "";
    const unreadIncoming = (messages.data ?? []).filter(message =>
      message.senderUserId !== user.id && !message.readBy.includes(user.id)
    );
    return unreadIncoming[unreadIncoming.length - 1]?.id ?? "";
  }, [messages.data, user?.id]);
  const targetAutoScrollMessageId = latestUnreadIncomingMessageId || latestMessageId;
  const autoScrollToCurrentTarget = useCallback((behavior: ScrollBehavior = "smooth") => {
    if ((isMobile && !mobileDetail) || !selectedConversationId || !targetAutoScrollMessageId || !latestMessageId) return false;
    const scrollKey = `${selectedConversationId}:${targetAutoScrollMessageId}:${latestMessageId}`;
    if (lastAutoScrolledMessageId.current === scrollKey) return true;
    if (scrollThreadToMessage(targetAutoScrollMessageId, behavior)) {
      lastAutoScrolledMessageId.current = scrollKey;
      return true;
    }
    return false;
  }, [
    isMobile,
    latestMessageId,
    mobileDetail,
    scrollThreadToMessage,
    selectedConversationId,
    targetAutoScrollMessageId,
  ]);
  const registerMessageElement = useCallback((messageId: string) => (element: HTMLElement | null) => {
    messageRefs.current[messageId] = element;
    if (!element || messageId !== targetAutoScrollMessageId) return;
    window.requestAnimationFrame(() => {
      autoScrollToCurrentTarget("auto");
    });
  }, [autoScrollToCurrentTarget, targetAutoScrollMessageId]);
  useEffect(() => {
    if (threadSearchIndex >= threadSearchMatches.length) setThreadSearchIndex(0);
  }, [threadSearchIndex, threadSearchMatches.length]);
  useEffect(() => {
    if ((isMobile && !mobileDetail) || !selectedConversationId || messages.isLoading || pendingOpenMessageId.current || !targetAutoScrollMessageId) return;
    let cancelled = false;
    let attempts = 0;
    const scrollToThreadEntry = () => {
      if (cancelled) return;
      if (autoScrollRetryTimer.current) {
        window.clearTimeout(autoScrollRetryTimer.current);
        autoScrollRetryTimer.current = null;
      }
      if (autoScrollToCurrentTarget(attempts ? "auto" : "smooth")) return;
      attempts += 1;
      if (attempts <= 12) {
        autoScrollRetryTimer.current = window.setTimeout(scrollToThreadEntry, 80);
        return;
      }
      if (isMobile) {
        scrollMobileThreadToBottom("smooth");
      }
    };
    const frame = window.requestAnimationFrame(scrollToThreadEntry);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (autoScrollRetryTimer.current) {
        window.clearTimeout(autoScrollRetryTimer.current);
        autoScrollRetryTimer.current = null;
      }
    };
  }, [
    attachment?.name,
    autoScrollToCurrentTarget,
    isMobile,
    messages.isLoading,
    mobileDetail,
    replyTo?.id,
    scrollMobileThreadToBottom,
    selectedConversationId,
    selectedSavannaAnswers.length,
    targetAutoScrollMessageId,
  ]);
  const dueFollowUps = useMemo(() => (
    (messageMemories.data ?? [])
      .filter(memory => isSavannaFollowUpDue(memory))
      .sort((left, right) => {
        const leftTime = left.followUpAt ? new Date(left.followUpAt).getTime() : 0;
        const rightTime = right.followUpAt ? new Date(right.followUpAt).getTime() : 0;
        return leftTime - rightTime;
      })
      .slice(0, 3)
  ), [messageMemories.data]);

  const startChatWithProfile = (profile: AppUser) => {
    if (!user) return;
    if (profile.id === user.id || (profile.username && profile.username === user.username)) {
      toast.info("That is your profile.");
      return;
    }
    const existingDirect = conversationSource.find(conversation =>
      conversation.kind === "direct"
      && conversation.memberIds.length === 2
      && conversation.memberIds.includes(user.id)
      && conversation.memberIds.includes(profile.id)
    );
    if (existingDirect) {
      setSelectedConversationId(existingDirect.id);
      setConversationSearch("");
      if (isMobile) setMobileDetail(true);
      return;
    }

    chatMutations.create.mutate(
      {
        kind: "direct",
        title: profile.name || (profile.username ? `@${profile.username}` : "Private chat"),
        memberIds: [profile.id],
      },
      {
        onSuccess: conversationId => {
          setLocallyCreatedConversations(current => [
            {
              id: conversationId,
              kind: "direct",
              title: profile.name || (profile.username ? `@${profile.username}` : "Private chat"),
              mutedUntil: null,
              lastMessageAt: new Date(),
              previewMessage: "",
              previewStatus: "sent",
              memberIds: [user.id, profile.id].sort(),
            },
            ...current.filter(item => item.id !== conversationId),
          ]);
          setSelectedConversationId(conversationId);
          setConversationSearch("");
          if (isMobile) setMobileDetail(true);
          toast.success("Chat started");
        },
        onError: error => toast.error(error.message),
      },
    );
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return toast.error(creationMode === "community" ? "Sign in to create a community" : "Sign in to create a chat");
    if (creationMode === "community") {
      communityMutations.create.mutate(
        {
          name: communityForm.name,
          description: communityForm.description,
          city: communityForm.city,
          visibility: communityForm.visibility,
        },
        {
          onSuccess: () => {
            setCommunityForm(initialCommunityForm());
            setNewChatOpen(false);
            navigate("/communities");
            toast.success("Community created");
          },
          onError: error => toast.error(error.message),
        },
      );
      return;
    }
    const parsedMembers = selectedInvitees.map(profile => profile.id);
    if (!parsedMembers.length) return toast.error("Add at least one Savanna user by @username");
    if (creationMode === "direct" && parsedMembers.length !== 1) return toast.error("Choose one person for a direct chat");
    if (creationMode === "group" && !groupTitle.trim()) return toast.error("Give the group a short name");
    chatMutations.create.mutate(
      { kind: creationMode, title: creationMode === "group" ? groupTitle.trim() : undefined, memberIds: parsedMembers },
      {
        onSuccess: conversationId => {
          setLocallyCreatedConversations(current => [
            {
              id: conversationId,
              kind: creationMode,
              title: creationMode === "group" ? groupTitle.trim() : null,
              mutedUntil: null,
              lastMessageAt: new Date(),
              previewMessage: "",
              previewStatus: "sent",
              memberIds: [user.id, ...parsedMembers].filter(Boolean).sort(),
            },
            ...current.filter(item => item.id !== conversationId),
          ]);
          setSelectedConversationId(conversationId);
          setSelectedInvitees([]);
          setInviteeSearch("");
          setGroupTitle("");
          setNewChatOpen(false);
          toast.success("Conversation created");
        },
        onError: error => toast.error(error.message),
      },
    );
  };

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!allowedMimeTypes.includes(file.type)) return toast.error("Choose a PNG, JPEG, WebP, PDF, MP3, or MP4 file");
    if (file.size > 8 * 1024 * 1024) return toast.error("Attachments must be 8 MB or smaller");
    setAttachment(file);
  };

  const messageSnippet = (message: FirebaseMessage) => {
    const text = message.contentType === "attachment" ? "Private attachment" : message.payload;
    const trimmed = text.trim().replace(/\s+/g, " ");
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedConversationId) return;
    setSendPulse(current => current + 1);
    if (isPreviewConversation) return toast.info("Development preview - messages are not sent or saved.");
    const savannaQuery = parseSavannaInvocation(draft);
    if (savannaQuery !== null) {
      if (attachment) return toast.error("@Savanna recall works with text questions for now.");
      if (!savannaQuery) return toast.info("Ask Savanna what to find in this conversation.");
      const answer = answerConversationRecall({
        conversationId: selectedConversationId,
        conversationTitle: selected ? conversationTitle(selected) : "this chat",
        query: savannaQuery,
        messages: messages.data ?? [],
        memories: messageMemories.data ?? [],
      });
      setSavannaAnswers(current => ({
        ...current,
        [selectedConversationId]: [...(current[selectedConversationId] ?? []), answer].slice(-8),
      }));
      setDraft("");
      return;
    }
    if (attachment) {
      chatMutations.sendAttachment.mutate(
        {
          conversationId: selectedConversationId,
          memberIds: selected?.memberIds ?? [],
          file: attachment,
          replyTo: replyTo ? { messageId: replyTo.id, senderUserId: replyTo.senderUserId, snippet: messageSnippet(replyTo) } : null,
        },
        {
          onSuccess: () => {
            setAttachment(null);
            setReplyTo(null);
            toast.success("Private attachment sent");
          },
          onError: error => toast.error(error.message),
        },
      );
      return;
    }
    if (draft.trim()) {
      chatMutations.send.mutate(
        {
          conversationId: selectedConversationId,
          memberIds: selected?.memberIds ?? [],
          body: draft.trim(),
          replyTo: replyTo ? { messageId: replyTo.id, senderUserId: replyTo.senderUserId, snippet: messageSnippet(replyTo) } : null,
        },
        {
          onSuccess: () => {
            setDraft("");
            setReplyTo(null);
          },
          onError: error => toast.error(error.message),
        },
      );
    }
  };

  const addCustomTab = () => {
    const label = window.prompt("Name this chat tab");
    if (!label?.trim()) return;
    setCustomTabs(current => current.includes(label.trim()) ? current : [...current, label.trim()].slice(0, 5));
  };

  const saveSelectedToTab = () => {
    if (!selected) return;
    const tab = window.prompt(`Save this chat to which tab?\n${customTabs.join(", ")}`)?.trim();
    if (!tab || !customTabs.includes(tab)) return toast.error("Choose one of your existing custom tabs.");
    setTabMembership(current => ({ ...current, [tab]: Array.from(new Set([...(current[tab] ?? []), selected.id])) }));
    toast.success(`Chat saved to ${tab}`);
  };

  const filterTabs = ([["all", "All"], ["direct", "Chats"], ["group", "Groups"], ["merchant_support", "Support"]] as const);

  const addInvitee = (profile: AppUser) => {
    setSelectedInvitees(current => current.some(item => item.id === profile.id) ? current : [...current, profile].slice(0, creationMode === "direct" ? 1 : 20));
    setInviteeSearch("");
  };

  const removeInvitee = (profileId: string) => {
    setSelectedInvitees(current => current.filter(profile => profile.id !== profileId));
  };

  const renderInviteePicker = () => (
    <div className="space-y-2">
      {selectedInvitees.length ? (
        <div className="flex flex-wrap gap-2">
          {selectedInvitees.map(profile => {
            const displayName = profile.name || (profile.username ? `@${profile.username}` : "Savanna user");
            return (
              <button key={profile.id} type="button" onClick={() => removeInvitee(profile.id)} className="inline-flex h-9 items-center gap-2 rounded-full bg-[#D9A441]/20 px-3 text-xs font-semibold text-[#9a6410] dark:text-[#D9A441]" aria-label={`Remove ${displayName}`}>
                {profile.photoURL ? <img src={profile.photoURL} alt="" className="size-5 rounded-full object-cover" /> : <span className="grid size-5 place-items-center rounded-full bg-[#D9A441]/20">{displayName.slice(0, 1).toUpperCase()}</span>}
                <span className="max-w-28 truncate">{displayName}</span>
                <X className="size-3" />
              </button>
            );
          })}
        </div>
      ) : null}
      <Input value={inviteeSearch} onChange={event => setInviteeSearch(event.target.value)} placeholder="Search @username to add people" aria-label="Search username to add people" className="savanna-new-chat-input bg-white dark:bg-[#2a2119]" />
      {isInviteeSearch ? (
        <div className="space-y-2 rounded-2xl bg-[#D9A441]/10 p-2">
          {inviteeResults.isLoading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-xs font-semibold text-[#9a6410]"><Loader2 className="size-4 animate-spin" />Searching people</div>
          ) : inviteeResults.data?.length ? inviteeResults.data.map(profile => {
            const displayName = profile.name || (profile.username ? `@${profile.username}` : "Savanna user");
            const selected = selectedInvitees.some(item => item.id === profile.id);
            return (
              <button key={profile.id} type="button" onClick={() => addInvitee(profile)} disabled={selected} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[#D9A441]/10 disabled:opacity-60">
                <span className="savanna-brand-token grid size-9 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold">
                  {profile.photoURL ? <img src={profile.photoURL} alt="" className="size-full rounded-full object-cover" /> : displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{displayName}</span>
                  <span className="block truncate text-xs text-[#5F6861] dark:text-[#9AA1A6]">@{profile.username}</span>
                </span>
                <span className="rounded-full bg-[#D9A441]/20 px-2 py-1 text-[11px] font-semibold text-[#D9A441]">{selected ? "Added" : "Add"}</span>
              </button>
            );
          }) : (
            <div className="px-2 py-2 text-xs font-semibold text-[#9a6410]">No username found for @{normalizedInviteeSearch}</div>
          )}
        </div>
      ) : null}
    </div>
  );

  const renderUsernameResults = (variant: "mobile" | "desktop") => {
    if (!isUsernameSearch) return null;
    const compact = variant === "mobile";
    return (
      <div className={cn("space-y-2", compact ? "mx-2 mt-3" : "mt-3")}>
        {usernameResults.isLoading ? (
          <div className="flex items-center gap-2 rounded-2xl bg-[#D9A441]/10 px-4 py-3 text-xs font-semibold text-[#9a6410]">
            <Loader2 className="size-4 animate-spin" /> Searching usernames
          </div>
        ) : usernameResults.data?.length ? (
          usernameResults.data.map(profile => {
            const displayName = profile.name || (profile.username ? `@${profile.username}` : "Savanna user");
            return (
              <div key={profile.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3 shadow-[0_8px_22px_rgba(94,58,11,0.035)] dark:bg-[#202C33]">
                <span className="savanna-brand-token grid size-10 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-semibold">
                  {profile.photoURL ? <img src={profile.photoURL} alt="" className="size-full rounded-full object-cover" /> : displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{displayName}</span>
                  <span className="block truncate text-xs text-[#5F6861] dark:text-[#9AA1A6]">@{profile.username}</span>
                </span>
                <Button
                  type="button"
                  onClick={() => startChatWithProfile(profile)}
                  disabled={chatMutations.create.isPending}
                  className="savanna-brand-token h-10 rounded-full px-4 text-xs shadow-none"
                >
                  {chatMutations.create.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <MobileNavIcon name="Messages" active size={18} />}
                  Chat
                </Button>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl bg-[#D9A441]/10 px-4 py-3 text-xs font-semibold text-[#9a6410]">
            No username found for @{normalizedUsernameSearch}
          </div>
        )}
      </div>
    );
  };

  const startVideoCall = () => toast.info("Video calling arrives with the next release.");
  const startVoiceCall = () => toast.info("Voice calling arrives with the next release.");

  /** Shared avatar tile so the group glyph and direct chats look identical everywhere. */
  const conversationAvatar = (conversation: Pick<ConversationListItem, "kind">) =>
    conversation.kind === "group" ? <Users className="size-5" /> : "S";

  /**
   * Avatar handler for the chat list and the conversation header: opens the
   * other person's public profile.
   *
   * Returns undefined when there is no single counterparty — groups, and rows
   * whose members cannot be resolved. Both call sites render a plain span in
   * that case, so a tile never looks tappable when it is not.
   */
  const peerProfileOpener = (conversation: Pick<ConversationListItem, "kind" | "memberIds">) => {
    const peerId = getConversationPeerId(conversation, user?.id);
    return peerId ? () => navigate(`/people/${peerId}`) : undefined;
  };

  const scrollToMessage = (messageId: string) => {
    scrollThreadToMessage(messageId);
  };

  const moveThreadSearch = (direction: 1 | -1) => {
    if (!threadSearchMatches.length) return;
    setThreadSearchIndex(current => {
      const next = (current + direction + threadSearchMatches.length) % threadSearchMatches.length;
      window.setTimeout(() => scrollToMessage(threadSearchMatches[next]?.id ?? ""), 0);
      return next;
    });
  };

  const openPinnedMessage = (messageId: string) => {
    scrollToMessage(messageId);
    revealMessageActions(messageId, true);
  };

  const buildInviteLink = (code: string) => `${window.location.origin}/messages?invite=${encodeURIComponent(code)}`;

  const shareSelectedInviteLink = async () => {
    if (!selected?.inviteCode) return toast.info("Create a group invite first.");
    const url = buildInviteLink(selected.inviteCode);
    const shareApi = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    const canShare = typeof shareApi.share === "function";
    try {
      if (canShare) {
        await shareApi.share!({ title: conversationTitle(selected), text: "Join this Savanna group.", url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      toast.success(canShare ? "Invite ready to share" : "Invite link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this invite link.");
    }
  };

  const conversationMenu = selected ? (
    <>
      <DropdownMenuItem onSelect={() => setThreadSearchOpen(true)}>Search in chat</DropdownMenuItem>
      {selected.kind === "group" && selected.inviteCode ? (
        <DropdownMenuItem onSelect={() => window.setTimeout(shareSelectedInviteLink, 0)}>Share invite link</DropdownMenuItem>
      ) : null}
      {pinnedMessages.length ? (
        <DropdownMenuItem onSelect={() => openPinnedMessage(pinnedMessages[0].id)}>View pinned message</DropdownMenuItem>
      ) : null}
      {customTabs.length ? (
        <DropdownMenuItem onSelect={() => window.setTimeout(saveSelectedToTab, 0)}>Save chat to a tab</DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={() => toast.info("Notification controls arrive with the next release.")}>Mute notifications</DropdownMenuItem>
    </>
  ) : null;

  const openRecallSource = (source: SavannaRecallSource) => {
    if (source.conversationId !== selectedConversationId) {
      setSelectedConversationId(source.conversationId);
      if (isMobile) setMobileDetail(true);
      window.setTimeout(() => scrollToMessage(source.messageId), 350);
      return;
    }
    scrollToMessage(source.messageId);
  };

  const openMemoryFollowUp = (memory: FirebaseMessageMemory) => {
    pendingOpenMessageId.current = memory.messageId;
    setSelectedConversationId(memory.conversationId);
    if (isMobile) setMobileDetail(true);
    window.setTimeout(() => scrollToMessage(memory.messageId), 350);
  };

  const renderDueFollowUpsPrompt = (variant: "mobile" | "desktop") => {
    if (!dueFollowUps.length) return null;
    const compact = variant === "mobile";
    const first = dueFollowUps[0];
    return (
      <div className={cn(
        "savanna-due-followups flex items-center gap-3 rounded-2xl bg-[#D9A441]/10 p-3 text-left",
        compact ? "mx-2 mt-3" : "mt-3",
      )}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]"><CalendarClock className="size-5" /></span>
        <button type="button" onClick={() => openMemoryFollowUp(first)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{dueFollowUps.length === 1 ? "1 follow-up due" : `${dueFollowUps.length} follow-ups due`}</span>
          <span className="mt-0.5 block truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">{first.followUpAction || first.snippet}</span>
        </button>
        <Button type="button" size="sm" onClick={() => navigate("/recall")} className="h-8 shrink-0 rounded-full bg-[#D9A441]/20 px-3 text-xs font-semibold text-[#9a6410] shadow-none hover:bg-[#D9A441]/30 dark:text-[#D9A441]">
          Recall
        </Button>
      </div>
    );
  };

  const clearActionHideTimer = () => {
    if (!actionHideTimer.current) return;
    window.clearTimeout(actionHideTimer.current);
    actionHideTimer.current = null;
  };

  const scheduleMessageActionsHide = () => {
    clearActionHideTimer();
    actionHideTimer.current = window.setTimeout(() => setActiveMessageActions(null), 3600);
  };

  const revealMessageActions = (messageId: string, autoHide = false) => {
    clearActionHideTimer();
    setActiveMessageActions(messageId);
    if (autoHide) scheduleMessageActionsHide();
  };

  const clearLongPressTimer = () => {
    if (!longPressTimer.current) return;
    window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const messageActionTriggerProps = (messageId: string) => ({
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest("button")) return;
      if (!isMobile) revealMessageActions(messageId, true);
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (!isMobile || (event.target as HTMLElement).closest("button")) return;
      clearLongPressTimer();
      longPressTimer.current = window.setTimeout(() => revealMessageActions(messageId, true), 420);
    },
    onPointerUp: clearLongPressTimer,
    onPointerCancel: clearLongPressTimer,
    onPointerLeave: clearLongPressTimer,
  });

  const renderSavannaAnswer = (answer: SavannaRecallAnswer) => {
    const sources = answer.sources.length ? answer.sources : answer.source ? [answer.source] : [];
    return (
      <div key={answer.id} className="flex justify-center">
        <article className="savanna-recall-card w-full max-w-[88%] rounded-2xl border border-[#D9A441]/20 bg-[#D9A441]/10 px-4 py-3 text-sm text-[#3d2d1a] dark:border-[#D9A441]/25 dark:bg-[#D9A441]/15 dark:text-[#F0F2F5]">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#D9A441]">
            <span className="grid size-7 place-items-center rounded-full bg-[#D9A441]/20">@</span>
            Savanna
          </div>
          <p className="mt-2 whitespace-pre-wrap leading-6">{answer.answer}</p>
          {sources.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {sources.slice(0, 4).map((source, index) => (
                <button key={`${source.conversationId}-${source.messageId}-${index}`} type="button" onClick={() => openRecallSource(source)} className="rounded-full bg-[#D9A441]/20 px-2.5 py-1 text-xs font-semibold text-[#A87820] underline-offset-4 hover:underline dark:text-[#D9A441]">
                  {sources.length === 1 ? `View ${source.label}` : source.label}
                </button>
              ))}
            </div>
          ) : null}
        </article>
      </div>
    );
  };

  const renderThreadSearchBar = () => threadSearchOpen ? (
    <div className="savanna-thread-search flex shrink-0 items-center gap-2 border-b border-[#DDE3DC] bg-white/80 px-3 py-2 backdrop-blur-xl dark:border-[#2C3336] dark:bg-[#111B21]/80">
      <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-[#D9A441]/10 px-3 text-sm text-[#5F6861] dark:text-[#AEBAC1]">
        <Search className="size-4 shrink-0" />
        <input value={threadSearchQuery} onChange={event => setThreadSearchQuery(event.target.value)} placeholder="Search this chat" aria-label="Search this chat" className="min-w-0 flex-1 bg-transparent outline-none" />
      </label>
      <span className="hidden min-w-16 text-center text-xs font-semibold text-[#5F6861] dark:text-[#AEBAC1] sm:block">
        {threadSearchQuery.trim() ? `${threadSearchMatches.length ? threadSearchIndex + 1 : 0}/${threadSearchMatches.length}` : ""}
      </span>
      <Button type="button" variant="ghost" size="icon" onClick={() => moveThreadSearch(-1)} disabled={!threadSearchMatches.length} className="size-9 rounded-full" aria-label="Previous search match"><ChevronUp className="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" onClick={() => moveThreadSearch(1)} disabled={!threadSearchMatches.length} className="size-9 rounded-full" aria-label="Next search match"><ChevronDown className="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" onClick={() => { setThreadSearchOpen(false); setThreadSearchQuery(""); }} className="size-9 rounded-full" aria-label="Close chat search"><X className="size-4" /></Button>
    </div>
  ) : null;

  const renderPinnedMessages = () => pinnedMessages.length ? (
    <div className="savanna-pinned-messages flex shrink-0 gap-2 overflow-x-auto border-b border-[#DDE3DC] bg-white/70 px-3 py-2 backdrop-blur-xl dark:border-[#2C3336] dark:bg-[#111B21]/70">
      {pinnedMessages.map(message => (
        <button key={message.id} type="button" onClick={() => openPinnedMessage(message.id)} className="flex min-w-48 max-w-64 shrink-0 items-center gap-2 rounded-2xl bg-[#D9A441]/10 px-3 py-2 text-left text-xs text-[#5F6861] transition-colors hover:bg-[#D9A441]/15 dark:text-[#AEBAC1]">
          <Pin className="size-3.5 shrink-0 text-[#D9A441]" />
          <span className="min-w-0 flex-1 truncate">{messageSnippet(message)}</span>
        </button>
      ))}
    </div>
  ) : null;

  const reactToMessage = (message: FirebaseMessage, reaction: FirebaseMessageReactionKey) => {
    if (!selectedConversationId || !user) return;
    scheduleMessageActionsHide();
    chatMutations.react.mutate(
      {
        conversationId: selectedConversationId,
        messageId: message.id,
        reaction,
        active: Boolean(message.reactions[reaction]?.includes(user.id)),
      },
      { onError: error => toast.error(error.message) },
    );
  };

  const saveMessageMemory = (message: FirebaseMessage) => {
    if (!selectedConversationId || !user) return;
    scheduleMessageActionsHide();
    if (message.savedBy.includes(user.id)) return toast.info("Already saved to memory");
    chatMutations.saveMemory.mutate(
      {
        conversationId: selectedConversationId,
        conversationTitle: selected ? conversationTitle(selected) : "Conversation",
        message,
      },
      {
        onSuccess: () => toast.success("Saved to memory"),
        onError: error => toast.error(error.message),
      },
    );
  };

  const toggleMessagePin = (message: FirebaseMessage) => {
    if (!selectedConversationId || !user) return;
    scheduleMessageActionsHide();
    chatMutations.pin.mutate(
      {
        conversationId: selectedConversationId,
        messageId: message.id,
        active: message.pinnedBy.includes(user.id),
      },
      {
        onSuccess: () => toast.success(message.pinnedBy.includes(user.id) ? "Message unpinned" : "Message pinned"),
        onError: error => toast.error(error.message),
      },
    );
  };

  const stopVoiceRecording = () => {
    mediaRecorder.current?.stop();
  };

  const startVoiceRecording = async () => {
    if (recording) {
      stopVoiceRecording();
      return;
    }
    if (!selectedConversationId || !selected) return toast.info("Open a chat before recording.");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return toast.error("Voice recording is not available in this browser.");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunks.current = [];
      recordingStream.current = stream;
      mediaRecorder.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size > 0) recordedChunks.current.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const voiceFile = new File(recordedChunks.current, `voice-note-${Date.now()}.webm`, { type: mimeType });
        recordedChunks.current = [];
        stream.getTracks().forEach(track => track.stop());
        recordingStream.current = null;
        mediaRecorder.current = null;
        setRecording(false);
        if (voiceFile.size <= 0) return;
        chatMutations.sendAttachment.mutate(
          {
            conversationId: selectedConversationId,
            memberIds: selected.memberIds,
            file: voiceFile,
            replyTo: replyTo ? { messageId: replyTo.id, senderUserId: replyTo.senderUserId, snippet: messageSnippet(replyTo) } : null,
          },
          {
            onSuccess: () => {
              setReplyTo(null);
              toast.success("Voice note sent");
            },
            onError: error => toast.error(error.message),
          },
        );
      };
      recorder.start();
      setRecording(true);
      toast.info("Recording voice note. Tap the mic again to send.");
    } catch (error) {
      setRecording(false);
      recordingStream.current?.getTracks().forEach(track => track.stop());
      recordingStream.current = null;
      toast.error(error instanceof Error ? error.message : "Could not start voice recording.");
    }
  };

  const renderReplyContext = (message: FirebaseMessage) => message.replyTo ? (
    <button
      type="button"
      onClick={() => scrollToMessage(message.replyTo!.messageId)}
      className="mb-2 block w-full rounded-xl border-l-2 border-[#3d2d1a] bg-white/60 px-3 py-2 text-left text-xs leading-5 text-[#3d2d1a] transition-opacity hover:bg-white/75 dark:border-[#F2C14E] dark:bg-white/10 dark:text-[#F0F2F5] dark:hover:bg-white/15"
    >
      <span className="block font-semibold text-[#151A17] dark:text-[#FDFBF5]">Reply</span>
      <span className="line-clamp-2">{message.replyTo.snippet}</span>
    </button>
  ) : null;

  const renderReactionSummary = (message: FirebaseMessage) => {
    const entries = FIREBASE_MESSAGE_REACTIONS
      .map(reaction => ({ ...reaction, userIds: message.reactions[reaction.key] ?? [] }))
      .filter(reaction => reaction.userIds.length);
    if (!entries.length) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entries.map(reaction => {
          const active = Boolean(user && reaction.userIds.includes(user.id));
          return (
            <button
              key={reaction.key}
              type="button"
              onClick={() => reactToMessage(message, reaction.key)}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors",
                active
                  ? "bg-[#D9A441]/20 text-[#D9A441]"
                  : "bg-black/[0.05] text-[#5f6861] dark:bg-white/[0.08] dark:text-[#AEBAC1]",
              )}
              aria-label={`${reaction.label} reaction`}
            >
              <span>{reactionGlyphs[reaction.key]}</span>
              <span>{reaction.userIds.length}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderMessageActions = (message: FirebaseMessage) => (
    activeMessageActions === message.id ? <div className="savanna-message-actions mt-2 flex flex-wrap items-center justify-end gap-1">
      <button type="button" onClick={() => toggleMessagePin(message)} className="inline-flex h-7 items-center gap-1 rounded-full bg-[#D9A441]/10 px-2 text-[11px] font-semibold text-[#A87820] dark:bg-[#D9A441]/15 dark:text-[#D9A441]">
        <Pin className="size-3" />
        {user && message.pinnedBy.includes(user.id) ? "Unpin" : "Pin"}
      </button>
      <button type="button" onClick={() => { setReplyTo(message); scheduleMessageActionsHide(); }} className="inline-flex h-7 items-center gap-1 rounded-full bg-[#D9A441]/10 px-2 text-[11px] font-semibold text-[#A87820] dark:bg-[#D9A441]/15 dark:text-[#D9A441]">
        <Reply className="size-3" />
        Reply
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex h-7 items-center gap-1 rounded-full bg-[#D9A441]/10 px-2 text-[11px] font-semibold text-[#A87820] dark:bg-[#D9A441]/15 dark:text-[#D9A441]">
            <Heart className="size-3" />
            React
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {FIREBASE_MESSAGE_REACTIONS.map(reaction => (
            <DropdownMenuItem key={reaction.key} onSelect={() => reactToMessage(message, reaction.key)} className="gap-2">
              <span className="text-xs font-semibold text-[#D9A441]">{reactionGlyphs[reaction.key]}</span>
              {reaction.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" onClick={() => saveMessageMemory(message)} className="inline-flex h-7 items-center gap-1 rounded-full bg-[#D9A441]/10 px-2 text-[11px] font-semibold text-[#A87820] disabled:opacity-60 dark:bg-[#D9A441]/15 dark:text-[#D9A441]" disabled={Boolean(user && message.savedBy.includes(user.id))}>
        <Bookmark className="size-3" />
        {user && message.savedBy.includes(user.id) ? "Saved" : "Save"}
      </button>
    </div> : null
  );

  /**
   * One composer for every thread - mobile and desktop, direct, group and
   * merchant support. It shows the mic until there is something to send,
   * then swaps in the animated send button.
   */
  const renderComposer = (variant: "mobile" | "desktop") => {
    const isDesktop = variant === "desktop";
    const sending = chatMutations.send.isPending || chatMutations.sendAttachment.isPending;
    const showSend = Boolean(draft.trim() || attachment) || sending;
    const actionSize = isDesktop ? "size-10" : "size-9";

    return (
      <form
        ref={isDesktop ? undefined : mobileComposerRef}
        className={cn(
          "shrink-0 p-3",
          isDesktop ? "savanna-desktop-composer p-4" : "savanna-mobile-composer",
        )}
        onSubmit={handleSend}
      >
        <input ref={attachmentInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,video/mp4" onChange={handleAttachmentChange} />
        {replyTo ? (
          <div className="mb-2 flex items-center gap-2 rounded-2xl border border-[#D9A441]/20 bg-[#D9A441]/10 px-3 py-2 text-xs text-[#5f6861] dark:border-[#D9A441]/25 dark:bg-[#D9A441]/15 dark:text-[#AEBAC1]">
            <Reply className="size-3.5 shrink-0 text-[#D9A441]" />
            <span className="min-w-0 flex-1 truncate">{messageSnippet(replyTo)}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="grid size-6 shrink-0 place-items-center rounded-full text-[#A87820] dark:text-[#D9A441]" aria-label="Cancel reply">
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        {/* `savanna-composer-field` owns the glass surface and the pill radius in
            both themes and at both breakpoints, so web and mobile cannot drift. */}
        <div
          className={cn(
            "savanna-composer-field flex items-center gap-2 p-2",
            isDesktop ? "" : "savanna-mobile-composer-field",
          )}
        >
          <Button type="button" variant="ghost" size="icon" onClick={() => attachmentInput.current?.click()} className={cn("shrink-0 rounded-xl", actionSize)} aria-label="Attach private media">
            <Paperclip className="size-4" />
          </Button>
          <Input value={draft} onChange={event => setDraft(event.target.value)} disabled={Boolean(attachment)} placeholder={attachment ? attachment.name : "Message or @Savanna"} aria-label="Message draft" className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0" />
          {attachment ? <Button type="button" variant="ghost" onClick={() => setAttachment(null)} size="icon" className="size-8 shrink-0 rounded-lg" aria-label="Remove attachment"><X className="size-4" /></Button> : null}
          {showSend ? (
            <Button type="submit" disabled={sending} size="icon" className={cn("savanna-send-button savanna-composer-action savanna-brand-token shrink-0 rounded-full", actionSize)} aria-label="Send message">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <AnimatedSendIcon size={18} pulse={sendPulse} />}
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="icon" onPointerDown={() => micIcon.current?.startAnimation()} onClick={startVoiceRecording} className={cn("savanna-composer-action savanna-brand-token shrink-0 rounded-full", actionSize, recording ? "ring-2 ring-[#22C55E]" : "")} aria-label={recording ? "Stop and send voice note" : "Record a voice message"}>
              {recording ? <StopCircle className="size-[18px]" /> : <MicIcon ref={micIcon} size={18} />}
            </Button>
          )}
        </div>
      </form>
    );
  };

  // Shared body of the create-chat form so the mobile Drawer and the centered
  // desktop Dialog render identical fields.
  const newChatFields = (
    <>
      <div className="savanna-new-chat-tabs flex rounded-xl bg-[#f5e4bf] p-1">
        <button type="button" data-active={creationMode === "direct"} onClick={() => setCreationMode("direct")} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${creationMode === "direct" ? "bg-white text-[#7b4a0d] shadow-sm" : "text-[#7b4a0d]"}`}>Chat</button>
        <button type="button" data-active={creationMode === "group"} onClick={() => setCreationMode("group")} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${creationMode === "group" ? "bg-white text-[#7b4a0d] shadow-sm" : "text-[#7b4a0d]"}`}>Group</button>
        <button type="button" data-active={creationMode === "community"} onClick={() => setCreationMode("community")} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${creationMode === "community" ? "bg-white text-[#7b4a0d] shadow-sm" : "text-[#7b4a0d]"}`}>Community</button>
      </div>
      {creationMode === "community" ? (
        <>
          <Input value={communityForm.name} onChange={event => setCommunityForm(current => ({ ...current, name: event.target.value }))} placeholder="Community name" className="savanna-new-chat-input bg-white dark:bg-[#2a2119]" />
          <Input value={communityForm.city} onChange={event => setCommunityForm(current => ({ ...current, city: event.target.value }))} placeholder="City or area" className="savanna-new-chat-input bg-white dark:bg-[#2a2119]" />
          <textarea
            value={communityForm.description}
            onChange={event => setCommunityForm(current => ({ ...current, description: event.target.value }))}
            placeholder="What is this community for?"
            className="savanna-new-chat-input min-h-20 w-full resize-none rounded-xl border border-[#ead2a4] bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441]/35 dark:bg-[#2a2119]"
          />
          <CommunityVisibilitySelect value={communityForm.visibility} onChange={visibility => setCommunityForm(current => ({ ...current, visibility }))} />
        </>
      ) : (
        <>
          {creationMode === "group" ? <Input value={groupTitle} onChange={event => setGroupTitle(event.target.value)} placeholder="Group name" className="savanna-new-chat-input bg-white dark:bg-[#2a2119]" /> : null}
          {renderInviteePicker()}
        </>
      )}
    </>
  );

  const createButton = (isPending: boolean) => (
    <Button type="submit" disabled={chatMutations.create.isPending || communityMutations.create.isPending} className="savanna-brand-token rounded-xl">
      {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <AnimatedPlusIcon className="mr-2 size-4" />}
      {creationMode === "community" ? "Create community" : "Create chat"}
    </Button>
  );

  // On web the create modal floats centered as a dialog; on mobile it stays a
  // bottom drawer within thumb reach.
  const newChatDrawer = isMobile ? (
    <Drawer open={newChatOpen} onOpenChange={setNewChatOpen}>
      <DrawerContent className="savanna-new-chat-drawer rounded-t-[28px] border-[#ead2a4] bg-[#fffaf0] dark:border-[#5b4833] dark:bg-[#21180f]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl text-[#3d2d1a] dark:text-[#fff8ed]">Create</DrawerTitle>
          <DrawerDescription>Start a private chat, group conversation, or community.</DrawerDescription>
        </DrawerHeader>
        <form className="space-y-3 px-4" onSubmit={handleCreate}>
          {newChatFields}
          <DrawerFooter className="px-0">{createButton(chatMutations.create.isPending || communityMutations.create.isPending)}</DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
      <DialogContent className="savanna-new-chat-dialog max-w-md gap-0 rounded-[28px] border-[#ead2a4] bg-[#fffaf0] p-6 dark:border-[#5b4833] dark:bg-[#21180f]">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-2xl text-[#3d2d1a] dark:text-[#fff8ed]">Create</DialogTitle>
          <DialogDescription>Start a private chat, group conversation, or community.</DialogDescription>
        </DialogHeader>
        <form className="mt-4 space-y-3" onSubmit={handleCreate}>
          {newChatFields}
          <DialogFooter className="mt-4">{createButton(chatMutations.create.isPending || communityMutations.create.isPending)}</DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  const storyComposerDrawer = (
    <Drawer open={storyComposerOpen} onOpenChange={setStoryComposerOpen}>
      <DrawerContent className="savanna-new-chat-drawer rounded-t-[28px] border-[#ead2a4] bg-[#fffaf0] dark:border-[#5b4833] dark:bg-[#21180f]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl text-[#3d2d1a] dark:text-[#fff8ed]">Your Story</DrawerTitle>
          <DrawerDescription>Share a short private Story.</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">
          <StoryComposer compact onDone={() => { setStoryComposerOpen(false); }} />
        </div>
      </DrawerContent>
    </Drawer>
  );

  const renderChatRow = (conversation: ConversationListItem, index: number) => {
    const active = selectedConversationId === conversation.id;
    const presence = getConversationPresence(conversation, index);
    const previewStatus = conversation.previewStatus;
    const showPreviewDelivery = Boolean(
      conversation.previewMessage
      && user?.id
      && conversation.lastMessageSenderId === user.id,
    );
    const openConversation = () => {
      if (isPreviewConversationId(conversation.id)) {
        if (import.meta.env.DEV) {
          setSelectedConversationId(conversation.id);
          if (isMobile) setMobileDetail(true);
          return;
        }
        return toast.info("Development preview chat - no real conversation opened");
      }
      setSelectedConversationId(conversation.id);
      if (isMobile) setMobileDetail(true);
    };
    const openProfile = peerProfileOpener(conversation);
    return (
      // A div with role="button" rather than a <button>: the avatar inside is
      // its own button, and nesting interactive content is invalid HTML.
      <div
        key={conversation.id}
        data-active={active}
        role="button"
        tabIndex={0}
        onClick={openConversation}
        onKeyDown={event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openConversation();
        }}
        className="savanna-chat-row flex w-full cursor-pointer items-center gap-3 rounded-2xl p-3 text-left transition-colors"
      >
        {openProfile ? (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              openProfile();
            }}
            aria-label={`Open ${conversationTitle(conversation)}'s profile`}
            className="savanna-brand-token grid size-12 shrink-0 place-items-center rounded-full text-sm font-semibold transition-opacity active:opacity-70"
          >
            {conversation.kind === "group" ? <Users className="size-5" /> : "S"}
          </button>
        ) : (
          <span className="savanna-brand-token grid size-12 shrink-0 place-items-center rounded-full text-sm font-semibold">
            {conversation.kind === "group" ? <Users className="size-5" /> : "S"}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[#3d2d1a] dark:text-[#fff8ed]">{conversationTitle(conversation)}</span>
            <span className="ml-auto shrink-0 text-[11px] text-[#5f6861] dark:text-[#9AA1A6]">{conversation.mutedUntil ? "Muted" : presence.headline}</span>
          </span>
          <span className="mt-1 flex items-center gap-1 truncate text-xs text-[#5f6861] dark:text-[#9AA1A6]">
            {conversation.previewMessage ? (
              <>
                {showPreviewDelivery ? (
                  previewStatus === "failed" ? <X className="size-3 shrink-0 text-[#FF5B6B]" aria-label="Failed" /> : <DeliveryIcon status={previewStatus ?? "sent"} />
                ) : null}
                {conversation.previewMessage}
              </>
            ) : conversation.kind === "merchant_support" ? "Merchant support" : "Tap to open your conversation"}
          </span>
        </span>
      </div>
    );
  };

  if (loading) {
    return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></div></SavannaShell>;
  }

  if (!isAuthenticated) {
    return (
      <SavannaShell>
        <section className="grid min-h-[62vh] place-items-center rounded-[30px] border border-[#DDE3DC] bg-white p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]"><MessageCircle className="size-6" /></span>
            <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-[#5F6861]">Private conversations</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.06em] text-[#151A17]">A more considered place to talk.</h1>
            <p className="mt-4 text-[15px] leading-7 text-[#5F6861]">Sign in to begin a direct conversation or keep up with the groups that matter to you.</p>
            <Button className="savanna-brand-token mt-7 rounded-xl px-5 shadow-none" onClick={() => startLogin()}><MessageCircle className="mr-2 size-4" />Sign in to messages</Button>
          </div>
        </section>
      </SavannaShell>
    );
  }

  if (isMobile && mobileDetail && selected) {
    const presence = selectedPresence ?? getConversationPresence(selected);
    return (
      <SavannaShell hideChrome>
        <div className="savanna-mobile-conversation flex h-[100dvh] flex-col overflow-hidden bg-[#faf7f0] dark:bg-[#17120d]">
          <ConversationHeader
            title={conversationTitle(selected)}
            avatar={conversationAvatar(selected)}
            presenceLabel={presence.headline}
            onBack={closeMobileDetail}
            onAvatarClick={peerProfileOpener(selected)}
            onVideoCall={startVideoCall}
            onVoiceCall={startVoiceCall}
            menuItems={conversationMenu}
          />
          {renderThreadSearchBar()}
          {renderPinnedMessages()}
          <div ref={mobileThreadRef} className="savanna-mobile-message-thread flex-1 space-y-3 overflow-y-auto p-4">
            {messages.isLoading ? <Loader2 className="mx-auto mt-10 size-5 animate-spin text-[#9a6410]" /> : (messages.data?.length || selectedSavannaAnswers.length) ? (
              <>
                {messages.data?.map(message => (
                  <div key={message.id} ref={registerMessageElement(message.id)} className={`flex ${isSameUser(message.senderUserId, user?.id) ? "justify-end" : "justify-start"}`}>
                    <article {...messageActionTriggerProps(message.id)} className={`savanna-message-bubble max-w-[82%] rounded-2xl px-3 py-2.5 text-sm shadow-sm ${activeThreadSearchMessageId === message.id ? "ring-2 ring-[#D9A441]" : ""} ${isSameUser(message.senderUserId, user?.id) ? "savanna-outgoing-message rounded-tr-none bg-[#D9A441] text-[#3d2d1a] dark:text-[#F0F2F5]" : "savanna-incoming-message rounded-tl-none bg-white text-[#3d2d1a] dark:text-[#fff8ed]"}`}>
                      {renderReplyContext(message)}
                      {message.payload ? <p className="whitespace-pre-wrap">{message.payload}</p> : null}
                      {message.attachments.map(item => <PrivateAttachment key={item.id} url={item.url} fileName={item.fileName} mimeType={item.mimeType} />)}
                      <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isSameUser(message.senderUserId, user?.id) ? "text-[#3d2d1a] dark:text-[#FDFBF5]" : "text-[#5f6861]"}`}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{isSameUser(message.senderUserId, user?.id) ? <DeliveryIcon status={message.status} className="text-white/90" /> : null}</p>
                      {renderReactionSummary(message)}
                      {renderMessageActions(message)}
                    </article>
                  </div>
                ))}
                {selectedSavannaAnswers.map(renderSavannaAnswer)}
              </>
            ) : <div className="grid h-full place-items-center text-center"><div><MessageCircle className="mx-auto size-8 text-[#d2a34f]" /><p className="mt-3 text-sm font-semibold text-[#5b4934] dark:text-[#f2e7d5]">No messages yet</p></div></div>}
          </div>
          {renderComposer("mobile")}
        </div>
      </SavannaShell>
    );
  }

  if (isMobile) {
    return (
      <SavannaShell>
        <div className="savanna-mobile-messages-canvas -mx-4 min-h-[calc(100vh-190px)] bg-white px-4 pb-8 pt-2 dark:bg-[#0A1014]">
          <label className="savanna-mobile-chat-search mx-2 mt-2 flex h-11 items-center gap-2 rounded-2xl px-4 text-sm dark:text-[#9AA1A6]">
            <AnimatedSearchIcon size={16} />
            <input value={conversationSearch} onChange={event => setConversationSearch(event.target.value)} placeholder="Search chats or people" aria-label="Search chats or people" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#a5947e] dark:bg-[#23282C]" />
          </label>
          {renderUsernameResults("mobile")}
          {renderDueFollowUpsPrompt("mobile")}
          <div className="story-rail mt-4 flex gap-2 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Chat filters">
            {filterTabs.map(([value, label]) => <button key={value} role="tab" aria-selected={chatFilter === value} onClick={() => setChatFilter(value)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${chatFilter === value ? "bg-[#e3a43c] text-[#3a260e] dark:bg-[#23282C] dark:text-[#D9A441]" : "bg-[#f4f0e8] text-[#715d43] dark:bg-[#2b2118] dark:text-[#dac7a9]"}`}>{label}</button>)}
            {customTabs.map(tab => <button key={tab} role="tab" aria-selected={chatFilter === tab} onClick={() => setChatFilter(tab)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${chatFilter === tab ? "bg-[#e3a43c] text-[#3a260e] dark:bg-[#23282C] dark:text-[#D9A441]" : "bg-[#f4f0e8] text-[#715d43] dark:bg-[#2b2118] dark:text-[#dac7a9]"}`}>{tab}</button>)}
            <button onClick={addCustomTab} className="savanna-brand-token grid size-8 shrink-0 place-items-center rounded-full" aria-label="Create a chat tab"><AnimatedPlusIcon size={16} /></button>
          </div>
          <div className="savanna-mobile-chat-rows mt-3 divide-y-0 px-2">
            {conversations.isLoading ? <div className="grid min-h-48 place-items-center"><Loader2 className="size-5 animate-spin text-[#9a6410]" /></div> : filteredChatList.length ? filteredChatList.map(renderChatRow) : <div className="grid min-h-56 place-items-center"><MessageCircle className="size-8 text-[#d2a34f]" /></div>}
          </div>
          <Button onClick={() => setNewChatOpen(true)} size="icon" className="savanna-brand-token fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 size-12 rounded-full shadow-none" aria-label="Start a new chat"><AnimatedPlusIcon size={20} /></Button>
          {newChatDrawer}
        </div>
      </SavannaShell>
    );
  }

  return (
    <SavannaShell>
      <div className="savanna-desktop-messages grid min-h-screen lg:grid-cols-[470px_minmax(0,1fr)]">
        <aside className="savanna-desktop-chat-list flex min-h-0 flex-col border-r p-4">
          <header className="flex items-center justify-between gap-3">
            <span className="savanna-wordmark text-[28px]">Savanna</span>
            <Button onClick={() => setNewChatOpen(true)} size="icon" className="savanna-brand-token size-10 rounded-2xl shadow-none" aria-label="Start a new chat"><AnimatedPlusIcon size={19} /></Button>
          </header>
          <label className="savanna-desktop-chat-search mt-5 flex h-11 items-center gap-2 rounded-2xl px-3 text-sm">
            <AnimatedSearchIcon size={17} />
            <input value={conversationSearch} onChange={event => setConversationSearch(event.target.value)} placeholder="Search chats or people" aria-label="Search conversations" className="min-w-0 flex-1 bg-transparent outline-none" />
          </label>
          {renderUsernameResults("desktop")}
          {renderDueFollowUpsPrompt("desktop")}
          <DesktopStoryRail items={desktopStoryItems} onCreateStory={() => setStoryComposerOpen(true)} />
          <div className="savanna-desktop-message-tabs flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Desktop chat filters">
            {filterTabs.map(([value, label]) => <button key={value} role="tab" aria-selected={chatFilter === value} onClick={() => setChatFilter(value)} data-active={chatFilter === value} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold">{label}</button>)}
            {customTabs.map(tab => <button key={tab} role="tab" aria-selected={chatFilter === tab} onClick={() => setChatFilter(tab)} data-active={chatFilter === tab} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold">{tab}</button>)}
            <button type="button" onClick={addCustomTab} className="savanna-brand-token grid size-8 shrink-0 place-items-center rounded-full" aria-label="Create a chat tab"><AnimatedPlusIcon size={15} /></button>
          </div>
          <div className="savanna-desktop-chat-rows mt-3 flex-1 overflow-y-auto">
            {conversations.isLoading ? <div className="grid min-h-48 place-items-center"><Loader2 className="size-5 animate-spin text-[#A87820]" /></div> : filteredChatList.length ? filteredChatList.map(renderChatRow) : <div className="grid min-h-48 place-items-center"><MessageCircle className="size-7 text-[#9AA1A6]" /></div>}
          </div>
        </aside>
        <section className="savanna-desktop-conversation-panel flex min-h-0 flex-col">
          {selected ? (
            <>
              <ConversationHeader
                className="gap-3 px-6 py-4"
                title={conversationTitle(selected)}
                avatar={conversationAvatar(selected)}
                presenceLabel={selectedPresence ? `${selectedPresence.headline} · ${selectedPresence.subline}` : "Conversation members only"}
                onAvatarClick={peerProfileOpener(selected)}
                onVideoCall={startVideoCall}
                onVoiceCall={startVoiceCall}
                menuItems={conversationMenu}
                trailing={<SafetyActions targetDomain="message" targetId={`conversation-${selected.id}`} targetLabel="this conversation" />}
              />
              {renderThreadSearchBar()}
              {renderPinnedMessages()}
              <div className="savanna-desktop-message-thread flex-1 space-y-3 overflow-y-auto p-6">
                {messages.isLoading ? <Loader2 className="size-5 animate-spin text-[#A87820]" /> : (messages.data?.length || selectedSavannaAnswers.length) ? (
                  <>
                    {messages.data?.map(message => (
                      <article key={message.id} ref={registerMessageElement(message.id)} className={`group flex ${isSameUser(message.senderUserId, user?.id) ? "justify-end" : "justify-start"}`}>
                        <div {...messageActionTriggerProps(message.id)} className={`savanna-message-bubble savanna-desktop-message-bubble max-w-[58%] cursor-pointer rounded-2xl px-3 py-2 text-sm shadow-sm ${activeThreadSearchMessageId === message.id ? "ring-2 ring-[#D9A441]" : ""} ${isSameUser(message.senderUserId, user?.id) ? "savanna-outgoing-message rounded-tr-none bg-[#D9A441] text-[#3d2d1a] dark:text-[#F0F2F5]" : "savanna-incoming-message rounded-tl-none"}`}>
                          {renderReplyContext(message)}
                          {message.payload ? <p className="whitespace-pre-wrap text-sm leading-5">{message.payload}</p> : null}
                          {message.attachments.map(item => <PrivateAttachment key={item.id} url={item.url} fileName={item.fileName} mimeType={item.mimeType} />)}
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80"><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{isSameUser(message.senderUserId, user?.id) ? <DeliveryIcon status={message.status} className="text-white/90" /> : null}</div>
                          {renderReactionSummary(message)}
                          {renderMessageActions(message)}
                        </div>
                      </article>
                    ))}
                    {selectedSavannaAnswers.map(renderSavannaAnswer)}
                  </>
                ) : <div className="grid h-full min-h-72 place-items-center text-center"><div><MessageCircle className="mx-auto size-8 text-[#9AA1A6]" /><p className="mt-4 font-display text-2xl font-semibold">No messages yet</p><p className="mt-2 text-sm">Start the conversation when you are ready.</p></div></div>}
              </div>
              {renderComposer("desktop")}
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <MessageCircle className="mx-auto size-9 text-[#9AA1A6]" />
                <p className="mt-4 font-display text-2xl font-semibold">Choose a conversation</p>
                <p className="mt-2 max-w-sm text-sm leading-6">Select an existing conversation from the list, or create a new private chat.</p>
              </div>
            </div>
          )}
        </section>
        {newChatDrawer}
        {storyComposerDrawer}
      </div>
    </SavannaShell>
  );
}
