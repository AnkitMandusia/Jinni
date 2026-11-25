"""Ride booking rules (mocked AsyncSession, like the other backend tests)."""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.modules.rides import router as rr
from app.modules.rides import service
from app.modules.rides.models import Ride, RideSettings, RideStatus
from app.modules.users.models import DeliveryAgentProfile, User


def S(**kw):
    d = dict(base_fare=Decimal("20"), per_km=Decimal("9"), min_fare=Decimal("30"), road_factor=Decimal("1.30"),
             max_distance_km=Decimal("25"), request_timeout_minutes=5, is_enabled=True, platform_upi_id=None)
    d.update(kw)
    return RideSettings(id=1, **d)


def R(**kw):
    d = dict(id=uuid4(), ride_number="RD1", customer_id=uuid4(), status="requested",
             pickup_text="A", pickup_lat=26.9, pickup_lng=75.8, drop_text="B", drop_lat=26.95, drop_lng=75.85,
             distance_km=Decimal("5"), fare=Decimal("65"), payment_method="cash", payment_status="pending",
             requested_at=datetime.utcnow())
    d.update(kw)
    return Ride(**d)


# ── pricing ──────────────────────────────────────────────────────────────────

def test_haversine_known_distance():
    # Jaipur railway station -> Hawa Mahal is ~3.5 km as the crow flies
    d = service.haversine_km(26.9196, 75.7878, 26.9239, 75.8267)
    assert 3.5 < d < 4.5
    assert service.haversine_km(26.9, 75.8, 26.9, 75.8) == 0


def test_fare_rounds_up_to_5_and_respects_minimum():
    s = S()
    assert service.compute_fare(Decimal("0.5"), s) == Decimal("30")          # 24.5 -> min 30
    assert service.compute_fare(Decimal("5"), s) == Decimal("65")            # 20+45 = 65 exact
    assert service.compute_fare(Decimal("5.1"), s) == Decimal("70")          # 65.9 -> 70
    assert service.compute_fare(Decimal("10"), S(min_fare=Decimal("200"))) == Decimal("200")


def test_trip_distance_applies_road_factor():
    s = S(road_factor=Decimal("1.5"))
    straight = service.haversine_km(26.9, 75.8, 26.95, 75.85)
    assert abs(float(service.trip_distance_km(s, 26.9, 75.8, 26.95, 75.85)) - straight * 1.5) < 0.02


# ── lifecycle rules ──────────────────────────────────────────────────────────

def test_stale_only_when_requested_and_past_timeout():
    s = S(request_timeout_minutes=5)
    old = datetime.utcnow() - timedelta(minutes=6)
    assert service.is_stale(R(requested_at=old), s)
    assert not service.is_stale(R(requested_at=datetime.utcnow()), s)
    assert not service.is_stale(R(requested_at=old, status="accepted"), s)


def test_rider_transitions_are_one_way():
    t = service.RIDER_TRANSITIONS
    assert "in_progress" in t["accepted"] and "arrived" in t["accepted"]
    assert t["in_progress"] == ("completed",)
    assert "completed" not in t and "requested" not in t


def test_customer_cannot_cancel_once_on_board():
    assert RideStatus.IN_PROGRESS not in service.CUSTOMER_CANCELLABLE
    assert RideStatus.ACCEPTED in service.CUSTOMER_CANCELLABLE


# ── privacy / payment links in serialization ─────────────────────────────────

def test_rider_sees_customer_phone_only_after_accept():
    c = User(id=uuid4(), name="Asha Verma", phone="+911")
    pre = service.serialize_ride(R(status="requested"), customer=c, viewer="rider")
    assert pre["customer"] == {"name": "Asha", "phone": None}
    post = service.serialize_ride(R(status="accepted"), customer=c, viewer="rider")
    assert post["customer"]["phone"] == "+911"


def test_customer_sees_rider_contact_only_after_accept():
    rider = User(id=uuid4(), name="Raj", phone="+912")
    prof = DeliveryAgentProfile(name="Raj S", vehicle_type="Bike", rating=4.8)
    assert service.serialize_ride(R(status="requested"), rider=rider, rider_profile=prof)["rider"] is None
    assert service.serialize_ride(R(status="accepted"), rider=rider, rider_profile=prof)["rider"]["phone"] == "+912"


def test_upi_link_uses_rider_vpa_then_platform_fallback_and_only_when_unpaid():
    rider = User(id=uuid4(), name="Raj", phone="+912")
    ride = R(status="completed", payment_method="upi")
    with_rider = service.serialize_ride(ride, rider=rider, rider_profile=DeliveryAgentProfile(name="Raj", upi_id="raj@upi"),
                                        settings=S(platform_upi_id="jinni@upi"))
    assert with_rider["upi"]["vpa"] == "raj@upi" and with_rider["upi"]["link"].startswith("upi://pay?pa=raj%40upi")
    assert "am=65.00" in with_rider["upi"]["link"]
    fallback = service.serialize_ride(ride, rider=rider, rider_profile=DeliveryAgentProfile(name="Raj"),
                                      settings=S(platform_upi_id="jinni@upi"))
    assert fallback["upi"]["vpa"] == "jinni@upi"
    ride.payment_status = "paid"
    assert "upi" not in service.serialize_ride(ride, rider=rider, rider_profile=DeliveryAgentProfile(name="R", upi_id="raj@upi"),
                                               settings=S())
    assert "upi" not in service.serialize_ride(R(status="completed", payment_method="cash"), rider=rider,
                                               rider_profile=DeliveryAgentProfile(name="R", upi_id="raj@upi"), settings=S())


