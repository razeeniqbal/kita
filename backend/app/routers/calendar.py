"""Calendar for one mode (spec 5.4). Manual entries are editable; the rest are derived from tasks,
expenses and the event date. The other mode's dates can be included read-only."""
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.engine import Connection

from app.db import get_db
from app.deps import Event, get_event
from app.routers.factory import register_crud
from app.schemas import CalendarCreate, CalendarUpdate
from app.summaries import calendar_items, today
from app.tables import calendar_events, planning_events

router = APIRouter(prefix="/planning-events/{event_id}", tags=["calendar"])


@router.get("/calendar")
def calendar(event: Event = Depends(get_event), db: Connection = Depends(get_db),
             range: Literal["upcoming", "past", "all"] = "upcoming", include_other_mode: bool = False):
    items = [{**i, "read_only": False} for i in calendar_items(db, event.id)]
    if include_other_mode:
        other = db.scalar(select(planning_events.c.id).where(planning_events.c.workspace_id == event.workspace_id,
                                                             planning_events.c.mode != event.mode))
        if other is not None:
            items += [{**i, "read_only": True} for i in calendar_items(db, other)]
            items.sort(key=lambda i: (i["date"], str(i["time"] or "99")))
    now = today()
    if range == "upcoming":
        items = [i for i in items if i["date"] >= now]
    elif range == "past":
        items = [i for i in items if i["date"] < now][::-1]
    return items


register_crud(router, "/calendar-events", calendar_events, "calendar item", CalendarCreate, CalendarUpdate,
              order_by=(calendar_events.c.event_date, calendar_events.c.start_time))
