import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2, Minimize2, X } from "lucide-react";
import { useT } from "@/components/language-provider";

interface Props {
  playing: boolean;
  muted: boolean;
  visible: boolean;
  isFullscreen: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onMute: () => void;
  onFullscreen: () => void;
  onExit: () => void;
}

function Ctrl({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

export function PresentationControls({ playing, muted, visible, isFullscreen, onToggle, onPrev, onNext, onMute, onFullscreen, onExit }: Props) {
  const { t } = useT();
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/50 px-3 py-2 backdrop-blur-md"
        >
          <Ctrl onClick={onPrev} label={t("present.prevScene")}>
            <SkipBack size={18} />
          </Ctrl>
          <Ctrl onClick={onToggle} label={playing ? t("present.pause") : t("present.play")}>
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </Ctrl>
          <Ctrl onClick={onNext} label={t("present.nextScene")}>
            <SkipForward size={18} />
          </Ctrl>
          <div className="mx-1 h-5 w-px bg-white/15" />
          <Ctrl onClick={onMute} label={muted ? t("present.unmute") : t("present.mute")}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </Ctrl>
          <Ctrl onClick={onFullscreen} label={isFullscreen ? t("present.exitFullscreen") : t("present.fullscreen")}>
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </Ctrl>
          <Ctrl onClick={onExit} label={t("present.exitPresentation")}>
            <X size={18} />
          </Ctrl>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
