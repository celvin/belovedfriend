import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useRequestUploadUrl, useCreateMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, Square, RefreshCcw } from "lucide-react";
import { MessageInputType } from "@workspace/api-client-react";

export function VideoRecorder() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const [authorName, setAuthorName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [locationInput, setLocationInput] = useState("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const requestUpload = useRequestUploadUrl();
  const createMessage = useCreateMessage();

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Camera Error", description: "Could not access camera. Please check permissions." });
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startRecording = () => {
    if (!stream) return;
    
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorderRef.current = mediaRecorder;
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedBlob(blob);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = URL.createObjectURL(blob);
      }
    };

    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);
    
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= 180) { // 3 minutes max
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
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    }
  };

  const resetRecording = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
    startCamera();
  };

  const handleSave = async () => {
    if (!recordedBlob || !authorName) return;
    
    try {
      // 1. Get upload URL
      const { uploadURL, objectPath } = await requestUpload.mutateAsync({
        data: { name: `video-${Date.now()}.webm`, contentType: 'video/webm', size: recordedBlob.size }
      });
      
      // 2. Upload file
      await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/webm' },
        body: recordedBlob
      });
      
      // 3. Create message record
      await createMessage.mutateAsync({
        data: {
          type: MessageInputType.video,
          videoPath: objectPath,
          authorName,
          relationship,
          location: locationInput
        }
      });
      
      toast({ title: "Tribute saved", description: "Your video has been added to the wall." });
      setLocation("/wall");
      
    } catch (err) {
      toast({ variant: "destructive", title: "Upload Failed", description: "There was an error saving your tribute." });
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isSaving = requestUpload.isPending || createMessage.isPending;

  return (
    <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-16">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-serif mb-2">Record Video</h2>
          <p className="text-muted-foreground font-serif italic">A quiet space to speak from the heart.</p>
        </div>
        
        <div className="aspect-video bg-black rounded-2xl overflow-hidden relative shadow-lg ring-1 ring-border/20">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted={!recordedBlob} 
            controls={!!recordedBlob}
            className="w-full h-full object-cover"
          />
          
          {!recordedBlob && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-4 z-10">
              <div className="absolute left-6 text-white font-mono text-sm bg-black/50 px-3 py-1 rounded-full backdrop-blur-md">
                {formatTime(recordingTime)} / 3:00
              </div>
              
              {!isRecording ? (
                <button 
                  onClick={startRecording}
                  className="w-14 h-14 bg-red-500 rounded-full border-4 border-white/80 hover:scale-105 transition-transform flex items-center justify-center shadow-lg"
                >
                  <div className="w-4 h-4 bg-white rounded-full" />
                </button>
              ) : (
                <button 
                  onClick={stopRecording}
                  className="w-14 h-14 bg-white/20 rounded-full border-4 border-white/80 hover:scale-105 transition-transform flex items-center justify-center backdrop-blur-md"
                >
                  <Square className="w-5 h-5 text-white fill-white" />
                </button>
              )}
            </div>
          )}
          
          {isRecording && (
            <div className="absolute top-4 right-4 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          )}
        </div>
        
        {recordedBlob && (
          <Button variant="outline" onClick={resetRecording} className="w-full font-serif" disabled={isSaving}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            Re-record
          </Button>
        )}
      </div>

      <div className="space-y-8 py-4">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">Your Name <span className="text-destructive">*</span></label>
            <Input 
              value={authorName} 
              onChange={e => setAuthorName(e.target.value)} 
              placeholder="How would you like to be remembered?"
              className="bg-background/50 h-12"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">Relationship</label>
            <Input 
              value={relationship} 
              onChange={e => setRelationship(e.target.value)} 
              placeholder="e.g. Colleague, Friend, Family"
              className="bg-background/50 h-12"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">Location</label>
            <Input 
              value={locationInput} 
              onChange={e => setLocationInput(e.target.value)} 
              placeholder="e.g. San Diego, CA"
              className="bg-background/50 h-12"
            />
          </div>
        </div>

        <Button 
          onClick={handleSave} 
          disabled={!recordedBlob || !authorName || isSaving}
          className="w-full h-14 text-lg font-serif rounded-xl shadow-md hover:shadow-lg transition-all"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
          {isSaving ? "Saving Tribute..." : "Save Tribute"}
        </Button>
      </div>
    </div>
  );
}
