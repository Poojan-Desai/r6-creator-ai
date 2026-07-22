import { Aperture } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl border border-[#b8ff2c]/25 bg-[#b8ff2c]/10 text-[#b8ff2c] shadow-[0_0_28px_rgba(184,255,44,0.08)]">
        <Aperture aria-hidden="true" size={22} strokeWidth={2.4} />
      </span>
      {!compact && (
        <span>
          <span className="font-display block text-xl leading-none font-extrabold tracking-[-0.02em] text-white uppercase">
            R6 Creator
          </span>
          <span className="mt-1 block text-[10px] leading-none font-bold tracking-[0.28em] text-[#b8ff2c] uppercase">
            Local AI Desk
          </span>
        </span>
      )}
    </div>
  );
}
