-- Document files: a private Supabase Storage bucket the browser uploads to directly.
-- Files live at <workspace id>/<planning event id>/<random name>. Only signed-in members of that
-- workspace can upload, open or delete them; kita.documents keeps the name, type and size.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640,  -- 15 MB, the same limit as kita.documents
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- True when the signed-in user belongs to the workspace named by the file's first folder.
-- Security definer, because members can't read kita tables directly; it only answers yes or no.
create function public.kita_can_use_document(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from kita.workspace_members m
    where m.user_id = auth.uid() and m.workspace_id::text = split_part(object_name, '/', 1)
  )
$$;
revoke all on function public.kita_can_use_document(text) from public, anon;
grant execute on function public.kita_can_use_document(text) to authenticated;

create policy "kita members open documents" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.kita_can_use_document(name));
create policy "kita members upload documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.kita_can_use_document(name));
create policy "kita members delete documents" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.kita_can_use_document(name));
