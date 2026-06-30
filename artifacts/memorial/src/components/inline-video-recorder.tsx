import { useEffect, useRef, useState } from "react";
import {
  useCreateMessage,
  useGetCurrentUser,
  MessageInputType,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Square, RefreshCcw, Video as VideoIcon } from "lucide-react";
import { uploadFile } from "@/lib/upload";
import { useT } from "@/components/language-provider";

const MAX_VIDEO_BYTES = 18 * 1024 * 1024; // 18 MB

interface Props {
  slug: string;
  defaultLocation?: string;
  contextLabel?: string;
  /** Attach the video to a reach-map marker so it shows in that marker's memories. */
  nodeId?: number;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function InlineVideoRecorder({ slug, defaultLocation = "", contextLabel, nodeId, onSaved, onCancel }: Props) {
  const { t } = useT();
  const { data: currentUser, isLoading: authLoading } = useGetCurrentUser();
  const isAuthenticated = currentUser?.authenticated ?? false;

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [authorName, setAuthorName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [locationInput, setLocationInput] = useState(defaultLocation);
  const [busy, setBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const createMessage = useCreateMessage();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("recorder.cameraUnavailableTitle"),
        description: t("recorder.cameraUnavailableDesc"),
      });
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (authLoading) {
    return <div className="text-sm text-muted-foreground italic font-serif p-2">{t("recorder.preparing")}</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2 text-foreground/80">
          <VideoIcon size={14} className="text-primary" />
          <span className="font-medium">{t("recorder.signInToRecord")}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("recorder.signInBody")}
        </p>
        <div className="flex gap-2">
          <Link href={`/sign-in?slug=${slug}&intent=compose`} className="text-xs font-medium text-primary hover:underline">
            {t("recorder.signInLink")}
          </Link>
          {onCancel && (
            <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground ml-auto">
              {t("recorder.cancel")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: "video/webm" });
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = URL.createObjectURL(blob);
      }
    };
    mr.start();
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        if (prev >= 180) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    }
  };

  const reset = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
    startCamera();
  };

  const handleSave = async () => {
    if (!recordedBlob || !authorName.trim()) return;
    if (busy) return;

    if (recordedBlob.size > MAX_VIDEO_BYTES) {
      toast({
        variant: "destructive",
        title: t("recorder.fileTooLargeTitle"),
        description: t("recorder.fileTooLargeDesc"),
      });
      return;
    }

    setBusy(true);
    try {
      const objectPath = await uploadFile(recordedBlob, "video/webm");
      await createMessage.mutateAsync({
        slug,
        data: {
          type: MessageInputType.video,
          videoPath: objectPath,
          authorName: authorName.trim(),
          relationship: relationship.trim() || undefined,
          location: locationInput.trim() || undefined,
          ...(nodeId != null ? { nodeId } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(slug) });
      toast({ title: t("recorder.toastSavedTitle"), description: t("recorder.toastSavedDescInline") });
      onSaved?.();
    } catch {
      toast({
        variant: "destructive",
        title: t("recorder.couldntSaveTitle"),
        description: t("recorder.couldntSaveDesc"),
      });
    } finally {
      setBusy(false);
    }
  };

  const isSaving = busy || createMessage.isPending;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      {contextLabel && (
        <div className="text-[10px] tracking-widest uppercase text-muted-foreground">
          {t("recorder.forContext", { contextLabel })}
        </div>
      )}
      <div className="aspect-video bg-black rounded-lg overflow-hidden relative ring-1 ring-border/30">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={!recordedBlob}
          controls={!!recordedBlob}
          className="w-full h-full object-cover"
        />
        {!recordedBlob && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center items-center gap-3 z-10">
            <div className="absolute left-2 text-white font-mono text-[10px] bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-md">
              {fmt(recordingTime)} {t("recorder.maxDuration")}
            </div>
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                aria-label={t("recorder.startRecording")}
                className="w-10 h-10 bg-red-500 rounded-full border-[3px] border-white/80 hover:scale-105 transition-transform flex items-center justify-center shadow-lg"
              >
                <div className="w-3 h-3 bg-white rounded-full" />
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                aria-label={t("recorder.stopRecording")}
                className="w-10 h-10 bg-white/20 rounded-full border-[3px] border-white/80 hover:scale-105 transition-transform flex items-center justify-center backdrop-blur-md"
              >
                <Square className="w-3.5 h-3.5 text-white fill-white" />
              </button>
            )}
          </div>
        )}
        {isRecording && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
        )}
      </div>

      {recordedBlob && (
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          disabled={isSaving}
          className="w-full text-xs font-serif"
        >
          <RefreshCcw className="w-3 h-3 mr-1.5" /> {t("recorder.reRecord")}
        </Button>
      )}

      <div className="space-y-2">
        <Input
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder={t("recorder.authorNamePlaceholderShort")}
          className="h-9 text-sm bg-background/60"
          disabled={isSaving}
        />
        <Input
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          placeholder={t("recorder.relationshipOptionalPlaceholder")}
          className="h-9 text-sm bg-background/60"
          disabled={isSaving}
        />
        <Input
          value={locationInput}
          onChange={(e) => setLocationInput(e.target.value)}
          placeholder={t("recorder.locationPlaceholder")}
          className="h-9 text-sm bg-background/60"
          disabled={isSaving}
        />
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving} className="text-xs">
            {t("recorder.cancel")}
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={!recordedBlob || !authorName.trim() || isSaving}
          size="sm"
          className="flex-1 text-xs font-serif"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
          {isSaving ? t("recorder.saving") : t("recorder.saveButton")}
        </Button>
      </div>
    </div>
  );
}
