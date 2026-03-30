# Twilio SMS Integration Setup Guide

## Overview
This guide explains how to set up and use the Twilio SMS integration for after-hours lead communication with the Carson Exports AI Chat System.

## What It Does
- Receives ADF/XML formatted leads from your CRM via email service (Make, Zapier, SendGrid)
- Automatically sends SMS greeting to customers
- Uses AI to answer questions about vehicles, financing, and dealership info
- Guides customers through appointment booking via SMS
- Logs complete conversation transcripts
- Submits completed leads to your CRM webhook for team follow-up

## Prerequisites
1. **Twilio Account** - Active account at https://www.twilio.com
2. **Twilio Phone Number** - A Twilio number to send/receive SMS
3. **Make/Zapier Account** - For ADF email parsing (optional, but recommended)
4. **Node.js Backend** - Running ai-backend.js with Twilio SDK

## Setup Steps

### Step 1: Get Twilio Credentials

1. Go to https://www.twilio.com/console
2. Find your **Account SID** (starts with `AC...`)
3. Copy your **Auth Token**
4. Note your **Twilio Phone Number** (format: `+1XXXXXXXXXX`)

### Step 2: Configure Environment Variables

Edit `.env` file in your project directory:

```
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
```

**⚠️ IMPORTANT:** Never commit the `.env` file to GitHub. It's in `.gitignore` for security.

### Step 3: Install Dependencies

```bash
npm install
```

This installs the Twilio SDK and other required packages.

### Step 4: Start the Backend

```bash
npm start
# or for development with auto-reload:
npm run dev
```

You should see:
```
✅ Twilio configured. SMS features enabled.
🚗 Carson Exports AI Backend running on http://localhost:3001
```

### Step 5: Configure Make/Zapier Email Integration

**Option A: Using Make (Recommended)**
1. Create a new scenario in Make
2. Trigger: Gmail - New Email received (watch for emails to your ADF email)
3. Action: HTTP - Make a request
   - **URL**: `http://your-domain.com/api/webhook/adf`
   - **Method**: POST
   - **Headers**: `Content-Type: application/json`
   - **Body** (JSON):
   ```json
   {
     "customer_name": "{{message.from.name}}",
     "customer_phone": "{{message.body.[phone number pattern]}}",
     "customer_email": "{{message.from.email}}",
     "vehicle_interest": "{{message.body.[vehicle type]}}",
     "department": "Sales"
   }
   ```

**Option B: Using Zapier**
1. Create a Zap with Gmail trigger
2. Search for "Webhooks by Zapier"
3. Set webhook URL to: `http://your-domain.com/api/webhook/adf`
4. Send the ADF data as JSON payload

### Step 6: Configure Twilio Webhook

1. Go to Twilio Console > Messaging > Services
2. Select your messaging service or phone number
3. **Webhook URL** (inbound messages):
   ```
   http://your-domain.com/api/webhook/sms-inbound
   ```
4. **Method**: POST
5. Save

### Step 7: Test the Setup

#### Test ADF Webhook (from command line):
```bash
curl -X POST http://localhost:3001/api/webhook/adf \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "John Smith",
    "customer_phone": "9025551234",
    "customer_email": "john@example.com",
    "vehicle_interest": "Honda CR-V",
    "department": "Sales"
  }'
```

Expected Response:
```json
{
  "success": true,
  "leadId": "sms_1704067200000",
  "message": "SMS conversation initiated",
  "customerPhone": "+19025551234"
}
```

You should receive an SMS message immediately on the phone number provided.

#### Test SMS Reply:
Send an SMS to your Twilio number from the customer's phone. The backend should:
1. Receive the message at `/api/webhook/sms-inbound`
2. Look up the SMS lead by phone
3. Pass the message to AI
4. Generate and send a response

#### Test Admin Dashboard:
1. Open the chat admin dashboard (gear icon in chat)
2. Click "SMS Leads" tab in sidebar
3. You should see active SMS conversations
4. Click "View" to see full transcript
5. Click "Submit to CRM" to send lead to webhook

## API Endpoints

### POST /api/webhook/adf
Receives ADF lead from email service, initiates SMS conversation

**Request:**
```json
{
  "customer_name": "John Smith",
  "customer_phone": "9025551234",
  "customer_email": "john@example.com",
  "vehicle_interest": "Honda CR-V",
  "department": "Sales"
}
```

**Response:**
```json
{
  "success": true,
  "leadId": "sms_1704067200000",
  "message": "SMS conversation initiated",
  "customerPhone": "+19025551234"
}
```

### POST /api/sms-chat
Processes SMS message and generates AI response

**Request:**
```json
{
  "phone": "+19025551234",
  "message": "Tell me about the Honda CR-V"
}
```

**Response:**
```json
{
  "success": true,
  "response": "Great! We have a 2022 Honda CR-V EX with 45k km, $28,900. Features include...",
  "leadState": "ah_inventory"
}
```

