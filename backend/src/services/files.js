import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { filesBucket } from '../db.js';
import { config } from '../config.js';
import { fail, toId } from '../utils/http.js';

/** Allowed lesson file types => MIME type. */
export const UPLOAD_TYPES = {
  pdf: 'application/pdf',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain', csv: 'text/csv',
};

const extOf = (name) => path.extname(String(name || '')).slice(1).toLowerCase();

/** Multipart parser: files go to the OS temp folder first, then into GridFS. */
export const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
});

/** Small uploads (CSV import) kept in memory. */
export const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

export function removeTemp(file) {
  if (file?.path) fs.promises.unlink(file.path).catch(() => {});
}

/** Throws a user-facing message if the file type is not allowed. */
export function checkUploadType(file) {
  const ext = extOf(file.originalname);
  if (!UPLOAD_TYPES[ext]) {
    fail(422, `That file type is not allowed. Allowed: ${Object.keys(UPLOAD_TYPES).join(', ')}.`);
  }
}

/** Saves a multer temp file into GridFS. Returns the lesson.file sub-document. */
export async function storeUpload(file) {
  checkUploadType(file);
  const name = path.basename(file.originalname);
  const contentType = UPLOAD_TYPES[extOf(name)];
  const stream = filesBucket().openUploadStream(name, { metadata: { contentType } });
  await new Promise((resolve, reject) => {
    fs.createReadStream(file.path).on('error', reject).pipe(stream).on('error', reject).on('finish', resolve);
  });
  removeTemp(file);
  return { id: stream.id, name, contentType, size: file.size };
}

export async function deleteStoredFile(id) {
  if (!id) return;
  try {
    await filesBucket().delete(toId(id));
  } catch {
    /* already gone */
  }
}

/** Streams a stored file with HTTP Range support so videos can be seeked. */
export async function sendStoredFile(req, res, file, download) {
  const bucket = filesBucket();
  const [info] = await bucket.find({ _id: toId(file.id) }).toArray();
  if (!info) fail(404, 'The file is missing on the server.');
  const size = info.length;
  let start = 0;
  let end = size - 1;
  const name = file.name || info.filename;
  const safe = name.replace(/["\r\n]/g, '');

  // The frontend (another domain, e.g. Vercel) shows PDFs in an <iframe>: allow framing for files.
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');
  res.setHeader('Content-Type', file.contentType || UPLOAD_TYPES[extOf(name)] || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`);

  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    if (range[1] === '' && range[2] !== '') {
      start = Math.max(0, size - parseInt(range[2], 10));
    } else {
      start = parseInt(range[1] || '0', 10);
      if (range[2] !== '') end = Math.min(parseInt(range[2], 10), size - 1);
    }
    if (start > end || start >= size) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      return res.end();
    }
    res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  res.setHeader('Content-Length', String(end - start + 1));
  if (size === 0) return res.end();
  bucket
    .openDownloadStream(info._id, { start, end: end + 1 })
    .on('error', () => res.destroy())
    .pipe(res);
}
