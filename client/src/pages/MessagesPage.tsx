import { useAuth } from "@/_core/hooks/useAuth";
import { AnimatedCheckCheckIcon, AnimatedPlusIcon, AnimatedSearchIcon, AnimatedSendIcon } from "@/components/AnimatedNavIcons";
import { SafetyActions } from "@/components/SafetyActions";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { ArrowLeft, BookmarkPlus, Check, FileText, Loader2, MessageCircle, Paperclip, Plus, Send, ShieldCheck, Users, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/mpeg", "video/mp4"];

const previewConversations = [
  { id: -201, kind: "direct" as const, title: "Ayo Mensah", mutedUntil: null, previewMessage: "Fresh produce is in today.", previewStatus: "delivered" as const },
  { id: -202, kind: "direct" as const, title: "Esi Adom", mutedUntil: null, previewMessage: "A small thought for the day.", previewStatus: "read" as const },
  { id: -203, kind: "group" as const, title: "Zawadi Study Circle", mutedUntil: null, previewMessage: "New lesson is now available.", previewStatus: "sent" as const },
  { id: -204, kind: "merchant_support" as const, title: "Amina’s Kitchen", mutedUntil: null, previewMessage: "Weekend plans, simply shared.", previewStatus: "failed" as const },
] as const;

const desktopPreviewMessages = [
  { id: -1201, senderUserId: -801, contentType: "text", payload: "Fresh produce is in today. I can set aside a basket for you.", attachments: [], createdAt: new Date("2026-08-27T09:25:00.000Z"), status: "delivered" as const },
  { id: -1202, senderUserId: -801, contentType: "text", payload: "This conversation is a development preview. Nothing here is saved or sent.", attachments: [], createdAt: new Date("2026-08-27T09:27:00.000Z"), status: "read" as const },
];

function PrivateAttachment({ attachmentId, fileName, mimeType }: { attachmentId: number; fileName: string; mimeType: string }) {
  const attachment = trpc.chat.attachmentUrl.useQuery({ attachmentId });
  if (attachment.isLoading) return <span className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#edf2e9] px-3 py-2 text-xs text-[#587157]"><Loader2 className="size-3 animate-spin" /> Preparing attachment</span>;
  if (!attachment.data) return <span className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#fff2e9] px-3 py-2 text-xs text-[#8a5b39]">Attachment unavailable</span>;
  return <a href={attachment.data.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-xl bg-[#edf2e9] px-3 py-2 text-xs font-medium text-[#31583a] hover:bg-[#e2eadc]"><FileText className="size-4" /><span className="max-w-44 truncate">{fileName}</span><span className="text-[#71806d]">{mimeType.split("/")[1]?.toUpperCase()}</span></a>;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("The attachment could not be read"));
    reader.readAsDataURL(file);
  });
}

function DeliveryIcon({ status }: { status: "sending" | "sent" | "delivered" | "read" | "failed" | "deleted" }) {
  if (status === "delivered" || status === "read") return <AnimatedCheckCheckIcon size={13} aria-label="Delivered" />;
  if (status === "failed") return <X className="size-3 text-[#FF5B6B]" aria-label="Failed" />;
  return <Check className="size-3 text-[#AEBAC1]" aria-label="Sent" />;
}

function DesktopStoryRail({ items }: { items: Array<{ id: number; label: string }> }) {
  return <div className="savanna-desktop-story-rail" aria-label="Stories"><div className="flex gap-3 overflow-x-auto pb-1">{items.map(item => <div key={item.id} className="flex w-11 shrink-0 flex-col items-center gap-1"><span aria-label={`${item.label}'s Story`} className="grid size-11 place-items-center rounded-full border-2 border-[#D9A441] bg-[#A87820] text-xs font-semibold text-white">{item.label.slice(0, 1).toUpperCase()}</span><span className="max-w-11 truncate text-center text-[10px] text-[#9a8467]">{item.label.split(" ")[0]}</span></div>)}</div></div>;
}

export default function MessagesPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const conversations = trpc.chat.list.useQuery(undefined, { enabled: isAuthenticated });
  const desktopStories = trpc.stories.list.useQuery(undefined, { enabled: isAuthenticated });
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const messageQuery = trpc.chat.messages.useQuery({ conversationId: selectedConversationId ?? 0 }, { enabled: isAuthenticated && selectedConversationId !== null && selectedConversationId > 0 });
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [creationMode, setCreationMode] = useState<"direct" | "group">("direct");
  const [memberIds, setMemberIds] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const isMobile = useIsMobile();
  const isPreviewConversation = import.meta.env.DEV && (selectedConversationId ?? 0) < 0;
  const messages = isPreviewConversation ? { ...messageQuery, data: desktopPreviewMessages, isLoading: false } : messageQuery;
  const chatPreviewMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("chatPreview") : null;
  const [chatFilter, setChatFilter] = useState<string>("all");
  const [mobileDetail, setMobileDetail] = useState(chatPreviewMode === "detail");
  const [newChatOpen, setNewChatOpen] = useState(chatPreviewMode === "drawer");
  const [customTabs, setCustomTabs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("savanna-message-tabs") ?? "[]"); } catch { return []; }
  });
  const [tabMembership, setTabMembership] = useState<Record<string, number[]>>(() => {
    try { return JSON.parse(localStorage.getItem("savanna-message-tab-membership") ?? "{}"); } catch { return {}; }
  });
  const attachmentInput = useRef<HTMLInputElement>(null);
  const create = trpc.chat.create.useMutation({ onSuccess: result => { setSelectedConversationId(result.id); setMemberIds(""); setGroupTitle(""); setNewChatOpen(false); utils.chat.list.invalidate(); toast.success("Conversation created"); }, onError: error => toast.error(error.message) });
  const send = trpc.chat.send.useMutation({ onSuccess: () => { setDraft(""); utils.chat.messages.invalidate({ conversationId: selectedConversationId ?? 0 }); utils.chat.list.invalidate(); }, onError: error => toast.error(error.message) });
  const sendAttachment = trpc.chat.sendAttachment.useMutation({ onSuccess: () => { setAttachment(null); utils.chat.messages.invalidate({ conversationId: selectedConversationId ?? 0 }); utils.chat.list.invalidate(); toast.success("Private attachment sent"); }, onError: error => toast.error(error.message) });

  useEffect(() => {
    if (!selectedConversationId && conversations.data?.[0]) setSelectedConversationId(conversations.data[0].id);
  }, [conversations.data, selectedConversationId]);
  useEffect(() => {
    if (import.meta.env.DEV && !isMobile && chatPreviewMode === "desktop") setSelectedConversationId(previewConversations[0].id);
  }, [chatPreviewMode, isMobile]);
  useEffect(() => {
    if (import.meta.env.DEV && isMobile && chatPreviewMode === "detail") setSelectedConversationId(previewConversations[0].id);
  }, [chatPreviewMode, isMobile]);
  useEffect(() => { localStorage.setItem("savanna-message-tabs", JSON.stringify(customTabs)); }, [customTabs]);
  useEffect(() => { localStorage.setItem("savanna-message-tab-membership", JSON.stringify(tabMembership)); }, [tabMembership]);

  const conversationSource = conversations.data?.length ? conversations.data : (import.meta.env.DEV ? previewConversations : []);
  const filteredConversations = conversationSource.filter(conversation => (conversation.title || conversation.kind).toLowerCase().includes(conversationSearch.toLowerCase()));
  const filteredChatList = filteredConversations.filter(conversation => chatFilter === "all" || conversation.kind === chatFilter || tabMembership[chatFilter]?.includes(conversation.id));
  const desktopStoryItems = desktopStories.data?.length ? desktopStories.data.slice(0, 8).map(story => ({ id: story.id, label: story.authorName })) : import.meta.env.DEV ? previewConversations.map(conversation => ({ id: conversation.id, label: conversation.title })) : [];
  const selected = conversations.data?.find(conversation => conversation.id === selectedConversationId) ?? (isPreviewConversation ? previewConversations.find(conversation => conversation.id === selectedConversationId) : chatPreviewMode === "detail" ? previewConversations[0] : undefined);

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedMembers = memberIds.split(",").map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0);
    if (!parsedMembers.length) return toast.error("Enter at least one valid Savanna account ID");
    if (creationMode === "group" && !groupTitle.trim()) return toast.error("Give the group a short name");
    create.mutate({ kind: creationMode, title: creationMode === "group" ? groupTitle.trim() : undefined, memberIds: parsedMembers });
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
    if (isPreviewConversation) return toast.info("Development preview — messages are not sent or saved.");
    if (attachment) {
      try {
        const base64Data = await fileToBase64(attachment);
        sendAttachment.mutate({ conversationId: selectedConversationId, clientMessageId: crypto.randomUUID(), fileName: attachment.name, mimeType: attachment.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "audio/mpeg" | "video/mp4", base64Data, byteSize: attachment.size });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The attachment could not be prepared");
      }
      return;
    }
    if (draft.trim()) send.mutate({ conversationId: selectedConversationId, clientMessageId: crypto.randomUUID(), payload: draft.trim() });
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

  const newChatDrawer = <Drawer open={newChatOpen} onOpenChange={setNewChatOpen}><DrawerContent className="savanna-new-chat-drawer rounded-t-[28px] border-[#ead2a4] bg-[#fffaf0] dark:border-[#5b4833] dark:bg-[#21180f]"><DrawerHeader className="text-left"><DrawerTitle className="font-display text-2xl text-[#3d2d1a] dark:text-[#fff8ed]">New chat</DrawerTitle><DrawerDescription>Start a private direct or group conversation.</DrawerDescription></DrawerHeader><form className="space-y-3 px-4" onSubmit={handleCreate}><div className="savanna-new-chat-tabs flex rounded-xl bg-[#f5e4bf] p-1"><button type="button" data-active={creationMode === "direct"} onClick={() => setCreationMode("direct")} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${creationMode === "direct" ? "bg-white text-[#7b4a0d] shadow-sm" : "text-[#7b4a0d]"}`}>Chat</button><button type="button" data-active={creationMode === "group"} onClick={() => setCreationMode("group")} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${creationMode === "group" ? "bg-white text-[#7b4a0d] shadow-sm" : "text-[#7b4a0d]"}`}>Group</button></div>{creationMode === "group" ? <Input value={groupTitle} onChange={event => setGroupTitle(event.target.value)} placeholder="Group name" className="savanna-new-chat-input bg-white dark:bg-[#2a2119]" /> : null}<Input value={memberIds} onChange={event => setMemberIds(event.target.value)} placeholder={creationMode === "group" ? "Account IDs, comma-separated" : "Savanna account ID"} aria-label="Savanna account ID" className="savanna-new-chat-input bg-white dark:bg-[#2a2119]" /><DrawerFooter className="px-0"><Button type="submit" disabled={create.isPending} className="rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">{create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <AnimatedPlusIcon className="mr-2 size-4" />}Create chat</Button></DrawerFooter></form></DrawerContent></Drawer>;

  if (loading) return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#31583a]" /></div></SavannaShell>;
  if (!isAuthenticated) return <SavannaShell><section className="grid min-h-[62vh] place-items-center rounded-[30px] border border-[#dce1d3] bg-white p-8 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#dfe8d9] text-[#31583a]"><MessageCircle className="size-6" /></span><p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8065]">Private conversations</p><h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.06em] text-[#263126]">A more considered place to talk.</h1><p className="mt-4 text-[15px] leading-7 text-[#687462]">Sign in to begin a direct conversation or keep up with the groups that matter to you.</p><Button className="mt-7 rounded-xl bg-[#24482f] text-white hover:bg-[#1b3b25]" onClick={() => startLogin()}>Sign in to messages</Button></div></section></SavannaShell>;

  const filterTabs = ([['all', 'All'], ['direct', 'Chats'], ['group', 'Groups'], ['merchant_support', 'Support']] as const);
  const chatRows = filteredChatList.map(conversation => <button key={conversation.id} data-active={selectedConversationId === conversation.id} onClick={() => { if (conversation.id < 0) { if (import.meta.env.DEV) { setSelectedConversationId(conversation.id); if (isMobile) setMobileDetail(true); return; } return toast.info("Development preview chat — no real conversation opened"); } setSelectedConversationId(conversation.id); if (isMobile) setMobileDetail(true); }} className={`savanna-chat-row flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors ${selectedConversationId === conversation.id ? "bg-[#D9A441]/20" : "hover:bg-[#f4f0e8]"}`}><span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#5d3a0c] text-sm font-semibold text-white">{conversation.kind === "group" ? <Users className="size-5" /> : "S"}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-[#3d2d1a] dark:text-[#fff8ed]">{conversation.title || (conversation.kind === "group" ? "Group chat" : "Private chat")}</span><span className="ml-auto shrink-0 text-[11px] text-[#9a8467] dark:text-[#9AA1A6]">{conversation.id < 0 ? "Preview" : conversation.mutedUntil ? "Muted" : "Active"}</span></span><span className="mt-1 flex items-center gap-1 truncate text-xs text-[#9a8467] dark:text-[#9AA1A6]">{"previewMessage" in conversation ? <>{conversation.previewStatus === "delivered" || conversation.previewStatus === "read" ? <AnimatedCheckCheckIcon size={13} aria-label="Delivered" /> : conversation.previewStatus === "failed" ? <X className="size-3 shrink-0 text-[#FF5B6B]" aria-label="Failed" /> : <Check className="size-3 shrink-0 text-[#AEBAC1]" aria-label="Sent" />}{conversation.previewMessage}</> : conversation.kind === "merchant_support" ? "Merchant support" : "Tap to open your conversation"}</span></span></button>);

  if (isMobile && mobileDetail && selected) return <SavannaShell><div className="savanna-mobile-conversation -mx-4 -mt-5 flex min-h-[calc(100vh-190px)] flex-col bg-[#faf7f0] px-4 dark:bg-[#17120d]"><header className="savanna-mobile-conversation-header flex items-center gap-3 border-b border-[#eadfca] px-4 py-3 dark:border-[#3b2d20]"><Button variant="ghost" size="icon" onClick={() => setMobileDetail(false)} className="rounded-full" aria-label="Back to chats"><ArrowLeft className="size-5" /></Button><span className="grid size-10 place-items-center rounded-full bg-[#5d3a0c] text-white">{selected.kind === "group" ? <Users className="size-5" /> : "S"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#3d2d1a] dark:text-[#fff8ed]">{selected.title || (selected.kind === "group" ? "Group chat" : "Private chat")}</p><p className="text-xs text-[#8a765d] dark:text-[#cdb99b]">{selected.kind === "merchant_support" ? "Merchant support" : "Private conversation"}</p></div>{customTabs.length ? <Button variant="ghost" size="icon" onClick={saveSelectedToTab} className="rounded-full" aria-label="Save chat to a tab"><BookmarkPlus className="size-4" /></Button> : null}</header><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.isLoading ? <Loader2 className="mx-auto mt-10 size-5 animate-spin text-[#9a6410]" /> : messages.data?.length ? messages.data.map(message => <div key={message.id} className={`flex ${message.senderUserId === user?.id ? "justify-end" : "justify-start"}`}><article className={`max-w-[82%] rounded-2xl px-3 py-2.5 text-sm shadow-sm ${message.senderUserId === user?.id ? "bg-[#5d3a0c] text-white" : "savanna-incoming-message bg-white text-[#3d2d1a] dark:text-[#fff8ed]"}`}><p className="whitespace-pre-wrap">{message.contentType === "attachment" ? "Private attachment" : message.payload}</p><p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${message.senderUserId === user?.id ? "text-[#f8edcf]" : "text-[#9a8467]"}`}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{message.senderUserId === user?.id ? <DeliveryIcon status={message.status} /> : null}</p></article></div>) : <div className="grid h-full place-items-center text-center"><div><MessageCircle className="mx-auto size-8 text-[#d2a34f]" /><p className="mt-3 text-sm font-semibold text-[#5b4934] dark:text-[#f2e7d5]">No messages yet</p></div></div>}</div><form className="savanna-mobile-composer border-t border-[#eadfca] bg-white p-3 dark:border-[#3b2d20] dark:bg-[#21180f]" onSubmit={handleSend}><input ref={attachmentInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,video/mp4" onChange={handleAttachmentChange} /><div className="savanna-mobile-composer-field flex items-center gap-2 rounded-2xl bg-[#f4f0e8] p-2 dark:bg-[#2a2119]"><Button type="button" variant="ghost" size="icon" onClick={() => attachmentInput.current?.click()} className="size-9 rounded-xl" aria-label="Attach private media"><Paperclip className="size-4" /></Button><Input value={draft} onChange={event => setDraft(event.target.value)} disabled={Boolean(attachment)} placeholder={attachment ? attachment.name : "Write a message"} className="border-0 bg-transparent shadow-none focus-visible:ring-0" /><Button type="submit" disabled={(!draft.trim() && !attachment) || send.isPending || sendAttachment.isPending} size="icon" className="size-9 shrink-0 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]" aria-label="Send message">{send.isPending || sendAttachment.isPending ? <Loader2 className="size-4 animate-spin" /> : <AnimatedSendIcon size={18} />}</Button></div></form></div></SavannaShell>;

  if (isMobile) return <SavannaShell><div className="savanna-mobile-messages-canvas -mx-4 min-h-[calc(100vh-190px)] bg-white px-4 pb-8 pt-2 dark:bg-[#0A1014]"><label className="mx-2 mt-2 flex h-11 items-center gap-2 rounded-2xl bg-[#f4f0e8] px-4 text-sm text-[#8a765d] dark:bg-[#23282C] dark:text-[#9AA1A6]"><AnimatedSearchIcon size={16} /><input value={conversationSearch} onChange={event => setConversationSearch(event.target.value)} placeholder="Search chats or people" aria-label="Search chats or people" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#a5947e]" /></label><div className="story-rail mt-4 flex gap-2 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Chat filters">{filterTabs.map(([value, label]) => <button key={value} role="tab" aria-selected={chatFilter === value} onClick={() => setChatFilter(value)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${chatFilter === value ? "bg-[#e3a43c] text-[#3a260e]" : "bg-[#f4f0e8] text-[#715d43] dark:bg-[#2b2118] dark:text-[#dac7a9]"}`}>{label}</button>)}{customTabs.map(tab => <button key={tab} role="tab" aria-selected={chatFilter === tab} onClick={() => setChatFilter(tab)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${chatFilter === tab ? "bg-[#e3a43c] text-[#3a260e]" : "bg-[#f4f0e8] text-[#715d43] dark:bg-[#2b2118] dark:text-[#dac7a9]"}`}>{tab}</button>)}<button onClick={addCustomTab} className="grid size-8 shrink-0 place-items-center rounded-full border border-[#ead2a4] text-[#7b4a0d] dark:border-[#76531d] dark:text-[#f0bf65]" aria-label="Create a chat tab"><AnimatedPlusIcon size={16} /></button></div><div className="mt-3 divide-y-0 px-0">{conversations.isLoading ? <div className="grid min-h-48 place-items-center"><Loader2 className="size-5 animate-spin text-[#9a6410]" /></div> : filteredChatList.length ? chatRows : <div className="grid min-h-56 place-items-center"><MessageCircle className="size-8 text-[#d2a34f]" /></div>}</div><Button onClick={() => setNewChatOpen(true)} size="icon" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 size-12 rounded-full bg-[#5d3a0c] text-white shadow-[0_10px_24px_rgba(93,58,12,0.32)] hover:bg-[#412607]" aria-label="Start a new chat"><AnimatedPlusIcon size={20} /></Button>{newChatDrawer}</div></SavannaShell>;

  return <SavannaShell><div className="savanna-desktop-messages grid min-h-screen lg:grid-cols-[470px_minmax(0,1fr)]"><aside className="savanna-desktop-chat-list flex min-h-0 flex-col border-r p-4"><header className="flex items-center justify-between gap-3"><span className="savanna-wordmark text-[28px]">Savanna</span><Button onClick={() => setNewChatOpen(true)} size="icon" className="size-10 rounded-2xl bg-[#D9A441] text-[#111111] shadow-none hover:bg-[#F2C14E]" aria-label="Start a new chat"><AnimatedPlusIcon size={19} /></Button></header><label className="savanna-desktop-chat-search mt-5 flex h-11 items-center gap-2 rounded-2xl px-3 text-sm"><AnimatedSearchIcon size={17} /><input value={conversationSearch} onChange={event => setConversationSearch(event.target.value)} placeholder="Search chats or people" aria-label="Search conversations" className="min-w-0 flex-1 bg-transparent outline-none" /></label><DesktopStoryRail items={desktopStoryItems} /><div className="savanna-desktop-message-tabs flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Desktop chat filters">{filterTabs.map(([value, label]) => <button key={value} role="tab" aria-selected={chatFilter === value} onClick={() => setChatFilter(value)} data-active={chatFilter === value} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold">{label}</button>)}{customTabs.map(tab => <button key={tab} role="tab" aria-selected={chatFilter === tab} onClick={() => setChatFilter(tab)} data-active={chatFilter === tab} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold">{tab}</button>)}<button type="button" onClick={addCustomTab} className="grid size-8 shrink-0 place-items-center rounded-full" aria-label="Create a chat tab"><AnimatedPlusIcon size={15} /></button></div><div className="savanna-desktop-chat-rows mt-3 flex-1 overflow-y-auto">{conversations.isLoading ? <div className="grid min-h-48 place-items-center"><Loader2 className="size-5 animate-spin text-[#A87820]" /></div> : filteredChatList.length ? chatRows : <div className="grid min-h-48 place-items-center"><MessageCircle className="size-7 text-[#9AA1A6]" /></div>}</div></aside><section className="savanna-desktop-conversation-panel flex min-h-0 flex-col">{selected ? <><header className="flex items-center justify-between gap-3 border-b px-6 py-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#A87820] text-white">{selected.kind === "group" ? <Users className="size-5" /> : "S"}</span><div><p className="text-sm font-semibold">{selected.title || `${selected.kind === "group" ? "Group" : "Private"} conversation`}</p><p className="mt-0.5 text-xs">{selected.kind === "merchant_support" ? "Merchant support" : "Conversation members only"}</p></div></div><SafetyActions targetDomain="message" targetId={`conversation-${selected.id}`} targetLabel="this conversation" /></header><div className="savanna-desktop-message-thread flex-1 space-y-3 overflow-y-auto p-6">{messages.isLoading ? <Loader2 className="size-5 animate-spin text-[#A87820]" /> : messages.data?.length ? messages.data.map(message => <article key={message.id} className={`group flex ${message.senderUserId === user?.id ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${message.senderUserId === user?.id ? "bg-[#A87820] text-[#111111]" : "savanna-incoming-message"}`}><p className="whitespace-pre-wrap text-sm leading-6">{message.contentType === "attachment" ? "Private attachment" : message.payload}</p>{message.attachments.map(item => <PrivateAttachment key={item.id} attachmentId={item.id} fileName={item.fileName} mimeType={item.mimeType} />)}<div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] opacity-80"><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{message.senderUserId === user?.id ? <DeliveryIcon status={message.status} /> : null}</div><div className="mt-1 opacity-0 transition-opacity group-hover:opacity-100"><SafetyActions targetDomain="message" targetId={String(message.id)} targetLabel="this message" blockUserId={message.senderUserId} /></div></div></article>) : <div className="grid h-full min-h-72 place-items-center text-center"><div><MessageCircle className="mx-auto size-8 text-[#9AA1A6]" /><p className="mt-4 font-display text-2xl font-semibold">No messages yet</p><p className="mt-2 text-sm">Start the conversation when you are ready.</p></div></div>}</div><form className="savanna-desktop-composer border-t p-4" onSubmit={handleSend}><input ref={attachmentInput} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,video/mp4" onChange={handleAttachmentChange} /><div className="flex items-end gap-2 rounded-2xl p-2"><Button type="button" variant="ghost" onClick={() => attachmentInput.current?.click()} size="icon" className="size-10 shrink-0 rounded-xl" aria-label="Attach private media"><Paperclip className="size-4" /></Button><Input value={draft} onChange={event => setDraft(event.target.value)} disabled={Boolean(attachment)} placeholder={attachment ? attachment.name : "Write a message"} aria-label="Message draft" className="border-0 bg-transparent shadow-none focus-visible:ring-0" />{attachment ? <Button type="button" variant="ghost" onClick={() => setAttachment(null)} size="icon" className="size-8 shrink-0 rounded-lg" aria-label="Remove attachment"><X className="size-4" /></Button> : null}<Button type="submit" disabled={(!draft.trim() && !attachment) || send.isPending || sendAttachment.isPending} size="icon" className="size-10 shrink-0 rounded-xl bg-[#D9A441] text-[#111111] hover:bg-[#F2C14E]" aria-label="Send message">{send.isPending || sendAttachment.isPending ? <Loader2 className="size-4 animate-spin" /> : <AnimatedSendIcon size={18} />}</Button></div></form></> : <div className="grid flex-1 place-items-center p-8 text-center"><div><MessageCircle className="mx-auto size-9 text-[#9AA1A6]" /><p className="mt-4 font-display text-2xl font-semibold">Choose a conversation</p><p className="mt-2 max-w-sm text-sm leading-6">Select an existing conversation from the list, or create a new private chat.</p></div></div>}</section>{newChatDrawer}</div></SavannaShell>;
}
