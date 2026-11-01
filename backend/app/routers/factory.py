"""Standard create / read / update / delete routes for a table that belongs to one planning event."""
import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import Table, select
from sqlalchemy.engine import Connection

from app.crud import as_dict, delete_scoped, get_scoped, insert_row, log, update_scoped
from app.db import get_db
from app.deps import Event, Member, get_event, get_member
from app.schemas import changes


def register_crud(
    router: APIRouter, path: str, table: Table, noun: str,
    create_model: type[BaseModel] | None, update_model: type[BaseModel], *,
    order_by: tuple = (), label: str = "title", with_list: bool = True,
    describe_update: Callable[[dict, dict], str] | None = None,
) -> None:
    entity = noun.replace(" ", "_")

    if with_list:
        @router.get(path, name=f"list_{entity}s")
        def list_items(event: Event = Depends(get_event), db: Connection = Depends(get_db)):
            stmt = select(table).where(table.c.planning_event_id == event.id).order_by(*order_by)
            return [as_dict(r) for r in db.execute(stmt)]

    if create_model is not None:
        @router.post(path, status_code=status.HTTP_201_CREATED, name=f"create_{entity}")
        def create_item(body: create_model, event: Event = Depends(get_event),  # type: ignore[valid-type]
                        member: Member = Depends(get_member), db: Connection = Depends(get_db)):
            row = insert_row(db, table, {**body.model_dump(), "planning_event_id": event.id}, member)
            log(db, member, event.id, f"{entity}.created", entity, row["id"], f"added {noun} “{row[label]}”")
            db.commit()
            return row

    @router.get(path + "/{item_id}", name=f"get_{entity}")
    def get_item(item_id: uuid.UUID, event: Event = Depends(get_event), db: Connection = Depends(get_db)):
        return get_scoped(db, table, event, item_id, noun)

    @router.patch(path + "/{item_id}", name=f"update_{entity}")
    def update_item(item_id: uuid.UUID, body: update_model, event: Event = Depends(get_event),  # type: ignore[valid-type]
                    member: Member = Depends(get_member), db: Connection = Depends(get_db)):
        values = changes(body)
        row = update_scoped(db, table, event, item_id, body.version, values, member, noun)
        summary = describe_update(row, values) if describe_update else f"updated {noun} “{row[label]}”"
        log(db, member, event.id, f"{entity}.updated", entity, row["id"], summary)
        db.commit()
        return row

    @router.delete(path + "/{item_id}", status_code=status.HTTP_204_NO_CONTENT, name=f"delete_{entity}")
    def delete_item(item_id: uuid.UUID, event: Event = Depends(get_event),
                    member: Member = Depends(get_member), db: Connection = Depends(get_db)):
        row = delete_scoped(db, table, event, item_id, noun)
        log(db, member, event.id, f"{entity}.deleted", entity, row["id"], f"deleted {noun} “{row[label]}”")
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
