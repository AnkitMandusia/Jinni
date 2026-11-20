"""Create or update the super-admin from environment variables (container-friendly).

    docker compose run --rm -e ADMIN_EMAIL=you@x.com -e ADMIN_PASSWORD='...' api \
        python scripts/create_admin.py

Unlike seed_admin.py this has no hard-coded credentials and uses the app's own
DATABASE_URL. Refuses short passwords.
"""
import asyncio
import os
import sys
from datetime import datetime
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.modules.users.models import User


async def main() -> None:
    email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", "")
    phone = os.environ.get("ADMIN_PHONE", "+910000000000").strip()
    name = os.environ.get("ADMIN_NAME", "Super Admin")
    if not email or "@" not in email:
        sys.exit("ADMIN_EMAIL is required")
    if len(password) < 12:
        sys.exit("ADMIN_PASSWORD must be at least 12 characters")

    engine = create_async_engine(settings.DATABASE_URL)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    async with Session() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user:
            user.role, user.status, user.profile_complete = "admin", "active", True
            user.password_hash, user.name, user.is_active, user.is_verified = pw_hash, name, True, True
            print(f"Updated admin: {email}")
        else:
            db.add(User(id=uuid4(), phone=phone, email=email, name=name, role="admin", status="active",
                        profile_complete=True, password_hash=pw_hash, is_active=True, is_verified=True,
                        created_at=datetime.utcnow(), updated_at=datetime.utcnow()))
            print(f"Created admin: {email}")
        await db.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
