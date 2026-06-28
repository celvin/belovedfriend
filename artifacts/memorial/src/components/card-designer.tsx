import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useCreateMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ImagePlus, X } from "lucide-react";
import { MessageInputType, CardDesignLayout } from "@workspace/api-client-react";
import { uploadFile } from "@/lib/upload";

const TEMPLATES = {
  candle: { bg: "linear-gradient(135deg, #FFF9EB 0%, #F5E6CC 100%)", accent: "#B47C34" },
  garden: { bg: "linear-gradient(135deg, #F0F4F0 0%, #DCE5DC 100%)", accent: "#4A6B4A" },
  ocean:  { bg: "linear-gradient(135deg, #F0F6F9 0%, #D8E6ED 100%)", accent: "#3B6A82" },
  sunset: { bg: "linear-gradient(135deg, #FFF0E6 0%, #FAD7C8 100%)", accent: "#C46545" },
  stars:  { bg: "linear-gradient(135deg, #1A1F2B 0%, #0F131C 100%)", accent: "#D1D9E6" },
  minimal:{ bg: "#FAFAFA", accent: "#2A2A2A" }
};

const FONTS = [
  { id: "serif", name: "Classic Serif" },
  { id: "sans", name: "Clean Sans" },
  { id: "handwritten", name: "Handwritten" }
];

const LAYOUTS: { id: CardDesignLayout, name: string }[] = [
  { id: "center", name: "Centered" },
  { id: "top", name: "Top Aligned" },
  { id: "bottom", name: "Bottom Aligned" }
];

interface Props {
  slug: string;
  nodeId?: number;
}

export function CardDesigner({ slug, nodeId }: Props) {
  const [template, setTemplate] = useState<keyof typeof TEMPLATES>("minimal");
  const [font, setFont] = useState("serif");
  const [layout, setLayout] = useState<CardDesignLayout>("center");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [signature, setSignature] = useState("");

  const [authorName, setAuthorName] = useState("");
  const [relationship, setRelationship] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createMessage = useCreateMessage();

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!body || !authorName) return;

    try {
      let objectPath: string | null = null;

      if (photoFile) {
        objectPath = await uploadFile(photoFile, photoFile.type);
      }

      await createMessage.mutateAsync({
        slug,
        data: {
          type: MessageInputType.card,
          authorName,
          relationship,
          body,
          photoPath: objectPath,
          card: {
            template,
            background: TEMPLATES[template].bg,
            accent: TEMPLATES[template].accent,
            font,
            title,
            body,
            signature,
            layout,
            photoPath: objectPath
          },
          ...(nodeId != null ? { nodeId } : {}),
        }
      });

      toast({ title: "Tribute saved", description: "Your card has been added to the wall." });
      setLocation(`/${slug}/wall`);

    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to save card." });
    }
  };

  const isSaving = createMessage.isPending;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
      {/* Controls */}
      <div className="space-y-10">
        <div>
          <h2 className="text-3xl font-serif mb-2">Design a Card</h2>
          <p className="text-muted-foreground font-serif italic">Take your time to write something beautiful.</p>
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
            <label className="text-sm font-medium text-foreground/80 uppercase tracking-widest">Theme</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {(Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>).map(t => (
                <button
                  key={t}
                  onClick={() => setTemplate(t)}
                  className={`w-full aspect-square rounded-full border-2 transition-all ${template === t ? 'border-primary scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                  style={{ background: TEMPLATES[t].bg }}
                  title={t}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80 uppercase tracking-widest">Font</label>
              <div className="flex flex-col gap-2">
                {FONTS.map(f => (
                  <Button
                    key={f.id}
                    variant={font === f.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFont(f.id)}
                    className={f.id === 'serif' ? 'font-serif' : f.id === 'handwritten' ? "font-handwriting text-lg" : "font-sans"}
                  >
                    {f.name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80 uppercase tracking-widest">Layout</label>
              <div className="flex flex-col gap-2">
                {LAYOUTS.map(l => (
                  <Button
                    key={l.id}
                    variant={layout === l.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLayout(l.id as CardDesignLayout)}
                    className="font-serif"
                  >
                    {l.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border/40">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Title <span className="text-muted-foreground font-normal">(Optional)</span></label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="A beautiful memory..." className="bg-background/50" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Message <span className="text-destructive">*</span></label>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Share your thoughts..."
                className="min-h-[120px] bg-background/50 resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Sign-off <span className="text-muted-foreground font-normal">(Optional)</span></label>
              <Input value={signature} onChange={e => setSignature(e.target.value)} placeholder="With love," className="bg-background/50" />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border/40">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Your Details</label>
              <div className="grid grid-cols-2 gap-4">
                <Input value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="Your Name *" className="bg-background/50" />
                <Input value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="Relationship" className="bg-background/50" />
              </div>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={!body || !authorName || isSaving}
            className="w-full h-14 text-lg font-serif rounded-xl shadow-md"
          >
            {isSaving && <Loader2 className="w-5 h-5 animate-spin mr-2" />}
            {isSaving ? "Saving..." : "Save Card"}
          </Button>
        </div>
      </div>

      {/* Live Preview */}
      <div className="relative">
        <div className="sticky top-24">
          <label className="text-sm font-medium text-muted-foreground uppercase tracking-widest block mb-4">Live Preview</label>

          <div
            className="w-full aspect-[3/4] md:aspect-auto md:min-h-[600px] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative transition-all duration-500 ease-in-out border border-border/10"
            style={{
              background: TEMPLATES[template].bg,
              color: TEMPLATES[template].accent,
              fontFamily: font === "serif" ? "var(--font-serif)" : font === "handwritten" ? "var(--font-handwriting)" : "var(--font-sans)"
            }}
          >
            {photoPreview ? (
              <div className="relative w-full h-64 shrink-0 group">
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover opacity-90" />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="absolute top-4 right-4 z-10">
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoChange} />
                <Button variant="secondary" size="sm" className="bg-white/50 backdrop-blur-md hover:bg-white/80 text-black shadow-sm" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="w-4 h-4 mr-2" /> Add Photo
                </Button>
              </div>
            )}

            <div className={`flex-1 p-8 md:p-12 flex flex-col overflow-y-auto ${
              layout === 'top' ? 'justify-start text-left' :
              layout === 'bottom' ? 'justify-end text-left' :
              'justify-center text-center'
            }`}>
              {title && <h3 className="text-3xl md:text-4xl font-serif mb-6 opacity-90">{title}</h3>}

              {body ? (
                <p className="text-lg md:text-xl leading-relaxed whitespace-pre-wrap opacity-80">{body}</p>
              ) : (
                <p className="text-lg md:text-xl leading-relaxed opacity-40 italic">Your message will appear here...</p>
              )}

              {signature && (
                <p className="text-2xl font-handwriting mt-8 opacity-70">
                  — {signature}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
