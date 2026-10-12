"""Dev utility — clears all user & profile rows so you can re-test signup."""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://postgres:admin123@localhost:5432/superapp"


async def main():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM store_profiles"))
        await conn.execute(text("DELETE FROM restaurant_profiles"))
        await conn.execute(text("DELETE FROM delivery_agent_profiles"))
        await conn.execute(text("DELETE FROM users"))
    print("All users and profiles deleted. Ready for fresh signup test.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
