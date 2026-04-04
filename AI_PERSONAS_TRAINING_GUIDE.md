# AI Personas & Training System - Implementation Guide

## Overview

Your Carson Exports AI system now includes comprehensive AI persona customization, conversation storage, automatic training data collection, and webhook-based email notifications. This creates a closed-loop system for improving AI performance over time.

## Key Features Implemented

### 1. AI Persona Customization

**What it does:** You can now create different AI personas that adapt their tone, communication style, and greeting based on context (Sales, Service, or General).

**Three default personas installed:**
- **Sales Professional** - Persuasive, enthusiastic, focused on vehicle value propositions
- **Service Expert** - Patient, detailed, explains maintenance clearly
- **General Assistant** - Friendly, balanced approach for general inquiries

**How to use:**
1. Go to **Admin Dashboard → AI & Training → AI Personas**
2. Click **New Persona** to create custom personas
3. Configure:
   - **Name**: Display name (e.g., "Premium Sales Team")
   - **Tone Type**: sales, service, or general
   - **Response Style**: professional, friendly, detailed, or concise
   - **Greeting Template**: Custom greeting message
   - **System Prompt Addition**: Special instructions for this persona
4. Click **Activate** to make a persona active (used in all new conversations)

**Backend:** Personas are stored in `ce_ai_personas` table and injected into the system prompt during chat.

---

### 2. Automatic Conversation Storage

**What it does:** Every customer conversation is automatically logged to the database for later analysis and training.

**Data captured:**
- Complete message transcript
- Customer info (name, phone, email, vehicle interest)
- Session duration, message count, response times
- AI persona used
- Conversation outcome (active, completed, etc.)

**Location:** `ce_conversations` table stores individual messages; `ce_chat_sessions` tracks session metadata.

**How to access:**
1. Go to **Admin Dashboard → AI & Training → Conversations**
2. Use filters to search by:
   - Customer name/phone/email
   - Date range
   - Vehicle interest
3. Click any conversation to view the full transcript

---

### 3. Training Data Manager

**What it does:** Flag important conversations as training examples to identify patterns for AI improvement.

**Categories for flagging:**
- **good_answer** - Examples where AI responded well
- **bad_answer** - Examples where AI could improve
- **sales_close** - Conversations that resulted in appointments/sales
- **missed_opportunity** - Conversations with potential but no action taken

**How to use:**
1. Go to **Admin Dashboard → AI & Training → Training Data**
2. Search for conversations you want to flag
3. Click a conversation to view it
4. Click **Flag for Training**
5. Select category and add notes about why it's valuable
6. Approved training data appears in the **Training Data Manager** section

**Use cases for training data:**
- Collect 50+ "good answer" examples to fine-tune prompts
- Identify patterns in "missed_opportunity" to improve follow-up
- Export "sales_close" conversations to study what works

**Backend:** Data stored in `ce_training_data` table with approval workflow.

---

### 4. Conversation Completion & Webhook Notifications

**What it does:** When a conversation ends, automatically send a summary webhook to ActivePieces to trigger email notifications.

**Triggers webhook when:**
1. User closes the chat window
2. 10 minutes of inactivity detected (auto-sends summary)

**Webhook payload includes:**
```json
{
  "event": "conversation_completed",
  "timestamp": "2026-04-04T12:00:00Z",
  "session": {
    "id": "ses_1234567890",
    "started_at": "2026-04-04T11:50:00Z",
    "ended_at": "2026-04-04T12:00:00Z",
    "duration_seconds": 600,
    "message_count": 8,
    "user_messages": 4,
    "ai_messages": 4,
    "outcome": "active"
  },
  "lead": {
    "id": "uuid",
    "name": "John Smith",
    "phone": "555-0123",
    "email": "john@example.com",
    "vehicle_interest": "Honda CR-V"
  },
  "ai": {
    "persona": "Sales Professional",
    "tone_type": "sales"
  },
  "conversation": [
    {"role": "user", "content": "Hi, I'm looking for a Honda", "timestamp": "..."},
    {"role": "assistant", "content": "Great! We have several Honda models...", "timestamp": "..."}
  ],
  "summary": {
    "total_messages": 8,
    "conversation_topics": ["vehicle", "price", "test_drive"],
    "sentiment": "positive"
  }
}
```

