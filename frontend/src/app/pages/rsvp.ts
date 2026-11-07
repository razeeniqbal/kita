import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Api, errorMessage } from '../core/api';
import { Mode } from '../core/models';
import { Icon } from '../shared/icon';

interface Invitation {
  couple: string;
  partners: [string, string];
  event: { mode: Mode; label: string; name: string; date: string | null; start_time: string | null; venue: string;
           rsvp_by: string | null; hosts: string; programme: string };
  closed: boolean;
  /** Null on the shared link, where the guest types their own details. */
  guest: { name: string; seats: number; rsvp: 'PENDING' | 'ATTENDING' | 'DECLINED'; note: string } | null;
}

/** Largest party a guest can give on the shared link. */
const SHARED_MAX = 10;
const PETALS = Array.from({ length: 14 }, (_, i) => i);

/**
 * The guest invitation, opened from a private RSVP link (/rsvp/<token>) or the event's shared link
 * (/jemputan/<token>), with no sign-in. A sealed envelope opens onto the date, live countdown,
 * wording, venue and RSVP. Guest-facing text is in Bahasa Melayu, as Malay invitations are.
 */
@Component({
  selector: 'k-rsvp',
  imports: [Icon],
  templateUrl: './rsvp.html',
  styleUrl: './rsvp.css',
  host: { '[class.sage]': "inv()?.event?.mode === 'PERKAHWINAN'" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rsvp implements OnInit {
  readonly token = input.required<string>();
  /** True on the shared link (set by the route). */
  readonly shared = input(false);
  private readonly api = inject(Api);
  private readonly location = inject(Location);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly petals = PETALS;
  protected readonly inv = signal<Invitation | null>(null);
  protected readonly missing = signal('');
  protected readonly opened = signal(false);
  protected readonly opening = signal(false);
  protected readonly answer = signal<'ATTENDING' | 'DECLINED' | null>(null);
  protected readonly seats = signal(1);
  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly note = signal('');
  protected readonly changing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly now = signal(Date.now());
  /** API path of the invitation on screen; becomes the guest's own once they answer the shared link. */
  private readonly path = signal('');

  protected readonly maxSeats = computed(() => this.inv()?.guest?.seats ?? SHARED_MAX);
  /** Days, hours, minutes and seconds until the event starts (Malaysia time), or null without a date. */
  protected readonly countdown = computed(() => {
    const e = this.inv()?.event;
    if (!e?.date) return null;
    const start = Date.parse(`${e.date}T${e.start_time ?? '00:00:00'}+08:00`);
    const left = Math.max(0, Math.floor((start - this.now()) / 1000));
    return [
      { n: Math.floor(left / 86400), label: 'Hari' }, { n: Math.floor(left / 3600) % 24, label: 'Jam' },
      { n: Math.floor(left / 60) % 60, label: 'Minit' }, { n: left % 60, label: 'Saat' },
    ];
  });

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }

  async ngOnInit(): Promise<void> {
    // Someone who already answered the shared link on this phone sees their own answer again.
    const mine = this.shared() ? remembered(this.token()) : null;
    this.path.set(mine ? `/rsvp/${mine}` : `/${this.shared() ? 'invite' : 'rsvp'}/${encodeURIComponent(this.token())}`);
    try {
      this.load(await this.api.get<Invitation>(this.path()));
    } catch (e) {
      if (mine) return this.retryShared();
      this.missing.set(errorMessage(e));
    }
  }

  private async retryShared(): Promise<void> {
    forget(this.token());
    this.path.set(`/invite/${encodeURIComponent(this.token())}`);
    try {
      this.load(await this.api.get<Invitation>(this.path()));
    } catch (e) {
      this.missing.set(errorMessage(e));
    }
  }

  private load(i: Invitation): void {
    this.inv.set(i);
    this.seats.set(i.guest ? i.guest.seats : 1);
  }

  protected open(): void {
    if (this.opening()) return;
    this.opening.set(true);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setTimeout(() => {
      this.opened.set(true);
      setTimeout(() => this.revealOnScroll());
    }, reduced ? 0 : 1300);
  }

  /** Sections fade up as they scroll into view. */
  private revealOnScroll(): void {
    const items = (this.host.nativeElement as HTMLElement).querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) return items.forEach(el => el.classList.add('in'));
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { threshold: 0.12 });
    items.forEach(el => io.observe(el));
  }

  protected change(i: Invitation): void {
    this.answer.set(i.guest && i.guest.rsvp !== 'PENDING' ? i.guest.rsvp : null);
    this.seats.set(i.guest?.seats ?? 1);
    this.note.set(i.guest?.note ?? '');
    this.changing.set(true);
  }

  protected async send(i: Invitation): Promise<void> {
    if (!i.guest && !this.name().trim()) return this.error.set('Sila isi nama anda.');
    if (!i.guest && this.phone().replace(/\D/g, '').length < 9) return this.error.set('Sila isi nombor telefon anda.');
    if (!this.answer()) return this.error.set('Sila pilih sama ada anda dapat hadir.');
    this.busy.set(true);
    this.error.set('');
    const reply = { rsvp: this.answer(), seats: this.answer() === 'ATTENDING' ? this.seats() : 1, note: this.note().trim() };
    try {
      if (i.guest) {
        this.load(await this.api.post<Invitation>(this.path(), reply));
      } else {
        const { token } = await this.api.post<{ token: string }>(this.path(),
          { ...reply, name: this.name().trim(), phone: this.phone().trim() });
        remember(this.token(), token);
        // From now on this is the guest's own invitation, so a refresh shows their answer.
        this.path.set(`/rsvp/${token}`);
        this.location.replaceState(`/rsvp/${token}`);
        this.load(await this.api.get<Invitation>(this.path()));
      }
      this.changing.set(false);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected answerLine(i: Invitation): string {
    if (i.guest?.rsvp === 'DECLINED') return 'Anda telah memaklumkan bahawa anda tidak dapat hadir.';
    const n = i.guest?.seats ?? 1;
    return n > 1 ? `Anda akan hadir, ${n} orang kesemuanya.` : 'Anda akan hadir.';
  }
  protected longDate(d: string): string {
    return new Date(`${d}T00:00:00`).toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  protected dayName(d: string): string {
    return new Date(`${d}T00:00:00`).toLocaleDateString('ms-MY', { weekday: 'long' }).toUpperCase();
  }
  protected dotDate(d: string): string {
    const [y, m, day] = d.split('-');
    return `${day}.${m}.${y}`;
  }
  protected time(t: string): string {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'PAGI' : h < 19 ? 'PETANG' : 'MALAM'}`;
  }
  protected maps(venue: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
  }
  protected waze(venue: string): string {
    return `https://waze.com/ul?q=${encodeURIComponent(venue)}&navigate=yes`;
  }
  protected cover(mode: Mode): string {
    return mode === 'PERKAHWINAN' ? '/assets/kita/perkahwinan-cover-960.webp' : '/assets/kita/tunang-cover-960.webp';
  }
}

// The guest's own token for a shared link, kept on their phone. Storage can be blocked (private mode).
const key = (shared: string) => `kita-rsvp-${shared}`;
function remembered(shared: string): string | null {
  try { return localStorage.getItem(key(shared)); } catch { return null; }
}
function remember(shared: string, own: string): void {
  try { localStorage.setItem(key(shared), own); } catch { /* answer is saved on the server either way */ }
}
function forget(shared: string): void {
  try { localStorage.removeItem(key(shared)); } catch { /* nothing to clear */ }
}
