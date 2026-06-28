import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMessages,
  useDeleteMessage,
  useCreateMessage,
  useUpdateTenant,
  useListMyTenants,
  useGetTenant,
  getListMessagesQueryKey,
  getGetTenantQueryKey,
  getListMyTenantsQueryKey,
} from "@workspace/api-client-react";
import { Trash2, Plus, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTenantSlug } from "@/lib/tenant";
import { Button } from "@/components/ui/button";

export default function Manage() {
  const slug = useTenantSlug() ?? "";
  const { isAdmin, isAuthenticated } = useAuth();
  const { data: mine } = useListMyTenants({
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

  // Loading ownership check
  if (tenantLoading) {
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
      <section className="space-y-4">
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
                <button
                  type="button"
                  onClick={() => handleDelete(m.id)}
                  disabled={deleteMessage.isPending}
                  className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                  aria-label="Delete tribute"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
