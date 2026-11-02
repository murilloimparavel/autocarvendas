import { Space_Grotesk } from "next/font/google"
import { cn } from "@/lib/utils"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
});

const OpenfrontCTA = () => {
  return (
    <a
      href="https://www.openship.org"
      target="_blank"
      rel="noreferrer"
      className="group inline-flex min-h-11 items-center"
    >
      <span className="flex gap-x-2 items-center bg-white border border-transparent ring-1 ring-foreground/5 rounded-md px-2.5 py-0.5 shadow group-hover:bg-white/90 transition-colors">
        <span className="text-muted-foreground font-medium text-xs uppercase">Powered By</span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 bg-[#3b82f6] rounded-[1px]"/>
          <span className={cn(spaceGrotesk.className, "text-sm font-semibold tracking-tight text-zinc-700 mb-0.5")}>
            open<span className="font-normal">front</span>
          </span>
        </span>
      </span>
    </a>
  );
}

export default OpenfrontCTA
