import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMessages,
  useDeleteMessage,
  useCreateMessage,
  useUpdateTenant,
  useListMyTenants,
  useGetTenant,
  useListBlocks,
  useCreateBlock,
  useDeleteBlock,
  getListMessagesQueryKey,
  getGetTenantQueryKey,
  getListMyTenantsQueryKey,
  getListBlocksQueryKey,
} from "@workspace/api-client-react";
import type { TenantUpdatePageConfig } from "@workspace/api-client-react";
import { Trash2, Plus, ExternalLink, ChevronDown, ChevronUp, ShieldOff, ShieldCheck, ArrowUp, ArrowDown, Camera } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTenantSlug } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { uploadFile } from "@/lib/upload";

// ---- PageConfig local types ------------------------------------------------

type SectionKey = "story" | "wall" | "reach";

interface StoryBlock {
  heading: string;
  body: string;
}

interface ReachCallout {
  label: string;
  mode: "value" | "derived";
  value: string;
  derived: string;
}

interface PageSettingsState {
  // theme
  palette: string;
  accent: string;
  font: "serif" | "sans" | "handwritten";
  // hero
  heroPhotoPath: string | null;
  showDates: boolean;
  // story
  storyEnabled: boolean;
  storyBlocks: StoryBlock[];
  // sections
  sectionsOrder: SectionKey[];
  sectionStory: boolean;
  sectionWall: boolean;
  sectionReach: boolean;
  // reachSummary
  reachSummary: ReachCallout[];
  // cta
  primaryLabel: string;
  wallLabel: string;
}

const DERIVED_OPTIONS = [
  { value: "nodeCount", label: "Node count" },
  { value: "placeCount", label: "Place count" },
  { value: "contributorCount", label: "Contributor count" },
  { value: "countryCount", label: "Country count" },
] as const;

function buildPageConfig(settings: PageSettingsState): TenantUpdatePageConfig {
  return {
    version: 1 as const,
    theme: {
      palette: settings.palette,
      accent: settings.accent,
      font: settings.font,
    },
    hero: {
      heroPhotoPath: settings.heroPhotoPath,
      showDates: settings.showDates,
    },
    story: {
      enabled: settings.storyEnabled,
      blocks: settings.storyBlocks.map((b) => ({ heading: b.heading, body: b.body })),
    },
    sections: {
      order: settings.sectionsOrder,
      story: settings.sectionStory,
      wall: settings.sectionWall,
      reach: settings.sectionReach,
    },
    reachSummary: settings.reachSummary.map((r) => {
      if (r.mode === "derived") {
        return { label: r.label, derived: r.derived };
      }
      return { label: r.label, value: r.value };
    }),
    cta: {
      primaryLabel: settings.primaryLabel,
      wallLabel: settings.wallLabel,
    },
  };
}

function buildDefaultSettings(cfg: Record<string, unknown>): PageSettingsState {
  const themeCfg = ((cfg.theme ?? {}) as Record<string, unknown>);
  const heroCfg = ((cfg.hero ?? {}) as Record<string, unknown>);
  const storyCfg = ((cfg.story ?? {}) as Record<string, unknown>);
  const sectionsCfg = ((cfg.sections ?? {}) as Record<string, unknown>);
  const ctaCfg = ((cfg.cta ?? {}) as Record<string, unknown>);
  const reachSummaryCfg = (cfg.reachSummary as Array<Record<string, unknown>> | undefined) ?? [];

  const order = (sectionsCfg.order as string[] | undefined) ?? ["story", "wall", "reach"];
  const validOrder: SectionKey[] = order.filter((k): k is SectionKey => ["story", "wall", "reach"].includes(k));
  if (!validOrder.includes("story")) validOrder.push("story");
  if (!validOrder.includes("wall")) validOrder.push("wall");
  if (!validOrder.includes("reach")) validOrder.push("reach");

  const rawBlocks = (storyCfg.blocks as Array<Record<string, unknown>> | undefined) ?? [];
  const storyBlocks: StoryBlock[] = rawBlocks.map((b) => ({
    heading: (b.heading as string | undefined) ?? "",
    body: (b.body as string | undefined) ?? "",
  }));

  const reachSummary: ReachCallout[] = reachSummaryCfg.map((r) => {
    const hasDerived = r.derived != null;
    return {
      label: (r.label as string | undefined) ?? "",
      mode: hasDerived ? "derived" : "value",
      value: r.value != null ? String(r.value) : "",
      derived: (r.derived as string | undefined) ?? "nodeCount",
    };
  });

  return {
    palette: (themeCfg.palette as string | undefined) ?? "warm",
    accent: (themeCfg.accent as string | undefined) ?? "#7a4a1f",
    font: ((themeCfg.font as string | undefined) === "sans" ? "sans" : (themeCfg.font as string | undefined) === "handwritten" ? "handwritten" : "serif"),
    heroPhotoPath: (heroCfg.heroPhotoPath as string | null | undefined) ?? null,
    showDates: heroCfg.showDates !== false,
    storyEnabled: storyCfg.enabled !== false,
    storyBlocks,
    sectionsOrder: validOrder,
    sectionStory: sectionsCfg.story !== false,
    sectionWall: sectionsCfg.wall !== false,
    sectionReach: sectionsCfg.reach !== false,
    reachSummary,
    primaryLabel: (ctaCfg.primaryLabel as string | undefined) ?? "Leave a tribute",
    wallLabel: (ctaCfg.wallLabel as string | undefined) ?? "Read tributes",
  };
}

