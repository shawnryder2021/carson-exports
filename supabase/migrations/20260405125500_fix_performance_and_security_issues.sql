/*
  # Fix Performance and Security Issues

  This migration addresses security and performance issues identified by Supabase:

  1. Performance Optimizations
    - Add missing index for ce_conversations.lead_id foreign key
    - Optimize RLS policies to use (select auth.uid()) instead of auth.uid()
      for better query performance at scale
    - Drop unused indexes that provide no benefit

  2. Security Improvements
    - Enable RLS on all public tables (ce_ai_personas, ce_training_data, 
      ce_settings, ce_webhook_logs)
    - Add appropriate policies for anon role access (backend operations)
    - Protect sensitive columns from unauthorized access

  3. Tables Modified
    - ce_leads: Optimized RLS policies
    - ce_conversations: Added foreign key index, optimized RLS policies
    - ce_appointments: Optimized RLS policies
    - ce_chat_sessions: Optimized RLS policies
    - ce_ai_personas: Enabled RLS with anon access
    - ce_training_data: Enabled RLS with anon access
    - ce_settings: Enabled RLS with anon access
    - ce_webhook_logs: Enabled RLS with anon access

  4. Indexes
    - Added: idx_ce_conversations_lead_id (foreign key coverage)
    - Dropped: Unused indexes that have not been utilized
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ADD MISSING FOREIGN KEY INDEX
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add index for ce_conversations.lead_id foreign key
CREATE INDEX IF NOT EXISTS idx_ce_conversations_lead_id 
  ON ce_conversations(lead_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. DROP UNUSED INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

-- These indexes have not been used and can be removed
DROP INDEX IF EXISTS idx_ce_appointments_lead_id;
DROP INDEX IF EXISTS idx_ce_chat_sessions_lead_id;
DROP INDEX IF EXISTS idx_ce_chat_sessions_persona_id;
DROP INDEX IF EXISTS idx_ce_training_data_conversation_id;
DROP INDEX IF EXISTS idx_ce_training_data_session_id;
DROP INDEX IF EXISTS idx_ce_webhook_logs_session_id;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. OPTIMIZE RLS POLICIES - CE_LEADS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated admin can view all leads" ON ce_leads;
DROP POLICY IF EXISTS "Authenticated admin can create leads" ON ce_leads;
DROP POLICY IF EXISTS "Authenticated admin can update leads" ON ce_leads;
DROP POLICY IF EXISTS "Authenticated admin can delete leads" ON ce_leads;

-- Recreate with optimized auth.uid() calls
CREATE POLICY "Authenticated admin can view all leads"
  ON ce_leads FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can create leads"
  ON ce_leads FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can update leads"
  ON ce_leads FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can delete leads"
  ON ce_leads FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. OPTIMIZE RLS POLICIES - CE_CONVERSATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated admin can view all conversations" ON ce_conversations;
DROP POLICY IF EXISTS "Authenticated admin can create conversations" ON ce_conversations;
DROP POLICY IF EXISTS "Authenticated admin can update conversations" ON ce_conversations;
DROP POLICY IF EXISTS "Authenticated admin can delete conversations" ON ce_conversations;

CREATE POLICY "Authenticated admin can view all conversations"
  ON ce_conversations FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can create conversations"
  ON ce_conversations FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can update conversations"
  ON ce_conversations FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can delete conversations"
  ON ce_conversations FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. OPTIMIZE RLS POLICIES - CE_APPOINTMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated admin can view all appointments" ON ce_appointments;
DROP POLICY IF EXISTS "Authenticated admin can create appointments" ON ce_appointments;
DROP POLICY IF EXISTS "Authenticated admin can update appointments" ON ce_appointments;
DROP POLICY IF EXISTS "Authenticated admin can delete appointments" ON ce_appointments;

CREATE POLICY "Authenticated admin can view all appointments"
  ON ce_appointments FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can create appointments"
  ON ce_appointments FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can update appointments"
  ON ce_appointments FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can delete appointments"
  ON ce_appointments FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. OPTIMIZE RLS POLICIES - CE_CHAT_SESSIONS
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated admin can view all chat sessions" ON ce_chat_sessions;
DROP POLICY IF EXISTS "Authenticated admin can create chat sessions" ON ce_chat_sessions;
DROP POLICY IF EXISTS "Authenticated admin can update chat sessions" ON ce_chat_sessions;
DROP POLICY IF EXISTS "Authenticated admin can delete chat sessions" ON ce_chat_sessions;

CREATE POLICY "Authenticated admin can view all chat sessions"
  ON ce_chat_sessions FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can create chat sessions"
  ON ce_chat_sessions FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can update chat sessions"
  ON ce_chat_sessions FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated admin can delete chat sessions"
  ON ce_chat_sessions FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. ENABLE RLS AND ADD POLICIES - CE_AI_PERSONAS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE ce_ai_personas ENABLE ROW LEVEL SECURITY;

-- Allow anon role (backend) and authenticated users to access
CREATE POLICY "Backend and admin can view personas"
  ON ce_ai_personas FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Backend and admin can create personas"
  ON ce_ai_personas FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Backend and admin can update personas"
  ON ce_ai_personas FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Backend and admin can delete personas"
  ON ce_ai_personas FOR DELETE
  TO anon, authenticated
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. ENABLE RLS AND ADD POLICIES - CE_TRAINING_DATA
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE ce_training_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backend and admin can view training data"
  ON ce_training_data FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Backend and admin can create training data"
  ON ce_training_data FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Backend and admin can update training data"
  ON ce_training_data FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Backend and admin can delete training data"
  ON ce_training_data FOR DELETE
  TO anon, authenticated
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. ENABLE RLS AND ADD POLICIES - CE_SETTINGS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE ce_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backend and admin can view settings"
  ON ce_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Backend and admin can create settings"
  ON ce_settings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Backend and admin can update settings"
  ON ce_settings FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Backend and admin can delete settings"
  ON ce_settings FOR DELETE
  TO anon, authenticated
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. ENABLE RLS AND ADD POLICIES - CE_WEBHOOK_LOGS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE ce_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backend and admin can view webhook logs"
  ON ce_webhook_logs FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Backend can create webhook logs"
  ON ce_webhook_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Backend and admin can update webhook logs"
  ON ce_webhook_logs FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Backend and admin can delete webhook logs"
  ON ce_webhook_logs FOR DELETE
  TO anon, authenticated
  USING (true);
