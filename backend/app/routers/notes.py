"""Notes and inspiration, and document records (spec 5.7).

File upload is not built yet: it needs a private Supabase Storage bucket and signed upload URLs.
Until then, documents can be listed, renamed, re-typed and removed."""
from fastapi import APIRouter

from app.routers.factory import register_crud
from app.schemas import DocumentUpdate, NoteCreate, NoteUpdate
from app.tables import documents, notes

router = APIRouter(prefix="/planning-events/{event_id}", tags=["notes and documents"])

register_crud(router, "/notes", notes, "note", NoteCreate, NoteUpdate,
              order_by=(notes.c.pinned.desc(), notes.c.updated_at.desc()))
register_crud(router, "/documents", documents, "document", None, DocumentUpdate,
              order_by=(documents.c.created_at.desc(),), label="name")