### POST /api/webhook/sms-inbound
Receives SMS messages from Twilio (called automatically by Twilio)

**Request (from Twilio):**
```json
{
  "From": "+19025551234",
  "Body": "Tell me about the Honda CR-V",
  "MessageSid": "SM...",
  ...
}
```

**Response:**
```json
{
  "statusCode": 200,
  "body": "Message processed"
}
```

## SMS State Machine

The SMS conversation flows through these states:

| State | Description | Example |
|-------|-------------|---------|
| `ah_menu` | Initial greeting | "Hi John! What can we help with? 1) Browse vehicles 2) Book appointment 3) Ask a question" |
| `ah_inventory` | Browsing vehicles | "What type of vehicle are you looking for? SUV, sedan, truck?" |
| `ah_appt_name` | Collecting name | "Got it! What's your full name?" |
| `ah_appt_phone` | Collecting phone | "Got it, 902-555-1234. What's your email?" |
| `ah_appt_email` | Collecting email | "Got your email. What date works best?" |
| `ah_appt_date` | Collecting date | "Tomorrow at 2 PM - confirm?" |
| `ah_appt_time` | Collecting time | "Perfect! You're all set for tomorrow at 2 PM" |

## Admin Dashboard

### SMS Leads Tab
Located in admin dashboard sidebar. Shows:
- **Phone** - Customer phone number
- **Name** - Customer name
- **Interest** - Vehicle interest or "General"
- **Status** - active, booked, closed, or submitted
- **Messages** - Number of SMS messages exchanged
- **Last Message** - Preview of most recent message
- **Created** - When lead was received

### SMS Transcript Modal
Click "View" on any SMS lead to see:
- Full conversation history
- Each message color-coded (customer vs. bot)
- Option to "Submit to CRM" to send lead to webhook

## Troubleshooting

### "Twilio not configured" Message
- Check `.env` file has all three variables
- Verify no typos in Account SID, Auth Token, Phone Number
- Restart backend: `npm start`

### SMS Not Received
- Check Twilio phone number is correct in `.env`
- Verify Make/Zapier webhook is sending to correct endpoint
- Check backend logs for errors
- Test manually with curl command above

### SMS Responses Not Sent
- Verify OpenAI API key is valid in `.env`
- Check backend logs for OpenAI errors
- Confirm Twilio credentials are correct
- Try manually testing with `/api/sms-chat` endpoint

### Backend Crashes on Start
- Run syntax check: `node -c ai-backend.js`
- Check for missing dependencies: `npm install`
- Verify `.env` file syntax (no quotes needed)
- Check Node.js version: `node --version` (v14+ required)

## Production Deployment

When deploying to production:

1. **Environment Variables**
   - Set on hosting platform (Heroku, AWS, etc.)
   - Never commit `.env` to version control

2. **API Endpoint URLs**
   - Update webhook URLs in Make/Zapier (use production domain)
   - Update SMS webhook in Twilio console (use production domain)

3. **Database**
   - Current implementation stores SMS leads in memory (lost on restart)
   - For production, implement persistent storage (MongoDB, PostgreSQL, etc.)

4. **Security**
   - Use HTTPS for all webhook URLs
   - Validate webhook signatures from Twilio
   - Never log sensitive data (API keys, passwords)

## Example Flow

1. **Customer emails your CRM** about a Honda CR-V
2. **Make/Zapier** receives email and POSTs to `/api/webhook/adf`
3. **System creates SMS lead** and sends greeting: "Hi John! Thanks for your interest in the Honda CR-V. What can we help with?"
4. **Customer replies** "Tell me more about the price"
5. **System receives at** `/api/webhook/sms-inbound`
6. **AI generates response**: "It's priced at $28,900. Features include..."
7. **System sends response** via Twilio
8. **Conversation continues** until appointment is booked
9. **Admin sees SMS lead** in "SMS Leads" tab with full transcript
10. **Admin clicks "Submit to CRM"** to send to webhook for team follow-up

## Support

For issues with:
- **Twilio**: https://www.twilio.com/docs
- **AI Chat System**: Check backend logs with `npm start`
- **Make Integration**: https://www.make.com/support
- **Zapier Integration**: https://zapier.com/help

## Files Modified/Created

- ✅ **ai-backend.js** - Added Twilio client, 3 new endpoints, SMS system prompt
- ✅ **adf-parser.js** - NEW - Parses ADF/XML data
- ✅ **package.json** - Added twilio dependency
- ✅ **.env** - Added Twilio configuration variables
- ✅ **index.html** - Added SMS Leads tab and admin functions

## Next Steps

1. ✅ Configure `.env` with Twilio credentials
2. ✅ Start backend: `npm start`
3. ✅ Test with curl command above
4. ✅ Set up Make/Zapier email integration
5. ✅ Configure Twilio webhook
6. ✅ Test end-to-end SMS flow
7. ✅ Monitor SMS Leads tab in admin dashboard
