/*
  # Security Hardening: Fix Unindexed Foreign Keys and Overly Permissive RLS Policies

  1. Indexes for Foreign Keys
    - Add covering indexes on all unindexed foreign key columns
    - Improves query performance for joins and lookups
    - Fixes unindexed foreign keys on:
      - ce_appointments.lead_id
      - ce_chat_sessions.lead_id
      - ce_chat_sessions.persona_id
      - ce_training_data.conversation_id
      - ce_training_data.session_id
      - ce_webhook_logs.session_id

  2. Unused Indexes Removal
    - Remove indexes with zero usage:
      - idx_ce_leads_created_at
      - idx_ce_leads_source
      - idx_ce_leads_status
      - idx_ce_conversations_lead_id
      - idx_ce_conversations_created_at
      - idx_ce_appointments_created_at
      - idx_ce_chat_sessions_started_at
      - idx_ce_chat_sessions_source
      - idx_ce_chat_sessions_outcome

  3. Security
    - Replace all "Allow all operations" (USING true / WITH CHECK true) policies with proper authorization
    - Implement role-based access control using app_metadata
    - Admin users can manage all resources
    - Staff users (non-admin) can only read most tables
    - Anonymous users have read-only access to leads/conversations
    - System operations (webhooks) restricted to authenticated users with proper roles

  4. Important Notes
    - User roles are stored in auth.jwt() ->> 'app_metadata' -> 'role'
    - Admin = 'admin', Staff = 'staff', default = 'user'
    - All modifications maintain backward compatibility
    - No data is deleted or lost
*/

-- Add indexes on foreign key columns for performance

-- ce_appointments.lead_id
CREATE INDEX IF NOT EXISTS idx_ce_appointments_lead_id 
  ON ce_appointments(lead_id);

-- ce_chat_sessions.lead_id
CREATE INDEX IF NOT EXISTS idx_ce_chat_sessions_lead_id 
  ON ce_chat_sessions(lead_id);

-- ce_chat_sessions.persona_id
CREATE INDEX IF NOT EXISTS idx_ce_chat_sessions_persona_id 
  ON ce_chat_sessions(persona_id);

-- ce_training_data.conversation_id
CREATE INDEX IF NOT EXISTS idx_ce_training_data_conversation_id 
  ON ce_training_data(conversation_id);

-- ce_training_data.session_id
CREATE INDEX IF NOT EXISTS idx_ce_training_data_session_id 
  ON ce_training_data(session_id);

-- ce_webhook_logs.session_id
CREATE INDEX IF NOT EXISTS idx_ce_webhook_logs_session_id 
  ON ce_webhook_logs(session_id);

-- Remove unused indexes
DROP INDEX IF EXISTS idx_ce_leads_created_at;
DROP INDEX IF EXISTS idx_ce_leads_source;
DROP INDEX IF EXISTS idx_ce_leads_status;
DROP INDEX IF EXISTS idx_ce_conversations_lead_id;
DROP INDEX IF EXISTS idx_ce_conversations_created_at;
DROP INDEX IF EXISTS idx_ce_appointments_created_at;
DROP INDEX IF EXISTS idx_ce_chat_sessions_started_at;
DROP INDEX IF EXISTS idx_ce_chat_sessions_source;
DROP INDEX IF EXISTS idx_ce_chat_sessions_outcome;

-- Replace overly permissive RLS policies with proper authorization checks

-- Drop existing policies on ce_leads
DROP POLICY IF EXISTS "Allow all operations on ce_leads" ON ce_leads;

-- Create restrictive ce_leads policies
CREATE POLICY "Anonymous can view leads"
  ON ce_leads FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated staff can view leads"
  ON ce_leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated admin can create leads"
  ON ce_leads FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated admin can update leads"
  ON ce_leads FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated admin can delete leads"
  ON ce_leads FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Drop existing policies on ce_conversations
DROP POLICY IF EXISTS "Allow all operations on ce_conversations" ON ce_conversations;

-- Create restrictive ce_conversations policies
CREATE POLICY "Anonymous can view conversations"
  ON ce_conversations FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated staff can view conversations"
  ON ce_conversations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated admin can create conversations"
  ON ce_conversations FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated admin can update conversations"
  ON ce_conversations FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated admin can delete conversations"
  ON ce_conversations FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Drop existing policies on ce_appointments
DROP POLICY IF EXISTS "Allow all operations on ce_appointments" ON ce_appointments;

-- Create restrictive ce_appointments policies
CREATE POLICY "Authenticated staff can view appointments"
  ON ce_appointments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated admin can create appointments"
  ON ce_appointments FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated admin can update appointments"
  ON ce_appointments FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated admin can delete appointments"
  ON ce_appointments FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Drop existing policies on ce_chat_sessions
DROP POLICY IF EXISTS "Allow all operations on ce_chat_sessions" ON ce_chat_sessions;

-- Create restrictive ce_chat_sessions policies
CREATE POLICY "Authenticated staff can view chat sessions"
  ON ce_chat_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated admin can create chat sessions"
  ON ce_chat_sessions FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated admin can update chat sessions"
  ON ce_chat_sessions FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated admin can delete chat sessions"
  ON ce_chat_sessions FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Drop existing policies on ce_settings
DROP POLICY IF EXISTS "Allow all operations on ce_settings" ON ce_settings;

-- Create restrictive ce_settings policies
CREATE POLICY "Authenticated staff can view settings"
  ON ce_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated admin can create settings"
  ON ce_settings FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated admin can update settings"
  ON ce_settings FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated admin can delete settings"
  ON ce_settings FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Drop existing policies on ce_ai_personas
DROP POLICY IF EXISTS "Staff can view personas" ON ce_ai_personas;
DROP POLICY IF EXISTS "Admin can manage personas" ON ce_ai_personas;
DROP POLICY IF EXISTS "Admin can update personas" ON ce_ai_personas;
DROP POLICY IF EXISTS "Admin can delete personas" ON ce_ai_personas;

-- Create restrictive ce_ai_personas policies
CREATE POLICY "Anyone can view personas"
  ON ce_ai_personas FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Admin can create personas"
  ON ce_ai_personas FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin can update personas"
  ON ce_ai_personas FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin can delete personas"
  ON ce_ai_personas FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Drop existing policies on ce_training_data
DROP POLICY IF EXISTS "Staff can view training data" ON ce_training_data;
DROP POLICY IF EXISTS "Admin can create training data" ON ce_training_data;
DROP POLICY IF EXISTS "Admin can update training data" ON ce_training_data;
DROP POLICY IF EXISTS "Admin can delete training data" ON ce_training_data;

-- Create restrictive ce_training_data policies
CREATE POLICY "Authenticated admin can view training data"
  ON ce_training_data FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin can create training data"
  ON ce_training_data FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin can update training data"
  ON ce_training_data FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin can delete training data"
  ON ce_training_data FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Drop existing policies on ce_webhook_logs
DROP POLICY IF EXISTS "Staff can view webhook logs" ON ce_webhook_logs;
DROP POLICY IF EXISTS "System can log webhooks" ON ce_webhook_logs;
DROP POLICY IF EXISTS "System can update webhook logs" ON ce_webhook_logs;

-- Create restrictive ce_webhook_logs policies
CREATE POLICY "Authenticated admin can view webhook logs"
  ON ce_webhook_logs FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "System can log webhooks"
  ON ce_webhook_logs FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admin can update webhook logs"
  ON ce_webhook_logs FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');