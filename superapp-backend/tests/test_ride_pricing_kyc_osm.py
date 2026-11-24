"""Pricing engine, partner KYC rules and OpenStreetMap parsing (pure functions)."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest

from app.modules.delivery import kyc
from app.modules.rides import osm, pricing

CARD = NS(base_fare=Decimal("20"), per_km=Decimal("9"), min_fare=Decimal("30"))


def settings(**kw):
    d = dict(pricing_mode="dynamic", manual_multiplier=Decimal("1"), auto_surge_enabled=False,
             auto_surge_step=Decimal("0.25"), max_multiplier=Decimal("2"), peak_windows=[])
    d.update(kw)
    return NS(**d)


def at(h, m=0):  # an IST datetime
    return datetime(2026, 1, 5, h, m, tzinfo=pricing.IST)


# ── fare card ────────────────────────────────────────────────────────────────

def test_fare_card_min_and_round_up():
    assert pricing.quote_fare(CARD, Decimal("0.5"), Decimal("1")) == Decimal("30")
    assert pricing.quote_fare(CARD, Decimal("5"), Decimal("1")) == Decimal("65")
    assert pricing.quote_fare(CARD, Decimal("5.1"), Decimal("1")) == Decimal("70")
    assert pricing.quote_fare(CARD, Decimal("5"), Decimal("1.2")) == Decimal("80")    # 65*1.2=78 -> 80


# ── multipliers ──────────────────────────────────────────────────────────────

def test_fixed_mode_ignores_everything():
    s = settings(pricing_mode="fixed", manual_multiplier=Decimal("2"), peak_windows=[{"start": "00:00", "end": "23:59", "multiplier": 2}])
    assert pricing.effective_multiplier(s, now=at(9), open_requests=50, idle_riders=0) == (Decimal("1.00"), None)


def test_peak_window_inside_outside_and_overnight():
    w = [{"label": "Morning rush", "start": "08:00", "end": "10:00", "multiplier": 1.2},
         {"label": "Late night", "start": "23:00", "end": "05:00", "multiplier": 1.5}]
    assert pricing.peak_multiplier(w, at(9)) == (Decimal("1.2"), "Morning rush")
    assert pricing.peak_multiplier(w, at(10))[0] == Decimal("1")                      # end is exclusive
    assert pricing.peak_multiplier(w, at(23, 30)) == (Decimal("1.5"), "Late night")
    assert pricing.peak_multiplier(w, at(2)) == (Decimal("1.5"), "Late night")        # wraps past midnight
    assert pricing.peak_multiplier(w, at(14))[0] == Decimal("1")


def test_overlapping_windows_use_the_highest():
    w = [{"start": "08:00", "end": "12:00", "multiplier": 1.2}, {"label": "Rain", "start": "09:00", "end": "11:00", "multiplier": 1.4}]
    assert pricing.peak_multiplier(w, at(10)) == (Decimal("1.4"), "Rain")


def test_demand_multiplier_grows_with_shortage_and_handles_no_riders():
    step = Decimal("0.25")
    assert pricing.demand_multiplier(0, 0, step) == Decimal("1")
    assert pricing.demand_multiplier(2, 3, step) == Decimal("1")        # enough riders
    assert pricing.demand_multiplier(4, 2, step) == Decimal("1.50")     # 2 short
    assert pricing.demand_multiplier(2, 0, step) == Decimal("2.00")     # nobody online: counted double


def test_dynamic_multiplier_combines_clamps_and_names_reason():
    s = settings(manual_multiplier=Decimal("1.1"), auto_surge_enabled=True, max_multiplier=Decimal("1.8"),
                 peak_windows=[{"label": "Evening rush", "start": "17:00", "end": "20:00", "multiplier": 1.3}])
    m, why = pricing.effective_multiplier(s, now=at(18), open_requests=6, idle_riders=2)   # 1.1 * 1.3 * 2.0 -> capped 1.8
    assert m == Decimal("1.80") and why == "High demand"
    m, why = pricing.effective_multiplier(s, now=at(12), open_requests=0, idle_riders=2)   # only manual 1.1
    assert m == Decimal("1.10") and why == "Special pricing"
    m, why = pricing.effective_multiplier(settings(), now=at(12), open_requests=0, idle_riders=2)
    assert (m, why) == (Decimal("1.00"), None)


def test_validate_windows():
    assert pricing.validate_windows([{"start": "8:00", "end": "10:00", "multiplier": 1.2}])[0]["start"] == "08:00"
    for bad in ({"start": "08:00", "end": "08:00", "multiplier": 1.2}, {"start": "08:00", "end": "10:00", "multiplier": 3.5},
                {"start": "xx", "end": "10:00", "multiplier": 1.2}):
        with pytest.raises(ValueError):
            pricing.validate_windows([bad])


def test_now_ist_is_utc_plus_530():
    assert pricing.now_ist(datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)).strftime("%H:%M") == "05:30"


# ── KYC ──────────────────────────────────────────────────────────────────────

TODAY = date(2026, 6, 1)


def good(**kw):
    d = dict(vehicle_class="bike", license_no="RJ14 2019 0012345", vehicle_number="rj14 ab 1234", dob="1998-04-02",
             dl_expiry="2035-01-01", rc_expiry="2031-01-01", insurance_expiry="2027-01-01", vehicle_make_model="Honda Activa",
             emergency_name="Mother", emergency_phone="9876543210", aadhaar_last4="1234", upi_id="raj@okaxis")
    d.update(kw)
    return d


def test_kyc_accepts_valid_and_normalises():
    out = kyc.validate_partner(good(), today=TODAY)
    assert out["license_no"] == "RJ1420190012345" and out["vehicle_number"] == "RJ14AB1234"
    assert out["vehicle_type"] == "Bike" and out["aadhaar_last4"] == "1234"


@pytest.mark.parametrize("field,value,fragment", [
    ("license_no", "12345", "driving licence"),
    ("license_no", "RJ14 1850 0012345", "driving licence"),        # issue year before 1900s range
    ("vehicle_number", "RJ-14-1234", "registration"),
    ("vehicle_class", "truck", "Bike, Auto or Cab"),
    ("dob", "2012-01-01", "at least 18"),
    ("dl_expiry", "2025-01-01", "Licence expiry has passed"),
    ("insurance_expiry", "2026-06-01", "Insurance expiry has passed"),
    ("emergency_phone", "12345", "emergency contact"),
    ("aadhaar_last4", "123456789012", "LAST 4"),
    ("upi_id", "no-at-sign", "UPI"),
    ("vehicle_make_model", "", "make"),
])
def test_kyc_rejects_bad_input(field, value, fragment):
    with pytest.raises(ValueError) as e:
        kyc.validate_partner(good(**{field: value}), today=TODAY)
    assert fragment.lower() in str(e.value).lower()


def test_kyc_age_rules_by_vehicle_and_bharat_series():
    teen = good(dob="2007-01-01")
    assert kyc.validate_partner(teen, today=TODAY)["vehicle_class"] == "bike"                 # 19 ok on a bike
    with pytest.raises(ValueError):
        kyc.validate_partner(good(dob="2007-01-01", vehicle_class="cab"), today=TODAY)        # cab needs 20
    assert kyc.valid_reg("22BH1234AA") and kyc.valid_reg("DL1CAB1234") and not kyc.valid_reg("ABCD")


def test_expiry_issues_listing():
    p = NS(dl_expiry=date(2026, 1, 1), rc_expiry=None, insurance_expiry=date(2030, 1, 1))
    assert kyc.expiry_issues(p, today=TODAY) == ["Your driving licence has expired", "Add your vehicle registration expiry date"]


# ── OpenStreetMap parsing ────────────────────────────────────────────────────

def test_overpass_query_contains_all_categories_and_radius():
    q = osm.build_query(26.9, 75.8, 8000)
    assert "around:8000,26.9,75.8" in q and '"railway"="station"' in q and '"amenity"="hospital"' in q and "out center" in q


ELEMENTS = [
    {"type": "node", "id": 1, "lat": 26.919, "lon": 75.787, "tags": {"railway": "station", "name": "Jaipur Junction", "wikidata": "Q1"}},
    {"type": "way", "id": 2, "center": {"lat": 26.824, "lon": 75.812}, "tags": {"aeroway": "aerodrome", "name": "Jaipur International Airport"}},
    {"type": "node", "id": 3, "lat": 26.90, "lon": 75.80, "tags": {"amenity": "hospital", "name": "SMS Hospital"}},
    {"type": "node", "id": 4, "lat": 26.90, "lon": 75.80, "tags": {"amenity": "hospital"}},                       # no name -> dropped
    {"type": "node", "id": 5, "lat": 26.90, "lon": 75.80, "tags": {"amenity": "cafe", "name": "Some Cafe"}},      # not a category
    {"type": "node", "id": 6, "lat": 26.9201, "lon": 75.7881, "tags": {"railway": "station", "name": "Jaipur  Junction"}},  # duplicate name
]


def test_parse_ranks_dedupes_and_uses_way_centres():
    out = osm.parse_elements(ELEMENTS, (26.9124, 75.7873))
    names = [c["name"] for c in out]
    assert names[0] in ("Jaipur International Airport", "Jaipur Junction")        # top importance
    assert names.count("Jaipur Junction") == 1 and "SMS Hospital" in names
    assert "Some Cafe" not in names and len(out) == 3
    airport = next(c for c in out if c["category"] == "airport")
    assert airport["lat"] == 26.824 and airport["osm_id"] == "w2" and airport["icon"] == "✈️"
    junction = next(c for c in out if c["name"] == "Jaipur Junction")
    assert junction["score"] > 95 + 10                                              # fame bonus applied


def test_parse_limit_and_nominatim_shape():
    assert len(osm.parse_elements(ELEMENTS, (26.9, 75.8), limit=1)) == 1
    res = osm.parse_nominatim([{"lat": "26.9", "lon": "75.8", "name": "Albert Hall", "display_name": "Albert Hall, Ram Niwas Bagh, Jaipur"},
                               {"lat": "bad"}])
    assert res == [{"text": "Albert Hall", "subtitle": "Ram Niwas Bagh, Jaipur", "lat": 26.9, "lng": 75.8}]


def test_viewbox_is_ordered_left_top_right_bottom():
    left, top, right, bottom = map(float, osm.viewbox(26.9, 75.8, 20).split(","))
    assert left < 75.8 < right and bottom < 26.9 < top


def test_pick_diverse_caps_each_category():
    ranked = [{"category": "railway", "score": 100 - i, "name": f"s{i}"} for i in range(6)] + \
             [{"category": "mall", "score": 50, "name": "m"}]
    out = osm.pick_diverse(ranked, limit=10, per_category=3)
    assert [c["name"] for c in out] == ["s0", "s1", "s2", "m"]


def test_nominatim_fallback_filters_lookalikes_and_generic_names():
    rows = [
        ("railway", 95, [{"lat": "26.92", "lon": "75.78", "name": "Jaipur Junction", "category": "railway", "type": "station", "importance": 0.5, "osm_type": "node", "osm_id": 1},
                          {"lat": "26.93", "lon": "75.70", "name": "Kanakpura", "category": "place", "type": "suburb", "importance": 0.4, "osm_type": "node", "osm_id": 2}]),
        ("hospital", 80, [{"lat": "26.9", "lon": "75.8", "name": "hospital", "category": "amenity", "type": "hospital", "osm_type": "node", "osm_id": 3},
                          {"lat": "26.9", "lon": "75.8", "name": "SMS Hospital", "category": "amenity", "type": "hospital", "osm_type": "way", "osm_id": 4}]),
    ]
    out = osm.parse_nominatim_places(rows, (26.9124, 75.7873), 10)
    assert [c["name"] for c in out] == ["Jaipur Junction", "SMS Hospital"] and out[1]["osm_id"] == "w4"
