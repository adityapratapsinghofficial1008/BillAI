-- BillAI Database Schema (PostgreSQL)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Teams Table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    billai_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Pricing Table
CREATE TABLE IF NOT EXISTS pricing (
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_price_per_1k NUMERIC NOT NULL,
    output_price_per_1k NUMERIC NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, model)
);

-- 3. Usage Logs Table
CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INT NOT NULL,
    output_tokens INT NOT NULL,
    cost_usd NUMERIC NULL,
    latency_ms INT NOT NULL,
    status_code INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_usage_logs_team_id ON usage_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);

-- Seed Pricing Data for Groq llama3-8b-8192
INSERT INTO pricing (provider, model, input_price_per_1k, output_price_per_1k)
VALUES ('groq', 'llama3-8b-8192', 0.00008, 0.00008)
ON CONFLICT (provider, model) DO UPDATE 
SET input_price_per_1k = EXCLUDED.input_price_per_1k,
    output_price_per_1k = EXCLUDED.output_price_per_1k,
    updated_at = NOW();
