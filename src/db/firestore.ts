import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { env } from '../config/env';

if (getApps().length === 0) {
  initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
    ...(env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }),
  });
}

// FIRESTORE_EMULATOR_HOST is recognized automatically by firebase-admin.
export const firestore = getFirestore();