**To enable webhook notifications:**
1. Set your webhook URL in **Admin → Settings → Dealership Settings**
2. Use the webhook endpoint in ActivePieces to trigger email notifications
3. Map webhook fields to email template variables

**Backend endpoints:**
- `POST /api/send-webhook` - Manually trigger webhook
- `GET /api/webhook-logs` - View delivery history
- `POST /api/webhook-logs/:id/retry` - Retry failed delivery (up to 3 attempts)

---

### 5. Admin Dashboard Sections

#### AI Personas Tab
- Create, edit, activate, and delete personas
- See which persona is currently active
- View tone type and response style for each

#### Training Data Tab
- Search through all conversations
- Filter by date range
- View flagged training data with approval status
- Approve or delete training data

#### Conversation Analytics Tab
- Full-text search across all conversations
- Advanced filters (name, phone, email, date range)
- Click any conversation to view full transcript
- Flag conversations as training data directly from view
- Extract sentiment analysis and conversation topics

---

## API Reference

### Personas

```bash
# List all personas
GET /api/personas

# Get active persona
GET /api/personas/active

# Create new persona
POST /api/personas
{
  "name": "Custom Persona",
  "tone_type": "sales",
  "response_style": "professional",
  "greeting_template": "Hi there!",
  "system_prompt_addition": "You are..."
}

# Update persona (including activation)
PUT /api/personas/:id
{
  "is_active": true
}

# Delete persona
DELETE /api/personas/:id
```

### Training Data

```bash
# Get training data (optional: ?category=good_answer&is_approved=true)
GET /api/training-data

# Flag conversation as training data
POST /api/training-data/flag
{
  "session_id": "ses_xxx",
  "category": "good_answer",
  "notes": "Great handling of objection"
}

# Approve training data
PUT /api/training-data/:id/approve

# Delete training data
DELETE /api/training-data/:id
```

### Conversations

```bash
# Search conversations
GET /api/conversations/search?query=John&start_date=2026-04-01&end_date=2026-04-04&limit=50

# Get single conversation with full transcript
GET /api/conversations/:sessionId
```

### Webhooks

```bash
# Send conversation completion webhook
POST /api/send-webhook
{
  "sessionId": "ses_xxx",
  "webhookUrl": "https://your-webhook-url.com/api/..."
}

# Get webhook delivery logs
GET /api/webhook-logs?limit=50&offset=0

# Retry webhook delivery
POST /api/webhook-logs/:id/retry
```

---

## Database Schema

### New Tables Created

#### `ce_ai_personas`
Stores AI persona configurations
- `id` (uuid) - primary key
- `name` (text) - persona display name
- `tone_type` (text) - 'sales', 'service', or 'general'
- `response_style` (text) - communication approach
- `greeting_template` (text) - custom greeting
- `system_prompt_addition` (text) - persona-specific instructions
- `is_active` (boolean) - currently active persona

#### `ce_training_data`
Stores flagged conversations for AI training
- `id` (uuid) - primary key
- `conversation_id` (uuid) - reference to conversation
- `session_id` (uuid) - reference to session
- `category` (text) - training category
- `notes` (text) - why this is valuable
- `is_approved` (boolean) - review status

#### `ce_webhook_logs`
Logs all webhook deliveries and retries
- `id` (uuid) - primary key
- `session_id` (uuid) - reference to session
- `webhook_url` (text) - the URL called
- `payload` (jsonb) - full webhook payload
- `status_code` (integer) - HTTP response code
- `error_message` (text) - error details if failed
- `retry_count` (integer) - number of attempts
- `next_retry_at` (timestamp) - when to retry

### Extended Tables

#### `ce_chat_sessions` (new columns)
- `persona_id` (uuid) - which persona was used
- `webhook_sent` (boolean) - whether webhook was sent

