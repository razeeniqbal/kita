import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { API, Api, errorMessage, eventPath } from '../core/api';
import { ModeService } from '../core/mode';
import { FamilySide, Guest, GuestList, INVITATION_LABEL, Invitation, MODES, RSVP_LABEL, Rsvp } from '../core/models';
import { SessionStore } from '../core/session';
import { Toast } from '../core/ui';
import { Icon } from '../shared/icon';
import { EmptyState, Sheet } from '../shared/ui';

@Component({
  selector: 'k-guests',
  imports: [ReactiveFormsModule, NgTemplateOutlet, Icon, EmptyState, Sheet],
  template: `
    <div class="ph">
      <div class="ph-t"><div class="eyebrow acc">{{ modeLabel() }}</div><h1>{{ mode.mode() === 'PERKAHWINAN' ? 'Guests & RSVP' : 'Guests' }}</h1></div>
      <button type="button" class="btn" (click)="openNew()"><k-icon name="plus" [size]="18" />Add guest</button>
    </div>

    @if (list.value(); as data) {
      @if (data.guests.length) {
        <div class="tiles">
          <div class="tile"><span>Guests</span><b>{{ data.summary.total }}</b></div>
          <div class="tile"><span>Invited</span><b>{{ data.summary.invited }}</b></div>
          <div class="tile"><span>Seats confirmed</span><b>{{ data.summary.seats_confirmed }}</b></div>
          <div class="tile"><span>Pending RSVP</span><b>{{ data.summary.rsvp_pending }}</b></div>
        </div>
        <div class="toolbar">
          <label class="search"><k-icon name="search" [size]="17" /><span class="sr-only">Search guests</span>
            <input type="search" placeholder="Search guests" [value]="query()" (input)="query.set($any($event.target).value)"></label>
          <select class="sel" aria-label="Family side" [value]="side()" (change)="side.set($any($event.target).value)">
            @for (o of sides(); track o.key) { <option [value]="o.key">{{ o.label }}</option> }</select>
          <select class="sel" aria-label="RSVP" [value]="rsvp()" (change)="rsvp.set($any($event.target).value)">
            <option value="ALL">Any RSVP</option>@for (r of rsvps; track r) { <option [value]="r">{{ rsvpLabel[r] }}</option> }</select>
          <ng-container [ngTemplateOutlet]="copyButton" />
        </div>
        @for (g of groups(); track g.name) {
          <div class="sec-h"><span><span class="dot"></span>{{ g.name }}</span><b>{{ g.seats }} seats</b></div>
          <div class="list">
            @for (guest of g.guests; track guest.id) {
              <div class="row">
                <button type="button" class="row-main" (click)="openEdit(guest)"><span class="t">{{ guest.name }}</span>
                  <span class="s">{{ sideLabel(guest.family_side) }} · {{ guest.seats }} seat{{ guest.seats === 1 ? '' : 's' }}{{ guest.contact ? ' · ' + guest.contact : '' }}</span></button>
                <span class="row-end">
                  @if (guest.invitation === 'INVITED') { <span class="pill">Invited</span> }
                  <span class="pill" [class.ok]="guest.rsvp === 'ATTENDING'" [class.bad]="guest.rsvp === 'DECLINED'">{{ rsvpLabel[guest.rsvp] }}</span>
                </span>
              </div>
            }
          </div>
        } @empty { <div class="empty"><b>No matches</b>Try a different search or filter.</div> }
      } @else {
        <k-empty art="guests-envelopes" title="No guests yet" [text]="'This list is only for ' + modeLabel() + '.'" action="Add guest" (act)="openNew()" />
        <div class="toolbar" style="margin-top:12px"><ng-container [ngTemplateOutlet]="copyButton" /></div>
      }
    } @else { <div class="empty">Loading guests…</div> }

    <ng-template #copyButton>
      <button type="button" class="btn sm secondary" (click)="copy()" [disabled]="busy()"><k-icon name="copy" [size]="18" />
        {{ confirmCopy() ? 'Tap again to copy from ' + otherLabel() : 'Copy from ' + otherLabel() }}</button>
    </ng-template>

    <k-sheet [open]="sheetOpen()" [title]="editing() ? 'Guest' : 'New guest'" (closed)="sheetOpen.set(false)">
      <button sheetAction type="submit" form="guest-form" class="r" [disabled]="busy()">{{ editing() ? 'Save' : 'Add' }}</button>
      <form id="guest-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (error()) { <div class="sheet-err" role="alert">{{ error() }}</div> }
        <div class="list"><div class="field stack"><label for="g-name">Name</label><input id="g-name" formControlName="name" maxlength="160" placeholder="e.g. Mak Long &amp; family"></div></div>
        <div class="list">
          <div class="field stack"><span class="lab">Family side</span><div class="seg" role="radiogroup" aria-label="Family side">
            @for (o of sides().slice(1); track o.key) { <label><input type="radio" formControlName="family_side" [value]="o.key"><span>{{ o.short }}</span></label> }</div></div>
          <div class="field"><label for="g-group">Group</label><input id="g-group" formControlName="group_name" list="guest-groups" maxlength="200" placeholder="Family, friends, office"></div>
          <datalist id="guest-groups">@for (g of groupNames(); track g) { <option [value]="g"></option> }</datalist>
          <div class="field"><label for="g-seats">Seats</label><input id="g-seats" type="number" min="1" max="50" formControlName="seats"></div>
          <div class="field"><label for="g-contact">Contact</label><input id="g-contact" formControlName="contact" maxlength="200" placeholder="Optional"></div>
        </div>
        <div class="list">
          <div class="field stack"><span class="lab">Invitation</span><div class="seg" role="radiogroup" aria-label="Invitation">
            @for (i of invitations; track i) { <label><input type="radio" formControlName="invitation" [value]="i"><span>{{ invitationLabel[i] }}</span></label> }</div></div>
          <div class="field stack"><span class="lab">RSVP</span><div class="seg" role="radiogroup" aria-label="RSVP">
            @for (r of rsvps; track r) { <label><input type="radio" formControlName="rsvp" [value]="r"><span>{{ rsvpLabel[r] }}</span></label> }</div></div>
        </div>
        <div class="list"><div class="field stack"><label for="g-notes">Notes</label><textarea id="g-notes" formControlName="notes" rows="2"></textarea></div></div>
        <div class="sheet-acts">
          <button class="btn block" type="submit" [disabled]="busy()">{{ editing() ? 'Save changes' : 'Add guest' }}</button>
          @if (editing()) {
            <button type="button" class="btn danger block" (click)="remove()" [disabled]="busy()"><k-icon name="trash-2" [size]="18" />{{ confirmDelete() ? 'Tap again to delete' : 'Delete' }}</button>
          }
        </div>
      </form>
    </k-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Guests {
  protected readonly mode = inject(ModeService);
  private readonly session = inject(SessionStore);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);

  protected readonly rsvps: Rsvp[] = ['PENDING', 'ATTENDING', 'DECLINED'];
  protected readonly invitations: Invitation[] = ['NOT_INVITED', 'INVITED'];
  protected readonly rsvpLabel = RSVP_LABEL;
  protected readonly invitationLabel = INVITATION_LABEL;
  protected readonly query = signal('');
  protected readonly side = signal<FamilySide | 'ALL'>('ALL');
  protected readonly rsvp = signal<Rsvp | 'ALL'>('ALL');
  protected readonly sheetOpen = signal(false);
  protected readonly editing = signal<Guest | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);
  protected readonly confirmCopy = signal(false);

  protected readonly list = httpResource<GuestList>(() => {
    const id = this.mode.eventId();
    return id ? API + eventPath(id, '/guests') : undefined;
  });

  protected readonly modeLabel = computed(() => MODES[this.mode.mode()].label);
  protected readonly otherLabel = computed(() => MODES[MODES[this.mode.mode()].other].label);
  protected readonly sides = computed(() => {
    const n = this.session.names();
    return [{ key: 'ALL' as const, label: 'All sides', short: 'All' },
            { key: 'PARTNER_1' as const, label: `${n.PARTNER_1}'s side`, short: n.PARTNER_1 },
            { key: 'PARTNER_2' as const, label: `${n.PARTNER_2}'s side`, short: n.PARTNER_2 },
            { key: 'BOTH' as const, label: 'Both', short: 'Both' }];
  });
  protected readonly groupNames = computed(() => [...new Set((this.list.value()?.guests ?? []).map(g => g.group_name).filter(Boolean))]);
  protected readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    const side = this.side();
    const rsvp = this.rsvp();
    const shown = (this.list.value()?.guests ?? []).filter(g =>
      (side === 'ALL' || g.family_side === side) && (rsvp === 'ALL' || g.rsvp === rsvp)
      && (!q || [g.name, g.group_name, g.contact, g.notes].some(v => v.toLowerCase().includes(q))));
    const map = new Map<string, Guest[]>();
    for (const g of shown) map.set(g.group_name || 'No group', [...(map.get(g.group_name || 'No group') ?? []), g]);
    return [...map.entries()]
      .sort(([a], [b]) => (a === 'No group' ? 1 : b === 'No group' ? -1 : a.localeCompare(b)))
      .map(([name, guests]) => ({ name, guests: guests.sort((a, b) => a.name.localeCompare(b.name)), seats: guests.reduce((s, g) => s + g.seats, 0) }));
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    family_side: ['BOTH' as FamilySide], group_name: [''], seats: [1], contact: [''],
    invitation: ['NOT_INVITED' as Invitation], rsvp: ['PENDING' as Rsvp], notes: [''],
  });

  protected sideLabel(side: FamilySide): string {
    return side === 'BOTH' ? 'Both sides' : this.sides().find(s => s.key === side)!.label;
  }

  protected openNew(): void {
    this.editing.set(null);
    this.form.reset({ name: '', family_side: 'BOTH', group_name: '', seats: 1, contact: '', invitation: 'NOT_INVITED', rsvp: 'PENDING', notes: '' });
    this.show();
  }

  protected openEdit(g: Guest): void {
    this.editing.set(g);
    this.form.reset({ name: g.name, family_side: g.family_side, group_name: g.group_name, seats: g.seats, contact: g.contact,
                      invitation: g.invitation, rsvp: g.rsvp, notes: g.notes });
    this.show();
  }

  private show(): void {
    this.error.set('');
    this.confirmDelete.set(false);
    this.sheetOpen.set(true);
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    if (!v.name.trim()) return this.error.set("Enter the guest's name.");
    const seats = Number(v.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 50) return this.error.set('Seats must be a whole number from 1 to 50.');
    const body = { ...v, seats, name: v.name.trim(), group_name: v.group_name.trim(), contact: v.contact.trim(), notes: v.notes.trim() };
    const g = this.editing();
    const eventId = this.mode.eventId()!;
    await this.run(async () => {
      if (g) await this.api.patch(eventPath(eventId, `/guests/${g.id}`), { ...body, version: g.version });
      else await this.api.post(eventPath(eventId, '/guests'), body);
      this.toast.show(g ? 'Saved' : 'Guest added');
      this.sheetOpen.set(false);
    });
  }

  protected async remove(): Promise<void> {
    if (!this.confirmDelete()) return this.confirmDelete.set(true);
    const g = this.editing()!;
    await this.run(async () => {
      await this.api.delete(eventPath(g.planning_event_id, `/guests/${g.id}`));
      this.toast.show('Guest removed');
      this.sheetOpen.set(false);
    });
  }

  protected async copy(): Promise<void> {
    if (!this.confirmCopy()) return this.confirmCopy.set(true);
    this.confirmCopy.set(false);
    await this.run(async () => {
      const r = await this.api.post<{ copied: number }>(eventPath(this.mode.eventId()!, '/guests/copy-from-other-mode'));
      this.toast.show(r.copied ? `Copied ${r.copied} guest${r.copied === 1 ? '' : 's'} from ${this.otherLabel()}` : 'Everyone is already on this list');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.list.reload();
    } catch (err) {
      this.error.set(errorMessage(err));
      if (!this.sheetOpen()) this.toast.show(errorMessage(err));
      this.confirmDelete.set(false);
    } finally {
      this.busy.set(false);
    }
  }
}
