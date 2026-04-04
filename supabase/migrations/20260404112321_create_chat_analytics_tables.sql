/*
  # Chat Analytics Database Schema

  1. New Tables
    - `ce_leads` - Customer lead information
      - `id` (uuid, primary key)
      - `name` (text) - Customer name
      - `phone` (text, unique) - Customer phone number
      - `email` (text) - Customer email
      - `vehicle_interest` (text) - Vehicle they're interested in
      - `source` (text) - Lead source: 'sms' or 'web_chat'
      - `status` (text) - Lead status: 'new', 'active', 'booked', 'submitted', 'closed'
      - `interest_score` (integer) - Engagement score 0-100
      - `notes` (text) - Additional notes
      - `last_message_at` (timestamptz) - Last message timestamp
      - `created_at` (timestamptz) - Lead creation time

    - `ce_conversations` - Chat message history
      - `id` (uuid, primary key)
      - `lead_id` (uuid, foreign key) - Reference to lead
      - `role` (text) - Message sender: 'user' or 'assistant'
      - `content` (text) - Message content
      - `source` (text) - Channel: 'sms' or 'web_chat'
      - `created_at` (timestamptz) - Message timestamp

    - `ce_appointments` - Scheduled appointments
      - `id` (uuid, primary key)
      - `lead_id` (uuid, foreign key) - Reference to lead
      - `lead_name` (text) - Customer name
      - `lead_phone` (text) - Customer phone
      - `lead_email` (text) - Customer email
      - `vehicle_interest` (text) - Vehicle of interest
      - `appointment_date` (date) - Appointment date
      - `appointment_time` (text) - Appointment time
      - `appointment_type` (text) - Type: 'test_drive', 'service', 'consultation'
      - `status` (text) - Status: 'pending', 'confirmed', 'completed', 'cancelled'
      - `notes` (text) - Additional notes
      - `created_at` (timestamptz) - Record creation time

    - `ce_chat_sessions` - Chat session analytics
      - `id` (uuid, primary key)
      - `lead_id` (uuid, foreign key) - Reference to lead
      - `session_id` (text) - Unique session identifier
      - `source` (text) - Channel: 'sms' or 'web_chat'
      - `started_at` (timestamptz) - Session start time
      - `ended_at` (timestamptz) - Session end time
      - `message_count` (integer) - Total messages in session
      - `user_message_count` (integer) - User messages count
      - `ai_message_count` (integer) - AI messages count
      - `outcome` (text) - Session outcome: 'lead_captured', 'appointment_booked', 'abandoned', 'escalated'
      - `avg_response_time_ms` (integer) - Average AI response time in milliseconds

    - `ce_settings` - Dealership settings
      - `id` (uuid, primary key)
      - `key` (text, unique) - Setting key
      - `value` (text) - Setting value
      - `updated_at` (timestamptz) - Last update time

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated access
*/

-- Create ce_leads table
CREATE TABLE IF NOT EXISTS ce_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text DEFAULT '',
  phone text UNIQUE,
  email text DEFAULT '',
  vehicle_interest text DEFAULT '',
  source text DEFAULT 'web_chat',
  status text DEFAULT 'new',
  interest_score integer DEFAULT 0,
  notes text DEFAULT '',
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ce_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on ce_leads"
  ON ce_leads
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create ce_conversations table
CREATE TABLE IF NOT EXISTS ce_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES ce_leads(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  source text DEFAULT 'web_chat',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ce_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on ce_conversations"
  ON ce_conversations
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create ce_appointments table
CREATE TABLE IF NOT EXISTS ce_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES ce_leads(id) ON DELETE SET NULL,
  lead_name text DEFAULT '',
  lead_phone text DEFAULT '',
  lead_email text DEFAULT '',
  vehicle_interest text DEFAULT '',
  appointment_date date,
  appointment_time text,
  appointment_type text DEFAULT 'test_drive',
  status text DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ce_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on ce_appointments"
  ON ce_appointments
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create ce_chat_sessions table
CREATE TABLE IF NOT EXISTS ce_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES ce_leads(id) ON DELETE SET NULL,
  session_id text UNIQUE,
  source text DEFAULT 'web_chat',
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  message_count integer DEFAULT 0,
  user_message_count integer DEFAULT 0,
  ai_message_count integer DEFAULT 0,
  outcome text DEFAULT 'active',
  avg_response_time_ms integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ce_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on ce_chat_sessions"
  ON ce_chat_sessions
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create ce_settings table
CREATE TABLE IF NOT EXISTS ce_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ce_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on ce_settings"
  ON ce_settings
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ce_leads_created_at ON ce_leads(created_at);
CREATE INDEX IF NOT EXISTS idx_ce_leads_source ON ce_leads(source);
CREATE INDEX IF NOT EXISTS idx_ce_leads_status ON ce_leads(status);
CREATE INDEX IF NOT EXISTS idx_ce_conversations_lead_id ON ce_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_ce_conversations_created_at ON ce_conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_ce_appointments_created_at ON ce_appointments(created_at);
CREATE INDEX IF NOT EXISTS idx_ce_chat_sessions_started_at ON ce_chat_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_ce_chat_sessions_source ON ce_chat_sessions(source);
CREATE INDEX IF NOT EXISTS idx_ce_chat_sessions_outcome ON ce_chat_sessions(outcome);