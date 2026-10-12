"""Seed the super-admin user.

Run once:
    conda activate super
    python scripts/seed_admin.py

Creates (or updates) admin user:
    email: mandusiaankitankit.005@gmail.com
    phone: +910000000000  (placeholder — admin logs in with email+password)
    password: SuperAdmin@2024
    role: admin  |  status: active  |  profile_complete: True
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql+asyncpg://postgres:admin123@localhost:5432/superapp"

ADMIN_EMAIL = "mandusiaankit.005@gmail.com"
ADMIN_PHONE = "+910000000000"
ADMIN_PASSWORD = "Superadmin@2024"
ADMIN_NAME = "Super Admin"


async def seed():
    engine = create_async_engine(DATABASE_URL)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        from app.modules.users.models import User

        result = await db.execute(
            select(User).where(User.email == ADMIN_EMAIL)
        )
        user = result.scalar_one_or_none()

        pw_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        if user:
            user.role = "admin"
            user.status = "active"
            user.profile_complete = True
            user.password_hash = pw_hash
            user.name = ADMIN_NAME
            user.is_active = True
            user.is_verified = True
            print(f"Updated existing admin user: {ADMIN_EMAIL}")
        else:
            from uuid import uuid4
            from datetime import datetime
            user = User(
                id=uuid4(),
                phone=ADMIN_PHONE,
                email=ADMIN_EMAIL,
                name=ADMIN_NAME,
                role="admin",
                status="active",
                profile_complete=True,
                password_hash=pw_hash,
                is_active=True,
                is_verified=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(user)
            print(f"Created new admin user: {ADMIN_EMAIL}")

        await db.commit()
        print("Admin credentials:")
        print(f"  Email   : {ADMIN_EMAIL}")
        print(f"  Password: {ADMIN_PASSWORD}")
        print(f"  Role    : admin | Status: active")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
