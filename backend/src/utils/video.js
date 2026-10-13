/** Recognises YouTube, Vimeo and direct video links. Returns null if unsupported. */
export function parseVideoUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { kind: 'vimeo', src: `https://player.vimeo.com/video/${m[1]}` };
  if (/^https?:\/\/\S+\.(mp4|webm|ogg)(\?\S*)?$/i.test(u)) return { kind: 'file', src: u };
  return null;
}
