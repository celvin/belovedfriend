import { useTenantSlug } from "@/lib/tenant";
import { ReachNetwork } from "@/components/reach-network";

export default function MapPage() {
  const slug = useTenantSlug();
  if (!slug) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="font-serif italic text-muted-foreground">Loading…</p>
      </div>
    );
  }
  return (
    <div className="flex-1 container mx-auto px-4 py-10 md:py-14">
      <h1 className="text-3xl md:text-4xl font-serif mb-6 md:mb-8 text-center">
        The Memory Map
      </h1>
      <ReachNetwork slug={slug} />
    </div>
  );
}
