import {
  EllipsisVerticalIcon,
  PhoneIcon,
  VideoIcon,
  type ChatIconHandle,
} from "@/components/AnimatedChatIcons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useRef, type ReactNode } from "react";

type ConversationHeaderProps = {
  /** Conversation or group name shown next to the avatar. */
  title: string;
  /** Avatar tile contents - an initial, an image, or the group glyph. */
  avatar: ReactNode;
  /**
   * Opens the counterparty's public profile. Omit it for groups and for any
   * thread with no single other party — the tile then renders as a plain span
   * so nothing looks tappable that is not.
   */
  onAvatarClick?: () => void;
  /** Last-active / presence line rendered under the title. */
  presenceLabel: string;
  /** When provided a leading back arrow is rendered (mobile detail view). */
  onBack?: () => void;
  onVideoCall?: () => void;
  onVoiceCall?: () => void;
  /** `DropdownMenuItem` children. The three-dot button is hidden when empty. */
  menuItems?: ReactNode;
  /** Extra controls rendered after the three-dot button. */
  trailing?: ReactNode;
  className?: string;
};

/**
 * Single header implementation for the direct, group and merchant-support
 * threads on both breakpoints so every conversation gets the same
 * glassmorphic treatment as the main app header.
 */
export function ConversationHeader({
  title,
  avatar,
  presenceLabel,
  onBack,
  onAvatarClick,
  onVideoCall,
  onVoiceCall,
  menuItems,
  trailing,
  className,
}: ConversationHeaderProps) {
  const videoIcon = useRef<ChatIconHandle>(null);
  const phoneIcon = useRef<ChatIconHandle>(null);
  const menuIcon = useRef<ChatIconHandle>(null);

  return (
    <header
      className={cn(
        "savanna-chat-glass-header flex shrink-0 items-center gap-2 border-b border-[#DDE3DC] px-2 py-2.5 dark:border-[#2C3336]",
        className,
      )}
    >
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to chats"
          className="size-10 shrink-0 rounded-full text-[#3d2d1a] hover:text-[#a87820] dark:text-[#fff8ed] dark:hover:text-[#D9A441]"
        >
          <ArrowLeft className="size-5" />
        </Button>
      ) : null}

      {onAvatarClick ? (
        <button
          type="button"
          onClick={onAvatarClick}
          aria-label={`Open ${title}'s profile`}
          className="savanna-brand-token grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold transition-opacity active:opacity-70"
        >
          {avatar}
        </button>
      ) : (
        <span className="savanna-brand-token grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold">
          {avatar}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-[#3d2d1a] dark:text-[#fff8ed]">
          {title}
        </p>
        <p className="truncate text-[11px] leading-tight text-[#5f6861] dark:text-[#9AA1A6]">
          {presenceLabel}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Start a video call"
          onPointerDown={() => videoIcon.current?.startAnimation()}
          onClick={onVideoCall}
          className="size-10 rounded-full text-[#3d2d1a] hover:text-[#a87820] dark:text-[#fff8ed] dark:hover:text-[#D9A441]"
        >
          <VideoIcon ref={videoIcon} size={20} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Start a voice call"
          onPointerDown={() => phoneIcon.current?.startAnimation()}
          onClick={onVoiceCall}
          className="size-10 rounded-full text-[#3d2d1a] hover:text-[#a87820] dark:text-[#fff8ed] dark:hover:text-[#D9A441]"
        >
          <PhoneIcon ref={phoneIcon} size={20} />
        </Button>

        {menuItems ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Conversation options"
                onPointerDown={() => menuIcon.current?.startAnimation()}
                className="size-10 rounded-full text-[#3d2d1a] hover:text-[#a87820] dark:text-[#fff8ed] dark:hover:text-[#D9A441]"
              >
                <EllipsisVerticalIcon ref={menuIcon} size={20} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {menuItems}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {trailing}
      </div>
    </header>
  );
}
