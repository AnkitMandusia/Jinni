"""Seed data for initial database population."""
import asyncio
from uuid import uuid4
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, init_db
from app.modules.grocery.models import Category, Product


# Category data with icons
CATEGORIES = [
    {
        "name": "Fresh Fruits",
        "slug": "fresh-fruits",
        "icon": "🍎",
        "description": "Farm fresh fruits delivered to your door",
        "display_order": 1,
    },
    {
        "name": "Fresh Vegetables",
        "slug": "fresh-vegetables",
        "icon": "🥬",
        "description": "Organic and locally sourced vegetables",
        "display_order": 2,
    },
    {
        "name": "Dairy & Eggs",
        "slug": "dairy-eggs",
        "icon": "🥛",
        "description": "Fresh milk, cheese, butter and eggs",
        "display_order": 3,
    },
    {
        "name": "Bakery",
        "slug": "bakery",
        "icon": "🍞",
        "description": "Freshly baked bread, cakes and pastries",
        "display_order": 4,
    },
    {
        "name": "Beverages",
        "slug": "beverages",
        "icon": "🥤",
        "description": "Soft drinks, juices, tea and coffee",
        "display_order": 5,
    },
    {
        "name": "Snacks",
        "slug": "snacks",
        "icon": "🍿",
        "description": "Chips, biscuits, namkeen and more",
        "display_order": 6,
    },
    {
        "name": "Staples",
        "slug": "staples",
        "icon": "🌾",
        "description": "Rice, pulses, flour and essential groceries",
        "display_order": 7,
    },
    {
        "name": "Personal Care",
        "slug": "personal-care",
        "icon": "🧴",
        "description": "Shampoo, soap, toothpaste and hygiene products",
        "display_order": 8,
    },
]

