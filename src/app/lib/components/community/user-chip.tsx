"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Poster identity chip: badge icon + username (email as fallback display).
// Clicking it navigates to the poster's public profile page.
export function UserChip({
  username,
  email,
  badgeUrl,
  size = "md",
  subtitle,
}: {
  username?: string | null;
  email?: string | null;
  badgeUrl?: string | null;
  size?: "sm" | "md";
  subtitle?: string;
}) {
  const display = username || email || "anonymous";
  const initial = display.charAt(0).toUpperCase();
  const avatarSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  const inner = (
    <span className="inline-flex items-center gap-2 group/chip">
      <Avatar className={`${avatarSize} border border-white/20 transition-transform group-hover/chip:scale-110`}>
        <AvatarImage src={badgeUrl || undefined} alt={display} />
        <AvatarFallback className="bg-emerald-900/60 text-emerald-200 text-[10px]">
          {initial}
        </AvatarFallback>
      </Avatar>
      <span className="flex flex-col leading-tight">
        <span className={`${textSize} font-medium text-emerald-100 group-hover/chip:text-white transition-colors`}>
          {display}
        </span>
        {subtitle && <span className="text-[10px] text-white/40">{subtitle}</span>}
      </span>
    </span>
  );

  // Only usernames have profile pages; a bare email fallback stays unlinked.
  if (!username) return inner;

  return (
    <Link href={`/users/${encodeURIComponent(username)}`} className="no-underline">
      {inner}
    </Link>
  );
}
