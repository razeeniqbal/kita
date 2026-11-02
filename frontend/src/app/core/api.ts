import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export const API = '/api/v1';

/** Thin promise wrapper for writes. Reads use httpResource in the pages. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    return firstValueFrom(this.http.get<T>(API + path, { params: params && new HttpParams({ fromObject: params }) }));
  }
  post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(API + path, body));
  }
  put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(API + path, body));
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(API + path, body));
  }
  delete(path: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(API + path));
  }
}

export function eventPath(eventId: string, path = ''): string {
  return `/planning-events/${eventId}${path}`;
}

export function isConflict(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 409 && typeof error.error?.detail === 'object';
}

/** The API answers errors as {"detail": "..."} in plain English; validation errors are a list. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message);
    if (Array.isArray(detail)) {
      const first = detail[0];
      const field = Array.isArray(first?.loc) ? String(first.loc.at(-1)).replace(/_/g, ' ') : 'A field';
      return `${field.charAt(0).toUpperCase() + field.slice(1)}: ${String(first?.msg ?? 'is not valid').toLowerCase()}.`;
    }
    if (error.status === 0) return "Can't reach kita right now. Check your connection and try again.";
  }
  return 'Something went wrong. Please try again.';
}