#### `ce_conversations` (new columns)
- `flagged_for_training` (boolean) - marked for training
- `training_category` (text) - category if flagged

---

## Workflow Examples

### Example 1: Create Sales vs. Service Personas

**Use case:** Different communication for sales calls vs. service requests

1. Create "Sales Expert" persona:
   - Tone: sales
   - Style: persuasive
   - Greeting: "Hi! Looking for your next vehicle? I can help find the perfect match."
   - Prompt: "Focus on vehicle features, pricing, and booking test drives."

2. Create "Service Advisor" persona:
   - Tone: service
   - Style: detailed
   - Greeting: "Hello! Need service or maintenance help?"
   - Prompt: "Provide clear technical explanations and appointment scheduling."

3. Activate "Sales Expert" by default
4. Customers see personalized AI behavior based on context

### Example 2: Analyze Successful Sales Conversations

**Use case:** Understand what leads to conversions

1. Go to Conversation Analytics
2. Search for conversations from last 30 days
3. Flag 10+ conversations marked "sales_close"
4. Review common patterns in their transcripts:
   - Which vehicle types mentioned most?
   - What questions did customers ask?
   - How did AI handle objections?
5. Use insights to improve Sales persona's system prompt

### Example 3: Identify AI Training Gaps

**Use case:** Find where AI needs improvement

1. Go to Training Data Manager
2. Filter for "bad_answer" category
3. Review flagged conversations
4. Identify patterns (e.g., "AI struggled with financing questions")
5. Update AI Knowledge base or create specialized persona
6. Test improved responses on next batch of conversations

### Example 4: Webhook Integration with ActivePieces

**Use case:** Send conversation summaries to email

1. In ActivePieces, create a workflow:
   - HTTP trigger: `POST https://your-domain.com/api/send-webhook`
   - Parse webhook payload
   - Send email with:
     - Customer name/contact
     - Conversation summary
     - Sentiment analysis
     - Topics discussed
     - Recommended follow-up

2. Set webhook URL in Admin Settings
3. All conversation completions automatically trigger emails

---

## Best Practices

### For Persona Management
- Create personas that match your team roles (Sales, Service, Support)
- Test new personas with a small % of traffic before going live
- Update persona prompts monthly based on training data insights
- Maintain 2-3 personas maximum for clarity

### For Training Data
- Flag conversations within 24 hours while fresh
- Aim for 100+ training examples per category
- Review flagged data every week to identify patterns
- Use "notes" field to document why it's valuable
- Approve training data before using for fine-tuning

### For Conversation Analysis
- Export conversations weekly to analyze trends
- Look for drop-off points where customers leave
- Identify high-intent conversations (vehicle-specific questions)
- Track sentiment changes through conversation flow
- Share top performing conversations with team

### For Webhook Notifications
- Test webhook delivery weekly
- Monitor webhook logs for failures
- Set up automatic retries (system does this every 5 min, up to 3 times)
- Validate webhook payload structure in ActivePieces
- Include conversation sentiment in email subject for quick triage

---

## Troubleshooting

### Personas not appearing
- Clear browser cache
- Refresh admin panel
- Verify database connection is active

### Webhook not sending
- Check webhook URL is correct in Settings
- Verify endpoint is publicly accessible
- Review webhook logs for error messages
- Use "Retry" button to test delivery

### Training data not saving
- Ensure you're flagging while viewing conversation
- Check that category is selected
- Verify you have admin permissions
- Refresh page to see approval status

### Chat not recording conversations
- Verify Supabase connection in `.env`
- Check that lead creation completed first
- View `ce_conversations` table directly for debugging
- Ensure `ce_chat_sessions` was initialized

---

## Next Steps

1. **Activate** your first custom persona in the AI Personas admin panel
2. **Monitor** conversation quality in the Conversation Analytics section
3. **Flag** good and bad conversations for pattern recognition
4. **Configure** your webhook URL for email notifications
5. **Review** training data weekly to improve AI performance
6. **Iterate** - update personas based on what you learn

Your system is now ready to learn and improve continuously!
