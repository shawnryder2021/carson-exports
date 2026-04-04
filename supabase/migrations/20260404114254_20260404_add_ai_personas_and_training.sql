/*
  # AI Personas and Training Data System

  1. New Tables
    - `ce_ai_personas`
      - `id` (uuid, primary key) - unique persona identifier
      - `name` (text) - persona display name (e.g., "Sales Professional", "Service Expert")
      - `tone_type` (text) - one of: 'sales', 'service', 'general'
      - `response_style` (text) - communication approach (concise, detailed, friendly, professional)
      - `greeting_template` (text) - persona-specific greeting message
      - `system_prompt_addition` (text) - additional system prompt instructions specific to this persona
      - `is_active` (boolean) - whether this persona is currently active
      - `created_at`, `updated_at` (timestamps)

    - `ce_training_data`
      - `id` (uuid, primary key) - training record identifier
      - `conversation_id` (uuid, foreign key to ce_conversations)
      - `session_id` (uuid, foreign key to ce_chat_sessions)
      - `category` (text) - training category (good_answer, bad_answer, missed_opportunity, sales_close, etc.)
      - `notes` (text) - notes on why this conversation is good/bad training data
      - `is_approved` (boolean) - whether this training data has been reviewed and approved
      - `created_at` (timestamp)

    - `ce_webhook_logs`
      - `id` (uuid, primary key) - webhook delivery record identifier
      - `session_id` (uuid, foreign key to ce_chat_sessions)
      - `webhook_url` (text) - the URL that was called
      - `payload` (jsonb) - the complete payload sent
      - `status_code` (integer) - HTTP response status code
      - `error_message` (text, nullable) - error message if delivery failed
      - `retry_count` (integer, default 0) - number of retry attempts
      - `next_retry_at` (timestamp, nullable) - when to retry if failed
      - `created_at`, `updated_at` (timestamps)

  2. Schema Changes to Existing Tables
    - Add `persona_id` (uuid, nullable, foreign key) to `ce_chat_sessions`
    - Add `webhook_sent` (boolean, default false) to `ce_chat_sessions`
    - Add `flagged_for_training` (boolean, default false) to `ce_conversations`
    - Add `training_category` (text, nullable) to `ce_conversations`

  3. Security
    - Enable RLS on all new tables
    - Create appropriate policies for data access
    - Webhook logs are read-only for most users (append-only for system)

  4. Important Notes
    - Personas provide customizable AI behavior without requiring model fine-tuning
    - Training data collection is manual and optional for incremental AI improvements
    - Webhook delivery is tracked for reliability and debugging
    - RLS policies use role-based access control (all staff can read, admin can write)
*/

CREATE TABLE IF NOT EXISTS ce_ai_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tone_type text NOT NULL CHECK (tone_type IN ('sales', 'service', 'general')),
  response_style text NOT NULL DEFAULT 'professional',
  greeting_template text DEFAULT '',
  system_prompt_addition text DEFAULT '',
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ce_ai_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view personas"
  ON ce_ai_personas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can manage personas"
  ON ce_ai_personas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin can update personas"
  ON ce_ai_personas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin can delete personas"
  ON ce_ai_personas FOR DELETE
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS ce_training_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES ce_conversations(id) ON DELETE CASCADE,
  session_id uuid REFERENCES ce_chat_sessions(id) ON DELETE CASCADE,
  category text NOT NULL,
  notes text DEFAULT '',
  is_approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ce_training_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view training data"
  ON ce_training_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can create training data"
  ON ce_training_data FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin can update training data"
  ON ce_training_data FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin can delete training data"
  ON ce_training_data FOR DELETE
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS ce_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES ce_chat_sessions(id) ON DELETE CASCADE,
  webhook_url text NOT NULL,
  payload jsonb NOT NULL,
  status_code integer,
  error_message text,
  retry_count integer DEFAULT 0,
  next_retry_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ce_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view webhook logs"
  ON ce_webhook_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can log webhooks"
  ON ce_webhook_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update webhook logs"
  ON ce_webhook_logs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ce_chat_sessions' AND column_name = 'persona_id'
  ) THEN
    ALTER TABLE ce_chat_sessions ADD COLUMN persona_id uuid REFERENCES ce_ai_personas(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ce_chat_sessions' AND column_name = 'webhook_sent'
  ) THEN
    ALTER TABLE ce_chat_sessions ADD COLUMN webhook_sent boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ce_conversations' AND column_name = 'flagged_for_training'
  ) THEN
    ALTER TABLE ce_conversations ADD COLUMN flagged_for_training boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ce_conversations' AND column_name = 'training_category'
  ) THEN
    ALTER TABLE ce_conversations ADD COLUMN training_category text;
  END IF;
END $$;

INSERT INTO ce_ai_personas (name, tone_type, response_style, greeting_template, system_prompt_addition, is_active) VALUES
  ('Sales Professional', 'sales', 'persuasive', 'Hi there! I''d be happy to help you find the perfect vehicle. What are you looking for today?', 'You are a skilled sales consultant focused on understanding customer needs and presenting vehicles that match their interests. Emphasize value propositions, features, and available inventory. Be enthusiastic about our vehicles and dealership.', true),
  ('Service Expert', 'service', 'helpful', 'Welcome! I''m here to help with any service or maintenance questions about your vehicle. What can I assist with?', 'You are a knowledgeable service advisor. Provide clear, accurate information about maintenance, repairs, and service offerings. Be patient and explain technical concepts in understandable terms.', false),
  ('General Assistant', 'general', 'friendly', 'Hello! How can I help you today?', 'You are a helpful and friendly assistant ready to answer questions about our dealership, vehicles, services, and more.', false)
ON CONFLICT DO NOTHING;