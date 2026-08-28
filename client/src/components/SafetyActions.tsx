import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Flag, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type TargetDomain = "profile" | "story" | "storefront" | "product" | "course" | "message" | "payment";

type SafetyActionsProps = {
  targetDomain: TargetDomain;
  targetId: string;
  targetLabel: string;
  blockUserId?: number;
};

export function SafetyActions({ targetDomain, targetId, targetLabel, blockUserId }: SafetyActionsProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"spam" | "impersonation" | "scam" | "harassment" | "unsafe_content" | "other">("spam");
  const [evidenceScope, setEvidenceScope] = useState<"none" | "selected_item" | "user_submitted">("selected_item");
  const [detail, setDetail] = useState("");
  const report = trpc.account.report.useMutation({
    onSuccess: () => {
      toast.success("Report received. We will review the evidence you selected.");
      setOpen(false);
      setDetail("");
    },
    onError: error => toast.error(error.message),
  });
  const block = trpc.account.block.useMutation({
    onSuccess: () => toast.success("Account blocked"),
    onError: error => toast.error(error.message),
  });

  if (!open) {
    return <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="h-8 rounded-lg px-2 text-xs text-[#6f786b] hover:bg-[#f2f4ee] hover:text-[#31583a]">Safety</Button>;
  }

  return (
    <aside aria-label={`Safety actions for ${targetLabel}`} className="rounded-2xl border border-[#ead9bc] bg-[#fffaf0] p-4 shadow-[0_14px_30px_rgba(88,64,29,0.08)]">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#513b20]">Safety options</p><p className="mt-1 text-xs leading-5 text-[#7b6647]">You decide what evidence is included in a report.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close safety actions" className="rounded-lg p-1 text-[#7b6647] hover:bg-[#f3e9d8]"><X className="size-4" /></button></div>
      <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); report.mutate({ targetDomain, targetId, reason, evidenceScope, detail: detail.trim() || undefined }); }}>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor={`reason-${targetId}`} className="text-xs">Reason</Label><select id={`reason-${targetId}`} value={reason} onChange={event => setReason(event.target.value as typeof reason)} className="h-9 w-full rounded-lg border border-[#e1d1b6] bg-white px-2 text-xs"><option value="spam">Spam</option><option value="impersonation">Impersonation</option><option value="scam">Scam</option><option value="harassment">Harassment</option><option value="unsafe_content">Unsafe content</option><option value="other">Other</option></select></div><div className="space-y-1.5"><Label htmlFor={`evidence-${targetId}`} className="text-xs">Evidence</Label><select id={`evidence-${targetId}`} value={evidenceScope} onChange={event => setEvidenceScope(event.target.value as typeof evidenceScope)} className="h-9 w-full rounded-lg border border-[#e1d1b6] bg-white px-2 text-xs"><option value="selected_item">This item only</option><option value="none">No item attached</option><option value="user_submitted">My added evidence</option></select></div></div>
        <Textarea value={detail} onChange={event => setDetail(event.target.value)} className="min-h-16 border-[#e1d1b6] bg-white text-xs" placeholder="Optional context for the review team" maxLength={1200} />
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={report.isPending} className="h-9 rounded-lg bg-[#24482f] text-xs text-white hover:bg-[#1b3b25]"><Flag className="mr-1.5 size-3.5" />Send report</Button>{blockUserId ? <Button type="button" variant="outline" disabled={block.isPending} onClick={() => block.mutate({ userId: blockUserId })} className="h-9 rounded-lg border-[#dfbfb5] bg-white text-xs text-[#87452f] hover:bg-[#fff1eb]"><ShieldAlert className="mr-1.5 size-3.5" />Block account</Button> : null}</div>
      </form>
    </aside>
  );
}
