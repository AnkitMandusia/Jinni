"""Ride booking rules (mocked AsyncSession, like the other backend tests)."""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.modules.rides import dues as dues_svc
from app.modules.rides import router as rr
from app.modules.rides import service
from app.modules.rides.models import Ride, RideSettings, RideStatus
from app.modules.users.models import DeliveryAgentProfile, User


def S(**kw):
    d = dict(road_factor=Decimal("1.30"), max_distance_km=Decimal("25"), request_timeout_minutes=5, is_enabled=True,
             platform_upi_id=None, pricing_mode="fixed", manual_multiplier=Decimal("1"), auto_surge_enabled=False,
             auto_surge_step=Decimal("0.25"), max_multiplier=Decimal("2"), peak_windows=[], boost_options=[10, 20, 30],
             max_boost=Decimal("50"), cancel_grace_seconds=120, cancel_fee=Decimal("20"), avg_speed_kmph=25,
             service_lat=None, service_lng=None, service_radius_km=None, sos_helpline="112")
    d.update(kw)
    return RideSettings(id=1, **d)


def R(**kw):
    d = dict(id=uuid4(), ride_number="RD1", customer_id=uuid4(), status="requested", vehicle_class="bike",
             pickup_text="A", pickup_lat=26.9, pickup_lng=75.8, drop_text="B", drop_lat=26.95, drop_lng=75.85,
             distance_km=Decimal("5"), fare=Decimal("65"), payment_method="cash", payment_status="pending",
             requested_at=datetime.utcnow(), surge_multiplier=Decimal("1"), boost_amount=Decimal("0"),
             dues_amount=Decimal("0"), start_attempts=0, cancellation_fee=Decimal("0"), fee_waived=False)
    d.update(kw)
    return Ride(**d)


def P(**kw):
    d = dict(name="R", vehicle_class="bike", ride_enabled=True, take_rides=True, documents_verified=True, is_available=True,
             dl_expiry=datetime.utcnow().date() + timedelta(days=300), rc_expiry=datetime.utcnow().date() + timedelta(days=300),
             insurance_expiry=datetime.utcnow().date() + timedelta(days=300))
    d.update(kw)
    return DeliveryAgentProfile(**d)


# ── geometry / lifecycle ─────────────────────────────────────────────────────

def test_haversine_known_distance():
    d = service.haversine_km(26.9196, 75.7878, 26.9239, 75.8267)   # station -> Hawa Mahal
    assert 3.5 < d < 4.5
    assert service.haversine_km(26.9, 75.8, 26.9, 75.8) == 0


def test_trip_distance_applies_road_factor():
    s = S(road_factor=Decimal("1.5"))
    straight = service.haversine_km(26.9, 75.8, 26.95, 75.85)
    assert abs(float(service.trip_distance_km(s, 26.9, 75.8, 26.95, 75.85)) - straight * 1.5) < 0.02


def test_eta_minutes_from_speed():
    assert service.eta_minutes(S(avg_speed_kmph=30), 5) == 10
    assert service.eta_minutes(S(), 0.01) == 1


def test_service_area_circle():
    s = S(service_lat=26.9124, service_lng=75.7873, service_radius_km=Decimal("20"))
    assert service.in_service_area(s, 26.92, 75.80)
    assert not service.in_service_area(s, 28.61, 77.20)            # Delhi
    assert service.in_service_area(S(), 28.61, 77.20)              # unrestricted when unset


def test_stale_only_when_requested_and_past_timeout():
    s = S()
    old = datetime.utcnow() - timedelta(minutes=6)
    assert service.is_stale(R(requested_at=old), s)
    assert not service.is_stale(R(requested_at=datetime.utcnow()), s)
    assert not service.is_stale(R(requested_at=old, status="accepted"), s)


def test_rider_transitions_one_way_and_customer_cancel_window():
    t = service.RIDER_TRANSITIONS
    assert t["in_progress"] == ("completed",) and "completed" not in t
    assert RideStatus.IN_PROGRESS not in service.CUSTOMER_CANCELLABLE


def test_start_code_is_four_digits():
    for _ in range(100):
        c = service.new_start_code()
        assert len(c) == 4 and c.isdigit()


