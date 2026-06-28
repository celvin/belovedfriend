import { useTenantSlug } from "@/lib/tenant";

export default function MapPage() {
  const slug = useTenantSlug();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-serif mb-4">Reach Map</h1>
      <p className="text-muted-foreground font-serif italic">
        {slug ? `Reach map for ${slug}` : "Loading…"}
      </p>
    </div>
  );
}
