import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
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
  const session = inject(SessionStore);
  const router = inject(Router);
  try {
    await session.load();
  } catch {
    return router.parseUrl('/login');
  }
  return session.me()?.membership ? true : router.parseUrl('/not-invited');
};

export const signedOutGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.signedIn() && !auth.needsPassword() ? router.parseUrl('/') : true;
};