# Product data
PRODUCTS = {
    "fresh-fruits": [
        {"name": "Apple Royal Gala", "price": 129, "mrp": 149, "unit": "1 kg", "stock": 50, "tags": ["fresh", "imported"]},
        {"name": "Banana Robusta", "price": 39, "mrp": 45, "unit": "1 dozen", "stock": 100, "tags": ["fresh", "local"]},
        {"name": "Orange Imported", "price": 89, "mrp": 99, "unit": "1 kg", "stock": 40, "tags": ["fresh", "vitamin-c"]},
        {"name": "Mango Alphonso", "price": 299, "mrp": 349, "unit": "1 kg", "stock": 30, "tags": ["premium", "seasonal"]},
        {"name": "Watermelon", "price": 59, "mrp": 69, "unit": "1 piece", "stock": 25, "tags": ["fresh", "summer"]},
        {"name": "Pomegranate", "price": 109, "mrp": 129, "unit": "500 g", "stock": 35, "tags": ["fresh", "antioxidant"]},
        {"name": "Grapes Green", "price": 79, "mrp": 89, "unit": "500 g", "stock": 45, "tags": ["fresh", "seedless"]},
        {"name": "Papaya", "price": 49, "mrp": 55, "unit": "1 piece", "stock": 20, "tags": ["fresh", "digestion"]},
    ],
    "fresh-vegetables": [
        {"name": "Tomato Hybrid", "price": 35, "mrp": 40, "unit": "1 kg", "stock": 80, "tags": ["fresh", "daily"]},
        {"name": "Onion", "price": 28, "mrp": 32, "unit": "1 kg", "stock": 120, "tags": ["essential", "daily"]},
        {"name": "Potato", "price": 25, "mrp": 30, "unit": "1 kg", "stock": 150, "tags": ["essential", "daily"]},
        {"name": "Spinach", "price": 20, "mrp": 25, "unit": "250 g", "stock": 60, "tags": ["leafy", "iron-rich"]},
        {"name": "Carrot Orange", "price": 45, "mrp": 55, "unit": "1 kg", "stock": 55, "tags": ["fresh", "vitamin-a"]},
        {"name": "Cauliflower", "price": 35, "mrp": 42, "unit": "1 piece", "stock": 40, "tags": ["fresh", "seasonal"]},
        {"name": "Capsicum Green", "price": 49, "mrp": 59, "unit": "500 g", "stock": 50, "tags": ["fresh", "crunchy"]},
        {"name": "Lady Finger", "price": 39, "mrp": 45, "unit": "500 g", "stock": 45, "tags": ["fresh", "daily"]},
    ],
    "dairy-eggs": [
        {"name": "Amul Full Cream Milk", "price": 68, "mrp": 68, "unit": "1 L", "stock": 200, "tags": ["daily", "essential"]},
        {"name": "Amul Butter", "price": 55, "mrp": 58, "unit": "100 g", "stock": 80, "tags": ["dairy", "breakfast"]},
        {"name": "Amul Cheese Slices", "price": 135, "mrp": 145, "unit": "200 g", "stock": 60, "tags": ["dairy", "snack"]},
        {"name": "Nestle Curd", "price": 45, "mrp": 50, "unit": "400 g", "stock": 70, "tags": ["dairy", "probiotic"]},
        {"name": "Farm Fresh Eggs", "price": 95, "mrp": 110, "unit": "12 pcs", "stock": 90, "tags": ["protein", "fresh"]},
        {"name": "Amul Paneer", "price": 85, "mrp": 90, "unit": "200 g", "stock": 50, "tags": ["dairy", "protein"]},
        {"name": "Mother Dairy Ghee", "price": 145, "mrp": 155, "unit": "200 ml", "stock": 40, "tags": ["dairy", "cooking"]},
        {"name": "Soya Milk", "price": 35, "mrp": 40, "unit": "1 L", "stock": 30, "tags": ["vegan", "protein"]},
    ],
    "bakery": [
        {"name": "White Bread", "price": 35, "mrp": 40, "unit": "400 g", "stock": 60, "tags": ["fresh", "daily"]},
        {"name": "Brown Bread", "price": 40, "mrp": 45, "unit": "400 g", "stock": 50, "tags": ["healthy", "fiber"]},
        {"name": "Multigrain Bread", "price": 50, "mrp": 55, "unit": "400 g", "stock": 40, "tags": ["healthy", "fiber"]},
        {"name": "Cream Bun", "price": 15, "mrp": 18, "unit": "1 pc", "stock": 30, "tags": ["snack", "sweet"]},
        {"name": "Pav Bun", "price": 25, "mrp": 30, "unit": "6 pcs", "stock": 45, "tags": ["fresh", "vada-pav"]},
        {"name": "Chocolate Muffin", "price": 35, "mrp": 40, "unit": "1 pc", "stock": 25, "tags": ["sweet", "dessert"]},
        {"name": "Cookies Butter", "price": 45, "mrp": 50, "unit": "200 g", "stock": 55, "tags": ["snack", "tea-time"]},
    ],
    "beverages": [
        {"name": "Coca Cola", "price": 40, "mrp": 45, "unit": "750 ml", "stock": 80, "tags": ["cold-drink", "party"]},
        {"name": "Sprite", "price": 38, "mrp": 42, "unit": "750 ml", "stock": 70, "tags": ["cold-drink", "refreshing"]},
        {"name": "Fanta Orange", "price": 38, "mrp": 42, "unit": "750 ml", "stock": 65, "tags": ["cold-drink", "orange"]},
        {"name": "Tropicana Orange", "price": 65, "mrp": 75, "unit": "1 L", "stock": 50, "tags": ["juice", "vitamin-c"]},
        {"name": "Real Mixed Fruit", "price": 70, "mrp": 80, "unit": "1 L", "stock": 45, "tags": ["juice", "fruit"]},
        {"name": "Red Bull", "price": 115, "mrp": 125, "unit": "250 ml", "stock": 40, "tags": ["energy", "premium"]},
        {"name": "Nescafe Coffee", "price": 95, "mrp": 110, "unit": "50 g", "stock": 55, "tags": ["coffee", "morning"]},
        {"name": "Tata Tea Premium", "price": 85, "mrp": 95, "unit": "250 g", "stock": 60, "tags": ["tea", "daily"]},
    ],
    "snacks": [
        {"name": "Lay's Classic", "price": 20, "mrp": 22, "unit": "52 g", "stock": 100, "tags": ["chips", "snack"]},
        {"name": "Kurkure Masala", "price": 20, "mrp": 22, "unit": "90 g", "stock": 90, "tags": ["namkeen", "snack"]},
        {"name": "Bingo Mad Angles", "price": 20, "mrp": 22, "unit": "90 g", "stock": 85, "tags": ["chips", "spicy"]},
        {"name": "Parle-G Biscuits", "price": 10, "mrp": 10, "unit": "100 g", "stock": 150, "tags": ["biscuit", "tea-time"]},
        {"name": "Oreo Chocolate", "price": 30, "mrp": 35, "unit": "120 g", "stock": 70, "tags": ["biscuit", "chocolate"]},
        {"name": "Haldiram Bhujia", "price": 55, "mrp": 60, "unit": "200 g", "stock": 60, "tags": ["namkeen", "traditional"]},
        {"name": "Maggi Noodles", "price": 14, "mrp": 15, "unit": "70 g", "stock": 200, "tags": ["instant", "quick"]},
        {"name": "Popcorn Caramel", "price": 25, "mrp": 30, "unit": "60 g", "stock": 45, "tags": ["snack", "movie"]},
    ],
    "staples": [
        {"name": "Basmati Rice", "price": 125, "mrp": 145, "unit": "1 kg", "stock": 80, "tags": ["rice", "premium"]},
        {"name": "Toor Dal", "price": 110, "mrp": 125, "unit": "1 kg", "stock": 70, "tags": ["pulse", "essential"]},
        {"name": "Moong Dal", "price": 95, "mrp": 110, "unit": "1 kg", "stock": 65, "tags": ["pulse", "protein"]},
        {"name": "Aashirvaad Atta", "price": 65, "mrp": 75, "unit": "1 kg", "stock": 90, "tags": ["flour", "daily"]},
        {"name": "Fortune Oil", "price": 145, "mrp": 165, "unit": "1 L", "stock": 75, "tags": ["oil", "cooking"]},
        {"name": "Tata Salt", "price": 24, "mrp": 28, "unit": "1 kg", "stock": 120, "tags": ["essential", "iodized"]},
        {"name": "Sugar", "price": 48, "mrp": 55, "unit": "1 kg", "stock": 100, "tags": ["essential", "sweet"]},
        {"name": "Turmeric Powder", "price": 35, "mrp": 42, "unit": "100 g", "stock": 80, "tags": ["spice", "antioxidant"]},
    ],
    "personal-care": [
        {"name": "Dove Shampoo", "price": 95, "mrp": 110, "unit": "180 ml", "stock": 50, "tags": ["hair", "daily"]},
        {"name": "Colgate Toothpaste", "price": 55, "mrp": 65, "unit": "150 g", "stock": 80, "tags": ["oral", "essential"]},
        {"name": "Pears Soap", "price": 45, "mrp": 52, "unit": "125 g", "stock": 60, "tags": ["bath", "gentle"]},
        {"name": "Santoor Soap", "price": 35, "mrp": 40, "unit": "125 g", "stock": 70, "tags": ["bath", "sandalwood"]},
        {"name": "Head & Shoulders", "price": 165, "mrp": 185, "unit": "340 ml", "stock": 40, "tags": ["hair", "anti-dandruff"]},
        {"name": "Dettol Handwash", "price": 75, "mrp": 85, "unit": "200 ml", "stock": 55, "tags": ["hygiene", "germ-protection"]},
        {"name": "Vaseline Lotion", "price": 85, "mrp": 95, "unit": "100 ml", "stock": 45, "tags": ["skin", "moisturizer"]},
        {"name": "Oral-B Toothbrush", "price": 35, "mrp": 40, "unit": "2 pcs", "stock": 65, "tags": ["oral", "essential"]},
    ],
}


