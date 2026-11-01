"""API tests. Names that start with test_spec_ cover the critical cases in spec v1.2 section 13."""
import datetime as dt
import uuid

from conftest import SEED, auth, token

from app.summaries import today


def url(event_id, path=""):
    return f"/api/v1/planning-events/{event_id}{path}"


def add_task(client, world, event_id, **fields):
    r = client.post(url(event_id, "/tasks"), json={"title": "Pilih cincin", **fields}, headers=auth(world.razeen))
    assert r.status_code == 201, r.text
    return r.json()


def add_expense(client, world, event_id, **fields):
    r = client.post(url(event_id, "/expenses"), json={"name": "Cincin", **fields}, headers=auth(world.razeen))
    assert r.status_code == 201, r.text
    return r.json()


def pay(client, world, event_id, expense_id, amount_sen, who="razeen"):
    return client.post(url(event_id, f"/expenses/{expense_id}/payments"),
                       json={"amount_sen": amount_sen, "paid_on": str(today()), "paid_by": "PARTNER_1"},
                       headers=auth(getattr(world, who)))


# Sign-in and membership ---------------------------------------------------------------------------

def test_public_config_needs_no_sign_in_and_has_no_secrets(client):
    r = client.get("/api/v1/public-config")
    assert r.status_code == 200
    assert set(r.json()) == {"supabase_url", "supabase_anon_key", "auth_configured"}


