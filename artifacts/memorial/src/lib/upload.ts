// POST a file to the native Blobs upload function; returns the stored object path.
export async function uploadFile(file: Blob, contentType: string): Promise<string> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": contentType },
    body: file,
    credentials: "include",
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Upload failed (${res.status})`);
  }
  const json = (await res.json()) as { objectPath: string };
  return json.objectPath;
}
