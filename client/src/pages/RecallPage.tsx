import { useAuth } from "@/_core/hooks/useAuth";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startLogin } from "@/const";
import { useFirebaseMessageMemories, useFirebaseMessageMemoryMutations, type FirebaseMessageMemory } from "@/lib/firebaseChat";
import { isSavannaFollowUpMemory, SAVANNA_MEMORY_TAG_LABELS, type SavannaMemoryTag, type SavannaRecallAnswer, type SavannaRecallSource } from "@/lib/savannaRecall";
import { generateAnswer } from "@/savanna/orchestrator/SavannaOrchestrator";
import { AtSign, BellOff, Bookmark, CalendarClock, CheckCircle2, Clock3, Loader2, MessageCircle, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const memoryTagOptions = Object.keys(SAVANNA_MEMORY_TAG_LABELS) as SavannaMemoryTag[];
const quickPrompts = [
  "what do I need to follow up on?",
  "show me saved prices",
  "what links did I save?",
  "what products did I save?",
];

function formatDate(value: Date | string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function prepareRecallSource(source: SavannaRecallSource) {
  if (source.sourceType === "story") return;
  sessionStorage.setItem("savanna-open-conversation", source.conversationId);
  sessionStorage.setItem("savanna-open-message", source.messageId);
}

function prepareMemoryConversation(memory: FirebaseMessageMemory) {
  if (memory.sourceType === "story") return;
  sessionStorage.setItem("savanna-open-conversation", memory.conversationId);
  sessionStorage.setItem("savanna-open-message", memory.messageId);
}

function memoryHref(memory: FirebaseMessageMemory) {
  return memory.sourceType === "story" ? memory.storyHref ?? `/stories?story=${memory.storyId}` : "/messages";
}

function memoryTitle(memory: FirebaseMessageMemory) {
  return memory.sourceType === "story"
    ? memory.productName ?? memory.storefrontName ?? memory.communityName ?? memory.storyAuthorName ?? "Saved Story"
    : memory.conversationTitle;
}

export default function RecallPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const memories = useFirebaseMessageMemories(user);
  const memoryMutations = useFirebaseMessageMemoryMutations(user);
  const [draft, setDraft] = useState("");
  const [answer, setAnswer] = useState<SavannaRecallAnswer | null>(null);
  const [answering, setAnswering] = useState(false);
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryFilter, setMemoryFilter] = useState<SavannaMemoryTag | "all">("all");
  const visibleMemories = useMemo(() => {
    const query = memorySearch.trim().toLowerCase();
    return (memories.data ?? []).filter(memory => {
      const matchesFilter = memoryFilter === "all" || memory.tags.includes(memoryFilter);
      const matchesQuery = !query
        || memory.snippet.toLowerCase().includes(query)
        || memory.conversationTitle.toLowerCase().includes(query)
        || [memory.productName, memory.productDescription, memory.storefrontName, memory.communityName, memory.storyAuthorName].some(value => value?.toLowerCase().includes(query))
        || memory.tags.some(tag => (SAVANNA_MEMORY_TAG_LABELS[tag] ?? tag).toLowerCase().includes(query));
      return matchesFilter && matchesQuery;
    });
  }, [memories.data, memoryFilter, memorySearch]);
  const followUps = useMemo(() => (
    (memories.data ?? [])
      .filter(isSavannaFollowUpMemory)
      .sort((left, right) => {
        const leftTime = left.followUpAt ? new Date(left.followUpAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.followUpAt ? new Date(right.followUpAt).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      })
      .slice(0, 5)
  ), [memories.data]);

  const askRecall = async (value = draft) => {
    const query = value.trim();
    if (!query) return toast.info("Ask Savanna what to find in your memory.");
    setAnswering(true);
    try {
      setAnswer(await generateAnswer({
        conversationId: "recall",
        conversationTitle: "your Savanna memory",
        query,
        messages: [],
        memories: memories.data ?? [],
      }));
      setDraft(query);
    } finally {
      setAnswering(false);
    }
  };

  const removeMemory = (memory: FirebaseMessageMemory) => {
    memoryMutations.remove.mutate(memory, {
      onSuccess: () => toast.success("Memory removed"),
      onError: error => toast.error(error.message),
    });
  };

  const completeFollowUp = (memory: FirebaseMessageMemory) => {
    memoryMutations.completeFollowUp.mutate(memory, {
      onSuccess: () => toast.success("Follow-up marked done"),
      onError: error => toast.error(error.message),
    });
  };

  const snoozeFollowUp = (memory: FirebaseMessageMemory, days = 1) => {
    memoryMutations.snoozeFollowUp.mutate({ memory, days }, {
      onSuccess: () => toast.success(days === 1 ? "Snoozed until tomorrow" : `Snoozed for ${days} days`),
      onError: error => toast.error(error.message),
    });
  };

  const clearFollowUp = (memory: FirebaseMessageMemory) => {
    memoryMutations.clearFollowUp.mutate(memory, {
      onSuccess: () => toast.success("Reminder cleared"),
      onError: error => toast.error(error.message),
    });
  };

  if (loading) {
    return <SavannaShell hideMobileHeader><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></div></SavannaShell>;
  }

  if (!isAuthenticated) {
    return (
      <SavannaShell hideMobileHeader>
        <section className="savanna-profile-page grid min-h-[62vh] place-items-center rounded-[30px] border border-[#DDE3DC] bg-white p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]"><AtSign className="size-6" /></span>
            <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-[#5F6861]">Recall</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.06em] text-[#151A17]">Your memory belongs to you.</h1>
            <p className="mt-4 text-[15px] leading-7 text-[#5F6861]">Sign in to search saved messages, follow-ups, links, products, and decisions.</p>
            <Button className="savanna-brand-token mt-7 rounded-xl px-5 shadow-none" onClick={() => startLogin()}><AtSign className="mr-2 size-4" />Sign in to Recall</Button>
          </div>
        </section>
      </SavannaShell>
    );
  }

  return (
    <SavannaShell hideMobileHeader>
      <div className="savanna-profile-page mx-auto max-w-[960px] space-y-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8">
        <section className="savanna-profile-header savanna-profile-hero rounded-[28px] border border-[#eadfca]/70 bg-white/65 p-5 backdrop-blur-xl sm:p-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#D9A441]/20 px-3 py-1.5 text-xs font-semibold text-[#D9A441]"><AtSign className="size-4" /> Recall</span>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-[-0.06em] text-[#151A17] sm:text-5xl">Ask your Savanna memory.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5F6861]">Find follow-ups, saved prices, links, products, people, places, and decisions from your private chat memories.</p>
          <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); void askRecall(); }}>
            <label className="savanna-profile-card-muted flex h-12 flex-1 items-center gap-2 rounded-full bg-[#D9A441]/10 px-4 text-[#5F6861] dark:text-[#AEBAC1]">
              <Search className="size-4" />
              <Input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask Savanna about your memory" aria-label="Ask Savanna about your memory" className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
            </label>
            <Button type="submit" disabled={answering} className="savanna-brand-token h-12 rounded-full px-5 shadow-none">{answering ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Ask</Button>
          </form>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {quickPrompts.map(prompt => (
              <button key={prompt} type="button" onClick={() => void askRecall(prompt)} className="shrink-0 rounded-full bg-[#D9A441]/20 px-3 py-1.5 text-xs font-semibold text-[#D9A441]">
                {prompt}
              </button>
            ))}
          </div>
        </section>

        {answer ? (
          <section className="savanna-profile-card rounded-[28px] border border-[#eadfca] bg-white p-5 shadow-[0_14px_35px_rgba(94,58,11,0.04)] sm:p-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#D9A441]"><span className="grid size-7 place-items-center rounded-full bg-[#D9A441]/20">@</span>Savanna</div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#151A17] dark:text-[#E9EDEF]">{answer.answer}</p>
            {answer.sources.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {answer.sources.slice(0, 4).map((source, index) => (
                  <Button key={`${source.conversationId}-${source.messageId}-${index}`} asChild variant="outline" size="sm" className="rounded-full border-0 bg-[#D9A441]/20 text-[#9a6410] shadow-none hover:bg-[#D9A441]/30 dark:text-[#D9A441]">
                    <Link href={source.sourceType === "story" ? source.storyHref ?? `/stories?story=${source.storyId}` : "/messages"} onClick={() => prepareRecallSource(source)}><MessageCircle className="size-3.5" />{answer.sources.length === 1 ? `Open ${source.label}` : source.label}</Link>
                  </Button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="savanna-profile-card rounded-[28px] border border-[#eadfca] bg-white p-5 shadow-[0_14px_35px_rgba(94,58,11,0.04)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]"><CalendarClock className="size-5" /></span>
              <div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Follow-ups</h2><p className="mt-1 text-sm text-[#5F6861]">Saved promises and tasks Savanna noticed.</p></div>
            </div>
            <span className="rounded-full bg-[#D9A441]/20 px-3 py-1 text-xs font-semibold text-[#D9A441]">{followUps.length}</span>
          </div>
          <div className="mt-5 grid gap-3">
            {memories.isLoading ? <div className="grid min-h-24 place-items-center rounded-2xl bg-[#D9A441]/10"><Loader2 className="size-5 animate-spin text-[#D9A441]" /></div> : followUps.length ? followUps.map(memory => (
              <article key={memory.id} className="savanna-profile-card-muted rounded-2xl bg-[#D9A441]/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{memory.followUpAction || memory.snippet}</span><span className="mt-1 block truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">{memory.conversationTitle}</span></span>
                  <span className="shrink-0 rounded-full bg-[#D9A441]/20 px-2 py-1 text-[11px] font-semibold text-[#D9A441]">{memory.followUpLabel || formatDate(memory.followUpAt) || "Follow-up"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => completeFollowUp(memory)} disabled={memoryMutations.completeFollowUp.isPending} className="h-8 rounded-full bg-[#D9A441]/20 px-3 text-xs font-semibold text-[#9a6410] shadow-none hover:bg-[#D9A441]/30 dark:text-[#D9A441]"><CheckCircle2 className="size-3.5" />Done</Button>
                  <Button type="button" size="sm" onClick={() => snoozeFollowUp(memory)} disabled={memoryMutations.snoozeFollowUp.isPending} className="h-8 rounded-full bg-[#D9A441]/20 px-3 text-xs font-semibold text-[#9a6410] shadow-none hover:bg-[#D9A441]/30 dark:text-[#D9A441]"><RotateCcw className="size-3.5" />Snooze</Button>
                  <Button type="button" size="sm" onClick={() => clearFollowUp(memory)} disabled={memoryMutations.clearFollowUp.isPending} className="h-8 rounded-full bg-transparent px-3 text-xs font-semibold text-[#5F6861] shadow-none hover:bg-[#D9A441]/10 dark:text-[#AEBAC1]"><BellOff className="size-3.5" />Clear</Button>
                  <Button asChild size="sm" className="h-8 rounded-full bg-transparent px-3 text-xs font-semibold text-[#5F6861] shadow-none hover:bg-[#D9A441]/10 dark:text-[#AEBAC1]"><Link href={memoryHref(memory)} onClick={() => prepareMemoryConversation(memory)}><MessageCircle className="size-3.5" />{memory.sourceType === "story" ? "Open story" : "Open chat"}</Link></Button>
                </div>
              </article>
            )) : <div className="rounded-2xl bg-[#D9A441]/10 p-5 text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">No follow-ups saved yet.</div>}
          </div>
        </section>

        <section className="savanna-profile-card rounded-[28px] border border-[#eadfca] bg-white p-5 shadow-[0_14px_35px_rgba(94,58,11,0.04)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]"><Bookmark className="size-5" /></span>
              <div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">All memories</h2><p className="mt-1 text-sm text-[#5F6861]">Search the saved chat context you chose to keep.</p></div>
            </div>
            <span className="rounded-full bg-[#D9A441]/20 px-3 py-1 text-xs font-semibold text-[#D9A441]">{memories.data?.length ?? 0}</span>
          </div>
          <div className="mt-5 space-y-3">
            <label className="savanna-profile-card-muted flex h-11 items-center gap-2 rounded-full bg-[#D9A441]/10 px-4 text-[#5F6861] dark:text-[#AEBAC1]">
              <Search className="size-4" />
              <Input value={memorySearch} onChange={event => setMemorySearch(event.target.value)} placeholder="Search saved memories" aria-label="Search saved memories" className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setMemoryFilter("all")} data-active={memoryFilter === "all"} className="shrink-0 rounded-full bg-[#D9A441]/10 px-3 py-1.5 text-xs font-semibold text-[#5F6861] transition-colors data-[active=true]:bg-[#D9A441]/20 data-[active=true]:text-[#D9A441] dark:text-[#AEBAC1]">All</button>
              {memoryTagOptions.map(tag => <button key={tag} type="button" onClick={() => setMemoryFilter(tag)} data-active={memoryFilter === tag} className="shrink-0 rounded-full bg-[#D9A441]/10 px-3 py-1.5 text-xs font-semibold text-[#5F6861] transition-colors data-[active=true]:bg-[#D9A441]/20 data-[active=true]:text-[#D9A441] dark:text-[#AEBAC1]">{SAVANNA_MEMORY_TAG_LABELS[tag] ?? tag}</button>)}
            </div>
            {memories.isLoading ? <div className="grid min-h-24 place-items-center rounded-2xl bg-[#D9A441]/10"><Loader2 className="size-5 animate-spin text-[#D9A441]" /></div> : visibleMemories.length ? visibleMemories.slice(0, 24).map(memory => (
              <article key={memory.id} className="savanna-profile-card-muted rounded-2xl bg-[#D9A441]/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{memoryTitle(memory)}</p><p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">{memory.snippet}</p></div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#5F6861] dark:text-[#9AA1A6]"><Clock3 className="size-3.5" />{formatDate(memory.updatedAt)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {memory.followUpCompletedAt ? <span className="rounded-full bg-[#22C55E]/15 px-2 py-1 text-[11px] font-semibold text-[#22C55E]">Done</span> : null}
                  {memory.tags.slice(0, 4).map(tag => <span key={tag} className="rounded-full bg-[#D9A441]/20 px-2 py-1 text-[11px] font-semibold text-[#D9A441]">{SAVANNA_MEMORY_TAG_LABELS[tag] ?? tag}</span>)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm" className="rounded-full border-0 bg-[#D9A441]/20 text-[#9a6410] shadow-none hover:bg-[#D9A441]/30 dark:text-[#D9A441]"><Link href={memoryHref(memory)} onClick={() => prepareMemoryConversation(memory)}><MessageCircle className="size-3.5" />{memory.sourceType === "story" ? "Open story" : "Open chat"}</Link></Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => removeMemory(memory)} disabled={memoryMutations.remove.isPending} className="rounded-full border-0 bg-transparent text-[#5F6861] shadow-none hover:bg-[#D9A441]/10 dark:text-[#AEBAC1]"><Trash2 className="size-3.5" />Remove</Button>
                </div>
              </article>
            )) : <div className="rounded-2xl bg-[#D9A441]/10 p-5 text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">No saved memories match this search.</div>}
          </div>
        </section>
      </div>
    </SavannaShell>
  );
}