def test_requests_without_a_valid_token_are_refused(client, world):
    assert client.get("/api/v1/planning-events").status_code == 401
    assert client.get("/api/v1/planning-events", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    expired = {"Authorization": f"Bearer {token(world.razeen, expires_in=-60)}"}
    assert client.get("/api/v1/planning-events", headers=expired).status_code == 401


def test_me_shows_membership_and_strangers_are_kept_out(client, world):
    me = client.get("/api/v1/me", headers=auth(world.sabrina)).json()
    assert me["membership"]["partner"] == "PARTNER_2"
    assert me["workspace"]["partner_1_name"] == "Razeen"

    stranger = client.get("/api/v1/me", headers=auth(world.stranger)).json()
    assert stranger["membership"] is None
    assert client.get("/api/v1/planning-events", headers=auth(world.stranger)).status_code == 403


# Spec section 13 -----------------------------------------------------------------------------------

def test_spec_1_partner_sees_the_other_partners_edit(client, world):
    task = add_task(client, world, world.tunang)
    r = client.patch(url(world.tunang, f"/tasks/{task['id']}"),
                     json={"version": task["version"], "title": "Pilih cincin tunang"}, headers=auth(world.razeen))
    assert r.status_code == 200

    seen = client.get(url(world.tunang, f"/tasks/{task['id']}"), headers=auth(world.sabrina)).json()
    assert seen["title"] == "Pilih cincin tunang"
    assert seen["version"] == task["version"] + 1
    assert seen["updated_by"] == str(world.razeen)


def test_spec_2_perkahwinan_shows_nothing_from_tunang(client, world):
    expense = add_expense(client, world, world.tunang, committed_sen=100_000, planned_sen=100_000)
    assert pay(client, world, world.tunang, expense["id"], 40_000).status_code == 201
    client.post(url(world.tunang, "/guests"), json={"name": "Mak Long", "seats": 4}, headers=auth(world.razeen))
    add_task(client, world, world.tunang)

    sabrina = auth(world.sabrina)
    budget = client.get(url(world.perkahwinan, "/budget/summary"), headers=sabrina).json()
    assert budget["planned_sen"] == budget["committed_sen"] == budget["paid_sen"] == 0
    assert client.get(url(world.perkahwinan, "/expenses"), headers=sabrina).json() == []
    assert client.get(url(world.perkahwinan, "/guests"), headers=sabrina).json()["summary"]["total"] == 0
    assert client.get(url(world.perkahwinan, "/dashboard"), headers=sabrina).json()["progress"]["total"] == 0
    # A Tunang record cannot be reached through the Perkahwinan path either.
    assert client.get(url(world.perkahwinan, f"/expenses/{expense['id']}"), headers=sabrina).status_code == 404


def test_spec_3_each_mode_keeps_its_own_date_and_progress(client, world):
    tunang = client.get(url(world.tunang), headers=auth(world.razeen)).json()
    date = today() + dt.timedelta(days=45)
    client.patch(url(world.tunang), json={"version": tunang["version"], "target_date": str(date)},
                 headers=auth(world.razeen))
    task = add_task(client, world, world.tunang)
    client.patch(url(world.tunang, f"/tasks/{task['id']}"), json={"version": 1, "status": "DONE"},
                 headers=auth(world.razeen))

    t = client.get(url(world.tunang, "/dashboard"), headers=auth(world.razeen)).json()
    p = client.get(url(world.perkahwinan, "/dashboard"), headers=auth(world.razeen)).json()
    assert t["days_until"] == 45 and t["progress"]["percent"] == 100
    assert p["days_until"] is None and p["progress"]["total"] == 0


def test_spec_4_forged_ids_from_another_workspace_return_404(client, world):
    task = add_task(client, world, world.tunang)
    outsider = auth(world.outsider)
    assert client.get(url(world.tunang), headers=outsider).status_code == 404
    assert client.get(url(world.tunang, "/tasks"), headers=outsider).status_code == 404
    # Their own event id with our task id: still not found.
    assert client.get(url(world.outsider_event, f"/tasks/{task['id']}"), headers=outsider).status_code == 404
    assert client.patch(url(world.outsider_event, f"/tasks/{task['id']}"), json={"version": 1, "title": "x"},
                        headers=outsider).status_code == 404
    assert client.delete(url(world.outsider_event, f"/tasks/{task['id']}"), headers=outsider).status_code == 404
    assert client.post(url(world.tunang, "/guests"), json={"name": "x"}, headers=outsider).status_code == 404
    # And the other way round.
    assert client.get(url(world.outsider_event), headers=auth(world.razeen)).status_code == 404


def test_spec_5_deposit_and_final_payment_reconcile_to_the_sen(client, world, pg):
    event = client.get(url(world.tunang), headers=auth(world.razeen)).json()
    client.patch(url(world.tunang), json={"version": event["version"], "target_budget_sen": 2_000_000},
                 headers=auth(world.razeen))
    expense = add_expense(client, world, world.tunang, planned_sen=130_000, committed_sen=125_050)

    assert pay(client, world, world.tunang, expense["id"], 50_025).status_code == 201
    final = pay(client, world, world.tunang, expense["id"], 75_025, who="sabrina")
    assert final.status_code == 201
    assert final.json()["paid_sen"] == 125_050 and final.json()["balance_sen"] == 0

    summary = client.get(url(world.tunang, "/budget/summary"), headers=auth(world.razeen)).json()
    assert summary["committed_sen"] == 125_050 and summary["paid_sen"] == 125_050
    assert summary["outstanding_sen"] == 0
    assert summary["remaining_to_allocate_sen"] == 2_000_000 - 130_000

    # One sen over is refused and nothing is saved.
    over = pay(client, world, world.tunang, expense["id"], 1)
    assert over.status_code == 422 and "committed amount" in over.json()["detail"]
    assert pg.execute("select count(*) from kita.payments").fetchone()[0] == 2

    # Lowering the commitment below what is already paid is refused too.
    lower = client.patch(url(world.tunang, f"/expenses/{expense['id']}"),
                         json={"version": expense["version"], "committed_sen": 100_000}, headers=auth(world.razeen))
    assert lower.status_code == 422

    # Once overpayment is explicitly allowed, it saves.
    allowed = client.patch(url(world.tunang, f"/expenses/{expense['id']}"),
                           json={"version": expense["version"], "allow_overpayment": True}, headers=auth(world.razeen))
    assert allowed.status_code == 200
    assert pay(client, world, world.tunang, expense["id"], 1).json()["paid_sen"] == 125_051

    # Negative and zero payments never reach the database.
    assert pay(client, world, world.tunang, expense["id"], -100).status_code == 422
    assert pay(client, world, world.tunang, expense["id"], 0).status_code == 422


def test_spec_9_a_stale_edit_is_refused_instead_of_overwriting(client, world):
    task = add_task(client, world, world.tunang)
    first = client.patch(url(world.tunang, f"/tasks/{task['id']}"),
                         json={"version": task["version"], "title": "Razeen's change"}, headers=auth(world.razeen))
    assert first.status_code == 200

    second = client.patch(url(world.tunang, f"/tasks/{task['id']}"),
                          json={"version": task["version"], "title": "Sabrina's change"}, headers=auth(world.sabrina))
    assert second.status_code == 409
    assert second.json()["detail"]["current"]["title"] == "Razeen's change"
    stored = client.get(url(world.tunang, f"/tasks/{task['id']}"), headers=auth(world.sabrina)).json()
    assert stored["title"] == "Razeen's change"


# Mode boundaries ----------------------------------------------------------------------------------

def test_a_task_cannot_link_to_a_cost_in_the_other_mode(client, world):
    task = add_task(client, world, world.tunang)
    other_mode_cost = add_expense(client, world, world.perkahwinan)
    r = client.patch(url(world.tunang, f"/tasks/{task['id']}"),
                     json={"version": task["version"], "expense_id": other_mode_cost["id"]}, headers=auth(world.razeen))
    assert r.status_code == 422


def test_moving_a_task_clears_its_cost_link_and_is_logged(client, world):
    cost = add_expense(client, world, world.tunang)
    task = add_task(client, world, world.tunang, expense_id=cost["id"], category="Cincin & hantaran")

    moved = client.post(url(world.tunang, f"/tasks/{task['id']}/move"), json={"version": task["version"]},
                        headers=auth(world.razeen))
    assert moved.status_code == 200, moved.text
    body = moved.json()
    assert body["planning_event_id"] == str(world.perkahwinan)
    assert body["moved_from_event_id"] == str(world.tunang)
    assert body["expense_id"] is None and body["category"] == "Lain-lain"

    assert client.get(url(world.tunang, "/tasks"), headers=auth(world.razeen)).json() == []
    assert len(client.get(url(world.perkahwinan, "/tasks"), headers=auth(world.razeen)).json()) == 1
    activity = client.get("/api/v1/activity", headers=auth(world.sabrina)).json()
    assert any(a["action"] == "task.moved" and "from Tunang to Perkahwinan" in a["summary"] for a in activity)


# Features ----------------------------------------------------------------------------------------

def test_completed_at_follows_status(client, world):
    task = add_task(client, world, world.tunang)
    done = client.patch(url(world.tunang, f"/tasks/{task['id']}"), json={"version": 1, "status": "DONE"},
                        headers=auth(world.razeen)).json()
    assert done["completed_at"] is not None
    reopened = client.patch(url(world.tunang, f"/tasks/{task['id']}"), json={"version": 2, "status": "IN_PROGRESS"},
                            headers=auth(world.razeen)).json()
    assert reopened["completed_at"] is None


def test_dashboard_and_calendar_combine_dates(client, world):
    razeen = auth(world.razeen)
    event = client.get(url(world.tunang), headers=razeen).json()
    client.patch(url(world.tunang), json={"version": event["version"], "target_date": str(today() + dt.timedelta(days=30))},
                 headers=razeen)
    add_task(client, world, world.tunang, title="Tempah jurugambar", due_date=str(today() + dt.timedelta(days=3)))
    add_expense(client, world, world.tunang, name="Katering", committed_sen=500_000,
                balance_due_date=str(today() + dt.timedelta(days=10)))
    client.post(url(world.tunang, "/calendar-events"),
                json={"title": "Lawat dewan", "event_date": str(today() + dt.timedelta(days=5)), "type": "VENUE_VISIT"},
                headers=razeen)
    client.post(url(world.perkahwinan, "/calendar-events"),
                json={"title": "Kursus pra-perkahwinan", "event_date": str(today() + dt.timedelta(days=7))},
                headers=razeen)

    dash = client.get(url(world.tunang, "/dashboard"), headers=razeen).json()
    assert dash["days_until"] == 30
    assert [a["title"] for a in dash["next_actions"]] == ["Tempah jurugambar"]
    assert [i["kind"] for i in dash["upcoming"]] == ["TASK_DUE", "VENUE_VISIT", "PAYMENT_DUE", "EVENT_DAY"]

    own = client.get(url(world.tunang, "/calendar"), headers=razeen).json()
    assert len(own) == 4 and not any(i["read_only"] for i in own)
    both = client.get(url(world.tunang, "/calendar"), params={"include_other_mode": True}, headers=razeen).json()
    other = [i for i in both if i["read_only"]]
    assert len(both) == 5 and other[0]["mode"] == "PERKAHWINAN"


def test_copying_guests_skips_people_already_listed(client, world):
    razeen = auth(world.razeen)
    client.post(url(world.perkahwinan, "/guests"), json={"name": "Mak Long", "seats": 4, "rsvp": "ATTENDING",
                                                         "invitation": "INVITED"}, headers=razeen)
    client.post(url(world.perkahwinan, "/guests"), json={"name": "Pak Su", "seats": 2}, headers=razeen)
    client.post(url(world.tunang, "/guests"), json={"name": "mak long "}, headers=razeen)

    r = client.post(url(world.tunang, "/guests/copy-from-other-mode"), headers=razeen)
    assert r.json() == {"copied": 1}
    listed = client.get(url(world.tunang, "/guests"), headers=razeen).json()
    pak_su = next(g for g in listed["guests"] if g["name"] == "Pak Su")
    assert pak_su["rsvp"] == "PENDING" and pak_su["invitation"] == "NOT_INVITED" and pak_su["seats"] == 2
    assert listed["summary"]["total"] == 2


def test_vendor_contact_is_shared_but_bookings_are_per_mode(client, world, pg):
    razeen = auth(world.razeen)
    booked = client.post(url(world.tunang, "/vendors"), json={"name": "Studio Cahaya", "category": "Photography",
                                                              "status": "BOOKED", "quote_sen": 180_000}, headers=razeen)
    assert booked.status_code == 201, booked.text
    vendor_id = booked.json()["vendor_id"]
    reused = client.post(url(world.perkahwinan, "/vendors"), json={"vendor_id": vendor_id, "quote_sen": 450_000},
                         headers=razeen).json()
    assert reused["name"] == "Studio Cahaya" and reused["status"] == "CONSIDERING"

    client.delete(url(world.tunang, f"/vendors/{booked.json()['id']}"), headers=razeen)
    assert pg.execute("select count(*) from kita.vendors").fetchone()[0] == 1   # still used by Perkahwinan
    client.delete(url(world.perkahwinan, f"/vendors/{reused['id']}"), headers=razeen)
    assert pg.execute("select count(*) from kita.vendors").fetchone()[0] == 0


def test_unknown_or_invalid_ids_and_fields(client, world):
    razeen = auth(world.razeen)
    assert client.get(url(world.tunang, f"/tasks/{uuid.uuid4()}"), headers=razeen).status_code == 404
    assert client.get(url("not-a-uuid"), headers=razeen).status_code == 422
    assert client.post(url(world.tunang, "/tasks"), json={"title": "  "}, headers=razeen).status_code == 422
    assert client.post(url(world.tunang, "/tasks"), json={"title": "x", "status": "BLOCKED"},
                       headers=razeen).status_code == 422
    assert client.post(url(world.tunang, "/tasks"), json={"title": "x", "surprise": 1},
                       headers=razeen).status_code == 422
    task = add_task(client, world, world.tunang)
    assert client.patch(url(world.tunang, f"/tasks/{task['id']}"), json={"version": 1, "title": None},
                        headers=razeen).status_code == 422


def test_seed_applies_to_a_fresh_schema(pg):
    pg.execute("begin")
    try:
        pg.execute(SEED.read_text(encoding="utf-8"))
        per_mode = dict(pg.execute("select e.mode, count(*) from kita.tasks t join kita.planning_events e "
                                   "on e.id = t.planning_event_id group by 1").fetchall())
        assert per_mode == {"TUNANG": 21, "PERKAHWINAN": 27}
        assert pg.execute("select count(*) from kita.budget_categories").fetchone()[0] == 24
    finally:
        pg.execute("rollback")
