import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Readable temporary password (no 0/O, 1/l/I). */
export function randomPassword(len = 10) {
  let p = '';
  for (let i = 0; i < len; i++) p += CHARS[crypto.randomInt(CHARS.length)];
  return p;
}

export const hashPassword = (plain) => bcrypt.hash(plain, 10);
export const checkPassword = (plain, hash) => bcrypt.compare(String(plain || ''), String(hash || ''));
