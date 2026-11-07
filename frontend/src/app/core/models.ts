/** Shapes returned by the kita API (backend/app). Money is integer sen; dates are YYYY-MM-DD. */
export type Mode = 'TUNANG' | 'PERKAHWINAN';
export type ModeSlug = 'tunang' | 'perkahwinan';
export type Partner = 'PARTNER_1' | 'PARTNER_2';
export type Assignee = Partner | 'BOTH' | 'UNASSIGNED';
export type FamilySide = Partner | 'BOTH';
export type Payer = Partner | 'BOTH' | 'OTHER';
export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'POSTPONED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH';
export type EventStatus = 'PLANNING' | 'CONFIRMED' | 'COMPLETED';
export type VendorStatus = 'CONSIDERING' | 'SHORTLISTED' | 'BOOKED' | 'COMPLETED' | 'CANCELLED';
export type Rsvp = 'PENDING' | 'ATTENDING' | 'DECLINED';
export type Invitation = 'NOT_INVITED' | 'INVITED';
export type CalendarType = 'APPOINTMENT' | 'VENUE_VISIT' | 'FAMILY_DISCUSSION' | 'FITTING' | 'PAYMENT' | 'OTHER';
export type DocumentKind = 'QUOTATION' | 'RECEIPT' | 'AGREEMENT' | 'PAPERWORK' | 'OTHER';

export const MODE_OF: Record<ModeSlug, Mode> = { tunang: 'TUNANG', perkahwinan: 'PERKAHWINAN' };
export const SLUG_OF: Record<Mode, ModeSlug> = { TUNANG: 'tunang', PERKAHWINAN: 'perkahwinan' };
export const MODES: Record<Mode, { label: string; eyebrow: string; line: string; cover: 'tunang-cover' | 'perkahwinan-cover'; other: Mode }> = {
  TUNANG: { label: 'Tunang', eyebrow: 'Our engagement journey', line: 'One step closer, together.',
            cover: 'tunang-cover', other: 'PERKAHWINAN' },
  PERKAHWINAN: { label: 'Perkahwinan', eyebrow: 'Our wedding journey', line: 'The beginning of our forever.',
                 cover: 'perkahwinan-cover', other: 'TUNANG' },
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', DONE: 'Done', POSTPONED: 'Postponed',
};
export const PRIORITY_LABEL: Record<Priority, string> = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High' };
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = { PLANNING: 'Planning', CONFIRMED: 'Confirmed', COMPLETED: 'Completed' };
export const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  CONSIDERING: 'Considering', SHORTLISTED: 'Shortlisted', BOOKED: 'Booked', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
export const RSVP_LABEL: Record<Rsvp, string> = { PENDING: 'Pending', ATTENDING: 'Attending', DECLINED: 'Declined' };
export const INVITATION_LABEL: Record<Invitation, string> = { NOT_INVITED: 'Not invited', INVITED: 'Invited' };
export const CALENDAR_TYPE_LABEL: Record<CalendarType, string> = {
  APPOINTMENT: 'Appointment', VENUE_VISIT: 'Venue visit', FAMILY_DISCUSSION: 'Family discussion',
  FITTING: 'Fitting', PAYMENT: 'Payment', OTHER: 'Other',
};
export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  QUOTATION: 'Quotation', RECEIPT: 'Receipt', AGREEMENT: 'Agreement', PAPERWORK: 'Paperwork', OTHER: 'Other',
};
/** Checklist sections come from the Bahasa Melayu starter template (spec section 6). */
export const TASK_SECTIONS: Record<Mode, string[]> = {
  TUNANG: ['Perbincangan & keluarga', 'Bajet & perbelanjaan', 'Cincin & hantaran', 'Persiapan majlis', 'Semakan akhir', 'Lain-lain'],
  PERKAHWINAN: ['Perancangan awal', 'Urusan nikah', 'Vendor & majlis', 'Tetamu & jemputan', 'Persiapan akhir', 'Lain-lain'],
};
export const VENDOR_CATEGORIES: Record<Mode, string[]> = {
  TUNANG: ['Ring', 'Attire', 'Makeup', 'Photography', 'Food & catering', 'Decoration', 'Venue', 'Other'],
  PERKAHWINAN: ['Venue', 'Catering', 'Attire', 'Makeup', 'Photography & video', 'Pelamin & decoration', 'Invitations',
                'Doorgifts', 'Officiant', 'Entertainment', 'Other'],
};

interface Versioned { id: string; version: number; created_at: string; updated_at: string; created_by?: string | null; updated_by?: string | null; }

