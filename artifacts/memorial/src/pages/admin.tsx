import { useState } from "react";
import { Link } from "wouter";
import {
  useListMessages,
  useDeleteMessage,
  useUpdateMessage,
  getListMessagesQueryKey,
  type Message,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Pencil, Save, X, Video as VideoIcon, FileText } from "lucide-react";

export default function Admin() {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const { data: messages, isLoading: listLoading } = useListMessages({ type: "all", limit: 200 });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Message>>({});

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListMessagesQueryKey() });
  };

  const deleteMutation = useDeleteMessage({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Tribute removed." });
      },
      onError: () => toast({ title: "Could not delete.", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateMessage({
    mutation: {
      onSuccess: () => {
        invalidate();
        setEditing(null);
        toast({ title: "Tribute updated." });
      },
      onError: () => toast({ title: "Could not save.", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return <div className="container mx-auto px-4 py-24 text-center text-muted-foreground">Loading…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-24 max-w-md text-center space-y-4">
        <h1 className="text-3xl font-serif">Sign in required</h1>
        <p className="text-muted-foreground">
          Please sign in to access the manager.
        </p>
        <Link href="/sign-in">
          <Button>Sign In</Button>
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-24 max-w-md text-center space-y-4">
        <h1 className="text-3xl font-serif">Not authorized</h1>
        <p className="text-muted-foreground">
          This page is only available to the site manager.
        </p>
        <Link href="/">
          <Button variant="outline">Back to home</Button>
        </Link>
      </div>
    );
  }

  const startEdit = (m: Message) => {
    setEditing(m.id);
    setDraft({
      body: m.body,
      authorName: m.authorName,
      relationship: m.relationship,
      location: m.location,
    });
  };

  const saveEdit = (id: number) => {
    updateMutation.mutate({
      id,
      data: {
        body: draft.body ?? null,
        authorName: draft.authorName ?? "",
        relationship: draft.relationship ?? null,
        location: draft.location ?? null,
      },
    });
  };

  const confirmDelete = (m: Message) => {
    const label = m.authorName || `#${m.id}`;
    if (
      window.confirm(
        `Delete the tribute by ${label}? This cannot be undone.`,
      )
    ) {
      deleteMutation.mutate({ id: m.id });
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl">
      <div className="mb-10">
        <p className="text-sm tracking-widest uppercase text-primary mb-2">Manager</p>
        <h1 className="text-4xl md:text-5xl font-serif">All Tributes</h1>
        <p className="text-muted-foreground mt-2">
          Edit any message or remove tributes that don't belong on the wall.
        </p>
      </div>

      {listLoading ? (
        <p className="text-muted-foreground">Loading tributes…</p>
      ) : !messages || messages.length === 0 ? (
        <p className="text-muted-foreground">No tributes yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {messages.map((m) => {
            const isEditing = editing === m.id;
            return (
              <div
                key={m.id}
                className="rounded-xl border border-border/40 bg-card/60 p-5 backdrop-blur-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs tracking-widest uppercase text-muted-foreground">
                    {m.type === "video" ? <VideoIcon size={14} /> : <FileText size={14} />}
                    <span>{m.type}</span>
                    <span>·</span>
                    <span>#{m.id}</span>
                    <span>·</span>
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-1">
                    {isEditing ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => saveEdit(m.id)}
                          disabled={updateMutation.isPending}
                        >
                          <Save size={14} className="mr-1" /> Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                          <X size={14} />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => startEdit(m)}>
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => confirmDelete(m)}
                          disabled={deleteMutation.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid md:grid-cols-3 gap-3">
                      <Input
                        placeholder="Author name"
                        value={draft.authorName ?? ""}
                        onChange={(e) => setDraft({ ...draft, authorName: e.target.value })}
                      />
                      <Input
                        placeholder="Relationship"
                        value={draft.relationship ?? ""}
                        onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}
                      />
                      <Input
                        placeholder="Location"
                        value={draft.location ?? ""}
                        onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                      />
                    </div>
                    <Textarea
                      placeholder="Message"
                      rows={4}
                      value={draft.body ?? ""}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="font-serif text-lg">{m.authorName}</p>
                    {(m.relationship || m.location) && (
                      <p className="text-sm text-muted-foreground">
                        {[m.relationship, m.location].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {m.body && (
                      <p className="text-sm text-foreground/80 whitespace-pre-wrap">{m.body}</p>
                    )}
                    <Link
                      href={`/tribute/${m.id}`}
                      className="text-xs text-primary hover:underline inline-block mt-1"
                    >
                      View on site →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
