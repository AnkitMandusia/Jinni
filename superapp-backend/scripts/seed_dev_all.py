"""One-shot DEV seed: grocery catalogue, food restaurants + menus, and login-ready test accounts.

    docker compose exec api python scripts/seed_dev_all.py

Idempotent (safe to re-run). Refuses to run when DEBUG=false (production) unless --force,
because it creates accounts with a known password.

All accounts: password  Test@1234   (login with email + password)
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import bcrypt
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.modules.users.models import DeliveryAgentProfile, StoreProfile, User

PASSWORD = "Test@1234"
PIN, CITY, STATE = "302001", "Jaipur", "Rajasthan"

# Customer-facing / non-food partners. Food restaurant owners are created by the food seed
# and get their email+password below.
ACCOUNTS = [
    # Super admin (web console + mobile app). The second one matches scripts/seed_admin.py.
    dict(role="admin", email="admin@test.com", phone="+910000000001", name="Super Admin"),
    dict(role="admin", email="mandusiaankit.005@gmail.com", phone="+910000000002", name="Super Admin", pw="Superadmin@2024"),
    dict(role="customer", email="customer@test.com", phone="+919876543215", name="Test Customer"),
    dict(role="delivery", email="delivery@test.com", phone="+919876543211", name="Amit Singh (Delivery)", vc="bike"),
    dict(role="delivery", email="delivery2@test.com", phone="+919876543221", name="Rohit Meena (Delivery)", vc="auto"),
    dict(role="delivery", email="delivery3@test.com", phone="+919876543222", name="Imran Khan (Delivery)", vc="cab"),
    # Self-registered partner waiting for admin approval (tests the approval + verification flow)
    dict(role="delivery", email="delivery4@test.com", phone="+919876543223", name="Pending Partner", vc="bike", pending=True),
    dict(role="store", email="store@test.com", phone="+919876543214", name="Suresh Gupta (Store)"),
    dict(role="cab_driver", email="cab@test.com", phone="+919876543213", name="Vikram Patel (Cab)"),
    dict(role="salon", email="salon@test.com", phone="+919876543212", name="Priya Sharma (Salon)"),
]


VEHICLES = {  # class -> (make/model, colour, registration prefix, licence issue year)
    "bike": ("Honda Activa 6G", "Black", "RJ14SB", "2019"),
    "auto": ("Bajaj RE Compact", "Yellow-Green", "RJ14ZA", "2017"),
    "cab": ("Maruti Dzire", "White", "RJ14TA", "2016"),
}


async def _seed_partner(db, u, a) -> None:
    """Complete, valid KYC for a dev partner (verified in person, except the pending one)."""
    from datetime import date, timedelta
    pending = a.get("pending", False)
    vc = a["vc"]
    make, colour, reg, yr = VEHICLES[vc]
    last = a["phone"][-4:]
    p = (await db.execute(select(DeliveryAgentProfile).where(DeliveryAgentProfile.user_id == u.id))).scalar_one_or_none()
    if not p:
        p = DeliveryAgentProfile(user_id=u.id, name=a["name"].split(" (")[0])
        db.add(p)
    today = date.today()
    p.name = a["name"].split(" (")[0]
    p.vehicle_class, p.vehicle_type = vc, vc.capitalize()
    p.vehicle_make_model, p.vehicle_color, p.vehicle_number = make, colour, f"{reg}{last}"
    p.license_no = f"RJ14{yr}00{last}{last[-3:]}"[:15]
    p.dob = date(1996, 5, 14)
    p.dl_expiry, p.rc_expiry, p.insurance_expiry = today + timedelta(days=900), today + timedelta(days=1500), today + timedelta(days=300)
    p.aadhaar_last4, p.emergency_name, p.emergency_phone = last, "Family contact", "9876500000"
    p.pincode = p.pincode or PIN
    p.upi_id = p.upi_id or f"{a['email'].split('@')[0]}@okaxis"
    p.is_available = not pending
    p.documents_verified = not pending
    p.take_rides = p.take_deliveries = True
    p.ride_enabled = True
    # Dev convenience: appear "nearby" in central Jaipur for 5 minutes after seeding. Real riders report their GPS
    # while online (see riderRideStore.useRideLocationSharing); stale locations stop counting as available.
    from datetime import datetime
    p.current_lat, p.current_lng, p.last_location_at = 26.9124, 75.7873, (None if pending else datetime.utcnow())
    if pending:
        u.status, u.profile_complete = "pending_approval", True


def _hash() -> str:
    return bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode()


async def _get_user(db, *, email=None, phone=None):
    cond = []
    if email:
        cond.append(User.email == email)
    if phone:
        cond.append(User.phone == phone)
    from sqlalchemy import or_
    return (await db.execute(select(User).where(or_(*cond)))).scalars().first()


async def seed_accounts(db, pw_hash: str) -> list[tuple[str, str]]:
    out = []
    for a in ACCOUNTS:
        u = await _get_user(db, email=a["email"], phone=a["phone"])
        if not u:
            u = User(phone=a["phone"], email=a["email"], name=a["name"], role=a["role"],
                     status="active", profile_complete=True, is_active=True, is_verified=True)
            db.add(u)
            await db.flush()
        u.email, u.role, u.status = a["email"], a["role"], ("pending_approval" if a.get("pending") else "active")
        u.profile_complete, u.is_active, u.is_verified = True, True, True
        u.password_hash = bcrypt.hashpw(a["pw"].encode(), bcrypt.gensalt()).decode() if a.get("pw") else pw_hash

        if a["role"] == "store":
            has = (await db.execute(select(StoreProfile).where(StoreProfile.user_id == u.id))).scalar_one_or_none()
            if not has:
                db.add(StoreProfile(user_id=u.id, owner_name="Suresh Gupta", store_name="Jinni Fresh Mart",
                                    address="12 MI Road", pincode=PIN, city=CITY, state=STATE,
                                    latitude=26.9157, longitude=75.8040, delivery_radius_km=8.0, is_open=True))
        elif a["role"] == "delivery":
            await _seed_partner(db, u, a)
        out.append((a["role"], a["email"]))
    return out


# Well-known Jaipur spots (demo coordinates) so riding works out of the box. In production the
# admin curates these in Rides -> Jinni Spots.
PLACES = [
    ("Jaipur Junction (Railway Station)", "Station Road", "🚉", 26.9196, 75.7878),
    ("Sindhi Camp Bus Stand", "Station Road", "🚌", 26.9226, 75.7990),
    ("Hawa Mahal", "Old City", "🏯", 26.9239, 75.8267),
    ("SMS Hospital", "Tonk Road", "🏥", 26.9055, 75.8160),
    ("Raja Park Market", "Raja Park", "🛍️", 26.8985, 75.8350),
    ("C-Scheme", "Ashok Nagar", "🏙️", 26.9082, 75.8007),
    ("Malviya Nagar", "Malviya Nagar", "🏘️", 26.8553, 75.8157),
    ("Vaishali Nagar", "Vaishali Nagar", "🌳", 26.9124, 75.7406),
    ("Jaipur Airport", "Sanganer", "✈️", 26.8242, 75.8122),
]


async def seed_rides(db) -> None:
    from app.modules.rides.models import RidePlace, RideSettings
    rs = await db.get(RideSettings, 1)
    if not rs:
        rs = RideSettings(id=1)
        db.add(rs)
    rs.platform_upi_id = rs.platform_upi_id or "jinni@okaxis"
    if rs.service_lat is None:  # Jaipur service area (20 km around the city centre)
        rs.service_lat, rs.service_lng, rs.service_radius_km = 26.9124, 75.7873, 25
    have = {p for (p,) in (await db.execute(select(RidePlace.name))).all()}
    for i, (name, area, icon, lat, lng) in enumerate(PLACES):
        if name not in have:
            db.add(RidePlace(name=name, area=area, icon=icon, lat=lat, lng=lng, display_order=i))


async def main() -> None:
    if not settings.DEBUG and "--force" not in sys.argv:
        sys.exit("DEBUG=false: refusing to create test accounts with a known password (use --force to override).")

    # Imported here so module-level side effects stay off the import path of other tools.
    from app.seed_data import seed_categories, seed_products
    from scripts.seed_food_restaurants import RESTAURANTS, seed_one

    pw_hash = _hash()
    async with AsyncSessionLocal() as db:
        print("Grocery catalogue…")
        cat_map = await seed_categories(db)
        await seed_products(db, cat_map)

        print("Food restaurants + menus…")
        for r in RESTAURANTS:
            print("  ", await seed_one(db, r))

        print("Ride settings + Jinni Spots…")
        await seed_rides(db)

        print("Accounts…")
        creds = await seed_accounts(db, pw_hash)

        # Give each seeded restaurant owner an email+password login.
        for i, r in enumerate(RESTAURANTS, start=1):
            owner = await _get_user(db, phone=r["phone"])
            if owner:
                owner.email = f"restaurant{i}@test.com"
                owner.password_hash, owner.status = pw_hash, "active"
                owner.profile_complete, owner.is_active, owner.is_verified = True, True, True
                creds.append((f"restaurant ({r['name']})", owner.email))
        await db.commit()

    print("\nLogin (email + password):")
    for role, email in creds:
        print(f"  {role:34} {email:28} {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