# ── serialization / privacy ──────────────────────────────────────────────────

def test_start_code_visible_only_to_customer():
    ride = R(status="accepted", start_code="4821", accepted_at=datetime.utcnow())
    assert service.serialize_ride(ride, viewer="customer", settings=S())["start_code"] == "4821"
    assert "start_code" not in service.serialize_ride(ride, viewer="rider", settings=S())
    assert "start_code" not in service.serialize_ride(ride, viewer="admin", settings=S())
    done = R(status="in_progress", start_code="4821")
    assert "start_code" not in service.serialize_ride(done, viewer="customer", settings=S())


def test_rider_sees_customer_phone_only_after_accept():
    c = User(id=uuid4(), name="Asha Verma", phone="+911")
    assert service.serialize_ride(R(status="requested"), customer=c, viewer="rider")["customer"] == {"name": "Asha", "phone": None}
    assert service.serialize_ride(R(status="accepted"), customer=c, viewer="rider")["customer"]["phone"] == "+911"


def test_customer_sees_rider_contact_and_vehicle_only_after_accept():
    rider = User(id=uuid4(), name="Raj", phone="+912")
    prof = P(vehicle_number="RJ14AB1234", vehicle_make_model="Honda Activa", rating=4.8, rating_count=0)
    assert service.serialize_ride(R(status="requested"), rider=rider, rider_profile=prof)["rider"] is None
    r = service.serialize_ride(R(status="accepted"), rider=rider, rider_profile=prof)["rider"]
    assert r["phone"] == "+912" and r["vehicle_number"] == "RJ14AB1234"


def test_upi_link_uses_total_payable_incl_dues():
    rider = User(id=uuid4(), name="Raj", phone="+912")
    ride = R(status="completed", payment_method="upi", dues_amount=Decimal("20"))
    out = service.serialize_ride(ride, rider=rider, rider_profile=P(upi_id="raj@upi"), settings=S(platform_upi_id="j@upi"))
    assert out["total_payable"] == 85.0 and "am=85.00" in out["upi"]["link"]
    assert service.serialize_ride(ride, rider=rider, rider_profile=P(), settings=S(platform_upi_id="j@upi"))["upi"]["vpa"] == "j@upi"
    ride.payment_status = "paid"
    assert "upi" not in service.serialize_ride(ride, rider=rider, rider_profile=P(upi_id="raj@upi"), settings=S())


def test_rider_location_shown_only_when_fresh_and_during_ride():
    now = datetime.utcnow()
    prof = P(current_lat=26.90, current_lng=75.80, last_location_at=now - timedelta(seconds=30))
    ride = R(status="accepted")
    info = service.rider_location_info(ride, prof, S(), now)
    assert info["to"] == "pickup" and info["distance_km"] >= 0 and info["eta_min"] >= 1
    prof.last_location_at = now - timedelta(minutes=10)
    assert service.rider_location_info(ride, prof, S(), now) is None          # stale -> hidden
    assert service.rider_location_info(R(status="requested"), prof, S(), now) is None
    prof.last_location_at = now
    prog = service.rider_location_info(R(status="in_progress", distance_km=Decimal("5")), prof, S(), now)
    assert prog["to"] == "drop" and 0 <= prog["progress"] <= 1


# ── cancellation fee ─────────────────────────────────────────────────────────

def test_cancel_fee_rules():
    s = S()
    now = datetime.utcnow()
    assert dues_svc.cancel_fee_now(R(status="requested"), s, now)[0] == 0                       # nobody assigned yet
    assert dues_svc.cancel_fee_now(R(status="accepted", accepted_at=now - timedelta(seconds=30)), s, now)[0] == 0   # grace
    assert dues_svc.cancel_fee_now(R(status="accepted", accepted_at=now - timedelta(seconds=300)), s, now)[0] == 20
    assert dues_svc.cancel_fee_now(R(status="arrived", accepted_at=now), s, now)[0] == 20        # rider waiting at pickup
    assert dues_svc.cancel_fee_now(R(status="accepted", accepted_at=now - timedelta(seconds=300)), S(cancel_fee=Decimal("0")), now)[0] == 0


