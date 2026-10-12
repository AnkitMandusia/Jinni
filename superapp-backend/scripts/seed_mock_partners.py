"""Seed mock partner and customer accounts for testing - restaurant, delivery, salon, cab, customer."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql+asyncpg://postgres:admin123@localhost:5432/superapp"

# Mock partner credentials - simple email/password for quick login
MOCK_PARTNERS = [
    {
        "role": "restaurant",
        "email": "restaurant@test.com",
        "password": "Test@1234",
        "phone": "+919876543210",
        "name": "Test Restaurant Owner",
        "profile": {
            "owner_name": "Raj Kumar",
            "restaurant_name": "Spice Garden Restaurant",
            "cuisine_type": "North Indian, Chinese",
            "fssai": "12345678901234",
            "address": "123 MG Road, Sector 15",
            "pincode": "110001",
            "city": "New Delhi",
            "state": "Delhi",
            "latitude": 28.6139,
            "longitude": 77.2090,
        }
    },
    {
        "role": "delivery",
        "email": "delivery@test.com",
        "password": "Test@1234",
        "phone": "+919876543211",
        "name": "Test Delivery Agent",
        "profile": {
            "name": "Amit Singh",
            "vehicle_type": "Bike",
            "license_no": "DL1234567890",
            "aadhaar": "123456789012",
        }
    },
    {
        "role": "salon",
        "email": "salon@test.com",
        "password": "Test@1234",
        "phone": "+919876543212",
        "name": "Test Salon Owner",
        "profile": {
            "owner_name": "Priya Sharma",
            "salon_name": "Glamour Studio",
            "address": "456 Park Street, Connaught Place",
            "pincode": "110001",
            "city": "New Delhi",
            "state": "Delhi",
            "latitude": 28.6304,
            "longitude": 77.2177,
        }
    },
    {
        "role": "cab_driver",
        "email": "cab@test.com",
        "password": "Test@1234",
        "phone": "+919876543213",
        "name": "Test Cab Driver",
        "profile": {
            "name": "Vikram Patel",
            "vehicle_type": "Sedan",
            "license_no": "DL9876543210",
            "vehicle_number": "DL01AB1234",
        }
    },
    {
        "role": "store",
        "email": "store@test.com",
        "password": "Test@1234",
        "phone": "+919876543214",
        "name": "Test Store Owner",
        "profile": {
            "owner_name": "Suresh Gupta",
            "store_name": "Fresh Mart Grocery",
            "gstin": "29ABCDE1234F1Z5",
            "fssai": "98765432109876",
            "address": "789 Main Market, Karol Bagh",
            "pincode": "110005",
            "city": "New Delhi",
            "state": "Delhi",
            "latitude": 28.6517,
            "longitude": 77.1905,
            "delivery_radius_km": 5.0,
        }
    },
    {
        "role": "customer",
        "email": "customer@test.com",
        "password": "Test@1234",
        "phone": "+919876543215",
        "name": "Test Customer",
        "profile": {}  # No extra profile needed for customer
    },
]


async def seed():
    engine = create_async_engine(DATABASE_URL)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        from app.modules.users.models import (
            User, StoreProfile, RestaurantProfile, DeliveryAgentProfile
        )

        print("🌱 Seeding mock partner accounts...")

        for partner_data in MOCK_PARTNERS:
            role = partner_data["role"]
            email = partner_data["email"]
            password = partner_data["password"]
            phone = partner_data["phone"]
            name = partner_data["name"]
            profile_data = partner_data["profile"]

            # Check if user exists
            result = await db.execute(
                select(User).where(
                    (User.email == email) | (User.phone == phone)
                )
            )
            existing_user = result.scalar_one_or_none()

            if existing_user:
                print(f"  ⚠️  {role.upper()} user already exists: {email}")
                continue

            # Hash password
            password_hash = bcrypt.hashpw(
                password.encode('utf-8'),
                bcrypt.gensalt()
            ).decode('utf-8')

            # Create user
            user = User(
                phone=phone,
                email=email,
                name=name,
                role=role,
                status="active",  # Pre-approved for testing
                profile_complete=True,
                password_hash=password_hash,
            )
            db.add(user)
            await db.flush()
            await db.refresh(user)

            # Create role-specific profile
            if role == "store":
                profile = StoreProfile(
                    user_id=user.id,
                    owner_name=profile_data["owner_name"],
                    store_name=profile_data["store_name"],
                    gstin=profile_data.get("gstin"),
                    fssai=profile_data.get("fssai"),
                    address=profile_data["address"],
                    pincode=profile_data["pincode"],
                    city=profile_data["city"],
                    state=profile_data["state"],
                    latitude=profile_data["latitude"],
                    longitude=profile_data["longitude"],
                    delivery_radius_km=profile_data.get("delivery_radius_km", 5.0),
                    is_open=True,
                )
                db.add(profile)

            elif role == "restaurant":
                profile = RestaurantProfile(
                    user_id=user.id,
                    owner_name=profile_data["owner_name"],
                    restaurant_name=profile_data["restaurant_name"],
                    cuisine_type=profile_data.get("cuisine_type"),
                    fssai=profile_data.get("fssai"),
                    address=profile_data["address"],
                    pincode=profile_data["pincode"],
                    city=profile_data["city"],
                    state=profile_data["state"],
                    latitude=profile_data["latitude"],
                    longitude=profile_data["longitude"],
                    is_open=True,
                )
                db.add(profile)

            elif role == "delivery":
                profile = DeliveryAgentProfile(
                    user_id=user.id,
                    name=profile_data["name"],
                    vehicle_type=profile_data.get("vehicle_type"),
                    license_no=profile_data.get("license_no"),
                    aadhaar=profile_data.get("aadhaar"),
                    is_available=True,
                )
                db.add(profile)

            # For salon and cab_driver, we'll need to create similar profile models later
            # For now, just create the user

            # Customer role needs no extra profile
            if role == "customer":
                pass  # User already created above

            await db.commit()
            print(f"  ✅ Created {role.upper()}: {email} / {password}")

        print("\n✨ Mock partner seeding complete!")
        print("\n📋 Login Credentials:")
        print("=" * 60)
        for p in MOCK_PARTNERS:
            print(f"  {p['role'].upper():15} | {p['email']:25} | {p['password']}")
        print("=" * 60)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
