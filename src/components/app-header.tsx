import Link from "next/link";
import {
  Sparkles,
  BarChart3,
  BookOpen,
  Archive,
  FolderOpen,
  Map,
  Crosshair,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

export function AppHeader() {
  return (
    <header className="border-b border-white/8 bg-[#080b0e]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-7 lg:px-10">
        <Link
          href="/"
          className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b8ff2c]"
          aria-label="R6 Creator AI projects"
        >
          <BrandMark />
        </Link>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Main">
          <NavItem href="/studio" icon={Sparkles} label="Creator Studio" />
          <NavItem href="/" icon={FolderOpen} label="Sources" />
          <NavItem href="/replays" icon={Archive} label="Match Replays" />
          <NavItem href="/references" icon={BookOpen} label="References" />
          <NavItem href="/maps" icon={Map} label="Map knowledge" />
          <NavItem href="/operators" icon={Crosshair} label="Operators" />
          <NavItem href="/benchmarks" icon={BarChart3} label="Benchmarks" />
          <NavItem
            href="/transcript-rules"
            icon={ScrollText}
            label="Transcript rules"
          />
          <NavItem
            href="/style-profiles"
            icon={SlidersHorizontal}
            label="Style profiles"
          />
        </nav>
      </div>
    </header>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof FolderOpen;
  label: string;
}) {
  return (
    <Link href={href} className="secondary-button normal-case no-underline">
      <Icon aria-hidden="true" size={15} />
      {label}
    </Link>
  );
}