def test_rider_fault_reasons_are_marked():
    assert dues_svc.REASON_BY_CODE["rider_asked_cancel"]["rider_fault"]
    assert not dues_svc.REASON_BY_CODE["changed_plan"]["rider_fault"]


def _cancel_db(ride):
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=ride)))
    db.commit = AsyncMock()
    return db


async def test_customer_cancel_after_grace_records_fee(monkeypatch):
    uid = uuid4()
    ride = R(customer_id=uid, status="accepted", accepted_at=datetime.utcnow() - timedelta(minutes=5), rider_id=uuid4())
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    monkeypatch.setattr(dues_svc, "release", AsyncMock())
    monkeypatch.setattr(rr, "notify", AsyncMock())
    monkeypatch.setattr(rr, "emit", AsyncMock())
    monkeypatch.setattr(rr, "_load", AsyncMock(return_value={}))
    await rr.cancel_ride(ride.id, rr.CancelRequest(reason_code="changed_plan"), User(id=uid, role="customer"), _cancel_db(ride), MagicMock())
    assert ride.status == "cancelled" and ride.cancellation_fee == Decimal("20") and ride.cancel_reason_code == "changed_plan"


async def test_customer_cancel_for_rider_fault_is_free(monkeypatch):
    uid = uuid4()
    ride = R(customer_id=uid, status="arrived", accepted_at=datetime.utcnow(), rider_id=uuid4())
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    monkeypatch.setattr(dues_svc, "release", AsyncMock())
    monkeypatch.setattr(rr, "notify", AsyncMock())
    monkeypatch.setattr(rr, "emit", AsyncMock())
    monkeypatch.setattr(rr, "_load", AsyncMock(return_value={}))
    await rr.cancel_ride(ride.id, rr.CancelRequest(reason_code="rider_asked_cancel"), User(id=uid, role="customer"), _cancel_db(ride), MagicMock())
    assert ride.cancellation_fee == 0


async def test_cancel_unknown_reason_falls_back_to_other_and_is_idempotent(monkeypatch):
    uid = uuid4()
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    monkeypatch.setattr(dues_svc, "release", AsyncMock())
    monkeypatch.setattr(rr, "notify", AsyncMock())
    monkeypatch.setattr(rr, "emit", AsyncMock())
    monkeypatch.setattr(rr, "_load", AsyncMock(return_value={}))
    ride = R(customer_id=uid, status="requested")
    await rr.cancel_ride(ride.id, rr.CancelRequest(reason_code="<script>"), User(id=uid, role="customer"), _cancel_db(ride), MagicMock())
    assert ride.cancel_reason_code == "other" and ride.cancellation_fee == 0
    db = _cancel_db(ride)
    await rr.cancel_ride(ride.id, rr.CancelRequest(), User(id=uid, role="customer"), db, MagicMock())
    db.commit.assert_not_awaited()


# ── boost ────────────────────────────────────────────────────────────────────

async def _boost(monkeypatch, ride, amount, settings=None):
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=settings or S()))
    monkeypatch.setattr(rr, "_notify_riders_new_ride", AsyncMock())
    monkeypatch.setattr(rr, "emit", AsyncMock())
    monkeypatch.setattr(rr, "_load", AsyncMock(return_value={}))
    return await rr.boost_fare(ride.id, rr.BoostRequest(amount=amount), User(id=ride.customer_id, role="customer"),
                               _cancel_db(ride), MagicMock())


async def test_boost_adds_to_fare_and_restarts_timeout(monkeypatch):
    ride = R(requested_at=datetime.utcnow() - timedelta(minutes=4))
    await _boost(monkeypatch, ride, 20)
    assert ride.fare == Decimal("85") and ride.boost_amount == Decimal("20")
    assert datetime.utcnow() - ride.requested_at < timedelta(seconds=5)


async def test_boost_rejects_unlisted_amount_cap_and_wrong_state(monkeypatch):
    with pytest.raises(HTTPException) as e:
        await _boost(monkeypatch, R(), 15)                                   # not an offered option
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        await _boost(monkeypatch, R(boost_amount=Decimal("40")), 20)         # would exceed ₹50 cap
    assert "up to" in e.value.detail
    with pytest.raises(HTTPException) as e:
        await _boost(monkeypatch, R(status="accepted"), 10)                  # rider already found
    assert e.value.status_code == 409


