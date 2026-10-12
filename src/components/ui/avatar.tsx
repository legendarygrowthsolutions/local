import { cn } from "@/lib/utils";

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Filled brand circle with initials, or the user's photo. Decorative: the name is always shown beside it. */
export function Avatar({ name, src, className }: { name: string | null | undefined; src?: string | null; className?: string }) {
  return (
    <span className={cn("grid flex-none place-items-center overflow-hidden rounded-full bg-brand font-bold text-white", className)} aria-hidden>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL from the mock store
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Downscale a picked photo to a square JPEG data URL (phase 1 stores it inline). */
export async function fileToAvatar(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}
