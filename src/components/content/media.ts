"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { IMAGE_BUCKET, imagePath, dataUrlBytes } from "@/lib/content";

// Generated post images (CS6) live in the private "post-images" bucket (db/022), under <workspace>/<post>/.
// The page only ever holds a short-lived signed link; the object itself is read through the bucket policies.

/** A signed link to a stored image, renewed when the path changes; null while loading or when there is none. */
export function usePostImage(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!path) return;
    supabase().storage.from(IMAGE_BUCKET).createSignedUrl(path, 3600).then(({ data }: { data: { signedUrl: string } | null }) => { if (live) setUrl(data?.signedUrl ?? null); });
    return () => { live = false; };
  }, [path]);
  return url;
}

/** A signed link that downloads the image under a readable name. */
export async function imageDownloadUrl(path: string, name = "post-visual") {
  const { data } = await supabase().storage.from(IMAGE_BUCKET).createSignedUrl(path, 600, { download: `${name}.${path.split(".").pop() || "png"}` });
  return (data?.signedUrl as string | undefined) ?? null;
}

/** Uploads a generated data URL for the post, points the post at it and removes the image it replaces. */
export async function storePostImage(wsId: string, postId: string, dataUrl: string, oldPath = ""): Promise<{ path: string } | { error: string }> {
  const img = dataUrlBytes(dataUrl);
  if (!img) return { error: "That image could not be saved: only PNG, JPEG and WebP images are kept." };
  const path = imagePath(wsId, postId, img.mime);
  const up = await supabase().storage.from(IMAGE_BUCKET).upload(path, new Blob([img.bytes.buffer as ArrayBuffer], { type: img.mime }), { contentType: img.mime, upsert: false });
  if (up.error) return { error: `The image was made but not saved: ${up.error.message}` };
  const { error } = await supabase().from("posts").update({ image_path: path }).eq("id", postId);
  if (error) { await supabase().storage.from(IMAGE_BUCKET).remove([path]); return { error: error.message }; }
  if (oldPath && oldPath !== path) await supabase().storage.from(IMAGE_BUCKET).remove([oldPath]);
  return { path };
}

/** Takes the image off the post with an Undo: the stored file is deleted only once the Undo window (5 s) has passed. */
export async function removePostImage(postId: string, path: string): Promise<{ error: string } | { undo: () => Promise<void> }> {
  const { error } = await supabase().from("posts").update({ image_path: "" }).eq("id", postId);
  if (error) return { error: error.message };
  let undone = false;
  const t = setTimeout(() => { if (!undone && path) supabase().storage.from(IMAGE_BUCKET).remove([path]); }, 6000);
  return { undo: async () => { undone = true; clearTimeout(t); await supabase().from("posts").update({ image_path: path }).eq("id", postId); } };
}
