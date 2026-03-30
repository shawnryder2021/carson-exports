# Twilio SMS Integration - Testing Guide

## Quick Start (5 minutes)

### Step 1: Get Twilio Credentials (2 min)
1. Go to [twilio.com](https://www.twilio.com)
2. Sign up or log in
3. Go to Console → Account Info
4. Copy your **Account SID** (starts with `AC`)
5. Copy your **Auth Token**
6. Navigate to Messaging → Get started with Twilio numbers
7. Get a **phone number** (any Twilio number, e.g., `+1XXXXXXXXXX`)

### Step 2: Configure the Backend (1 min)
1. Open `.env` file in the project root
2. Replace the placeholder values:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
```
3. **Save the file** (do NOT commit to GitHub)

### Step 3: Start the Backend (1 min)
```bash
npm start
```

You should see:
```
✅ Twilio configured. SMS features enabled.
🚗 Carson Exports AI Backend running on http://localhost:3001
```

### Step 4: Test in Admin Dashboard (1 min)
1. Open the chat admin dashboard (gear icon)
2. Click **"Twilio Testing"** in the sidebar
3. You'll see three test sections

## Detailed Testing

### Test 1: ADF Lead Webhook ✅

**What it does:** Simulates receiving an ADF lead from your CRM (via Make/Zapier), creates an SMS lead, and sends a greeting message.

**Steps:**
1. Fill in test form:
   - Customer Name: `John Smith` (or your name)
   - Phone: `9025551234` (use YOUR phone number to receive SMS)
   - Email: `john@example.com`
   - Vehicle Interest: `Honda CR-V`
   - Department: `Sales`

2. Click **"Send Test ADF Payload"**

3. **Expected Result:**
   - ✅ Success message appears
   - ✅ You receive an SMS: "Hi John Smith! 👋 Thanks for your interest in Honda CR-V..."
   - ✅ SMS lead appears in "SMS Leads" tab

**Troubleshooting:**
- ❌ "Connection Error" → Backend not running. Do `npm start` in terminal
- ❌ "Twilio not configured" → Check .env file, restart backend
- ❌ No SMS received → Check phone number is correct, Twilio account has credits

### Test 2: SMS Chat Message ✅

**What it does:** Sends a test SMS message to an existing lead and gets an AI response.

**Prerequisites:** Complete Test 1 first to create a lead

**Steps:**
1. Phone should auto-fill with `+19025551234` (from Test 1)
2. Type a message, e.g.:
   - `Tell me about the Honda CR-V`
   - `How much does it cost?`
   - `I want to book an appointment`
3. Click **"Send Test SMS"**

4. **Expected Result:**
   - ✅ AI response appears in the result box
   - ✅ Response addresses your message (about the vehicle, pricing, or appointment)
   - ✅ Message is added to SMS lead transcript

**Sample Conversation Flow:**
```
You:  "Tell me about the Honda CR-V"
AI:   "Great! We have a 2022 Honda CR-V EX with 45k km for $28,900.
       It features leather interior, backup camera, Bluetooth, and more.
       Interested in a test drive?"

You:  "How much?"
AI:   "The 2022 CR-V EX is $28,900. We also have financing options
       available. What would work best for your budget?"

You:  "I want to book"
AI:   "Great! I can help you schedule a test drive.
       What's your full name?"
```

### Test 3: View SMS Leads ✅

**What it does:** Shows all SMS leads created during testing.

**Steps:**
1. Click **"Show SMS Leads"**

2. **Expected Result:**
   - Table displays all SMS leads
   - Shows: Phone, Name, Interest, Message count, Status, Created time
   - Each lead from your tests appears here

**What You Should See:**
- Phone: `+19025551234` (from Test 1)
- Name: `John Smith`
- Interest: `Honda CR-V`
- Messages: Increases as you do more tests
- Status: `active`

## Real-World Setup

After testing, here's how to connect it to your real CRM:

### Option A: Using Make (Recommended)

1. **Create a scenario in Make:**
   - Trigger: Gmail - New Email
   - Filter: Email received at your ADF email address
   - Action: HTTP - Make a POST request

2. **Configure HTTP request:**
   - **URL**: `https://your-domain.com/api/webhook/adf`
   - **Method**: POST
   - **Headers**: `Content-Type: application/json`
   - **Body** (parse email for these fields):
     ```json
     {
       "customer_name": "{{email.from.name}}",
       "customer_phone": "[extract phone from email body]",
       "customer_email": "{{email.from.email}}",
       "vehicle_interest": "[extract vehicle from email body]",
       "department": "Sales"
     }
   ```

3. **Test the scenario** to ensure ADF data flows correctly

### Option B: Using Zapier

1. Create a Zap with Gmail trigger
2. Add Webhooks by Zapier action
3. Configure same way as Make above
4. Test the Zap

### Configure Twilio Webhook

1. Go to Twilio Console
2. Navigate to Messaging → Services (or select your phone number)
3. **Inbound Webhook URL**: `https://your-domain.com/api/webhook/sms-inbound`
4. **Method**: POST
5. Save

### Test Real Flow

1. Send an email to your ADF email address (from your CRM)
2. Make/Zapier receives it and sends to your backend
3. Your backend sends SMS greeting to customer
4. Customer replies with SMS
5. Twilio sends message to your backend
6. AI generates response
7. Response sent back to customer
8. Lead appears in admin dashboard "SMS Leads" tab

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "Backend not running" | Start with `npm start` in project folder |
| "Twilio not configured" | Check .env file has all 3 variables, restart backend |
| No SMS received | Use YOUR real phone number in tests, check Twilio account balance |
| SMS takes >3 seconds | Normal for AI, OpenAI API latency varies |
| No response from AI | Check OPENAI_API_KEY in .env is valid, verify backend logs |
| Leads not appearing | Check browser developer console (F12) for JavaScript errors |

## Advanced Testing

### Test with Multiple Customers

1. Change phone number in Test 1 (use different numbers)
2. Create multiple leads
3. View all in "View SMS Leads" table
4. Switch between conversations

### Test Conversation Flow

**Appointment Booking Journey:**
```
Test 1: Create lead for John Smith
Test 2: "I'm interested in the Honda"
Test 2: "How much?"
Test 2: "I want to book a test drive"
Test 2: "My email is john@example.com"
Test 2: "Next Tuesday at 2 PM"

View in SMS Leads tab → Should show full conversation
Click "View" → Should see appointment details
```

**Inventory Search Journey:**
```
Test 1: Create lead
Test 2: "Do you have SUVs?"
Test 2: "What's your best price?"
Test 2: "Tell me about the CR-V"
Test 2: "Available tomorrow?"
```

## Production Checklist

Before going live:

- [ ] Twilio account created and funded
- [ ] Phone number provisioned
- [ ] .env configured with credentials
- [ ] Backend running (`npm start`)
- [ ] Make/Zapier scenario created and tested
- [ ] Twilio webhook configured
- [ ] Test 1-3 all passing
- [ ] Real ADF lead received and SMS sent
- [ ] Customer SMS reply received and AI responded
- [ ] Admin dashboard displays SMS leads correctly
- [ ] "Submit to CRM" button sends lead to webhook

## Support

**Backend issues?**
```bash
npm start  # Ensure running
npm install  # Reinstall deps if needed
```

**Twilio issues?**
- Check Twilio console: https://www.twilio.com/console
- Verify Account SID and Auth Token
- Check phone number is active
- Verify webhook URL is correct

**AI response issues?**
- Check OPENAI_API_KEY in .env
- Verify backend logs: `npm start`
- Try simple test: "Hi"

**Can't receive SMS?**
- Verify phone number in test is YOUR phone
- Check Twilio console for message logs
- Ensure phone number format is correct: +1XXXXXXXXXX

## Next Steps

1. ✅ Complete 4 steps above
2. ✅ Test all 3 test scenarios
3. ✅ Set up Make/Zapier email integration
4. ✅ Configure Twilio webhook
5. ✅ Receive your first real ADF lead via SMS
6. ✅ Customer replies and books appointment
7. ✅ View full transcript in admin dashboard