async def seed_categories(db: AsyncSession) -> dict:
    """Seed categories and return slug->id mapping."""
    category_map = {}
    
    for cat_data in CATEGORIES:
        # Check if category exists
        from sqlalchemy import select
        from app.modules.grocery.models import Category
        
        result = await db.execute(
            select(Category).where(Category.slug == cat_data["slug"])
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            category_map[cat_data["slug"]] = existing.id
            print(f"  ⚠️ Category '{cat_data['name']}' already exists")
            continue
        
        category = Category(**cat_data)
        db.add(category)
        await db.flush()
        await db.refresh(category)
        
        category_map[cat_data["slug"]] = category.id
        print(f"  ✅ Created category: {category.name}")
    
    return category_map


async def seed_products(db: AsyncSession, category_map: dict):
    """Seed products for each category."""
    from sqlalchemy import select
    from app.modules.grocery.models import Product
    
    for slug, products in PRODUCTS.items():
        category_id = category_map.get(slug)
        if not category_id:
            print(f"  ⚠️ Category '{slug}' not found, skipping products")
            continue
        
        for idx, prod_data in enumerate(products):
            # Generate unique slug
            prod_slug = f"{slug}-{prod_data['name'].lower().replace(' ', '-')}"
            
            # Check if product exists
            result = await db.execute(
                select(Product).where(Product.slug == prod_slug)
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                print(f"    ⚠️ Product '{prod_data['name']}' already exists")
                continue
            
            product = Product(
                name=prod_data["name"],
                slug=prod_slug,
                description=f"Fresh {prod_data['name']} delivered to your doorstep",
                price=Decimal(str(prod_data["price"])),
                mrp=Decimal(str(prod_data["mrp"])) if prod_data["mrp"] else None,
                unit=prod_data["unit"],
                stock_quantity=prod_data["stock"],
                category_id=category_id,
                tags=prod_data["tags"],
                display_order=idx,
                is_active=True,
                is_featured=idx < 3,  # First 3 products are featured
            )
            db.add(product)
            print(f"    ✅ Created product: {product.name}")
        
        await db.flush()


async def seed_all():
    """Run all seed operations."""
    print("\n🌱 Seeding database...\n")
    
    # Initialize database tables first
    print("🔧 Creating database tables...")
    await init_db()
    print("✅ Tables created\n")
    
    async with AsyncSessionLocal() as db:
        try:
            # Seed categories
            print("📁 Creating categories...")
            category_map = await seed_categories(db)
            
            # Seed products
            print("\n📦 Creating products...")
            await seed_products(db, category_map)
            
            await db.commit()
            print("\n✅ Database seeded successfully!\n")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ Error seeding database: {e}\n")
            raise


if __name__ == "__main__":
    asyncio.run(seed_all())