# ── start code ───────────────────────────────────────────────────────────────

def _start_db(ride):
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=ride)))
    db.commit = AsyncMock()
    return db


async def _start(monkeypatch, ride, uid, code):
    monkeypatch.setattr(rr, "_rider_ctx", AsyncMock(return_value=P()))
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    monkeypatch.setattr(rr, "emit", AsyncMock())
    monkeypatch.setattr(rr, "_load", AsyncMock(return_value={"ok": 1}))
    return await rr.rider_start(ride.id, rr.StartRequest(code=code), User(id=uid, role="delivery"), _start_db(ride), MagicMock())


async def test_start_requires_correct_code_and_counts_attempts(monkeypatch):
    uid = uuid4()
    ride = R(status="arrived", rider_id=uid, start_code="1234")
    with pytest.raises(HTTPException) as e:
        await _start(monkeypatch, ride, uid, "9999")
    assert e.value.status_code == 400 and "4 attempts left" in e.value.detail
    assert ride.start_attempts == 1 and ride.status == "arrived"
    await _start(monkeypatch, ride, uid, "1234")
    assert ride.status == "in_progress" and ride.started_at is not None


async def test_start_locks_after_too_many_wrong_codes(monkeypatch):
    uid = uuid4()
    ride = R(status="arrived", rider_id=uid, start_code="1234", start_attempts=5)
    with pytest.raises(HTTPException) as e:
        await _start(monkeypatch, ride, uid, "1234")                         # even the right code is refused
    assert e.value.status_code == 423


async def test_start_is_idempotent_when_already_in_progress(monkeypatch):
    uid = uuid4()
    ride = R(status="in_progress", rider_id=uid, start_code="1234")
    assert await _start(monkeypatch, ride, uid, "0000") == {"ok": 1}


# ── rating ───────────────────────────────────────────────────────────────────

async def test_rating_updates_rider_average_once(monkeypatch):
    uid, rid = uuid4(), uuid4()
    ride = R(customer_id=uid, rider_id=rid, status="completed", completed_at=datetime.utcnow())
    prof = P(rating=4.8, rating_count=0)
    db = MagicMock()
    db.execute = AsyncMock(side_effect=[MagicMock(scalar_one_or_none=MagicMock(return_value=ride)),
                                        MagicMock(scalar_one_or_none=MagicMock(return_value=prof))])
    db.commit = AsyncMock()
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    monkeypatch.setattr(rr, "_load", AsyncMock(return_value={}))
    await rr.rate_ride(ride.id, rr.RateRequest(rating=3, comment=" ok "), User(id=uid, role="customer"), db)
    assert prof.rating == 3.0 and prof.rating_count == 1 and ride.rating_comment == "ok"   # first real rating replaces default
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=ride)))
    with pytest.raises(HTTPException) as e:
        await rr.rate_ride(ride.id, rr.RateRequest(rating=5), User(id=uid, role="customer"), db)
    assert e.value.status_code == 409


async def test_rating_only_after_completion_and_within_window(monkeypatch):
    uid = uuid4()
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    for ride in (R(customer_id=uid, status="accepted"),
                 R(customer_id=uid, status="completed", completed_at=datetime.utcnow() - timedelta(days=8))):
        db = MagicMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=ride)))
        with pytest.raises(HTTPException) as e:
            await rr.rate_ride(ride.id, rr.RateRequest(rating=5), User(id=uid, role="customer"), db)
        assert e.value.status_code == 409


# ── rider eligibility ────────────────────────────────────────────────────────

def test_ride_block_reasons():
    assert rr.ride_block_reason(P()) is None
    assert "pending verification" in rr.ride_block_reason(P(documents_verified=False))
    assert "expired" in rr.ride_block_reason(P(insurance_expiry=datetime.utcnow().date() - timedelta(days=1)))
    assert "Profile" in rr.ride_block_reason(P(take_rides=False))
    assert "vehicle" in rr.ride_block_reason(P(vehicle_class=None))


