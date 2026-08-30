import { useAuth } from "@/_core/hooks/useAuth";
import { AnimatedCheckCheckIcon, AnimatedCheckIcon, AnimatedPlusIcon, AnimatedSearchIcon, AnimatedSendIcon, MobileNavIcon } from "@/components/AnimatedNavIcons";
import { MicIcon, type ChatIconHandle } from "@/components/AnimatedChatIcons";
import { CommunityVisibilitySelect } from "@/components/CommunityVisibilitySelect";
import { ConversationHeader } from "@/components/ConversationHeader";
import { SafetyActions } from "@/components/SafetyActions";
import { SavannaShell } from "@/components/SavannaShell";
import { StoryComposer } from "@/components/StoriesPanel";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/useMobile";
import { startLogin } from "@/const";
import {
  getConversationPeerId,
  useFirebaseChatMutations,
  useFirebaseConversations,
  useFirebaseMessages,
  type FirebaseConversationKind,
  type FirebaseConversationListItem,
  type FirebaseMessageStatus,
} from "@/lib/firebaseChat";
import { useFirebaseCommunityMutations, type FirebaseCommunityVisibility } from "@/lib/firebaseCommunities";
import { useFirebaseStories } from "@/lib/firebaseStories";
import { answerConversationRecall, parseSavannaInvocation, type SavannaRecallAnswer } from "@/lib/savannaRecall";
import { isSameUser, normalizeUsername, searchUserProfilesByUsername, type AppUser } from "@/lib/userProfile";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, MessageCircle, Paperclip, Users, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/mpeg", "video/mp4"];

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
  return <a href={url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-xl bg-[#D9A441]/10 px-3 py-2 text-xs font-medium text-[#9a6410] hover:bg-[#D9A441]/20"><FileText className="size-4" /><span className="max-w-44 truncate">{fileName}</span><span className="text-[#5f6861]">{mimeType.split("/")[1]?.toUpperCase()}</span></a>;
}

function DeliveryIcon({ status }: { status: FirebaseMessageStatus }) {
  if (status === "read") return <AnimatedCheckCheckIcon className="text-[#22C55E]" size={13} aria-label="Read" />;
  if (status === "delivered") return <AnimatedCheckCheckIcon className="text-[#AEBAC1]" size={13} aria-label="Delivered" />;
  if (status === "failed") return <X className="size-3 text-[#FF5B6B]" aria-label="Failed" />;
  return <AnimatedCheckIcon className="text-[#AEBAC1]" size={13} aria-label="Sent" />;
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
  const isMobile = useIsMobile();
  const desktopStories = useFirebaseStories(user, !isMobile);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const isPreviewConversation = Boolean(selectedConversationId && isPreviewConversationId(selectedConversationId));
  const messageQuery = useFirebaseMessages(selectedConversationId, user, isAuthenticated && selectedConversationId !== null && !isPreviewConversation);
  const chatMutations = useFirebaseChatMutations(user);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [memberIds, setMemberIds] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [locallyCreatedConversations, setLocallyCreatedConversations] = useState<ConversationListItem[]>([]);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [sendPulse, setSendPulse] = useState(0);
  const chatPreviewMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("chatPreview") : null;
  const messages = isPreviewConversation ? { ...messageQuery, data: desktopPreviewMessages, isLoading: false } : messageQuery;
  const [chatFilter, setChatFilter] = useState<string>("all");
  const [mobileDetail, setMobileDetail] = useState(chatPreviewMode === "detail");
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
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const normalizedUsernameSearch = normalizeUsername(conversationSearch);
  const isUsernameSearch = conversationSearch.trim().startsWith("@") && normalizedUsernameSearch.length >= 2;
  const usernameResults = useQuery({
    queryKey: ["firebase", "username-search", normalizedUsernameSearch, user?.id ?? "guest"],
    queryFn: () => searchUserProfilesByUsername(conversationSearch, user),
    enabled: Boolean(user && isUsernameSearch),
  });
  const communityMutations = useFirebaseCommunityMutations(user);

  useEffect(() => {
    if (!selectedConversationId || !conversations.data?.length) return;
    if (!conversations.data.some(conversation => conversation.id === selectedConversationId)) setSelectedConversationId(null);
  }, [conversations.data, selectedConversationId]);
  useEffect(() => {
    if (import.meta.env.DEV && !isMobile && chatPreviewMode === "desktop" && previewConversations[0]) setSelectedConversationId(previewConversations[0].id);
  }, [chatPreviewMode, isMobile]);
  useEffect(() => {
    if (import.meta.env.DEV && isMobile && chatPreviewMode === "detail" && previewConversations[0]) setSelectedConversationId(previewConversations[0].id);
  }, [chatPreviewMode, isMobile]);
  useEffect(() => {
    const pendingConversationId = sessionStorage.getItem("savanna-open-conversation");
    if (!pendingConversationId) return;
    const pendingMeta = sessionStorage.getItem("savanna-open-conversation-meta");
    if (pendingMeta && !user) return;
    sessionStorage.removeItem("savanna-open-conversation");
    sessionStorage.removeItem("savanna-open-conversation-meta");
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
  useEffect(() => { localStorage.setItem("savanna-message-tabs", JSON.stringify(customTabs)); }, [customTabs]);
  useEffect(() => { localStorage.setItem("savanna-message-tab-membership", JSON.stringify(tabMembership)); }, [tabMembership]);

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
    const parsedMembers = memberIds.split(",").map(value => value.trim()).filter(Boolean);
    if (!parsedMembers.length) return toast.error("Enter at least one valid Savanna user ID");
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
          setMemberIds("");
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
        { conversationId: selectedConversationId, memberIds: selected?.memberIds ?? [], file: attachment },
        {
          onSuccess: () => {
            setAttachment(null);
            toast.success("Private attachment sent");
          },
          onError: error => toast.error(error.message),
        },
      );
      return;
    }
    if (draft.trim()) {
      chatMutations.send.mutate(
        { conversationId: selectedConversationId, memberIds: selected?.memberIds ?? [], body: draft.trim() },
        {
          onSuccess: () => setDraft(""),
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

  const conversationMenu = selected ? (
    <>
      {customTabs.length ? (
        <DropdownMenuItem onSelect={() => window.setTimeout(saveSelectedToTab, 0)}>Save chat to a tab</DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={() => toast.info("Notification controls arrive with the next release.")}>Mute notifications</DropdownMenuItem>
    </>
  ) : null;

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

  const startVoiceRecording = () => toast.info("Voice messages arrive with the next release.");

  const scrollToMessage = (messageId: string) => {
    messageRefs.current[messageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const renderSavannaAnswer = (answer: SavannaRecallAnswer) => (
    <div key={answer.id} className="flex justify-center">
      <article className="savanna-recall-card w-full max-w-[88%] rounded-2xl border border-[#D9A441]/20 bg-[#D9A441]/10 px-4 py-3 text-sm text-[#3d2d1a] dark:border-[#D9A441]/25 dark:bg-[#D9A441]/15 dark:text-[#F0F2F5]">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#D9A441]">
          <span className="grid size-7 place-items-center rounded-full bg-[#D9A441]/20">@</span>
          Savanna
        </div>
        <p className="mt-2 whitespace-pre-wrap leading-6">{answer.answer}</p>
        {answer.source ? (
          <button type="button" onClick={() => scrollToMessage(answer.source!.messageId)} className="mt-3 text-xs font-semibold text-[#A87820] underline-offset-4 hover:underline dark:text-[#D9A441]">
            View source message
          </button>
        ) : null}
      </article>
    </div>
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
        className={cn(
          "shrink-0 border-t p-3",
          isDesktop
            ? "savanna-desktop-composer p-4"
            : "savanna-mobile-composer border-[#eadfca] bg-white dark:border-[#3b2d20] dark:bg-[#21180f]",
        )}
        onSubmit={handleSend}
      >
        <input ref={attachmentInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,video/mp4" onChange={handleAttachmentChange} />
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
            <Button type="button" variant="ghost" size="icon" onPointerDown={() => micIcon.current?.startAnimation()} onClick={startVoiceRecording} className={cn("savanna-composer-action savanna-brand-token shrink-0 rounded-full", actionSize)} aria-label="Record a voice message">
              <MicIcon ref={micIcon} size={18} />
            </Button>
          )}
        </div>
      </form>
    );
  };

  const newChatDrawer = (
    <Drawer open={newChatOpen} onOpenChange={setNewChatOpen}>
      <DrawerContent className="savanna-new-chat-drawer rounded-t-[28px] border-[#ead2a4] bg-[#fffaf0] dark:border-[#5b4833] dark:bg-[#21180f]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl text-[#3d2d1a] dark:text-[#fff8ed]">Create</DrawerTitle>
          <DrawerDescription>Start a private chat, group conversation, or community.</DrawerDescription>
        </DrawerHeader>
        <form className="space-y-3 px-4" onSubmit={handleCreate}>
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
              <Input value={memberIds} onChange={event => setMemberIds(event.target.value)} placeholder={creationMode === "group" ? "User IDs, comma-separated" : "Savanna user ID"} aria-label="Savanna user ID" className="savanna-new-chat-input bg-white dark:bg-[#2a2119]" />
            </>
          )}
          <DrawerFooter className="px-0">
            <Button type="submit" disabled={chatMutations.create.isPending || communityMutations.create.isPending} className="savanna-brand-token rounded-xl">
              {chatMutations.create.isPending || communityMutations.create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <AnimatedPlusIcon className="mr-2 size-4" />}
              {creationMode === "community" ? "Create community" : "Create chat"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
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
                {previewStatus === "failed" ? <X className="size-3 shrink-0 text-[#FF5B6B]" aria-label="Failed" /> : <DeliveryIcon status={previewStatus ?? "sent"} />}
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
          <div className="savanna-mobile-message-thread flex-1 space-y-3 overflow-y-auto p-4">
            {messages.isLoading ? <Loader2 className="mx-auto mt-10 size-5 animate-spin text-[#9a6410]" /> : (messages.data?.length || selectedSavannaAnswers.length) ? (
              <>
                {messages.data?.map(message => (
                  <div key={message.id} ref={element => { messageRefs.current[message.id] = element; }} className={`flex ${isSameUser(message.senderUserId, user?.id) ? "justify-end" : "justify-start"}`}>
                    <article className={`max-w-[82%] rounded-2xl px-3 py-2.5 text-sm shadow-sm ${isSameUser(message.senderUserId, user?.id) ? "rounded-tr-none bg-[#D9A441]/20 text-[#3d2d1a] dark:text-[#F0F2F5]" : "savanna-incoming-message rounded-tl-none bg-white text-[#3d2d1a] dark:text-[#fff8ed]"}`}>
                      <p className="whitespace-pre-wrap">{message.contentType === "attachment" ? "Private attachment" : message.payload}</p>
                      <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isSameUser(message.senderUserId, user?.id) ? "text-[#8a765d] dark:text-[#f8edcf]" : "text-[#5f6861]"}`}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{isSameUser(message.senderUserId, user?.id) ? <DeliveryIcon status={message.status} /> : null}</p>
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
              <div className="savanna-desktop-message-thread flex-1 space-y-3 overflow-y-auto p-6">
                {messages.isLoading ? <Loader2 className="size-5 animate-spin text-[#A87820]" /> : (messages.data?.length || selectedSavannaAnswers.length) ? (
                  <>
                    {messages.data?.map(message => (
                      <article key={message.id} ref={element => { messageRefs.current[message.id] = element; }} className={`group flex ${isSameUser(message.senderUserId, user?.id) ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${isSameUser(message.senderUserId, user?.id) ? "rounded-tr-none bg-[#D9A441]/20 text-[#3d2d1a] dark:text-[#F0F2F5]" : "savanna-incoming-message rounded-tl-none"}`}>
                          <p className="whitespace-pre-wrap text-sm leading-6">{message.contentType === "attachment" ? "Private attachment" : message.payload}</p>
                          {message.attachments.map(item => <PrivateAttachment key={item.id} url={item.url} fileName={item.fileName} mimeType={item.mimeType} />)}
                          <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] opacity-80"><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{isSameUser(message.senderUserId, user?.id) ? <DeliveryIcon status={message.status} /> : null}</div>
                          <div className="mt-1 opacity-0 transition-opacity group-hover:opacity-100"><SafetyActions targetDomain="message" targetId={String(message.id)} targetLabel="this message" blockUserId={message.senderUserId} /></div>
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
