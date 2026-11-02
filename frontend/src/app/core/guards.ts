import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { errorMessage } from './api';
import { AuthService } from './auth';
import { SessionStore } from './session';

/** Signed in, and not halfway through setting a password from an invitation link. */
export const signedInGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  if (auth.needsPassword() && auth.signedIn()) return router.parseUrl('/set-password');
  return auth.signedIn() ? true : router.parseUrl('/login');
};

/** Part of the workspace. Signed-in people who were never added see a short explanation instead. */
export const memberGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const session = inject(SessionStore);
  const router = inject(Router);
  // Guards run in parallel: don't ask the API about membership before we know someone is signed in.
  await auth.init();
  if (!auth.signedIn()) return router.parseUrl('/login');
  try {
    await session.load();
  } catch (error) {
    // Only a rejected session means "sign in again"; anything else (server or network trouble)
    // gets an explanation and a retry instead of a confusing trip back to the sign-in page.
    if (error instanceof HttpErrorResponse && error.status === 401) return router.parseUrl('/login');
    session.loadError.set(errorMessage(error));
    return router.parseUrl('/unavailable');
  }
  return session.me()?.membership ? true : router.parseUrl('/not-invited');
};

export const signedOutGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.signedIn() && !auth.needsPassword() ? router.parseUrl('/') : true;
};