def test_maps_url_is_keyless_google_maps_directions():
    u = service.maps_url(26.9, 75.8)
    assert u.startswith("https://www.google.com/maps/dir/?api=1&destination=26.9,75.8")


# ── router guards ────────────────────────────────────────────────────────────

def _req(**kw):
    pt = lambda lat, lng: rr.Point(text="x place", lat=lat, lng=lng)
    return rr.EstimateRequest(pickup=pt(kw.get("a", 26.90), 75.80), drop=pt(kw.get("b", 26.95), 75.85))


def test_price_rejects_too_close_too_far_and_paused():
    with pytest.raises(HTTPException) as e:
        rr._price(S(), rr.EstimateRequest(pickup=rr.Point(text="aa", lat=26.9, lng=75.8),
                                          drop=rr.Point(text="bb", lat=26.9001, lng=75.8001)))
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        rr._price(S(max_distance_km=Decimal("2")), _req())
    assert "limited" in e.value.detail
    with pytest.raises(HTTPException) as e:
        rr._price(S(is_enabled=False), _req())
    assert e.value.status_code == 503
    dist, fare = rr._price(S(), _req())
    assert fare >= Decimal("30") and fare % 5 == 0


async def test_customer_only_booking():
    with pytest.raises(HTTPException) as e:
        await rr.estimate(_req(), User(id=uuid4(), role="delivery"), MagicMock())
    assert e.value.status_code == 403


async def test_rider_endpoints_reject_non_delivery_and_disabled_riders():
    with pytest.raises(HTTPException) as e:
        await rr._rider_ctx(MagicMock(), User(id=uuid4(), role="customer"))
    assert e.value.status_code == 403
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(
        return_value=DeliveryAgentProfile(name="R", ride_enabled=False))))
    with pytest.raises(HTTPException) as e:
        await rr._rider_ctx(db, User(id=uuid4(), role="delivery"))
    assert "not enabled" in e.value.detail


async def test_accept_lost_race_returns_409(monkeypatch):
    uid = uuid4()
    ride = R()
    db = MagicMock()
    db.get = AsyncMock(return_value=ride)
    db.execute = AsyncMock(return_value=MagicMock(rowcount=0))   # UPDATE matched nothing: someone else won
    db.commit = AsyncMock()
    monkeypatch.setattr(rr, "_rider_ctx", AsyncMock(return_value=DeliveryAgentProfile(name="R", is_available=True)))
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    monkeypatch.setattr(service, "rider_is_busy", AsyncMock(return_value=False))
    with pytest.raises(HTTPException) as e:
        await rr.rider_accept(ride.id, User(id=uid, role="delivery"), db, MagicMock())
    assert e.value.status_code == 409 and "Another rider" in e.value.detail


async def test_accept_refused_when_rider_busy(monkeypatch):
    db = MagicMock()
    monkeypatch.setattr(rr, "_rider_ctx", AsyncMock(return_value=DeliveryAgentProfile(name="R", is_available=True)))
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    monkeypatch.setattr(service, "rider_is_busy", AsyncMock(return_value=True))
    with pytest.raises(HTTPException) as e:
        await rr.rider_accept(uuid4(), User(id=uuid4(), role="delivery"), db, MagicMock())
    assert "current job" in e.value.detail


async def test_rider_step_rejects_invalid_transition_and_foreign_ride(monkeypatch):
    uid = uuid4()
    monkeypatch.setattr(rr, "_rider_ctx", AsyncMock(return_value=DeliveryAgentProfile(name="R")))
    monkeypatch.setattr(service, "get_settings", AsyncMock(return_value=S()))
    def db_with(ride):
        db = MagicMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=ride)))
        return db
    # completing straight from "accepted" is not allowed
    with pytest.raises(HTTPException) as e:
        await rr._rider_step(db_with(R(status="accepted", rider_id=uid)), MagicMock(), User(id=uid, role="delivery"),
                             uuid4(), "completed", "completed_at")
    assert e.value.status_code == 409
    # someone else's ride is a 404
    with pytest.raises(HTTPException) as e:
        await rr._rider_step(db_with(R(status="accepted", rider_id=uuid4())), MagicMock(), User(id=uid, role="delivery"),
                             uuid4(), "arrived", "arrived_at")
    assert e.value.status_code == 404
    # valid transition stamps the time
    ride = R(status="accepted", rider_id=uid)
    out, _ = await rr._rider_step(db_with(ride), MagicMock(), User(id=uid, role="delivery"), uuid4(), "in_progress", "started_at")
    assert out.status == "in_progress" and out.started_at is not None
