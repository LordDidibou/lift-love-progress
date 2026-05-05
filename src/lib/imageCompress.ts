// Compresses an image file to a max square size using canvas (centered crop).
// Returns a JPEG Blob/File. Works for any browser-decodable format.
export async function compressImageToSquare(
  file: File,
  size = 400,
  quality = 0.85,
): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Lecture impossible"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Format d'image non supporté par le navigateur"));
    i.src = dataUrl;
  });

  const minSide = Math.min(img.width, img.height);
  const sx = (img.width - minSide) / 2;
  const sy = (img.height - minSide) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compression impossible"))),
      "image/jpeg",
      quality,
    ),
  );

  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}

const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
const ACCEPTED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

export function isAcceptedImage(file: File): boolean {
  if (ACCEPTED.includes(file.type.toLowerCase())) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return !!ext && ACCEPTED_EXT.includes(ext);
}
