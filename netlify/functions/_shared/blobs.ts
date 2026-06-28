import { getStore } from "@netlify/blobs";
export const MEDIA_STORE = "media";
export function mediaStore() {
  return getStore({ name: MEDIA_STORE, consistency: "strong" });
}
// Object paths are stored on rows as "/objects/<key>"; the key is the blob key.
export function keyFromObjectPath(objectPath: string): string | null {
  const m = /^\/objects\/(.+)$/.exec(objectPath);
  return m ? m[1] : null;
}
