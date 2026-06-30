import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMessages,
  useDeleteMessage,
  useCreateMessage,
  useUpdateTenant,
  useDeleteTenant,
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
import { Trash2, Plus, ExternalLink, ChevronDown, ChevronUp, ShieldOff, ShieldCheck, ArrowUp, ArrowDown, Camera, Eye, EyeOff, Clapperboard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTenantSlug } from "@/lib/tenant";
import { type Lang, isLang } from "@/lib/i18n";
import { useT } from "@/components/language-provider";
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
  // locale
  defaultLanguage: Lang;
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

const DERIVED_OPTION_VALUES = ["nodeCount", "placeCount", "contributorCount", "edgeCount"] as const;

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
    defaultLanguage: settings.defaultLanguage,
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
    defaultLanguage: isLang(cfg.defaultLanguage) ? cfg.defaultLanguage : "en",
  };
}

export default function Manage() {
  const { t } = useT();
  const DERIVED_OPTIONS = [
    { value: "nodeCount", label: t("manage.derivedNodeCount") },
    { value: "placeCount", label: t("manage.derivedPlaceCount") },
    { value: "contributorCount", label: t("manage.derivedContributorCount") },
    { value: "edgeCount", label: t("manage.derivedEdgeCount") },
  ];
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

  // Delete page (tenant)
  const deleteTenant = useDeleteTenant();
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDeletePage() {
    if (deleteConfirmText.trim() !== slug) return;
    setDeleteError(null);
    deleteTenant.mutate(
      { slug },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMyTenantsQueryKey() });
          queryClient.removeQueries({ queryKey: getGetTenantQueryKey(slug) });
          setLocation("/");
        },
        onError: () => setDeleteError(t("manage.errorDeletePage")),
      },
    );
  }

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

  // Presentation ("Tribute Theater") curation
  const [presentationCfg, setPresentationCfg] = useState<{ order: number[]; hidden: number[]; autoplay: boolean }>({
    order: [],
    hidden: [],
    autoplay: false,
  });
  const [showPresentation, setShowPresentation] = useState(false);
  const [presentationSaved, setPresentationSaved] = useState(false);
  const presentationInitRef = useRef(false);

  // Eagerly initialize pageSettings when tenant data arrives (needed for top photo section)
  useEffect(() => {
    if (tenant && pageSettings === null) {
      const cfg = (tenant.pageConfig ?? {}) as Record<string, unknown>;
      setPageSettings(buildDefaultSettings(cfg));
    }
  }, [tenant, pageSettings]);

  // Initialize presentation curation from saved config once, then keep the
  // order in sync as memories are added/removed (new ones append at the end).
  useEffect(() => {
    if (!tenant || !messages) return;
    setPresentationCfg((prev) => {
      const saved = ((tenant.pageConfig as Record<string, unknown>)?.presentation ?? {}) as {
        order?: number[];
        hidden?: number[];
        autoplay?: boolean;
      };
      const base = presentationInitRef.current
        ? prev
        : { order: [...(saved.order ?? [])], hidden: [...(saved.hidden ?? [])], autoplay: saved.autoplay === true };
      presentationInitRef.current = true;
      const allIds = messages.map((m) => m.id);
      const known = new Set<number>([...base.order, ...base.hidden]);
      const order = [...base.order.filter((id) => allIds.includes(id)), ...allIds.filter((id) => !known.has(id))];
      const hidden = base.hidden.filter((id) => allIds.includes(id));
      return { ...base, order, hidden };
    });
  }, [tenant, messages]);

  function handleOpenPageSettings() {
    const cfg = (tenant?.pageConfig ?? {}) as Record<string, unknown>;
    setPageSettings(buildDefaultSettings(cfg));
    setPageSettingsError(null);
    setPageSettingsSaved(false);
    setShowPageSettings(true);
  }

  // Has the page-settings form diverged from what's persisted?
  function isPageSettingsDirty(): boolean {
    if (!pageSettings) return false;
    const persisted = buildDefaultSettings((tenant?.pageConfig ?? {}) as Record<string, unknown>);
    return JSON.stringify(buildPageConfig(pageSettings)) !== JSON.stringify(buildPageConfig(persisted));
  }

  function handleTogglePageSettings() {
    if (showPageSettings) {
      if (isPageSettingsDirty() && !confirm(t("manage.confirmDiscardPageSettings"))) return;
      // Reset to persisted so re-opening starts clean.
      setPageSettings(buildDefaultSettings((tenant?.pageConfig ?? {}) as Record<string, unknown>));
      setPageSettingsError(null);
      setPageSettingsSaved(false);
      setShowPageSettings(false);
    } else {
      handleOpenPageSettings();
    }
  }

  // Has the page-details (meta) form diverged from what's persisted?
  function isMetaDirty(): boolean {
    if (!tenant) return false;
    return (
      metaFriendName !== (tenant.friendName ?? "") ||
      metaTagline !== (tenant.tagline ?? "") ||
      metaBirthYear !== (tenant.birthYear?.toString() ?? "") ||
      metaDeathYear !== (tenant.deathYear?.toString() ?? "")
    );
  }

  function handleToggleEditMeta() {
    if (showEditMeta) {
      if (isMetaDirty() && !confirm(t("manage.confirmDiscardMeta"))) return;
      setShowEditMeta(false);
    } else {
      handleOpenEditMeta();
    }
  }

  function handleToggleAddLink() {
    if (showAddLink) {
      const dirty = !!(linkTitle.trim() || linkUrl.trim() || linkNote.trim());
      if (dirty && !confirm(t("manage.confirmDiscardLink"))) return;
      setLinkTitle("");
      setLinkUrl("");
      setLinkNote("");
      setLinkError(null);
      setShowAddLink(false);
    } else {
      setShowAddLink(true);
    }
  }

  async function handleHeroPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;
    setHeroUploading(true);
    setPageSettingsError(null);
    setHeroError(null);
    setHeroSaved(false);
    try {
      const objectPath = await uploadFile(file, file.type);
      // Update local preview
      setPageSettings((prev) => prev ? { ...prev, heroPhotoPath: objectPath } : prev);
      // Auto-save: build from PERSISTED tenant.pageConfig so unsaved form edits are not written
      const persistedCfg = (tenant.pageConfig ?? {}) as Record<string, unknown>;
      const persistedSettings = buildDefaultSettings(persistedCfg);
      const pageConfig = { ...buildPageConfig({ ...persistedSettings, heroPhotoPath: objectPath }), presentation: presentationCfg };
      updateTenant.mutate(
        { slug, data: { pageConfig } },
        {
          onSuccess: () => {
            setHeroSaved(true);
            queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(slug) });
            setTimeout(() => setHeroSaved(false), 3000);
          },
          onError: () => {
            setHeroError(t("manage.errorHeroSave"));
          },
        },
      );
    } catch {
      setHeroError(t("manage.errorHeroUpload"));
    } finally {
      setHeroUploading(false);
      if (heroFileInputRef.current) heroFileInputRef.current.value = "";
    }
  }

  function handleRemoveHeroPhoto() {
    if (!tenant) return;
    setHeroSaved(false);
    setHeroError(null);
    // Update local preview
    setPageSettings((prev) => prev ? { ...prev, heroPhotoPath: null } : prev);
    // Auto-save: build from PERSISTED tenant.pageConfig so unsaved form edits are not written
    const persistedCfg = (tenant.pageConfig ?? {}) as Record<string, unknown>;
    const persistedSettings = buildDefaultSettings(persistedCfg);
    const pageConfig = { ...buildPageConfig({ ...persistedSettings, heroPhotoPath: null }), presentation: presentationCfg };
    updateTenant.mutate(
      { slug, data: { pageConfig } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(slug) });
        },
        onError: () => {
          setHeroError(t("manage.errorHeroRemove"));
        },
      },
    );
  }

  // Presentation curation helpers
  function movePresentationItem(index: number, dir: -1 | 1) {
    setPresentationCfg((prev) => {
      const order = [...prev.order];
      const j = index + dir;
      if (j < 0 || j >= order.length) return prev;
      [order[index], order[j]] = [order[j], order[index]];
      return { ...prev, order };
    });
  }
  function togglePresentationHidden(id: number) {
    setPresentationCfg((prev) => ({
      ...prev,
      hidden: prev.hidden.includes(id) ? prev.hidden.filter((x) => x !== id) : [...prev.hidden, id],
    }));
  }
  function handleSavePresentation() {
    setPresentationSaved(false);
    const persistedCfg = (tenant?.pageConfig ?? {}) as Record<string, unknown>;
    const pageConfig = { ...buildPageConfig(buildDefaultSettings(persistedCfg)), presentation: presentationCfg };
    updateTenant.mutate(
      { slug, data: { pageConfig } },
      {
        onSuccess: () => {
          setPresentationSaved(true);
          queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(slug) });
          setTimeout(() => setPresentationSaved(false), 3000);
        },
      },
    );
  }

  function handleSavePageSettings() {
    if (!pageSettings) return;
    setPageSettingsError(null);
    setPageSettingsSaved(false);

    updateTenant.mutate(
      { slug, data: { pageConfig: { ...buildPageConfig(pageSettings), presentation: presentationCfg } } },
      {
        onSuccess: () => {
          setPageSettingsSaved(true);
          queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(slug) });
        },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          if (status === 422) {
            setPageSettingsError(t("manage.errorPageSettingsInvalid"));
          } else {
            setPageSettingsError(t("manage.errorPageSettingsSave"));
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
    if (!confirm(t("manage.confirmBlock"))) return;
    createBlock.mutate({ slug, data: { userId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBlocksQueryKey(slug) });
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(slug) });
      },
    });
  }

  function handleUnblock(userId: number) {
    if (!confirm(t("manage.confirmUnblock"))) return;
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
      if (isNaN(y)) { setMetaError(t("manage.errorBirthYearNumber")); return; }
      data.birthYear = y;
    }
    if (metaDeathYear.trim()) {
      const y = parseInt(metaDeathYear, 10);
      if (isNaN(y)) { setMetaError(t("manage.errorDeathYearNumber")); return; }
      data.deathYear = y;
    }
    updateTenant.mutate({ slug, data }, {
      onSuccess: () => {
        setMetaSuccess(true);
        queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(slug) });
      },
      onError: () => setMetaError(t("manage.errorMetaSave")),
    });
  }

  function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (createMessage.isPending) return;
    setLinkError(null);
    if (!linkUrl.trim()) {
      setLinkError(t("manage.errorLinkUrlRequired"));
      return;
    }
    createMessage.mutate(
      {
        slug,
        data: {
          type: "link",
          authorName: linkTitle.trim() || t("manage.linkAuthorFallback"),
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
        onError: () => setLinkError(t("manage.errorLinkSave")),
      },
    );
  }

  function handleDelete(id: number) {
    if (!confirm(t("manage.confirmDeleteTribute"))) return;
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
        <h1 className="text-3xl font-serif">{t("manage.signInRequired")}</h1>
        <p className="text-muted-foreground font-serif italic">
          {t("manage.signInRequiredBody")}
        </p>
        <Link href={`/sign-in?slug=${slug}&intent=manage`}>
          <Button variant="outline" className="font-serif rounded-full px-8">
            {t("nav.signIn")}
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
        <div className="font-serif italic text-muted-foreground animate-pulse">{t("manage.loading")}</div>
      </div>
    );
  }

  // Not authorized
  if (!isOwner) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
        <h1 className="text-3xl font-serif">{t("manage.notAuthorized")}</h1>
        <p className="text-muted-foreground font-serif italic">
          {t("manage.notAuthorizedBody")}
        </p>
        <Link href={`/${slug}`}>
          <Button variant="outline" className="font-serif rounded-full px-8">
            {t("manage.backToTribute")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl lg:max-w-6xl mx-auto px-4 py-10 space-y-8">

      {/* Header */}
      <div className="space-y-2">
        <div className="text-xs tracking-widest uppercase text-muted-foreground">{t("nav.manage")}</div>
        <h1 className="text-3xl font-serif">{tenant?.friendName ?? slug}</h1>
        <div className="flex gap-3">
          <Link href={`/${slug}`} className="text-xs text-primary hover:underline">
            {t("manage.viewPage")}
          </Link>
          <Link href={`/${slug}/wall`} className="text-xs text-primary hover:underline">
            {t("manage.tributeWallLink")}
          </Link>
        </div>
      </div>

      {/* Multi-page switcher (only when user owns more than 1 page) */}
      {!mineLoading && mine && mine.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="page-switcher" className="text-muted-foreground whitespace-nowrap">{t("manage.switchPage")}</label>
          <select
            id="page-switcher"
            className="border border-border/60 rounded-md px-2 py-1 text-sm bg-background"
            value={slug}
            onChange={(e) => setLocation(`/${e.target.value}/manage`)}
          >
            {mine.map((page) => (
              <option key={page.slug} value={page.slug}>{page.friendName ?? page.slug}</option>
            ))}
          </select>
        </div>
      )}

      {/* Responsive layout: editing forms (wide) + moderation lists (narrow) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

      {/* ── Left column: editing ── */}
      <div className="lg:col-span-2 space-y-8">

      {/* Edit tenant meta */}
      <section className="bg-card border border-border/40 rounded-xl overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition"
          onClick={handleToggleEditMeta}
        >
          <span className="font-serif text-lg">{t("manage.editPageDetails")}</span>
          {showEditMeta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showEditMeta && (
          <form onSubmit={handleSaveMeta} className="px-5 pb-5 space-y-4 border-t border-border/30 pt-4">
            {/* Friend photo */}
            <div>
              <label className="block text-xs text-muted-foreground mb-2">{t("manage.photoLabel")}</label>
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
                    alt={t("manage.friendPhotoAlt")}
                    className="h-28 w-28 object-cover rounded-full border border-border/40 shrink-0"
                  />
                ) : (
                  <div className="h-28 w-28 rounded-full bg-muted border border-border/40 flex items-center justify-center shrink-0">
                    <Camera size={32} className="text-muted-foreground/50" />
                  </div>
                )}
                <div className="space-y-2">
                  {heroUploading ? (
                    <p className="text-sm text-muted-foreground animate-pulse">{t("manage.uploading")}</p>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full font-serif"
                      onClick={() => heroFileInputRef.current?.click()}
                      disabled={heroUploading}
                    >
                      {pageSettings?.heroPhotoPath ? t("manage.changePhoto") : t("manage.uploadPhoto")}
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
                        {t("manage.removePhoto")}
                      </button>
                    </div>
                  )}
                  {heroSaved && <p className="text-xs text-green-600">{t("manage.photoSaved")}</p>}
                  {heroError && <p className="text-xs text-destructive">{heroError}</p>}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("manage.nameLabel")}</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={metaFriendName}
                onChange={e => setMetaFriendName(e.target.value)}
                placeholder={t("manage.namePlaceholder")}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("manage.taglineLabel")}</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={metaTagline}
                onChange={e => setMetaTagline(e.target.value)}
                placeholder={t("manage.taglinePlaceholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t("manage.birthYearLabel")}</label>
                <input
                  className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                  value={metaBirthYear}
                  onChange={e => setMetaBirthYear(e.target.value)}
                  placeholder={t("manage.birthYearPlaceholder")}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t("manage.deathYearLabel")}</label>
                <input
                  className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                  value={metaDeathYear}
                  onChange={e => setMetaDeathYear(e.target.value)}
                  placeholder={t("manage.deathYearPlaceholder")}
                />
              </div>
            </div>
            {metaError && <p className="text-xs text-destructive">{metaError}</p>}
            {metaSuccess && <p className="text-xs text-green-600">{t("manage.savedSuccessfully")}</p>}
            <Button
              type="submit"
              disabled={updateTenant.isPending}
              className="rounded-full font-serif"
            >
              {updateTenant.isPending ? t("manage.saving") : t("manage.saveChanges")}
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
          <span className="font-serif text-lg">{t("manage.pageSettings")}</span>
          {showPageSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showPageSettings && pageSettings && (
          <div className="px-5 pb-5 space-y-6 border-t border-border/30 pt-4">

            {/* Theme */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">{t("manage.themeHeading")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t("manage.fontStyleLabel")}</label>
                  <select
                    className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                    value={pageSettings.font}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, font: e.target.value as "serif" | "sans" | "handwritten" } : prev)}
                  >
                    <option value="serif">{t("manage.fontSerif")}</option>
                    <option value="sans">{t("manage.fontSans")}</option>
                    <option value="handwritten">{t("manage.fontHandwritten")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t("manage.paletteLabel")}</label>
                  <input
                    className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                    value={pageSettings.palette}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, palette: e.target.value } : prev)}
                    placeholder={t("manage.palettePlaceholder")}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t("manage.defaultLanguage")}</label>
                  <select
                    className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                    value={pageSettings.defaultLanguage}
                    onChange={(e) =>
                      setPageSettings((prev) =>
                        prev ? { ...prev, defaultLanguage: e.target.value as Lang } : prev,
                      )
                    }
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t("manage.accentColorLabel")}</label>
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
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">{t("manage.heroHeading")}</h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border border-border/60"
                    checked={pageSettings.showDates}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, showDates: e.target.checked } : prev)}
                  />
                  <span className="text-sm">{t("manage.showDates")}</span>
                </label>
              </div>
            </div>

            {/* Story */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">{t("manage.storyHeading")}</h3>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border border-border/60"
                  checked={pageSettings.storyEnabled}
                  onChange={(e) => setPageSettings((prev) => prev ? { ...prev, storyEnabled: e.target.checked } : prev)}
                />
                <span className="text-sm">{t("manage.enableStory")}</span>
              </label>
              <div className="space-y-3">
                {pageSettings.storyBlocks.map((block, i) => (
                  <div key={i} className="border border-border/30 rounded-lg p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t("manage.blockN", { n: i + 1 })}</span>
                      <button
                        type="button"
                        onClick={() => removeStoryBlock(i)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        aria-label={t("manage.removeBlock")}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">{t("manage.blockHeadingLabel")}</label>
                      <input
                        className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                        value={block.heading}
                        onChange={(e) => updateStoryBlock(i, "heading", e.target.value)}
                        placeholder={t("manage.blockHeadingPlaceholder")}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">{t("manage.blockBodyLabel")}</label>
                      <textarea
                        className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background resize-y"
                        rows={3}
                        value={block.body}
                        onChange={(e) => updateStoryBlock(i, "body", e.target.value)}
                        placeholder={t("manage.blockBodyPlaceholder")}
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addStoryBlock}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus size={12} /> {t("manage.addStoryBlock")}
                </button>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">{t("manage.sectionsHeading")}</h3>
              <div className="space-y-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border border-border/60"
                    checked={pageSettings.sectionStory}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, sectionStory: e.target.checked } : prev)}
                  />
                  <span className="text-sm">{t("manage.showStory")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border border-border/60"
                    checked={pageSettings.sectionWall}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, sectionWall: e.target.checked } : prev)}
                  />
                  <span className="text-sm">{t("manage.showWall")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border border-border/60"
                    checked={pageSettings.sectionReach}
                    onChange={(e) => setPageSettings((prev) => prev ? { ...prev, sectionReach: e.target.checked } : prev)}
                  />
                  <span className="text-sm">{t("manage.showReach")}</span>
                </label>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-2">{t("manage.sectionOrder")}</label>
                <div className="space-y-1">
                  {pageSettings.sectionsOrder.map((key, i) => (
                    <div
                      key={key}
                      className="flex items-center gap-2 border border-border/30 rounded-md px-3 py-2 bg-muted/20 text-sm"
                    >
                      <span className="flex-1">{t(({ story: "manage.sectionStory", wall: "manage.sectionWall", reach: "manage.sectionReach" } as Record<string, string>)[key] ?? key)}</span>
                      <button
                        type="button"
                        onClick={() => moveSection(i, -1)}
                        disabled={i === 0}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label={t("manage.moveUp")}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(i, 1)}
                        disabled={i === pageSettings.sectionsOrder.length - 1}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label={t("manage.moveDown")}
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
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">{t("manage.reachSummaryHeading")}</h3>
              <div className="space-y-3">
                {pageSettings.reachSummary.map((callout, i) => (
                  <div key={i} className="border border-border/30 rounded-lg p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t("manage.calloutN", { n: i + 1 })}</span>
                      <button
                        type="button"
                        onClick={() => removeReachCallout(i)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        aria-label={t("manage.removeCallout")}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">{t("manage.calloutLabelLabel")}</label>
                      <input
                        className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                        value={callout.label}
                        onChange={(e) => updateReachCallout(i, { label: e.target.value })}
                        placeholder={t("manage.calloutLabelPlaceholder")}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">{t("manage.valueTypeLabel")}</label>
                      <select
                        className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background mb-2"
                        value={callout.mode}
                        onChange={(e) => updateReachCallout(i, { mode: e.target.value as "value" | "derived" })}
                      >
                        <option value="derived">{t("manage.valueDerived")}</option>
                        <option value="value">{t("manage.valueFixed")}</option>
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
                  <Plus size={12} /> {t("manage.addCallout")}
                </button>
              </div>
            </div>

            {/* CTA */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">{t("manage.ctaHeading")}</h3>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t("manage.ctaPrimaryLabel")}</label>
                <input
                  className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                  value={pageSettings.primaryLabel}
                  onChange={(e) => setPageSettings((prev) => prev ? { ...prev, primaryLabel: e.target.value } : prev)}
                  placeholder="Leave a tribute"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t("manage.ctaWallLabel")}</label>
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
            {pageSettingsSaved && <p className="text-xs text-green-600">{t("manage.pageSettingsSaved")}</p>}
            <Button
              type="button"
              onClick={handleSavePageSettings}
              disabled={updateTenant.isPending || heroUploading}
              className="rounded-full font-serif"
            >
              {updateTenant.isPending ? t("manage.saving") : t("manage.savePageSettings")}
            </Button>
          </div>
        )}
      </section>

      {/* Presentation (Tribute Theater) curation */}
      <section className="bg-card border border-border/40 rounded-xl overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition"
          onClick={() => setShowPresentation((v) => !v)}
        >
          <span className="font-serif text-lg flex items-center gap-2">
            <Clapperboard size={18} /> {t("manage.presentationHeading")}
          </span>
          {showPresentation ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showPresentation && (
          <div className="px-5 pb-5 space-y-4 border-t border-border/30 pt-4">
            <p className="text-xs text-muted-foreground">
              {t("manage.presentationDesc")}
            </p>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border border-border/60"
                checked={presentationCfg.autoplay}
                onChange={(e) => setPresentationCfg((p) => ({ ...p, autoplay: e.target.checked }))}
              />
              <span className="text-sm">
                {t("manage.autostartLabel")}{" "}
                <span className="text-muted-foreground">{t("manage.kioskMode")}</span>
              </span>
            </label>

            <div className="space-y-1.5">
              {presentationCfg.order.length === 0 && (
                <p className="font-serif italic text-muted-foreground text-sm">{t("manage.noMemoriesYet")}</p>
              )}
              {presentationCfg.order.map((id, i) => {
                const m = messages?.find((x) => x.id === id);
                if (!m) return null;
                const isHidden = presentationCfg.hidden.includes(id);
                return (
                  <div
                    key={id}
                    className={`flex items-center gap-2 border border-border/30 rounded-md px-2.5 py-2 bg-muted/20 ${isHidden ? "opacity-50" : ""}`}
                  >
                    {m.photoPath ? (
                      <img src={`/api${m.photoPath}`} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded bg-muted shrink-0 flex items-center justify-center text-[9px] uppercase tracking-wide text-muted-foreground">
                        {m.type}
                      </span>
                    )}
                    <span className="flex-1 min-w-0 text-sm truncate">
                      {m.authorName}
                      {isHidden && <span className="text-xs text-muted-foreground"> · {t("manage.hiddenLabel")}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => movePresentationItem(i, -1)}
                      disabled={i === 0}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label={t("manage.moveUp")}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => movePresentationItem(i, 1)}
                      disabled={i === presentationCfg.order.length - 1}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label={t("manage.moveDown")}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePresentationHidden(id)}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                      aria-label={isHidden ? t("manage.showInTribute") : t("manage.hideFromTribute")}
                      title={isHidden ? t("manage.showInTribute") : t("manage.hideFromTribute")}
                    >
                      {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>

            {presentationSaved && <p className="text-xs text-green-600">{t("manage.presentationSaved")}</p>}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleSavePresentation}
                disabled={updateTenant.isPending}
                className="rounded-full font-serif"
              >
                {updateTenant.isPending ? t("manage.saving") : t("manage.savePresentation")}
              </Button>
              <Link href={`/${slug}/present`} className="text-xs text-primary hover:underline">
                {t("manage.previewLink")}
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Add a link */}
      <section className="bg-card border border-border/40 rounded-xl overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition"
          onClick={handleToggleAddLink}
        >
          <span className="font-serif text-lg flex items-center gap-2">
            <Plus size={16} /> {t("manage.addLinkHeading")}
          </span>
          {showAddLink ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showAddLink && (
          <form onSubmit={handleAddLink} className="px-5 pb-5 space-y-3 border-t border-border/30 pt-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("manage.linkTitleLabel")}</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={linkTitle}
                onChange={e => setLinkTitle(e.target.value)}
                placeholder={t("manage.linkTitlePlaceholder")}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("manage.linkUrlLabel")}</label>
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
              <label className="block text-xs text-muted-foreground mb-1">{t("manage.linkNoteLabel")}</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={linkNote}
                onChange={e => setLinkNote(e.target.value)}
                placeholder={t("manage.linkNotePlaceholder")}
              />
            </div>
            {linkError && <p className="text-xs text-destructive">{linkError}</p>}
            <Button
              type="submit"
              disabled={createMessage.isPending}
              className="rounded-full font-serif"
            >
              {createMessage.isPending ? t("manage.adding") : t("manage.addLinkButton")}
            </Button>
          </form>
        )}
      </section>

      </div>
      {/* ── Right column: moderation ── */}
      <div className="lg:col-span-1 space-y-8">

      {/* Tributes list */}
      <section className="bg-card border border-border/40 rounded-xl overflow-hidden p-5 space-y-4">
        <h2 className="font-serif text-xl">{t("manage.tributesHeading")}</h2>
        {messagesLoading && (
          <p className="font-serif italic text-muted-foreground animate-pulse">{t("manage.loadingTributes")}</p>
        )}
        {!messagesLoading && (!messages || messages.length === 0) && (
          <p className="font-serif italic text-muted-foreground">{t("manage.noTributes")}</p>
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
                      aria-label={t("manage.blockAuthor")}
                      title={t("manage.blockAuthor")}
                    >
                      <ShieldOff size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    disabled={deleteMessage.isPending}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                    aria-label={t("manage.deleteTribute")}
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
          <ShieldCheck size={18} /> {t("manage.blockedAccountsHeading")}
        </h2>
        {blocksLoading && (
          <p className="font-serif italic text-muted-foreground animate-pulse">{t("manage.loading")}</p>
        )}
        {!blocksLoading && (!blocks || blocks.length === 0) && (
          <p className="font-serif italic text-muted-foreground">{t("manage.noBlockedAccounts")}</p>
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
                    {b.name ?? b.email ?? t("manage.userFallback", { id: b.userId })}
                  </p>
                  {b.email && b.name && (
                    <p className="text-xs text-muted-foreground truncate">{b.email}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {t("manage.blockedDate", { date: new Date(b.createdAt).toLocaleDateString() })}
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
                  {t("manage.unblockButton")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      </div>
      </div>

      {/* Danger zone */}
      <section className="border border-destructive/40 rounded-xl overflow-hidden">
        <div className="px-5 py-4 bg-destructive/5">
          <h2 className="font-serif text-xl text-destructive flex items-center gap-2">
            <Trash2 size={18} /> {t("manage.deletePageHeading")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("manage.deletePageDescBefore")} <span className="font-medium">{tenant?.friendName ?? slug}</span>{" "}
            {t("manage.deletePageDescAfter")}
          </p>
        </div>
        <div className="px-5 py-4 border-t border-destructive/20">
          {!showDelete ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full font-serif border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => { setShowDelete(true); setDeleteConfirmText(""); setDeleteError(null); }}
            >
              {t("manage.deletePageButton")}
            </Button>
          ) : (
            <div className="space-y-3 max-w-md">
              <label className="block text-sm text-foreground">
                {t("manage.deleteConfirmBefore")} <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-destructive">{slug}</code> {t("manage.deleteConfirmAfter")}
              </label>
              <input
                className="w-full border border-destructive/50 rounded-md px-3 py-2 text-sm bg-background"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={slug}
                autoFocus
              />
              {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="rounded-full font-serif bg-destructive text-white hover:bg-destructive/90"
                  disabled={deleteConfirmText.trim() !== slug || deleteTenant.isPending}
                  onClick={handleDeletePage}
                >
                  {deleteTenant.isPending ? t("manage.deleting") : t("manage.permanentlyDelete")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full font-serif"
                  onClick={() => { setShowDelete(false); setDeleteConfirmText(""); setDeleteError(null); }}
                >
                  {t("manage.cancelButton")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
