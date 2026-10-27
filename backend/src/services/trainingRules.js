/**
 * When a course assigned by the Talent Pool counts as finished. Kept free of database code so it can be tested on its own.
 *
 *   none      the course gives no certificate      → finished when every lesson is done and every quiz passed
 *   auto      the certificate is issued at the end → the same
 *   approval  the certificate needs authorisation  → finished only once the certificate is authorised (issued)
 */
export function certificateRule(course) {
  if (!course?.certificateEnabled) return 'none';
  return course.certificateRequiresApproval ? 'approval' : 'auto';
}

/** Certificates saved before the status field existed count as issued. */
const certStatus = (c) => (c ? c.status || 'issued' : null);

/** { finished, finishedAt, waitingFor } — waitingFor: 'lessons' | 'approval' | 'revoked' | null */
export function courseFinished({ rule, completedAt, certificate }) {
  if (!completedAt) return { finished: false, finishedAt: null, waitingFor: 'lessons' };
  if (rule !== 'approval') return { finished: true, finishedAt: completedAt, waitingFor: null };
  const st = certStatus(certificate);
  if (st === 'issued') return { finished: true, finishedAt: certificate.authorizedAt || certificate.issuedAt || completedAt, waitingFor: null };
  return { finished: false, finishedAt: null, waitingFor: st === 'revoked' ? 'revoked' : 'approval' };
}

/** All assigned courses finished (and at least one assigned). */
export const allFinished = (courses) => courses.length > 0 && courses.every((c) => c.finished);
