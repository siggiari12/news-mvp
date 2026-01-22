-- ============================================================
-- HARDENED: 002_explainers.sql
-- Inline Explainers for VIZKA news app
-- ============================================================

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Explainers table for inline tooltips
-- Stores terms/entities with their explanations for each article
CREATE TABLE IF NOT EXISTS explainers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    explanation TEXT NOT NULL,
    term_type TEXT NOT NULL DEFAULT 'entity'
        CHECK (term_type IN ('person', 'organization', 'place', 'term', 'entity')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure we don't have duplicate terms per article
    UNIQUE(article_id, term)
);

-- Index for fast lookups by article
CREATE INDEX IF NOT EXISTS idx_explainers_article_id ON explainers(article_id);

-- Enable RLS (blocks all access by default)
ALTER TABLE explainers ENABLE ROW LEVEL SECURITY;

-- ONLY allow public SELECT - no INSERT/UPDATE/DELETE for anon users
CREATE POLICY "Public read access"
    ON explainers FOR SELECT
    USING (true);

-- No write policies = anon users cannot write
-- Service role (used in /api/ingest) bypasses RLS and can write
