import { Routes } from '@angular/router';
import { memberGuard, signedInGuard, signedOutGuard } from './core/guards';
import { Shell } from './layout/shell';

/** Pages inside a mode. The same set serves /tunang/... and /perkahwinan/..., each with its own data. */
const modePages: Routes = [
  { path: '', title: 'Overview · kita.', loadComponent: () => import('./pages/overview').then(m => m.Overview) },
  { path: 'checklist', title: 'Checklist · kita.', loadComponent: () => import('./pages/checklist').then(m => m.Checklist) },
  { path: 'budget', title: 'Budget · kita.', loadComponent: () => import('./pages/budget').then(m => m.Budget) },
  { path: 'hantaran', title: 'Hantaran · kita.', loadComponent: () => import('./pages/hantaran').then(m => m.Hantaran) },
  { path: 'calendar', title: 'Calendar · kita.', loadComponent: () => import('./pages/calendar').then(m => m.CalendarPage) },
  { path: 'guests', title: 'Guests · kita.', loadComponent: () => import('./pages/guests').then(m => m.Guests) },
  { path: 'vendors', title: 'Vendors · kita.', loadComponent: () => import('./pages/vendors').then(m => m.Vendors) },
  { path: 'documents', title: 'Documents · kita.', loadComponent: () => import('./pages/documents').then(m => m.Documents) },
  { path: 'notes', title: 'Notes · kita.', loadComponent: () => import('./pages/notes').then(m => m.Notes) },
];

export const routes: Routes = [
  { path: 'login', title: 'Sign in · kita.', canActivate: [signedOutGuard], loadComponent: () => import('./pages/auth').then(m => m.Login) },
  { path: 'set-password', title: 'Set your password · kita.', loadComponent: () => import('./pages/auth').then(m => m.SetPassword) },
  { path: 'unavailable', title: 'kita.', loadComponent: () => import('./pages/auth').then(m => m.Unavailable) },
  { path: 'not-invited', title: 'kita.', canActivate: [signedInGuard], loadComponent: () => import('./pages/auth').then(m => m.NotInvited) },
  {
    path: '',
    component: Shell,
    canActivate: [signedInGuard, memberGuard],
    children: [
      { path: '', title: 'kita.', loadComponent: () => import('./pages/home').then(m => m.Home) },
      { path: 'tunang', children: modePages },
      { path: 'perkahwinan', children: modePages },
      { path: 'activity', title: 'Activity · kita.', loadComponent: () => import('./pages/activity').then(m => m.ActivityPage) },
      { path: 'settings', title: 'Settings · kita.', loadComponent: () => import('./pages/settings').then(m => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
