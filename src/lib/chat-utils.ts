import { Timestamp } from 'firebase-admin/firestore';
import { HttpError } from './http-error';

export function canonicalPair(userAId: string, userBId: string): [string, string] {
  if (userAId === userBId) throw new HttpError(400, 'A direct chat needs two different users');
  return userAId.toLowerCase() < userBId.toLowerCase()
    ? [userAId.toLowerCase(), userBId.toLowerCase()]
    : [userBId.toLowerCase(), userAId.toLowerCase()];
}

/** Matches Firestore ordering: Timestamp, then document ID as tie breaker. */
export function compareMessagePosition(
  aTime: Pick<Timestamp, 'seconds' | 'nanoseconds'>,
  aId: string,
  bTime: Pick<Timestamp, 'seconds' | 'nanoseconds'>,
  bId: string,
): number {
  if (aTime.seconds !== bTime.seconds) return aTime.seconds < bTime.seconds ? -1 : 1;
  if (aTime.nanoseconds !== bTime.nanoseconds) return aTime.nanoseconds < bTime.nanoseconds ? -1 : 1;
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

export function requireTimestamp(value: unknown): Timestamp {
  if (!(value instanceof Timestamp)) {
    throw new HttpError(500, 'Invalid Firestore timestamp');
  }
  return value;
}