async def test_rider_endpoints_reject_non_delivery_and_admin_disabled():
    with pytest.raises(HTTPException) as e:
        await rr._rider_ctx(MagicMock(), User(id=uuid4(), role="customer"))
    assert e.value.status_code == 403
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=P(ride_enabled=False))))
    with pytest.raises(HTTPException) as e:
        await rr._rider_ctx(db, User(id=uuid4(), role="delivery"))
    assert "not enabled" in e.value.detail


async def test_accept_lost_race_busy_and_wrong_vehicle(monkeypatch):
    uid = uuid4()
    ride = R()
    db = MagicMock()
    db.get = AsyncMock(return_value=ride)
    db.execute = AsyncMock(return_value=MagicMock(rowcount=0))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    monkeypatch.setattr(rr, "_rider_ctx", AsyncMock(return_value=P()))
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    monkeypatch.setattr(service, "rider_is_busy", AsyncMock(return_value=False))
    with pytest.raises(HTTPException) as e:
        await rr.rider_accept(ride.id, User(id=uid, role="delivery"), db, MagicMock())
    assert e.value.status_code == 409 and "Another rider" in e.value.detail
    monkeypatch.setattr(service, "rider_is_busy", AsyncMock(return_value=True))
    with pytest.raises(HTTPException) as e:
        await rr.rider_accept(ride.id, User(id=uid, role="delivery"), db, MagicMock())
    assert "current job" in e.value.detail
    monkeypatch.setattr(service, "rider_is_busy", AsyncMock(return_value=False))
    monkeypatch.setattr(rr, "_rider_ctx", AsyncMock(return_value=P(vehicle_class="cab")))
    with pytest.raises(HTTPException) as e:
        await rr.rider_accept(ride.id, User(id=uid, role="delivery"), db, MagicMock())
    assert e.value.status_code == 403 and "cab" in e.value.detail


async def test_accept_refused_when_documents_unverified(monkeypatch):
    monkeypatch.setattr(rr, "_rider_ctx", AsyncMock(return_value=P(documents_verified=False)))
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    with pytest.raises(HTTPException) as e:
        await rr.rider_accept(uuid4(), User(id=uuid4(), role="delivery"), MagicMock(), MagicMock())
    assert e.value.status_code == 403 and "verification" in e.value.detail


async def test_rider_step_rejects_invalid_transition_and_foreign_ride(monkeypatch):
    uid = uuid4()
    monkeypatch.setattr(rr, "_rider_ctx", AsyncMock(return_value=P()))
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    def db_with(ride):
        db = MagicMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=ride)))
        return db
    with pytest.raises(HTTPException) as e:
        await rr._rider_step(db_with(R(status="accepted", rider_id=uid)), User(id=uid, role="delivery"), uuid4(), "completed", "completed_at")
    assert e.value.status_code == 409
    with pytest.raises(HTTPException) as e:
        await rr._rider_step(db_with(R(status="accepted", rider_id=uuid4())), User(id=uid, role="delivery"), uuid4(), "arrived", "arrived_at")
    assert e.value.status_code == 404
    ride = R(status="accepted", rider_id=uid)
    out, _ = await rr._rider_step(db_with(ride), User(id=uid, role="delivery"), uuid4(), "arrived", "arrived_at")
    assert out.status == "arrived" and out.arrived_at is not None


# ── SOS ──────────────────────────────────────────────────────────────────────

