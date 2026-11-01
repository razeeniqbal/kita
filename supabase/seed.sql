-- kita. starter data: one workspace, both planning events, budget categories and the
-- Bahasa Melayu checklist templates from spec v1.2 section 6. Every row is editable afterwards.
--
-- Run once, on an empty schema, after the initial migration. Razeen and Sabrina are linked as
-- members (kita.workspace_members) after they accept their Supabase Auth invitations.

do $$
begin
  if exists (select 1 from kita.workspaces) then
    raise exception 'kita seed already applied: kita.workspaces is not empty';
  end if;
end $$;

with ws as (
  insert into kita.workspaces (name, partner_1_name, partner_2_name)
  values ('Razeen & Sabrina', 'Razeen', 'Sabrina')
  returning id
),
ev as (
  insert into kita.planning_events (workspace_id, mode, event_name)
  select ws.id, e.mode, e.name
  from ws, (values ('TUNANG'::kita.planning_mode, 'Majlis Tunang'),
                   ('PERKAHWINAN',                'Majlis Perkahwinan')) as e (mode, name)
  returning id, mode
),
categories as (
  insert into kita.budget_categories (planning_event_id, name, sort_order)
  select ev.id, c.name, c.sort_order
  from ev
  join (values
    ('TUNANG',  1, 'Ring'), ('TUNANG', 2, 'Hantaran & dulang'), ('TUNANG', 3, 'Attire'), ('TUNANG', 4, 'Makeup'),
    ('TUNANG',  5, 'Photography'), ('TUNANG', 6, 'Food & catering'), ('TUNANG', 7, 'Decoration'), ('TUNANG', 8, 'Venue'),
    ('TUNANG',  9, 'Gifts'), ('TUNANG', 10, 'Other'),
    ('PERKAHWINAN',  1, 'Mas kahwin'), ('PERKAHWINAN', 2, 'Hantaran'), ('PERKAHWINAN', 3, 'Rings'),
    ('PERKAHWINAN',  4, 'Nikah fees & paperwork'), ('PERKAHWINAN', 5, 'Venue'), ('PERKAHWINAN', 6, 'Catering'),
    ('PERKAHWINAN',  7, 'Attire'), ('PERKAHWINAN', 8, 'Makeup'), ('PERKAHWINAN', 9, 'Photography & video'),
    ('PERKAHWINAN', 10, 'Pelamin & decoration'), ('PERKAHWINAN', 11, 'Invitations'), ('PERKAHWINAN', 12, 'Doorgifts'),
    ('PERKAHWINAN', 13, 'Honeymoon'), ('PERKAHWINAN', 14, 'Other')
  ) as c (mode, sort_order, name) on c.mode::kita.planning_mode = ev.mode
  returning 1
)
insert into kita.tasks (planning_event_id, sort_order, category, title, description, priority, assignee)
select ev.id, t.sort_order, t.category, t.title, t.description, t.priority::kita.task_priority, t.assignee::kita.assignee
from ev
join (values
  -- Mod Pertunangan
  ('TUNANG',  1, 'Perbincangan & keluarga', 'Berbincang tentang tarikh pertunangan yang sesuai.', '', 'HIGH', 'BOTH'),
  ('TUNANG',  2, 'Perbincangan & keluarga', 'Berbincang dengan keluarga kedua-dua belah pihak.', '', 'HIGH', 'BOTH'),
  ('TUNANG',  3, 'Perbincangan & keluarga', 'Menentukan wakil keluarga dan susunan perbincangan.', '', 'NORMAL', 'BOTH'),
  ('TUNANG',  4, 'Perbincangan & keluarga', 'Menetapkan anggaran bilangan tetamu.', '', 'NORMAL', 'BOTH'),
  ('TUNANG',  5, 'Bajet & perbelanjaan', 'Menetapkan jumlah bajet pertunangan.', '', 'HIGH', 'BOTH'),
  ('TUNANG',  6, 'Bajet & perbelanjaan', 'Menyenaraikan anggaran kos mengikut kategori.', '', 'NORMAL', 'UNASSIGNED'),
  ('TUNANG',  7, 'Bajet & perbelanjaan', 'Membahagikan tanggungjawab pembayaran.', '', 'NORMAL', 'BOTH'),
  ('TUNANG',  8, 'Bajet & perbelanjaan', 'Merekod deposit dan baki bayaran.', '', 'NORMAL', 'UNASSIGNED'),
  ('TUNANG',  9, 'Cincin & hantaran', 'Memilih cincin pertunangan dan mengesahkan saiz.', '', 'NORMAL', 'UNASSIGNED'),
  ('TUNANG', 10, 'Cincin & hantaran', 'Berbincang tentang bilangan dulang hantaran, jika ada.', '', 'NORMAL', 'BOTH'),
  ('TUNANG', 11, 'Cincin & hantaran', 'Menyediakan senarai barang hantaran.', '', 'NORMAL', 'UNASSIGNED'),
  ('TUNANG', 12, 'Cincin & hantaran', 'Menentukan dekorasi dan gubahan hantaran.', '', 'NORMAL', 'UNASSIGNED'),
  ('TUNANG', 13, 'Persiapan majlis', 'Memilih lokasi majlis pertunangan.', '', 'NORMAL', 'BOTH'),
  ('TUNANG', 14, 'Persiapan majlis', 'Memilih pakaian dan jurusolek, jika diperlukan.', '', 'NORMAL', 'UNASSIGNED'),
  ('TUNANG', 15, 'Persiapan majlis', 'Mengurus makanan atau katering.', '', 'NORMAL', 'UNASSIGNED'),
  ('TUNANG', 16, 'Persiapan majlis', 'Menyediakan senarai jemputan.', '', 'NORMAL', 'UNASSIGNED'),
  ('TUNANG', 17, 'Persiapan majlis', 'Menyusun atur cara ringkas majlis.', '', 'NORMAL', 'UNASSIGNED'),
  ('TUNANG', 18, 'Persiapan majlis', 'Mengesahkan vendor, tempahan dan baki bayaran.', '', 'NORMAL', 'BOTH'),
  ('TUNANG', 19, 'Semakan akhir', 'Menghubungi keluarga dan pihak yang terlibat.', '', 'NORMAL', 'BOTH'),
  ('TUNANG', 20, 'Semakan akhir', 'Menyemak barang, pakaian, cincin dan hantaran.', '', 'NORMAL', 'UNASSIGNED'),
  ('TUNANG', 21, 'Semakan akhir', 'Menyemak jadual dan pengangkutan pada hari majlis.', '', 'NORMAL', 'UNASSIGNED'),
  -- Mod Perkahwinan
  ('PERKAHWINAN',  1, 'Perancangan awal', 'Berbincang dan menetapkan tarikh akad nikah.', '', 'HIGH', 'BOTH'),
  ('PERKAHWINAN',  2, 'Perancangan awal', 'Memutuskan sama ada mengadakan majlis resepsi atau persandingan.', '', 'HIGH', 'BOTH'),
  ('PERKAHWINAN',  3, 'Perancangan awal', 'Menetapkan bajet keseluruhan perkahwinan.', '', 'HIGH', 'BOTH'),
  ('PERKAHWINAN',  4, 'Perancangan awal', 'Menentukan lokasi akad nikah dan majlis, jika berasingan.', '', 'NORMAL', 'BOTH'),
  ('PERKAHWINAN',  5, 'Urusan nikah', 'Menyemak syarat permohonan kebenaran berkahwin negeri berkaitan.',
     'Tertakluk pada negeri dan keadaan pasangan. Sahkan dengan pihak berkuasa agama negeri.', 'HIGH', 'BOTH'),
  ('PERKAHWINAN',  6, 'Urusan nikah', 'Menyemak keperluan kursus pra-perkahwinan.', '', 'NORMAL', 'BOTH'),
  ('PERKAHWINAN',  7, 'Urusan nikah', 'Menyemak keperluan saringan HIV dan tempoh sah keputusan.', '', 'NORMAL', 'BOTH'),
  ('PERKAHWINAN',  8, 'Urusan nikah', 'Menyediakan borang dan dokumen sokongan yang diperlukan.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN',  9, 'Urusan nikah', 'Mengesahkan urusan wali, saksi dan jurunikah.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 10, 'Urusan nikah', 'Menyemak mas kahwin dan persetujuan hantaran.', '', 'NORMAL', 'BOTH'),
  ('PERKAHWINAN', 11, 'Urusan nikah', 'Mengesahkan tarikh, masa dan lokasi akad nikah.', '', 'NORMAL', 'BOTH'),
  ('PERKAHWINAN', 12, 'Vendor & majlis', 'Membandingkan pakej dewan atau lokasi majlis.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 13, 'Vendor & majlis', 'Membuat tempahan katering dan menyemak menu.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 14, 'Vendor & majlis', 'Memilih pakaian pengantin dan jurusolek.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 15, 'Vendor & majlis', 'Menempah jurugambar atau juruvideo, jika perlu.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 16, 'Vendor & majlis', 'Menyusun dekorasi, pelamin dan keperluan teknikal.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 17, 'Vendor & majlis', 'Merekod deposit, invois dan tarikh akhir bayaran.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 18, 'Tetamu & jemputan', 'Menyediakan senarai tetamu kedua-dua keluarga.', '', 'NORMAL', 'BOTH'),
  ('PERKAHWINAN', 19, 'Tetamu & jemputan', 'Menentukan kuota tetamu mengikut pihak.', '', 'NORMAL', 'BOTH'),
  ('PERKAHWINAN', 20, 'Tetamu & jemputan', 'Menyediakan kad jemputan atau jemputan digital.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 21, 'Tetamu & jemputan', 'Merekod pengesahan kehadiran (RSVP).', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 22, 'Tetamu & jemputan', 'Menyediakan pelan tempat duduk, jika perlu.', '', 'LOW', 'UNASSIGNED'),
  ('PERKAHWINAN', 23, 'Persiapan akhir', 'Menyediakan jadual perjalanan hari majlis.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 24, 'Persiapan akhir', 'Membahagikan tugas kepada ahli keluarga dan petugas.', '', 'NORMAL', 'BOTH'),
  ('PERKAHWINAN', 25, 'Persiapan akhir', 'Mengesahkan semua tempahan serta baki bayaran.', '', 'NORMAL', 'BOTH'),
  ('PERKAHWINAN', 26, 'Persiapan akhir', 'Menyemak dokumen dan barang penting.', '', 'NORMAL', 'UNASSIGNED'),
  ('PERKAHWINAN', 27, 'Persiapan akhir', 'Menyediakan pelan alternatif untuk cuaca atau perubahan saat akhir.', '', 'LOW', 'UNASSIGNED')
) as t (mode, sort_order, category, title, description, priority, assignee)
  on t.mode::kita.planning_mode = ev.mode;
