"""Notes and inspiration, and documents (spec 5.7).

Document files go straight from the browser to the private "documents" storage bucket
(supabase/migrations/20261102150000_document_storage.sql); this API keeps their name, type and size."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.engine import Connection

from app.crud import insert_row, log
from app.db import get_db
from app.deps import Event, Member, get_event, get_member
from app.routers.factory import register_crud
from app.schemas import DocumentCreate, DocumentUpdate, NoteCreate, NoteUpdate
from app.tables import documents, notes

router = APIRouter(prefix="/planning-events/{event_id}", tags=["notes and documents"])

register_crud(router, "/notes", notes, "note", NoteCreate, NoteUpdate,
              order_by=(notes.c.pinned.desc(), notes.c.updated_at.desc()))


@router.post("/documents", status_code=status.HTTP_201_CREATED)
def add_document(body: DocumentCreate, event: Event = Depends(get_event), member: Member = Depends(get_member),
                 db: Connection = Depends(get_db)):
    if not body.storage_path.startswith(f"{event.workspace_id}/{event.id}/"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That file belongs to a different plan.")
    row = insert_row(db, documents, {**body.model_dump(), "planning_event_id": event.id}, member)
    log(db, member, event.id, "document.created", "document", row["id"], f"added document “{row['name']}”")
    db.commit()
    return row


register_crud(router, "/documents", documents, "document", None, DocumentUpdate,
              order_by=(documents.c.created_at.desc(),), label="name")