export interface Workspace { id: string; name: string; partner_1_name: string; partner_2_name: string; version: number; }
export interface WorkspaceDetail extends Workspace {
  members: { user_id: string; partner_slot: number; role: string }[];
  planning_events: { id: string; mode: Mode; event_name: string }[];
}
export interface Me {
  user: { id: string; email: string | null };
  membership: { workspace_id: string; partner_slot: number; partner: Partner; role: string } | null;
  workspace: Workspace | null;
}
export interface Progress { total: number; done: number; in_progress: number; not_started: number; postponed: number; percent: number; }
export interface BudgetSummary {
  /** Total cost (each line's agreed price, else its estimate) and what is still to pay on it. */
  cost_sen: number; left_to_pay_sen: number;
  target_sen: number; planned_sen: number; committed_sen: number; paid_sen: number;
  remaining_to_allocate_sen: number; outstanding_sen: number; paid_by: Partial<Record<Payer, number>>;
}
export interface PlanningEvent extends Versioned {
  workspace_id: string; mode: Mode; event_name: string; target_date: string | null; status: EventStatus; target_budget_sen: number;
  venue: string; start_time: string | null; rsvp_by: string | null;
  /** Guest invitation wording: who invites, and the programme (one item per line). */
  invite_hosts: string; programme: string;
}
export interface PlanningEventWithFigures extends PlanningEvent { progress: Progress; budget: BudgetSummary; }
export interface Task extends Versioned {
  planning_event_id: string; title: string; description: string; category: string; status: TaskStatus;
  priority: Priority; due_date: string | null; assignee: Assignee; expense_id: string | null; sort_order: number;
  completed_at: string | null; moved_from_event_id: string | null;
}
export interface Payment extends Versioned { expense_id: string; amount_sen: number; paid_on: string; paid_by: Payer; reference: string; }
export interface Expense extends Versioned {
  planning_event_id: string; category_id: string | null; vendor_booking_id: string | null; name: string;
  planned_sen: number; quoted_sen: number; committed_sen: number; balance_due_date: string | null;
  allow_overpayment: boolean; notes: string; payments: Payment[]; paid_sen: number; balance_sen: number;
}
export interface Category extends Versioned { planning_event_id: string; name: string; sort_order: number; }
export interface Booking extends Versioned {
  planning_event_id: string; vendor_id: string; status: VendorStatus; quote_sen: number; notes: string;
  name: string; category: string; contact: string; vendor_notes: string; vendor_version: number;
}
export interface VendorContact extends Versioned { name: string; category: string; contact: string; notes: string; }
export interface CalendarItem {
  planning_event_id: string; mode: Mode; date: string; time: string | null;
  kind: CalendarType | 'EVENT_DAY' | 'TASK_DUE' | 'PAYMENT_DUE'; title: string; detail: string | number;
  ref: { type: 'calendar_event' | 'task' | 'expense'; id: string; version: number } | null; read_only?: boolean;
}
export interface CalendarEvent extends Versioned {
  planning_event_id: string; title: string; event_date: string; start_time: string | null; location: string;
  type: CalendarType; notes: string;
}
export interface Guest extends Versioned {
  planning_event_id: string; name: string; family_side: FamilySide; group_name: string; contact: string;
  invitation: Invitation; rsvp: Rsvp; seats: number; notes: string;
  /** Private RSVP link code, or null until the guest is invited through kita. */
  rsvp_token: string | null; rsvp_note: string; responded_at: string | null;
}
export interface GuestList { guests: Guest[]; summary: { total: number; invited: number; seats_confirmed: number; rsvp_pending: number }; }
export interface Note extends Versioned { planning_event_id: string; title: string; body: string; link: string; pinned: boolean; }
export interface DocumentRecord extends Versioned {
  planning_event_id: string; name: string; kind: DocumentKind; storage_path: string; content_type: string; size_bytes: number;
}
export type HantaranStatus = 'PLANNED' | 'BUYING' | 'BOUGHT' | 'DECORATED' | 'READY';
export const HANTARAN_STATUS_LABEL: Record<HantaranStatus, string> = {
  PLANNED: 'Planned', BUYING: 'Buying', BOUGHT: 'Bought', DECORATED: 'Gubahan done', READY: 'Ready',
};
export interface HantaranItem extends Versioned {
  planning_event_id: string; name: string; giver: Partner; tray_number: number | null; status: HantaranStatus;
  assignee: Assignee; expense_id: string | null; task_id: string | null; notes: string; sort_order: number;
  expense_name: string | null; planned_sen: number | null; committed_sen: number | null; paid_sen: number;
  task_title: string | null; task_status: TaskStatus | null;
}
export interface HantaranList {
  items: HantaranItem[];
  summary: {
    sides: Record<Partner, { items: number; trays: number; ready: number }>;
    items: number; ready: number; planned_sen: number; committed_sen: number; paid_sen: number;
  };
}

export interface Activity {
  id: number; planning_event_id: string | null; actor_user_id: string | null; action: string; entity_type: string;
  entity_id: string | null; summary: string; created_at: string;
}
export interface Dashboard {
  event: PlanningEvent; days_until: number | null; progress: Progress; budget: BudgetSummary; next_actions: Task[];
  upcoming: CalendarItem[]; guests: { total: number; seats_confirmed: number; rsvp_pending: number };
  vendors_booked: number; documents: number;
}
