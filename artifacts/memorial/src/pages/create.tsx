import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import {
  useCreateTenant,
  useCheckSlugAvailability,
  getCheckSlugAvailabilityQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/components/language-provider";

function SlugAvailabilityIndicator({ slug }: { slug: string }) {
  const { t } = useT();
  const { data, isLoading, isFetching } = useCheckSlugAvailability(slug, {
    query: { enabled: slug.length >= 2, queryKey: getCheckSlugAvailabilityQueryKey(slug) },
  });

  if (!slug || slug.length < 2) return null;
  if (isLoading || isFetching) {
    return (
      <span className="text-xs text-muted-foreground animate-pulse">{t("create.checking")}</span>
    );
  }
  if (!data) return null;
  if (data.available) {
    return <span className="text-xs text-green-600 font-medium">{t("create.available")}</span>;
  }
  return <span className="text-xs text-destructive font-medium">{t("create.alreadyTaken")}</span>;
}

export default function Create() {
  const { t } = useT();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createTenant = useCreateTenant();

  // Form fields
  const [slugInput, setSlugInput] = useState("");
  const [debouncedSlug, setDebouncedSlug] = useState("");
  const [friendName, setFriendName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [deathYear, setDeathYear] = useState("");
  const [tagline, setTagline] = useState("");

  // Debounce slug input ~400ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSlug(slugInput.trim().toLowerCase()), 400);
    return () => clearTimeout(timer);
  }, [slugInput]);

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="font-serif italic text-muted-foreground animate-pulse">{t("create.loading")}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
        <h1 className="text-3xl font-serif">{t("create.heading")}</h1>
        <p className="text-muted-foreground font-serif italic max-w-md">
          {t("create.signInRequired")}
        </p>
        <Link href="/sign-in?intent=create">
          <Button className="font-serif rounded-full px-8">
            {t("create.signInButton")}
          </Button>
        </Link>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createTenant.isPending) return;

    const slug = slugInput.trim().toLowerCase();
    if (!slug || !friendName.trim()) return;

    createTenant.mutate(
      {
        data: {
          slug,
          friendName: friendName.trim(),
          ...(birthYear ? { birthYear: parseInt(birthYear, 10) } : {}),
          ...(deathYear ? { deathYear: parseInt(deathYear, 10) } : {}),
          ...(tagline.trim() ? { tagline: tagline.trim() } : {}),
        },
      },
      {
        onSuccess: (tenant) => {
          toast({ title: t("create.toastCreatedTitle"), description: t("create.toastCreatedDesc", { slug: tenant.slug }) });
          setLocation(`/${tenant.slug}/manage`);
        },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          if (status === 409) {
            toast({
              variant: "destructive",
              title: t("create.toastSlugTakenTitle"),
              description: t("create.toastSlugTakenDesc"),
            });
          } else if (status === 422) {
            toast({
              variant: "destructive",
              title: t("create.toastInvalidTitle"),
              description: t("create.toastInvalidDesc"),
            });
          } else {
            toast({
              variant: "destructive",
              title: t("create.toastErrorTitle"),
              description: t("create.toastErrorDesc"),
            });
          }
        },
      }
    );
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-card p-8 md:p-12 rounded-2xl shadow-xl border border-border/40"
      >
        <h1 className="text-3xl font-serif mb-2 text-center">{t("create.heading")}</h1>
        <p className="text-muted-foreground font-serif italic text-center mb-8">
          {t("create.subheading")}
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Slug */}
          <div className="space-y-1">
            <label htmlFor="slug" className="text-sm font-medium text-foreground/80">
              {t("create.slugLabel")} <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-mono flex-shrink-0">belovedfriend.org/</span>
              <Input
                id="slug"
                required
                placeholder={t("create.slugPlaceholder")}
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="h-10 bg-background font-mono"
              />
            </div>
            <div className="min-h-[1.25rem] pl-1">
              <SlugAvailabilityIndicator slug={debouncedSlug} />
            </div>
          </div>

          {/* Friend Name */}
          <div className="space-y-1">
            <label htmlFor="friendName" className="text-sm font-medium text-foreground/80">
              {t("create.friendNameLabel")} <span className="text-destructive">*</span>
            </label>
            <Input
              id="friendName"
              required
              placeholder="Maria Garcia"
              value={friendName}
              onChange={(e) => setFriendName(e.target.value)}
              className="h-10 bg-background"
            />
          </div>

          {/* Birth / Death years */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="birthYear" className="text-sm font-medium text-foreground/80">
                {t("create.birthYearLabel")}
              </label>
              <Input
                id="birthYear"
                type="number"
                min={1800}
                max={new Date().getFullYear()}
                placeholder="1950"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="deathYear" className="text-sm font-medium text-foreground/80">
                {t("create.deathYearLabel")}
              </label>
              <Input
                id="deathYear"
                type="number"
                min={1800}
                max={new Date().getFullYear()}
                placeholder="2023"
                value={deathYear}
                onChange={(e) => setDeathYear(e.target.value)}
                className="h-10 bg-background"
              />
            </div>
          </div>

          {/* Tagline */}
          <div className="space-y-1">
            <label htmlFor="tagline" className="text-sm font-medium text-foreground/80">
              {t("create.taglineLabel")} <span className="text-xs text-muted-foreground">({t("create.optional")})</span>
            </label>
            <Input
              id="tagline"
              placeholder={t("create.taglinePlaceholder")}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="h-10 bg-background"
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-lg font-serif rounded-xl"
            disabled={createTenant.isPending}
          >
            {createTenant.isPending ? t("create.creating") : t("create.createButton")}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
