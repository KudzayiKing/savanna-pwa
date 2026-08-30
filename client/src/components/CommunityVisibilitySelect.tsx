import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FirebaseCommunityVisibility } from "@/lib/firebaseCommunities";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

const communityVisibilityOptions: Array<{ value: FirebaseCommunityVisibility; label: string }> = [
  { value: "public", label: "Public - listed on Savanna" },
  { value: "private", label: "Private - invite-only" },
];

export function CommunityVisibilitySelect({
  value,
  onChange,
  className,
}: {
  value: FirebaseCommunityVisibility;
  onChange: (value: FirebaseCommunityVisibility) => void;
  className?: string;
}) {
  const selected = communityVisibilityOptions.find(option => option.value === value) ?? communityVisibilityOptions[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "savanna-new-chat-input flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#ead2a4] bg-white px-3 text-left text-sm font-medium text-[#151A17] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#D9A441]/35 dark:bg-[#2a2119] dark:text-[#fff8ed]",
            className,
          )}
        >
          <span className="truncate">{selected.label}</span>
          <ChevronDown className="size-4 shrink-0 text-[#5F6861] dark:text-[#AEBAC1]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        avoidCollisions={false}
        className="z-[90] w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border-[#ead2a4] bg-white p-1 text-[#151A17] shadow-[0_14px_34px_rgba(21,26,23,0.16)] dark:border-[#5b4833] dark:bg-[#21180f] dark:text-[#fff8ed]"
      >
        <DropdownMenuRadioGroup value={value} onValueChange={next => onChange(next as FirebaseCommunityVisibility)}>
          {communityVisibilityOptions.map(option => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="rounded-lg px-3 py-2 pl-8 text-sm font-semibold text-[#5F6861] focus:bg-[#D9A441]/20 focus:text-[#A87820] dark:text-[#AEBAC1] dark:focus:text-[#D9A441] data-[state=checked]:bg-[#D9A441]/20 data-[state=checked]:text-[#A87820] dark:data-[state=checked]:text-[#D9A441]"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
