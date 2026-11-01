import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input } from '@angular/core';
import {
  Activity, ArrowLeftRight, Bell, Calendar, CalendarDays, CalendarPlus, Check, ChevronRight, Clock, CloudOff, Copy,
  Ellipsis, Eye, FileText, Flag, FolderLock, Gem, Heart, HeartHandshake, House, IconNode, KeyRound, Link, ListChecks,
  Lock, LogOut, Mail, MapPin, NotebookPen, Pause, Pencil, Pin, Plus, Search, Settings, ShieldCheck, Shirt, Store,
  Trash2, Upload, User, UserRound, Users, Wallet, Wifi, X,
} from 'lucide';

/** Only the icons the app uses, so the rest of Lucide is left out of the bundle. */
const ICONS = {
  activity: Activity, 'arrow-left-right': ArrowLeftRight, bell: Bell, calendar: Calendar, 'calendar-days': CalendarDays,
  'calendar-plus': CalendarPlus, check: Check, 'chevron-right': ChevronRight, clock: Clock, 'cloud-off': CloudOff,
  copy: Copy, ellipsis: Ellipsis, eye: Eye, 'file-text': FileText, flag: Flag, 'folder-lock': FolderLock, gem: Gem,
  heart: Heart, 'heart-handshake': HeartHandshake, house: House, 'key-round': KeyRound, link: Link,
  'list-checks': ListChecks, lock: Lock, 'log-out': LogOut, mail: Mail, 'map-pin': MapPin, 'notebook-pen': NotebookPen,
  pause: Pause, pencil: Pencil, pin: Pin, plus: Plus, search: Search, settings: Settings, 'shield-check': ShieldCheck,
  shirt: Shirt, store: Store, 'trash-2': Trash2, upload: Upload, user: User, 'user-round': UserRound, users: Users,
  wallet: Wallet, wifi: Wifi, x: X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;
const SVG = 'http://www.w3.org/2000/svg';

/** A Lucide icon drawn as inline SVG. Decorative: give the surrounding control an accessible name. */
@Component({
  selector: 'k-icon',
  template: '',
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly stroke = input(1.8);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect(() => {
      const svg = document.createElementNS(SVG, 'svg');
      const attrs: Record<string, string> = {
        width: String(this.size()), height: String(this.size()), viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', 'stroke-width': String(this.stroke()), 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      };
      for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
      for (const [tag, childAttrs] of ICONS[this.name()]) {
        const el = document.createElementNS(SVG, tag);
        for (const [k, v] of Object.entries(childAttrs)) el.setAttribute(k, String(v));
        svg.appendChild(el);
      }
      this.host.nativeElement.replaceChildren(svg);
    });
  }
}
