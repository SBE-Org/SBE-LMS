import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { Readable } from 'node:stream';
import { filesBucket, getBucket } from '../db.js';
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
export async function sendStoredFile(req, res, file, download, bucket = filesBucket()) {
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

// ---- images and documents (logos, signatures, student documents) -------------------

/** Detects the real type of an uploaded buffer from its first bytes. */
export function sniffType(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const head = buf.slice(0, 1024).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

/**
 * Rejects SVG files that could run code or load outside resources. Logos are also served
 * with a strict Content-Security-Policy and shown through <img>, which never runs scripts.
 */
export function checkSvg(buf) {
  const text = buf.toString('utf8');
  if (/<script|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|javascript:|data:text\/html|<!ENTITY/i.test(text)) {
    fail(422, 'This SVG contains scripts or embedded content, which is not allowed. Export it again as a plain SVG or use PNG.');
  }
  if (/(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/)/i.test(text)) {
    fail(422, 'This SVG links to outside files. Use a self-contained SVG or a PNG instead.');
  }
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf', svg: 'image/svg+xml' };

/**
 * Validates an in-memory upload: extension, real content and size.
 * `allowed` is a list such as ['png', 'jpg', 'svg']. Returns the detected type.
 */
export function checkBufferUpload(file, allowed, maxMb, what = 'file') {
  if (!file?.buffer?.length) fail(422, `The ${what} is empty.`);
  if (file.size > maxMb * 1024 * 1024) fail(422, `The ${what} is larger than ${maxMb} MB.`);
  const ext = extOf(file.originalname).replace('jpeg', 'jpg');
  const kind = sniffType(file.buffer);
  const label = allowed.map((a) => a.toUpperCase()).join(', ');
  if (!kind || !allowed.includes(kind) || (ext && ext !== kind)) {
    fail(422, `The ${what} must be a real ${label} file${ext && kind && ext !== kind ? ' (its content does not match its extension)' : ''}.`);
  }
  if (kind === 'svg') checkSvg(file.buffer);
  return kind;
}

/** Saves an in-memory upload into a GridFS bucket. Returns { fileId, name, contentType, size, uploadedAt }. */
export async function storeBuffer(bucketName, file, kind) {
  const name = path.basename(String(file.originalname || `upload.${kind}`)).replace(/[^\w.\- ()]+/g, '_').slice(0, 150);
  const contentType = MIME[kind] || 'application/octet-stream';
  const stream = getBucket(bucketName).openUploadStream(name, { metadata: { contentType } });
  await new Promise((resolve, reject) => {
    Readable.from(file.buffer).on('error', reject).pipe(stream).on('error', reject).on('finish', resolve);
  });
  return { fileId: stream.id, name, contentType, size: file.size, uploadedAt: new Date() };
}

export async function deleteBucketFile(bucketName, id) {
  if (!id) return;
  try {
    await getBucket(bucketName).delete(toId(id));
  } catch {
    /* already gone */
  }
}

/** Small image/document uploads kept in memory (logos, signatures, registration documents). */
export const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
export const registrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 6, fields: 60 },
}).fields([{ name: 'photo', maxCount: 1 }, { name: 'documents', maxCount: 5 }]);
