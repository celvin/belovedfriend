import { getStore } from "@netlify/blobs";

export function mediaStore() {
  return getStore({ name: "media", consistency: "strong" });
}

export function keyFromObjectPath(objectPath: string): string | null {
  const m = /^\/objects\/(.+)$/.exec(objectPath);
  return m ? m[1] : null;
}
