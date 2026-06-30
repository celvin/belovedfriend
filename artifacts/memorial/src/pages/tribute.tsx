import { useState } from "react";
import { useGetMessage, useUpdateMessage, useDeleteMessage, getGetMessageQueryKey, getListMessagesQueryKey } from "@workspace/api-client-react";
import { useParams, Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Linkify } from "@/lib/linkify";
import { format } from "date-fns";
import { useTenantSlug } from "@/lib/tenant";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/components/language-provider";

export default function Tribute() {
  const { t } = useT();
  const slug = useTenantSlug() ?? "";
  const { id } = useParams<{ id: string }>();
  const { data: message, isLoading, error } = useGetMessage(slug, Number(id));
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const updateMutation = useUpdateMessage();
  const deleteMutation = useDeleteMessage();

  const [editOpen, setEditOpen] = useState(false);
  const [editAuthorName, setEditAuthorName] = useState("");
  const [editRelationship, setEditRelationship] = useState("");
  const [editLocation, setEditLocationValue] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editUrlError, setEditUrlError] = useState<string | null>(null);

  const isAuthor =
    message != null &&
    message.userId != null &&
    message.userId === user?.id;

  function openEdit() {
    if (!message) return;
    setEditAuthorName(message.authorName);
    setEditRelationship(message.relationship ?? "");
    setEditLocationValue(message.location ?? "");
    setEditBody(
      message.type === "card"
        ? (message.card?.body as string | undefined ?? "")
        : (message.body ?? "")
    );
    setEditUrl(message.url ?? "");
    setEditOpen(true);
  }

  function handleDelete() {
    if (!message) return;
    if (!window.confirm(t("wall.confirmDelete"))) return;
    deleteMutation.mutate(
      { slug, id: Number(id) },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(slug) });
          setLocation(`/${slug}/wall`);
        },
      }
    );
  }

  function handleSave() {
    if (!message) return;
    setEditUrlError(null);

    const trimmedName = editAuthorName.trim();
    const trimmedUrl = editUrl.trim();

    if (message.type === "link" && !trimmedUrl) {
      setEditUrlError(t("wall.urlRequired"));
      return;
    }

    const baseFields: {
      authorName?: string;
      relationship: string | null;
      location: string | null;
    } = {
      relationship: editRelationship.trim() || null,
      location: editLocation.trim() || null,
    };
    if (trimmedName.length > 0) baseFields.authorName = trimmedName;

    const data =
      message.type === "card"
        ? {
            ...baseFields,
            card: { ...message.card, body: editBody },
          }
        : message.type === "link"
        ? {
            ...baseFields,
            body: editBody.trim() || null,
            url: trimmedUrl,
          }
        : {
            ...baseFields,
            body: editBody.trim() || null,
          };

    updateMutation.mutate(
      { slug, id: Number(id), data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetMessageQueryKey(slug, Number(id)),
          });
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(slug) });
          setEditOpen(false);
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="font-serif italic text-muted-foreground">{t("tribute.loading")}</div>
      </div>
    );
  }

  if (error || !message) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <h2 className="text-2xl font-serif mb-4">{t("tribute.notFound")}</h2>
        <Link href={`/${slug}/wall`}>
          <Button variant="outline">{t("tribute.returnToWall")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-muted/10 py-12 px-4">
      <div className="container max-w-4xl mx-auto">
        <Link href={`/${slug}/wall`} className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("tribute.backToWall")}
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/40 shadow-xl rounded-2xl overflow-hidden"
        >
          {message.type === "video" && message.videoPath ? (
            <div className="aspect-video bg-black relative">
              <video
                src={`/api${message.videoPath}`}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          ) : message.type === "card" && message.card ? (
            <div
              className="p-12 md:p-24 flex flex-col min-h-[60vh] relative"
              style={{
                background: message.card.background || "var(--card)",
                color: message.card.accent || "inherit",
                fontFamily:
                  message.card.font === "serif"
                    ? "var(--font-serif)"
                    : message.card.font === "handwritten"
                    ? "var(--font-handwriting)"
                    : "var(--font-sans)",
              }}
            >
              {message.photoPath && (
                <div className="mb-12 flex justify-center">
                  <img
                    src={`/api${message.photoPath}`}
                    alt={t("tribute.photoAlt")}
                    className="max-h-96 object-contain rounded-lg shadow-md"
                  />
                </div>
              )}

              <div
                className={`flex-1 flex flex-col ${
                  message.card.layout === "top"
                    ? "justify-start text-left"
                    : message.card.layout === "bottom"
                    ? "justify-end text-left"
                    : "justify-center text-center"
                }`}
              >
                {message.card.title && (
                  <h2 className="text-4xl md:text-5xl font-serif mb-8">{message.card.title}</h2>
                )}

                <p className="text-xl md:text-2xl leading-relaxed whitespace-pre-wrap mb-12 opacity-90">
                  <Linkify text={message.card.body || message.body} linkClassName="underline underline-offset-2 hover:no-underline break-words" />
                </p>

                {message.card.signature && (
                  <div className="text-2xl font-handwriting mt-auto opacity-80">
                    — {message.card.signature}
                  </div>
                )}
              </div>
            </div>
          ) : message.type === "link" && message.url ? (
            <div className="p-12 md:p-24 flex flex-col items-center justify-center min-h-[30vh] gap-6">
              <p className="font-serif text-lg text-muted-foreground italic text-center max-w-xl whitespace-pre-wrap">
                <Linkify text={message.body} />
              </p>
              <a
                href={message.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline font-serif text-xl break-all"
              >
                {message.url}
              </a>
            </div>
          ) : null}

          <div className="p-8 bg-background border-t border-border/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-serif text-xl">{message.authorName}</h3>
              {(message.relationship || message.location) && (
                <p className="text-muted-foreground text-sm mt-1">
                  {[message.relationship, message.location].filter(Boolean).join(" • ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground italic">
                {format(new Date(message.createdAt), "MMMM d, yyyy")}
              </div>
              {isAuthor && (
                <div className="flex gap-1 bg-background/80 rounded-lg p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={openEdit}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:text-red-500"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("wall.editDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tribute-author-name">{t("wall.editLabelName")}</Label>
              <Input
                id="tribute-author-name"
                value={editAuthorName}
                onChange={(e) => setEditAuthorName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tribute-relationship">{t("wall.editLabelRelationship")}</Label>
              <Input
                id="tribute-relationship"
                value={editRelationship}
                onChange={(e) => setEditRelationship(e.target.value)}
                placeholder={t("wall.editPlaceholderRelationship")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tribute-location">{t("wall.editLabelLocation")}</Label>
              <Input
                id="tribute-location"
                value={editLocation}
                onChange={(e) => setEditLocationValue(e.target.value)}
                placeholder={t("wall.editPlaceholderLocation")}
              />
            </div>
            {message.type === "card" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tribute-body">{t("wall.editLabelMessage")}</Label>
                <Textarea
                  id="tribute-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={4}
                />
              </div>
            )}
            {message.type === "video" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tribute-body">{t("wall.editLabelCaption")}</Label>
                <Textarea
                  id="tribute-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            {message.type === "link" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tribute-body">{t("wall.editLabelDescription")}</Label>
                  <Textarea
                    id="tribute-body"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tribute-url">{t("wall.editLabelUrl")}</Label>
                  <Input
                    id="tribute-url"
                    value={editUrl}
                    onChange={(e) => { setEditUrl(e.target.value); setEditUrlError(null); }}
                    placeholder="https://"
                  />
                  {editUrlError && <p className="text-xs text-destructive">{editUrlError}</p>}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("wall.editCancel")}
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t("wall.editSaving") : t("wall.editSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
