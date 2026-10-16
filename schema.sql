-- ==============================================================================
-- Schema for Neon Serverless Postgres (Legendary To-Do Cloud Sync)
-- ==============================================================================

-- Enable UUID extension if supported
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Domain lookup table
CREATE TABLE IF NOT EXISTS domains (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL
);

INSERT INTO domains (id, name) VALUES 
('client', 'Client'),
('work', 'Work'),
('personal', 'Personal')
ON CONFLICT (id) DO NOTHING;

-- Primary Items Table
CREATE TABLE IF NOT EXISTS items (
    id VARCHAR(64) PRIMARY KEY,
    domain_id VARCHAR(32) REFERENCES domains(id) DEFAULT 'client',
    parent_id VARCHAR(64) REFERENCES items(id) ON DELETE SET NULL,
    tier SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 5),
    title VARCHAR(255) NOT NULL,
    notes TEXT DEFAULT '',
    done BOOLEAN DEFAULT FALSE,
    due_at BIGINT,
    target VARCHAR(16),
    time_spent BIGINT DEFAULT 0,
    sessions JSONB DEFAULT '[]'::jsonb,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    completed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_items_domain_done ON items(domain_id, done);
CREATE INDEX IF NOT EXISTS idx_items_updated_at ON items(updated_at);
CREATE INDEX IF NOT EXISTS idx_items_parent_id ON items(parent_id);

-- Focus Timer Sessions Table
CREATE TABLE IF NOT EXISTS timer_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id VARCHAR(64) REFERENCES items(id) ON DELETE CASCADE,
    started_at BIGINT NOT NULL,
    seconds INTEGER NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timer_sessions_item ON timer_sessions(item_id);

-- Trash Table (Deleted items retained for 30 days)
CREATE TABLE IF NOT EXISTS trash_entries (
    id VARCHAR(64) PRIMARY KEY,
    root_id VARCHAR(64) NOT NULL,
    deleted_at BIGINT NOT NULL,
    payload JSONB NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trash_updated_at ON trash_entries(updated_at);

-- User / Global Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(64) PRIMARY KEY,
    theme VARCHAR(16) DEFAULT 'dark',
    xp_config JSONB NOT NULL,
    updated_at BIGINT NOT NULL
);

-- Tombstones for Deleted Records (ensures delta sync propagates remote deletions)
CREATE TABLE IF NOT EXISTS deleted_records (
    entity_id VARCHAR(64) PRIMARY KEY,
    table_name VARCHAR(32) NOT NULL,
    deleted_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deleted_records_table_time ON deleted_records(table_name, deleted_at);
