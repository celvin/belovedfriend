import { useState } from "react";
import { useListMessages, useGetMessageStats, useUpdateMessage, useDeleteMessage, getListMessagesQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Play, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useTenantSlug } from "@/lib/tenant";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import type { Message } from "@workspace/api-client-react";
import { useT } from "@/components/language-provider";

type FilterType = "all" | "card" | "video" | "link";

export default function Wall() {
  const { t } = useT();
  const slug = useTenantSlug() ?? "";
  const [filter, setFilter] = useState<FilterType>("all");
  const { data: messages, isLoading } = useListMessages(slug, {
    type: filter !== "all" ? filter : undefined,
  });
  const { data: stats } = useGetMessageStats(slug);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  // Edit state
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editAuthorName, setEditAuthorName] = useState("");
  const [editRelationship, setEditRelationship] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editUrlError, setEditUrlError] = useState<string | null>(null);

  // Hooks called once at top level — not inside map()
  const updateMutation = useUpdateMessage();
  const deleteMutation = useDeleteMessage();

  function openEdit(msg: Message, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setEditingMsg(msg);
    setEditAuthorName(msg.authorName);
    setEditRelationship(msg.relationship ?? "");
    setEditLocation(msg.location ?? "");
    setEditBody(msg.type === "card" ? (msg.card?.body as string | undefined ?? "") : (msg.body ?? ""));
    setEditUrl(msg.url ?? "");
  }

  function handleDelete(msg: Message, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm(t("wall.confirmDelete"))) return;
    deleteMutation.mutate(
      { slug, id: msg.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(slug) });
        },
      }
    );
  }

  function handleSave() {
    if (!editingMsg) return;
    setEditUrlError(null);

    const trimmedName = editAuthorName.trim();
    const trimmedUrl = editUrl.trim();

    if (editingMsg.type === "link" && !trimmedUrl) {
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
      editingMsg.type === "card"
        ? {
            ...baseFields,
            card: { ...editingMsg.card, body: editBody },
          }
        : editingMsg.type === "link"
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
      { slug, id: editingMsg.id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(slug) });
          setEditingMsg(null);
        },
      }
    );
  }

  function isAuthor(msg: Message) {
    return msg.userId != null && msg.userId === user?.id;
  }

  return (
    <div className="flex-1 bg-background/50 pb-24">
      <div className="bg-card border-b border-border/40 py-10 md:py-16 px-4 text-center">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif mb-4 md:mb-6">{t("wall.heading")}</h1>
          {stats && (
            <p className="text-base md:text-lg text-muted-foreground font-serif italic mb-6 md:mb-8">
              {t("wall.count", { count: stats.total })}{" "}{t("wall.statsFrom", { count: stats.countries })}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
              className="rounded-full font-serif md:h-10 md:px-5"
            >
              {t("wall.filterAll")}
            </Button>
            <Button
              variant={filter === "card" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("card")}
              className="rounded-full font-serif md:h-10 md:px-5"
            >
              {t("wall.filterCards")}
            </Button>
            <Button
              variant={filter === "video" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("video")}
              className="rounded-full font-serif md:h-10 md:px-5"
            >
              {t("wall.filterVideos")}
            </Button>
            <Button
              variant={filter === "link" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("link")}
              className="rounded-full font-serif md:h-10 md:px-5"
            >
              {t("wall.filterLinks")}
            </Button>
          </div>

          <div className="mt-6">
            <Link href={`/${slug}/map`}>
              <Button variant="ghost" size="sm" className="font-serif text-muted-foreground hover:text-foreground">
                {t("wall.viewMemoryMap")}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-muted/20 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : messages?.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-xl text-muted-foreground font-serif italic mb-6">
              {t("wall.emptyState")}
            </p>
            <Link href={`/${slug}/compose`}>
              <Button className="font-serif rounded-full px-8">{t("wall.emptyStateCta")}</Button>
            </Link>
          </div>
        ) : (
          <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
            {messages?.map((msg, idx) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.05, 0.5) }}
                className="break-inside-avoid mb-6"
              >
                {msg.type === "video" ? (
                  <div className="relative">
                    <div
                      className="bg-black/90 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow relative aspect-[3/4] group cursor-pointer"
                      onClick={() => setPlayingVideo(msg.videoPath!)}
                    >
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 group-hover:bg-white/30 transition-all">
                          <Play className="w-6 h-6 text-white ml-1" />
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                      <div className="absolute bottom-0 left-0 right-0 p-6 z-20 text-white">
                        <h3 className="font-serif text-xl mb-1">{msg.authorName}</h3>
                        <p className="text-sm text-white/70">{msg.relationship}</p>
                      </div>
                    </div>
                    {isAuthor(msg) && (
                      <div className="absolute bottom-4 right-4 z-30 flex gap-1 bg-black/30 rounded-lg p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-white hover:text-white hover:bg-white/20"
                          onClick={(e) => openEdit(msg, e)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-white hover:text-red-400 hover:bg-white/20"
                          onClick={(e) => handleDelete(msg, e)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : msg.type === "link" ? (
                  <div className="relative">
                    <a
                      href={msg.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border border-border/20 bg-card group"
                    >
                      <div className="p-8 flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-serif text-lg font-medium group-hover:text-primary transition-colors">
                            {msg.authorName}
                          </h3>
                          <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 group-hover:text-primary transition-colors" />
                        </div>
                        {msg.body && (
                          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-4 font-serif">
                            {msg.body}
                          </p>
                        )}
                        {msg.url && (
                          <p className="text-xs text-primary/60 truncate mt-auto font-mono">
                            {msg.url}
                          </p>
                        )}
                      </div>
                    </a>
                    {isAuthor(msg) && (
                      <div className="absolute bottom-4 right-4 z-30 flex gap-1 bg-background/80 rounded-lg p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => openEdit(msg, e)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:text-red-500"
                          onClick={(e) => handleDelete(msg, e)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <Link href={`/${slug}/tribute/${msg.id}`}>
                      <div
                        className="rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border border-border/20 group"
                        style={{
                          background: msg.card?.background || "var(--card)",
                          color: msg.card?.accent || "inherit",
                        }}
                      >
                        {msg.photoPath && (
                          <div className="w-full aspect-square overflow-hidden bg-black/5">
                            <img
                              src={`/api${msg.photoPath}`}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="p-8 flex flex-col gap-6">
                          <p
                            className="text-lg leading-relaxed opacity-90 line-clamp-6"
                            style={{
                              fontFamily:
                                msg.card?.font === "serif"
                                  ? "var(--font-serif)"
                                  : msg.card?.font === "handwritten"
                                  ? "var(--font-handwriting)"
                                  : "var(--font-sans)",
                            }}
                          >
                            {msg.card?.body || msg.body}
                          </p>

                          <div className="mt-auto pt-6 border-t border-current/10">
                            <h3 className="font-serif font-medium">{msg.authorName}</h3>
                            <p className="text-sm opacity-70 mt-1">{msg.relationship}</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                    {isAuthor(msg) && (
                      <div className="absolute bottom-4 right-4 z-30 flex gap-1 bg-background/80 rounded-lg p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => openEdit(msg, e)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:text-red-500"
                          onClick={(e) => handleDelete(msg, e)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Video player dialog */}
      <Dialog open={!!playingVideo} onOpenChange={(open) => !open && setPlayingVideo(null)}>
        <DialogContent className="max-w-4xl w-full p-0 bg-black border-none overflow-hidden h-[80vh] flex items-center justify-center">
          {playingVideo && (
            <video
              src={`/api${playingVideo}`}
              controls
              autoPlay
              className="max-w-full max-h-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingMsg} onOpenChange={(open) => !open && setEditingMsg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("wall.editDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-author-name">{t("wall.editLabelName")}</Label>
              <Input
                id="edit-author-name"
                value={editAuthorName}
                onChange={(e) => setEditAuthorName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-relationship">{t("wall.editLabelRelationship")}</Label>
              <Input
                id="edit-relationship"
                value={editRelationship}
                onChange={(e) => setEditRelationship(e.target.value)}
                placeholder={t("wall.editPlaceholderRelationship")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-location">{t("wall.editLabelLocation")}</Label>
              <Input
                id="edit-location"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder={t("wall.editPlaceholderLocation")}
              />
            </div>
            {editingMsg?.type === "card" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-body">{t("wall.editLabelMessage")}</Label>
                <Textarea
                  id="edit-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={4}
                />
              </div>
            )}
            {editingMsg?.type === "video" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-body">{t("wall.editLabelCaption")}</Label>
                <Textarea
                  id="edit-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            {editingMsg?.type === "link" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-body">{t("wall.editLabelDescription")}</Label>
                  <Textarea
                    id="edit-body"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-url">{t("wall.editLabelUrl")}</Label>
                  <Input
                    id="edit-url"
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
            <Button variant="outline" onClick={() => setEditingMsg(null)}>
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