export default function Manage() {
  const slug = useTenantSlug() ?? "";
  const { isAdmin, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { data: mine, isLoading: mineLoading } = useListMyTenants({
    query: { enabled: isAuthenticated, queryKey: getListMyTenantsQueryKey() },
  });
  const { data: tenant, isLoading: tenantLoading } = useGetTenant(slug, {
    query: { enabled: !!slug, queryKey: getGetTenantQueryKey(slug) },
  });

  const isOwner = isAdmin || (mine ?? []).some((t) => t.slug === slug);

  const queryClient = useQueryClient();

  // Tributes list
  const { data: messages, isLoading: messagesLoading } = useListMessages(
    slug,
    { type: "all", limit: 200 },
    { query: { enabled: !!slug && isOwner, queryKey: getListMessagesQueryKey(slug, { type: "all", limit: 200 }) } },
  );

  const deleteMessage = useDeleteMessage();

  // Add link form state
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const createMessage = useCreateMessage();

  // Edit tenant meta state
  const [showEditMeta, setShowEditMeta] = useState(false);
  const [metaFriendName, setMetaFriendName] = useState("");
  const [metaTagline, setMetaTagline] = useState("");
  const [metaBirthYear, setMetaBirthYear] = useState("");
  const [metaDeathYear, setMetaDeathYear] = useState("");
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaSuccess, setMetaSuccess] = useState(false);

  const updateTenant = useUpdateTenant();

  // Blocks
  const { data: blocks, isLoading: blocksLoading } = useListBlocks(slug, {
    query: {
      enabled: !!slug && isOwner,
      queryKey: getListBlocksQueryKey(slug),
    },
  });

  const createBlock = useCreateBlock();
  const deleteBlock = useDeleteBlock();

  // Page settings state
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [pageSettings, setPageSettings] = useState<PageSettingsState | null>(null);
  const [pageSettingsError, setPageSettingsError] = useState<string | null>(null);
  const [pageSettingsSaved, setPageSettingsSaved] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  const [heroSaved, setHeroSaved] = useState(false);
  const [heroError, setHeroError] = useState<string | null>(null);
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  // Eagerly initialize pageSettings when tenant data arrives (needed for top photo section)
  useEffect(() => {
    if (tenant && pageSettings === null) {
      const cfg = (tenant.pageConfig ?? {}) as Record<string, unknown>;
      setPageSettings(buildDefaultSettings(cfg));
    }
  }, [tenant, pageSettings]);

  function handleOpenPageSettings() {
    const cfg = (tenant?.pageConfig ?? {}) as Record<string, unknown>;
    setPageSettings(buildDefaultSettings(cfg));
    setPageSettingsError(null);
    setPageSettingsSaved(false);
    setShowPageSettings(true);
  }

  function handleTogglePageSettings() {
    if (showPageSettings) {
      setShowPageSettings(false);
    } else {
      handleOpenPageSettings();
    }
  }

  async function handleHeroPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pageSettings) return;
    setHeroUploading(true);
    setPageSettingsError(null);
    setHeroError(null);
    setHeroSaved(false);
    try {
      const objectPath = await uploadFile(file, file.type);
      setPageSettings((prev) => prev ? { ...prev, heroPhotoPath: objectPath } : prev);
      // Auto-save: assemble config with the new heroPhotoPath (use objectPath directly, not state)
      const updatedSettings = { ...pageSettings, heroPhotoPath: objectPath };
      updateTenant.mutate(
        { slug, data: { pageConfig: buildPageConfig(updatedSettings) } },
        {
          onSuccess: () => {
            setHeroSaved(true);
            queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(slug) });
            setTimeout(() => setHeroSaved(false), 3000);
          },
          onError: () => {
            setHeroError("Photo uploaded but failed to save. Try saving page settings.");
          },
        },
      );
    } catch {
      setHeroError("Failed to upload photo.");
    } finally {
      setHeroUploading(false);
      if (heroFileInputRef.current) heroFileInputRef.current.value = "";
    }
  }

  function handleRemoveHeroPhoto() {
    if (!pageSettings) return;
    setHeroSaved(false);
    setHeroError(null);
    const newPath = null;
    setPageSettings((prev) => prev ? { ...prev, heroPhotoPath: newPath } : prev);
    const updatedSettings = { ...pageSettings, heroPhotoPath: newPath };
    updateTenant.mutate(
      { slug, data: { pageConfig: buildPageConfig(updatedSettings) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(slug) });
        },
        onError: () => {
          setHeroError("Failed to remove photo. Try again.");
        },
      },
    );
  }

  function handleSavePageSettings() {
    if (!pageSettings) return;
    setPageSettingsError(null);
    setPageSettingsSaved(false);

    updateTenant.mutate(
      { slug, data: { pageConfig: buildPageConfig(pageSettings) } },
      {
        onSuccess: () => {
          setPageSettingsSaved(true);
          queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(slug) });
        },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          if (status === 422) {
            setPageSettingsError("Invalid page settings — please review.");
          } else {
            setPageSettingsError("Failed to save page settings.");
          }
        },
      },
    );
  }

  // Section ordering helpers
  function moveSection(index: number, direction: -1 | 1) {
    if (!pageSettings) return;
    const newOrder = [...pageSettings.sectionsOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setPageSettings((prev) => prev ? { ...prev, sectionsOrder: newOrder } : prev);
  }

  // Story block helpers
  function addStoryBlock() {
    if (!pageSettings) return;
    setPageSettings((prev) => prev ? {
      ...prev,
      storyBlocks: [...prev.storyBlocks, { heading: "", body: "" }],
    } : prev);
  }

  function updateStoryBlock(index: number, field: "heading" | "body", val: string) {
    if (!pageSettings) return;
    const newBlocks = [...pageSettings.storyBlocks];
    newBlocks[index] = { ...newBlocks[index], [field]: val };
    setPageSettings((prev) => prev ? { ...prev, storyBlocks: newBlocks } : prev);
  }

  function removeStoryBlock(index: number) {
    if (!pageSettings) return;
    setPageSettings((prev) => prev ? {
      ...prev,
      storyBlocks: prev.storyBlocks.filter((_, i) => i !== index),
    } : prev);
  }

  // Reach summary helpers
  function addReachCallout() {
    if (!pageSettings) return;
    setPageSettings((prev) => prev ? {
      ...prev,
      reachSummary: [...prev.reachSummary, { label: "", mode: "derived", value: "", derived: "nodeCount" }],
    } : prev);
  }

  function updateReachCallout(index: number, patch: Partial<ReachCallout>) {
    if (!pageSettings) return;
    const updated = [...pageSettings.reachSummary];
    updated[index] = { ...updated[index], ...patch };
    setPageSettings((prev) => prev ? { ...prev, reachSummary: updated } : prev);
  }

  function removeReachCallout(index: number) {
    if (!pageSettings) return;
    setPageSettings((prev) => prev ? {
      ...prev,
      reachSummary: prev.reachSummary.filter((_, i) => i !== index),
    } : prev);
  }

  function handleBlock(userId: number) {
    if (!confirm("Block this author? They will no longer be able to post on this page.")) return;
    createBlock.mutate({ slug, data: { userId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey(slug) });
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(slug) });
      },
    });
  }

  function handleUnblock(userId: number) {
    if (!confirm("Unblock this user?")) return;
    deleteBlock.mutate({ slug, userId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey(slug) });
      },
    });
  }

  function handleOpenEditMeta() {
    if (tenant) {
      setMetaFriendName(tenant.friendName ?? "");
      setMetaTagline(tenant.tagline ?? "");
      setMetaBirthYear(tenant.birthYear?.toString() ?? "");
      setMetaDeathYear(tenant.deathYear?.toString() ?? "");
    }
    setMetaError(null);
    setMetaSuccess(false);
    setShowEditMeta(true);
  }

  function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    setMetaError(null);
    setMetaSuccess(false);
    const data: {
      friendName?: string;
      tagline?: string;
      birthYear?: number;
      deathYear?: number;
    } = {};
    if (metaFriendName.trim()) data.friendName = metaFriendName.trim();
    if (metaTagline.trim()) data.tagline = metaTagline.trim();
    if (metaBirthYear.trim()) {
      const y = parseInt(metaBirthYear, 10);
      if (isNaN(y)) { setMetaError("Birth year must be a number"); return; }
      data.birthYear = y;
    }
    if (metaDeathYear.trim()) {
      const y = parseInt(metaDeathYear, 10);
      if (isNaN(y)) { setMetaError("Death year must be a number"); return; }
      data.deathYear = y;
    }
    updateTenant.mutate({ slug, data }, {
      onSuccess: () => {
        setMetaSuccess(true);
        queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(slug) });
      },
      onError: () => setMetaError("Failed to update. Try again."),
    });
  }

  function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (createMessage.isPending) return;
    setLinkError(null);
    if (!linkUrl.trim()) {
      setLinkError("URL is required");
      return;
    }
    createMessage.mutate(
      {
        slug,
        data: {
          type: "link",
          authorName: linkTitle.trim() || "A link",
          body: linkNote.trim() || undefined,
          url: linkUrl.trim(),
        },
      },
      {
        onSuccess: () => {
          setLinkTitle("");
          setLinkUrl("");
          setLinkNote("");
          setShowAddLink(false);
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(slug) });
        },
        onError: () => setLinkError("Failed to add link. Try again."),
      },
    );
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this tribute?")) return;
    deleteMessage.mutate({ slug, id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(slug) });
      },
    });
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
        <h1 className="text-3xl font-serif">Sign in required</h1>
        <p className="text-muted-foreground font-serif italic">
          You must be signed in to manage this page.
        </p>
        <Link href={`/sign-in?slug=${slug}&intent=manage`}>
          <Button variant="outline" className="font-serif rounded-full px-8">
            Sign in
          </Button>
        </Link>
      </div>
    );
  }

  // Loading ownership check — wait for the owned-pages list too, so a
  // legitimate non-admin owner never sees a "Not authorized" flash.
  if (tenantLoading || (isAuthenticated && !isAdmin && mineLoading)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="font-serif italic text-muted-foreground animate-pulse">Loading…</div>
      </div>
    );
  }

  // Not authorized
  if (!isOwner) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
        <h1 className="text-3xl font-serif">Not authorized</h1>
        <p className="text-muted-foreground font-serif italic">
          You are not the owner of this page.
        </p>
        <Link href={`/${slug}`}>
          <Button variant="outline" className="font-serif rounded-full px-8">
            Back to the tribute
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">

      {/* Header */}
      <div className="space-y-2">
        <div className="text-xs tracking-widest uppercase text-muted-foreground">Manage</div>
        <h1 className="text-3xl font-serif">{tenant?.friendName ?? slug}</h1>
        <div className="flex gap-3">
          <Link href={`/${slug}`} className="text-xs text-primary hover:underline">
            View page →
          </Link>
          <Link href={`/${slug}/wall`} className="text-xs text-primary hover:underline">
            Tribute wall →
          </Link>
        </div>
      </div>

      {/* Multi-page switcher (only when user owns more than 1 page) */}
      {!mineLoading && mine && mine.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="page-switcher" className="text-muted-foreground whitespace-nowrap">Switch page:</label>
          <select
            id="page-switcher"
            className="border border-border/60 rounded-md px-2 py-1 text-sm bg-background"
            value={slug}
            onChange={(e) => setLocation(`/${e.target.value}/manage`)}
          >
            {mine.map((t) => (
              <option key={t.slug} value={t.slug}>{t.friendName ?? t.slug}</option>
            ))}
          </select>
        </div>
      )}

      {/* Edit tenant meta */}
      <section className="bg-card border border-border/40 rounded-xl overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition"
          onClick={() => (showEditMeta ? setShowEditMeta(false) : handleOpenEditMeta())}
        >
          <span className="font-serif text-lg">Edit page details</span>
          {showEditMeta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showEditMeta && (
          <form onSubmit={handleSaveMeta} className="px-5 pb-5 space-y-4 border-t border-border/30 pt-4">
            {/* Friend photo */}
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Photo</label>
              {/* Hidden file input — buttons below trigger it */}
              <input
                ref={heroFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleHeroPhotoChange}
                disabled={heroUploading}
              />
              <div className="flex items-center gap-5">
                {pageSettings?.heroPhotoPath ? (
                  <img
                    src={`/api${pageSettings.heroPhotoPath}`}
                    alt="Friend photo"
                    className="h-28 w-28 object-cover rounded-full border border-border/40 shrink-0"
                  />
                ) : (
                  <div className="h-28 w-28 rounded-full bg-muted border border-border/40 flex items-center justify-center shrink-0">
                    <Camera size={32} className="text-muted-foreground/50" />
                  </div>
                )}
                <div className="space-y-2">
                  {heroUploading ? (
                    <p className="text-sm text-muted-foreground animate-pulse">Uploading…</p>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full font-serif"
                      onClick={() => heroFileInputRef.current?.click()}
                      disabled={heroUploading}
                    >
                      {pageSettings?.heroPhotoPath ? "Change photo" : "Upload photo"}
                    </Button>
                  )}
                  {pageSettings?.heroPhotoPath && !heroUploading && (
                    <div>
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline"
                        onClick={handleRemoveHeroPhoto}
                        disabled={updateTenant.isPending}
                      >
                        Remove photo
                      </button>
                    </div>
                  )}
                  {heroSaved && <p className="text-xs text-green-600">Photo saved.</p>}
                  {heroError && <p className="text-xs text-destructive">{heroError}</p>}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Name</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={metaFriendName}
                onChange={e => setMetaFriendName(e.target.value)}
                placeholder="Friend's full name"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Tagline</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={metaTagline}
                onChange={e => setMetaTagline(e.target.value)}
                placeholder="A short tribute tagline"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Birth year</label>
                <input
                  className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                  value={metaBirthYear}
                  onChange={e => setMetaBirthYear(e.target.value)}
                  placeholder="e.g. 1965"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Death year</label>
                <input
                  className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                  value={metaDeathYear}
                  onChange={e => setMetaDeathYear(e.target.value)}
                  placeholder="e.g. 2024"
                />
              </div>
            </div>
            {metaError && <p className="text-xs text-destructive">{metaError}</p>}
            {metaSuccess && <p className="text-xs text-green-600">Saved successfully.</p>}
            <Button
              type="submit"
              disabled={updateTenant.isPending}
              className="rounded-full font-serif"
            >
              {updateTenant.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        )}
      </section>

      {/* Page settings */}
      <section className="bg-card border border-border/40 rounded-xl overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition"
          onClick={handleTogglePageSettings}
        >
          <span className="font-serif text-lg">Page settings</span>
          {showPageSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showPageSettings && pageSettings && (
          <div className="px-5 pb-5 space-y-6 border-t border-border/30 pt-4">

            {/* Theme */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Theme</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Font style</label>
                  <select
                    className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                    value={pageSettings.font}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, font: e.target.value as "serif" | "sans" | "handwritten" } : prev)}
                  >
                    <option value="serif">Serif</option>
                    <option value="sans">Sans</option>
                    <option value="handwritten">Handwritten</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Palette</label>
                  <input
                    className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                    value={pageSettings.palette}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, palette: e.target.value } : prev)}
                    placeholder="e.g. warm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Accent color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 border border-border/60 rounded-md bg-background cursor-pointer p-0.5"
                    value={pageSettings.accent}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, accent: e.target.value } : prev)}
                  />
                  <input
                    className="flex-1 border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                    value={pageSettings.accent}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, accent: e.target.value } : prev)}
                    placeholder="#7a4a1f"
                  />
                </div>
              </div>
            </div>

            {/* Hero */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Hero</h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border border-border/60"
                    checked={pageSettings.showDates}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, showDates: e.target.checked } : prev)}
                  />
                  <span className="text-sm">Show birth / death years</span>
                </label>
              </div>
            </div>

            {/* Story */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Story</h3>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border border-border/60"
                  checked={pageSettings.storyEnabled}
                  onChange={(e) => setPageSettings((prev) => prev ? { ...prev, storyEnabled: e.target.checked } : prev)}
                />
                <span className="text-sm">Enable story section</span>
              </label>
              <div className="space-y-3">
                {pageSettings.storyBlocks.map((block, i) => (
                  <div key={i} className="border border-border/30 rounded-lg p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Block {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeStoryBlock(i)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        aria-label="Remove block"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Heading</label>
                      <input
                        className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                        value={block.heading}
                        onChange={(e) => updateStoryBlock(i, "heading", e.target.value)}
                        placeholder="Section heading"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Body</label>
                      <textarea
                        className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background resize-y"
                        rows={3}
                        value={block.body}
                        onChange={(e) => updateStoryBlock(i, "body", e.target.value)}
                        placeholder="Story text…"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addStoryBlock}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus size={12} /> Add story block
                </button>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Sections</h3>
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border border-border/60"
                    checked={pageSettings.sectionStory}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, sectionStory: e.target.checked } : prev)}
                  />
                  <span className="text-sm">Show story</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border border-border/60"
                    checked={pageSettings.sectionWall}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, sectionWall: e.target.checked } : prev)}
                  />
                  <span className="text-sm">Show tribute wall</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border border-border/60"
                    checked={pageSettings.sectionReach}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, sectionReach: e.target.checked } : prev)}
                  />
                  <span className="text-sm">Show reach network</span>
                </label>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-2">Section order</label>
                <div className="space-y-1">
                  {pageSettings.sectionsOrder.map((key, i) => (
                    <div
                      key={key}
                      className="flex items-center gap-2 border border-border/30 rounded-md px-3 py-2 bg-muted/20 text-sm"
                    >
                      <span className="flex-1 capitalize">{key}</span>
                      <button
                        type="button"
                        onClick={() => moveSection(i, -1)}
                        disabled={i === 0}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(i, 1)}
                        disabled={i === pageSettings.sectionsOrder.length - 1}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reach summary */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Reach summary callouts</h3>
              <div className="space-y-3">
                {pageSettings.reachSummary.map((callout, i) => (
                  <div key={i} className="border border-border/30 rounded-lg p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Callout {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeReachCallout(i)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        aria-label="Remove callout"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Label</label>
                      <input
                        className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                        value={callout.label}
                        onChange={(e) => updateReachCallout(i, { label: e.target.value })}
                        placeholder="e.g. Memories"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Value type</label>
                      <select
                        className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background mb-2"
                        value={callout.mode}
                        onChange={(e) => updateReachCallout(i, { mode: e.target.value as "value" | "derived" })}
                      >
                        <option value="derived">Derived (auto-computed)</option>
                        <option value="value">Fixed value</option>
                      </select>
                      {callout.mode === "derived" ? (
                        <select
                          className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                          value={callout.derived}
                          onChange={(e) => updateReachCallout(i, { derived: e.target.value })}
                        >
                          {DERIVED_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                          value={callout.value}
                          onChange={(e) => updateReachCallout(i, { value: e.target.value })}
                          placeholder="e.g. 42"
                        />
                      )}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addReachCallout}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus size={12} /> Add callout
                </button>
              </div>
            </div>

            {/* CTA */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Call-to-action labels</h3>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Primary button label</label>
                <input
                  className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                  value={pageSettings.primaryLabel}
                  onChange={(e) => setPageSettings((prev) => prev ? { ...prev, primaryLabel: e.target.value } : prev)}
                  placeholder="Leave a tribute"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Wall button label</label>
                <input
                  className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                  value={pageSettings.wallLabel}
                  onChange={(e) => setPageSettings((prev) => prev ? { ...prev, wallLabel: e.target.value } : prev)}
                  placeholder="Read tributes"
                />
              </div>
            </div>

            {/* Save */}
            {pageSettingsError && <p className="text-xs text-destructive">{pageSettingsError}</p>}
            {pageSettingsSaved && <p className="text-xs text-green-600">Page settings saved.</p>}
            <Button
              type="button"
              onClick={handleSavePageSettings}
              disabled={updateTenant.isPending || heroUploading}
              className="rounded-full font-serif"
            >
              {updateTenant.isPending ? "Saving…" : "Save page settings"}
            </Button>
          </div>
        )}
      </section>

      {/* Add a link */}
      <section className="bg-card border border-border/40 rounded-xl overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition"
          onClick={() => setShowAddLink((v) => !v)}
        >
          <span className="font-serif text-lg flex items-center gap-2">
            <Plus size={16} /> Add a link
          </span>
          {showAddLink ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showAddLink && (
          <form onSubmit={handleAddLink} className="px-5 pb-5 space-y-3 border-t border-border/30 pt-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Title / Author name</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={linkTitle}
                onChange={e => setLinkTitle(e.target.value)}
                placeholder="e.g. Tribute article in El País"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">URL</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://..."
                type="url"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Note (opt.)</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={linkNote}
                onChange={e => setLinkNote(e.target.value)}
                placeholder="A brief description"
              />
            </div>
            {linkError && <p className="text-xs text-destructive">{linkError}</p>}
            <Button
              type="submit"
              disabled={createMessage.isPending}
              className="rounded-full font-serif"
            >
              {createMessage.isPending ? "Adding…" : "Add link"}
            </Button>
          </form>
        )}
      </section>

      {/* Tributes list */}
      <section className="bg-card border border-border/40 rounded-xl overflow-hidden p-5 space-y-4">
        <h2 className="font-serif text-xl">Tributes</h2>
        {messagesLoading && (
          <p className="font-serif italic text-muted-foreground animate-pulse">Loading tributes…</p>
        )}
        {!messagesLoading && (!messages || messages.length === 0) && (
          <p className="font-serif italic text-muted-foreground">No tributes yet.</p>
        )}
        {messages && messages.length > 0 && (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-3 bg-card border border-border/30 rounded-lg px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] tracking-widest uppercase text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {m.type}
                    </span>
                    <span className="text-sm font-medium text-foreground truncate">
                      {m.authorName}
                    </span>
                  </div>
                  {m.body && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.body}</p>
                  )}
                  {m.url && (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      <ExternalLink size={10} /> {m.url}
                    </a>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {m.userId != null && (
                    <button
                      type="button"
                      onClick={() => handleBlock(m.userId!)}
                      disabled={createBlock.isPending}
                      className="p-1.5 rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition"
                      aria-label="Block author"
                      title="Block author"
                    >
                      <ShieldOff size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    disabled={deleteMessage.isPending}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                    aria-label="Delete tribute"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Blocked accounts */}
      <section className="bg-card border border-border/40 rounded-xl overflow-hidden p-5 space-y-4">
        <h2 className="font-serif text-xl flex items-center gap-2">
          <ShieldCheck size={18} /> Blocked accounts
        </h2>
        {blocksLoading && (
          <p className="font-serif italic text-muted-foreground animate-pulse">Loading…</p>
        )}
        {!blocksLoading && (!blocks || blocks.length === 0) && (
          <p className="font-serif italic text-muted-foreground">No blocked accounts.</p>
        )}
        {blocks && blocks.length > 0 && (
          <ul className="space-y-3">
            {blocks.map((b) => (
              <li
                key={b.userId}
                className="flex items-center justify-between gap-3 bg-card border border-border/30 rounded-lg px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {b.name ?? b.email ?? `User #${b.userId}`}
                  </p>
                  {b.email && b.name && (
                    <p className="text-xs text-muted-foreground truncate">{b.email}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    Blocked {new Date(b.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleUnblock(b.userId)}
                  disabled={deleteBlock.isPending}
                  className="shrink-0 rounded-full font-serif text-xs"
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