async def test_sos_only_for_participants_during_ride(monkeypatch):
    cid, rid = uuid4(), uuid4()
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    monkeypatch.setattr(rr, "_notify_admins", AsyncMock())
    monkeypatch.setattr(rr, "emit", AsyncMock())
    ride = R(customer_id=cid, rider_id=rid, status="in_progress")
    def db_for(existing=None):
        db = MagicMock()
        db.get = AsyncMock(return_value=ride)
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=existing)))
        db.add = MagicMock()
        db.commit = AsyncMock()
        return db
    db = db_for()
    out = await rr.raise_sos(ride.id, rr.SOSRequest(lat=26.9, lng=75.8), User(id=cid, role="customer"), db, MagicMock())
    assert out["ok"] and out["helpline"] == "112"
    added = db.add.call_args[0][0]
    assert added.raised_by_role == "customer" and added.lat == 26.9
    db2 = db_for()
    await rr.raise_sos(ride.id, rr.SOSRequest(), User(id=rid, role="delivery"), db2, MagicMock())
    assert db2.add.call_args[0][0].raised_by_role == "rider"
    with pytest.raises(HTTPException) as e:                                  # stranger -> 404
        await rr.raise_sos(ride.id, rr.SOSRequest(), User(id=uuid4(), role="customer"), db_for(), MagicMock())
    assert e.value.status_code == 404
    db3 = db_for(existing=MagicMock())                                       # duplicate open SOS isn't re-created
    await rr.raise_sos(ride.id, rr.SOSRequest(), User(id=cid, role="customer"), db3, MagicMock())
    db3.add.assert_not_called()
    ride.status = "requested"                                                # not a live ride
    with pytest.raises(HTTPException) as e:
        await rr.raise_sos(ride.id, rr.SOSRequest(), User(id=cid, role="customer"), db_for(), MagicMock())
    assert e.value.status_code == 409


# ── location-based availability ──────────────────────────────────────────────

def _rider(vc, lat, lng, age_s=30):
    return DeliveryAgentProfile(name="R", vehicle_class=vc, current_lat=lat, current_lng=lng,
                                last_location_at=datetime.utcnow() - timedelta(seconds=age_s))


def test_riders_nearby_counts_only_fresh_and_within_radius():
    now = datetime.utcnow()
    pickup = (26.9239, 75.8267)                                    # Hawa Mahal
    riders = [
        _rider("bike", 26.9196, 75.7878),                           # ~4 km  -> in
        _rider("bike", 28.6139, 77.2090),                           # Delhi  -> out
        _rider("auto", 26.9200, 75.8300),                           # ~0.5 km -> in
        _rider("cab", 26.9230, 75.8270, age_s=900),                 # stale (15 min) -> out
        DeliveryAgentProfile(name="X", vehicle_class="cab"),        # never reported a location -> out
        _rider(None, 26.9230, 75.8270),                             # no vehicle class -> out
    ]
    out = service.riders_nearby(riders, *pickup, radius_km=6, now=now)
    assert out == {"bike": 1, "auto": 1, "cab": 0}
    assert service.riders_nearby(riders, *pickup, radius_km=0.1, now=now) == {"bike": 0, "auto": 0, "cab": 0}


async def test_rider_location_stored_when_online_even_without_ride(monkeypatch):
    prof = P(is_available=True)
    monkeypatch.setattr(rr, "_rider_ctx", AsyncMock(return_value=prof))
    monkeypatch.setattr(service, "rider_has_active_ride", AsyncMock(return_value=False))
    db = MagicMock(); db.commit = AsyncMock()
    out = await rr.rider_location(rr.LocationRequest(lat=26.9, lng=75.8), User(id=uuid4(), role="delivery"), db)
    assert out == {"ok": True} and prof.current_lat == 26.9 and prof.last_location_at is not None


async def test_rider_location_ignored_when_offline_and_idle(monkeypatch):
    prof = P(is_available=False)
    monkeypatch.setattr(rr, "_rider_ctx", AsyncMock(return_value=prof))
    monkeypatch.setattr(service, "rider_has_active_ride", AsyncMock(return_value=False))
    out = await rr.rider_location(rr.LocationRequest(lat=26.9, lng=75.8), User(id=uuid4(), role="delivery"), MagicMock())
    assert out == {"ok": False} and prof.current_lat is None


def test_only_bike_partners_get_deliveries():
    from app.modules.delivery.router import deliveries_allowed
    assert deliveries_allowed(DeliveryAgentProfile(name="a", vehicle_class="bike"))
    assert deliveries_allowed(DeliveryAgentProfile(name="a"))            # legacy partner, no class yet
    assert not deliveries_allowed(DeliveryAgentProfile(name="a", vehicle_class="auto"))
    assert not deliveries_allowed(DeliveryAgentProfile(name="a", vehicle_class="cab"))
