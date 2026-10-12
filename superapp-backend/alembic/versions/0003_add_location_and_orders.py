"""Add location fields, orders module, and store inventory

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add location fields to store profiles
    op.execute("""
        ALTER TABLE store_profiles
        ADD COLUMN IF NOT EXISTS pincode VARCHAR(10),
        ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
        ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS state VARCHAR(100)
    """)
    
    # Add location fields to restaurant profiles
    op.execute("""
        ALTER TABLE restaurant_profiles
        ADD COLUMN IF NOT EXISTS pincode VARCHAR(10),
        ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
        ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS state VARCHAR(100)
    """)
    
    # Create store_inventory table (store-specific product availability)
    op.execute("""
        CREATE TABLE IF NOT EXISTS store_inventory (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            store_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            is_available BOOLEAN DEFAULT true,
            custom_price NUMERIC(10, 2),
            stock_quantity INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(store_id, product_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_store_inventory_store ON store_inventory(store_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_store_inventory_product ON store_inventory(product_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_store_inventory_available ON store_inventory(store_id, is_available)")
    
    # Create store_custom_products table (store-added products)
    op.execute("""
        CREATE TABLE IF NOT EXISTS store_custom_products (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            store_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            category_id UUID NOT NULL REFERENCES product_categories(id),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price NUMERIC(10, 2) NOT NULL,
            unit VARCHAR(50) DEFAULT 'piece',
            stock_quantity INTEGER DEFAULT 0,
            image_url TEXT,
            is_available BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_store_custom_products_store ON store_custom_products(store_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_store_custom_products_category ON store_custom_products(category_id)")
    
    # Create orders table
    op.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_number VARCHAR(20) UNIQUE NOT NULL,
            order_type VARCHAR(20) NOT NULL,
            customer_id UUID NOT NULL REFERENCES users(id),
            store_id UUID REFERENCES users(id),
            delivery_agent_id UUID REFERENCES users(id),
            status VARCHAR(50) NOT NULL DEFAULT 'pending_dispatch',
            subtotal NUMERIC(10, 2) NOT NULL,
            delivery_fee NUMERIC(10, 2) DEFAULT 0.00,
            tax NUMERIC(10, 2) DEFAULT 0.00,
            discount NUMERIC(10, 2) DEFAULT 0.00,
            total_amount NUMERIC(10, 2) NOT NULL,
            payment_method VARCHAR(20) NOT NULL DEFAULT 'cod',
            payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
            payment_id VARCHAR(100),
            delivery_address JSONB NOT NULL,
            pickup_address JSONB,
            delivery_pincode VARCHAR(10) NOT NULL,
            delivery_lat NUMERIC(10, 7),
            delivery_lng NUMERIC(10, 7),
            broadcast_radius_km INTEGER DEFAULT 5,
            broadcast_attempt INTEGER DEFAULT 0,
            accept_timeout_seconds INTEGER DEFAULT 45,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            accepted_at TIMESTAMP,
            preparing_at TIMESTAMP,
            ready_at TIMESTAMP,
            picked_up_at TIMESTAMP,
            delivered_at TIMESTAMP,
            cancelled_at TIMESTAMP,
            cancellation_reason TEXT,
            cancelled_by UUID REFERENCES users(id),
            delivery_otp VARCHAR(6),
            delivery_photo_url TEXT,
            customer_rating INTEGER,
            customer_review TEXT,
            notes TEXT
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_order_number ON orders(order_number)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_order_customer_status ON orders(customer_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_order_store_status ON orders(store_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_order_delivery_status ON orders(delivery_agent_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_order_pincode_status ON orders(delivery_pincode, status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_order_created ON orders(created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_order_type ON orders(order_type)")
    
    # Create order_items table
    op.execute("""
        CREATE TABLE IF NOT EXISTS order_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            product_id UUID REFERENCES products(id),
            product_name VARCHAR(255) NOT NULL,
            product_sku VARCHAR(50),
            unit_price NUMERIC(10, 2) NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            subtotal NUMERIC(10, 2) NOT NULL,
            metadata JSONB
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id)")
    
    # Create delivery_locations table (live tracking)
    op.execute("""
        CREATE TABLE IF NOT EXISTS delivery_locations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            delivery_agent_id UUID NOT NULL REFERENCES users(id),
            order_id UUID REFERENCES orders(id),
            latitude NUMERIC(10, 7) NOT NULL,
            longitude NUMERIC(10, 7) NOT NULL,
            accuracy NUMERIC(10, 2),
            speed NUMERIC(10, 2),
            heading NUMERIC(5, 2),
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_delivery_location_agent_time ON delivery_locations(delivery_agent_id, timestamp)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_delivery_location_order ON delivery_locations(order_id, timestamp)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS delivery_locations CASCADE;")
    op.execute("DROP TABLE IF EXISTS order_items CASCADE;")
    op.execute("DROP TABLE IF EXISTS orders CASCADE;")
    op.execute("DROP TABLE IF EXISTS store_custom_products CASCADE;")
    op.execute("DROP TABLE IF EXISTS store_inventory CASCADE;")
    
    op.execute("""
        ALTER TABLE store_profiles
        DROP COLUMN IF EXISTS pincode,
        DROP COLUMN IF EXISTS latitude,
        DROP COLUMN IF EXISTS longitude,
        DROP COLUMN IF EXISTS city,
        DROP COLUMN IF EXISTS state;
    """)
    
    op.execute("""
        ALTER TABLE restaurant_profiles
        DROP COLUMN IF EXISTS pincode,
        DROP COLUMN IF EXISTS latitude,
        DROP COLUMN IF EXISTS longitude,
        DROP COLUMN IF EXISTS city,
        DROP COLUMN IF EXISTS state;
    """)
