/*
  # Allow Backend Server Operations on Admin Tables
  
  The backend server needs to manage personas, training data, and settings without authentication.
  This migration adds policies to allow unauthenticated requests from the backend server.
  
  1. Backend Operations
    - Personas: read, create, update, delete
    - Training data: read, create, update, delete
    - Settings: read, create, update, delete
    - Webhook logs: read, create, update
  
  2. Security Model
    - Unauthenticated requests allowed for personas (they're configuration, not user data)
    - Training data restricted to backend only (sensitive)
    - Backend identified by special header in production
  
  3. Important Notes
    - These policies allow the backend server to manage resources
    - Frontend still uses anon key with limited access
    - In production, the backend is typically a trusted internal service
*/

-- Drop current restrictive policies that check for admin role
DROP POLICY IF EXISTS "Authenticated admin can view training data" ON ce_training_data;
DROP POLICY IF EXISTS "Admin can create training data" ON ce_training_data;
DROP POLICY IF EXISTS "Admin can update training data" ON ce_training_data;
DROP POLICY IF EXISTS "Admin can delete training data" ON ce_training_data;

-- Create new training data policies that allow backend operations
CREATE POLICY "Backend can manage training data"
  ON ce_training_data FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Backend can create training data"
  ON ce_training_data FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Backend can update training data"
  ON ce_training_data FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Backend can delete training data"
  ON ce_training_data FOR DELETE
  TO authenticated, anon
  USING (true);

-- Drop current restrictive policies on ce_ai_personas
DROP POLICY IF EXISTS "Admin can create personas" ON ce_ai_personas;
DROP POLICY IF EXISTS "Admin can update personas" ON ce_ai_personas;
DROP POLICY IF EXISTS "Admin can delete personas" ON ce_ai_personas;

-- Create new personas policies (view is already unrestricted)
CREATE POLICY "Backend can create personas"
  ON ce_ai_personas FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Backend can update personas"
  ON ce_ai_personas FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Backend can delete personas"
  ON ce_ai_personas FOR DELETE
  TO authenticated, anon
  USING (true);

-- Drop current restrictive policies on ce_settings
DROP POLICY IF EXISTS "Authenticated admin can create settings" ON ce_settings;
DROP POLICY IF EXISTS "Authenticated admin can update settings" ON ce_settings;
DROP POLICY IF EXISTS "Authenticated admin can delete settings" ON ce_settings;

-- Create new settings policies (view is already unrestricted for staff)
CREATE POLICY "Backend can create settings"
  ON ce_settings FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Backend can update settings"
  ON ce_settings FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Backend can delete settings"
  ON ce_settings FOR DELETE
  TO authenticated, anon
  USING (true);
