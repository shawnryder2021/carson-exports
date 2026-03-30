/**
 * Carson Exports AI Backend
 * Secure OpenAI Integration via Node.js/Express
 *
 * This backend securely calls OpenAI API without exposing keys to frontend
 * Environment variables store the sensitive API key
 *
 * Setup:
 * 1. npm init -y
 * 2. npm install express cors dotenv axios
 * 3. Create .env file with: OPENAI_API_KEY=your_key_here
 * 4. node ai-backend.js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Twilio Configuration (optional - SMS features disabled if not provided)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Validation
if (!OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY not found in environment variables');
  console.error('Please create a .env file with: OPENAI_API_KEY=your_key_here');
  process.exit(1);
}

// Initialize Twilio client if credentials provided
let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio configured. SMS features enabled.');
} else {
  console.warn('⚠️  Twilio not configured. SMS features disabled.');
  console.warn('   Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env to enable SMS');
}

// SMS Leads Storage (in-memory, could be moved to database for production)
let smsLeads = [];

/**
 * Generate system prompt dynamically based on dealership settings and chat state
 * @param {Object} dealershipSettings - Settings from admin panel
 * @param {string} chatState - Current conversation state (menu, inventory_search, appt_*, etc.)
 * @param {Array} recentHistory - Last few messages for context (optional)
 * @returns {string} - Generated system prompt
 */
function generateSystemPrompt(dealershipSettings = {}, chatState = 'menu', recentHistory = []) {
  // Default values if not provided
  const settings = {
    dealershipName: dealershipSettings.dealershipName || 'Carson Exports',
    phone: dealershipSettings.phone || '1-833-706-3093',
    address: dealershipSettings.address || '550 Windmill Road, Dartmouth, NS, B3B 1B3',
    hours: dealershipSettings.hours || 'Monday–Saturday, 9:00 AM – 8:00 PM (Closed Sundays)',
    services: dealershipSettings.services || 'Sales, Service, Financing, Trade-ins',
    brands: dealershipSettings.brands || 'Toyota, Honda, Nissan, Hyundai, Ford, Audi, BMW, Ferrari, McLaren, and more',
    appointmentRules: dealershipSettings.appointmentRules || 'Appointments available Mon-Sat. Service appointments in 30-min slots from 8AM-5PM. Sales appointments from 9AM-7PM. No Sunday appointments.',
    responseTone: dealershipSettings.responseTone || 'friendly',
    faqKnowledge: dealershipSettings.faqKnowledge || ''
  };

  // Build tone instruction
  let toneInstruction = '';
  if (settings.responseTone === 'formal') {
    toneInstruction = 'Maintain a formal, professional tone at all times.';
  } else if (settings.responseTone === 'casual') {
    toneInstruction = 'Use a casual, conversational, friendly tone. Be relaxed and personable.';
  } else {
    toneInstruction = 'Use a friendly, professional tone that feels natural and approachable.';
  }

  // Build state-specific guidance
  let stateGuidance = '';

  switch(chatState) {
    case 'appt_name':
      stateGuidance = `CURRENT STATE: Collecting customer name for appointment
- Extract the customer's full name from their message
- Be conversational: "Thanks! I got John Smith. What's a good phone number to reach you?"
- If no name found, ask again: "Could I get your full name please?"
- Once you have the name, ALWAYS confirm it and move to asking for phone
- Do NOT collect multiple fields at once—focus on ONE field per exchange`;
      break;

    case 'appt_phone':
      stateGuidance = `CURRENT STATE: Collecting phone number for appointment
- Extract phone number in North American format: (XXX) XXX-XXXX or XXX-XXX-XXXX
- Accept: "902-555-1234", "(902) 555-1234", "9025551234"
- If invalid format, ask: "Could I get that phone number again? Format like 902-555-1234?"
- Once you have valid phone, confirm: "Got it, 902-555-1234. What's your email address?"
- Do NOT collect email yet—stay focused on phone validation`;
      break;

    case 'appt_email':
      stateGuidance = `CURRENT STATE: Collecting email address for appointment
- Extract email address (standard format: user@domain.com)
- If invalid, ask: "Could I get that email again? Something like john@example.com?"
- Once valid, confirm: "Perfect, john@example.com. What date works best for you?"
- Do NOT ask for date/time yet unless you have valid email`;
      break;

    case 'appt_date':
      stateGuidance = `CURRENT STATE: Collecting appointment date
- Extract date from natural language: "tomorrow", "next Tuesday", "March 30", "next week", etc.
- Available dates: Monday through Saturday, within next 2 weeks
- Sundays are NOT available
- If unclear, ask: "Would next Tuesday work, or do you prefer a different day?"
- Once date confirmed, ask: "What time works best for you? We have morning and afternoon slots."
- Be flexible and natural—don't force a specific format`;
      break;

    case 'appt_time':
      stateGuidance = `CURRENT STATE: Collecting appointment time
- Extract time from: "2pm", "14:00", "two o'clock", "morning", "afternoon"
- Available: Weekday mornings 9AM-12PM, afternoons 1PM-5PM. Saturday 9AM-4PM.
- If unclear, suggest: "Would morning (9AM-12PM) or afternoon (1PM-5PM) work better?"
- Once confirmed, show summary: "Great! You're all set for [Date] at [Time]. Ready to confirm?"
- Do NOT ask for confirmation details—let the system handle appointment summary`;
      break;

    case 'inventory_search':
      stateGuidance = `CURRENT STATE: Helping customer search for vehicles
- Listen for: vehicle type (SUV, sedan, truck, sports car), make (Honda, Toyota), model, budget, features
- Ask clarifying questions: "Any budget in mind? Prefer gas or diesel?"
- Extract structured info: "Looking for a Honda under $25k" → Make: Honda, Budget: $25k
- Suggest 2-3 relevant vehicles with prices and features
- Offer: "Want to see more? Would you like to book a test drive for any of these?"
- Be helpful and knowledgeable about inventory`;
      break;

    case 'vehicle_interest':
      stateGuidance = `CURRENT STATE: Customer interested in a specific vehicle
- Provide enthusiastic details: price, mileage, key features, condition highlights
- Answer questions about the vehicle naturally
- Use this format: "The [Vehicle] is priced at $[Price] with [Mileage]. Features include [Key Features]."
- When ready, suggest: "Ready for a test drive? I can book one for you right now."
- If asked about financing/trade-in, answer briefly and suggest appointment with finance team`;
      break;

    case 'menu':
      stateGuidance = `CURRENT STATE: Main menu / general inquiry
- Be helpful and offer choices without being pushy
- Suggest next steps: vehicle search, financing info, service booking, speaking with sales
- If confused about intent, ask: "What can I help you with today? Vehicle search, financing, or booking service?"
- Keep responses natural and conversational`;
      break;

    default:
      stateGuidance = `Current conversation state: ${chatState}
- Continue naturally based on the conversation flow
- Keep responses helpful and focused on the customer's needs`;
  }

  // Build the dynamic prompt
  return `You are an AI assistant for ${settings.dealershipName}, a quality pre-owned and exotic vehicle dealership.

DEALERSHIP INFORMATION:
- Name: ${settings.dealershipName}
- Hours: ${settings.hours}
- Location: ${settings.address}
- Phone: ${settings.phone}
- Services: ${settings.services}
- Brands: ${settings.brands}
- Appointment Policy: ${settings.appointmentRules}

RESPONDING TO DEALERSHIP INFORMATION QUESTIONS:
When customers ask about hours, location, phone, services, financing, trade-ins, or other dealership details, answer directly and accurately using the information above. Examples:
- "What are your hours?" → Answer with exact hours from above
- "Where are you located?" → Provide full address and mention it's in Dartmouth
- "Do you offer financing?" → "Yes! We work with multiple lenders to find the best rates."
- "Do you accept trade-ins?" → "Absolutely! We offer fair market value on all trade-ins."
- "What services do you provide?" → List relevant services from above

YOUR CORE RESPONSIBILITIES:
1. Help customers find vehicles matching their needs
2. Answer questions about dealership info, vehicle specs, pricing, availability
3. Provide financing, trade-in, and service information
4. Guide customers toward test drive or service appointments
5. Collect appointment information naturally from conversation (do NOT use form-like requests)
6. Keep responses concise (under 150 words typically)
7. Be conversational—this is a chat, not a questionnaire

IMPORTANT STATE-AWARE BEHAVIOR:
${stateGuidance}

CRITICAL RULES:
- When collecting appointment fields (name, phone, email, date, time): Extract from natural language, confirm the value, then move to the next field
- Example: User says "John Smith" when asked for name → Confirm "Got it, John Smith!" then ask for phone
- NEVER ask for multiple pieces of information at once
- NEVER force a rigid form structure—work with what customers naturally provide
- Be flexible with formats (phone, date, time)—accept various formats and normalize them
- If customer provides info before you ask (e.g., "My name is Sarah, call me at 555-1234"), acknowledge it and confirm, then ask for the remaining fields
- ALWAYS confirm extracted information before moving forward
- Keep the conversation natural and helpful

TONE: ${toneInstruction}

Remember: This is a natural conversation between a helpful AI and a customer. Respond like you're talking to a friend, not filling out a form.`;
}

/**
 * Generate system prompt for SMS conversations
 * SMS-optimized: shorter messages, natural language, mobile-friendly
 * @param {Object} dealershipSettings - Dealership configuration
 * @param {string} smsState - Current SMS state (ah_menu, ah_inventory, ah_appt_*, etc.)
 * @param {Object} leadData - SMS lead data for context
 * @returns {string} - SMS-optimized system prompt
 */
function generateSMSSystemPrompt(dealershipSettings = {}, smsState = 'ah_menu', leadData = {}) {
  const settings = {
    dealershipName: dealershipSettings.dealershipName || 'Carson Exports',
    phone: dealershipSettings.phone || '1-833-706-3093',
    address: dealershipSettings.address || '550 Windmill Road, Dartmouth, NS',
    hours: dealershipSettings.hours || 'Mon-Sat 9AM-8PM',
    brands: dealershipSettings.brands || 'Toyota, Honda, Nissan, Hyundai, Ford, Audi, BMW'
  };

  let stateGuidance = '';

  switch(smsState) {
    case 'ah_menu':
      stateGuidance = `CURRENT STATE: Initial SMS greeting (after-hours)
- Customer just received initial SMS
- Keep VERY short: under 160 characters (single SMS)
- Offer 2-3 clear menu options
- Use emojis to make it friendly
- Example: "Hi ${leadData.name}! 🚗 Thanks for your interest. What can we help with? Reply:\n1️⃣ Browse vehicles\n2️⃣ Book appointment\n3️⃣ Ask a question"`;
      break;

    case 'ah_inventory':
      stateGuidance = `CURRENT STATE: Customer browsing vehicles via SMS
- Keep responses SHORT: fit in 1-2 SMS messages (320 chars max)
- Ask about preferences: vehicle type, budget, features
- Share 1-2 vehicle options with brief details and prices
- If customer shows interest in booking, transition to appointment
- Example: "Great! We have a Honda CR-V ($28,900, 85k km) and Toyota RAV4 ($25,500, 92k km). Interested? Reply with your choice!"`;
      break;

    case 'ah_appt_name':
      stateGuidance = `CURRENT STATE: Collecting customer full name
- The system will extract the name from their response
- Ask clearly and conversationally: "What's your full name?"
- Once they respond, CONFIRM their name: "Got it, ${leadData.appointmentData?.name || 'NAME'}!"
- Then ask for phone: "What's the best number to reach you?"
- Be friendly and natural, not robotic
- If they provide multiple pieces of info (name + phone), acknowledge it and ask for the remaining fields`;
      break;

    case 'ah_appt_phone':
      stateGuidance = `CURRENT STATE: Collecting customer phone number
- We already have name: "${leadData.appointmentData?.name || 'Not set yet'}"
- Ask for phone: "What's the best number to reach you?"
- The system will extract and validate the phone number
- Accept various formats: (902) 555-1234 or 902-555-1234 or 9025551234
- If they provide an invalid format, ask again politely
- Once valid phone is extracted, confirm it: "Got it, 902-555-1234! What's your email?"`;
      break;

    case 'ah_appt_email':
      stateGuidance = `CURRENT STATE: Collecting customer email
- We have: Name: "${leadData.appointmentData?.name || 'Not set'}" | Phone: "${leadData.appointmentData?.phone || 'Not set'}"
- Ask for email: "What's your email address?"
- The system will extract and validate the email
- Once valid, confirm: "Got your email! When works best for an appointment?"
- Then ask for appointment date in next message`;
      break;

    case 'ah_appt_date':
      stateGuidance = `CURRENT STATE: Collecting appointment date
- All contact info collected: ${leadData.appointmentData?.name || 'name?'} | ${leadData.appointmentData?.phone || 'phone?'} | ${leadData.appointmentData?.email || 'email?'}
- Ask about appointment timing: "When would work best for you? (e.g., tomorrow, next Tuesday, March 15)"
- The system will extract dates in various formats
- Accept: "tomorrow", "next Tuesday", "today", "3/15", "March 15", etc.
- Confirm: "Perfect! Tomorrow works. What time would you prefer?"`;
      break;

    case 'ah_appt_time':
      stateGuidance = `CURRENT STATE: Collecting appointment time
- We have date: "${leadData.appointmentData?.date || 'Not set'}"
- Ask for time: "What time works best? (e.g., 2 PM, 3:30 AM, 14:00)"
- The system will extract times in various formats
- Accept: "2 PM", "14:00", "3:30", "morning", etc.
- Confirm: "Perfect! You're all set for ${leadData.appointmentData?.date || 'that date'} at TIME. Someone from Carson Exports will reach out with details. Thanks! 🚗"
- This is the FINAL field - after time, appointment is complete`;
      break;

    case 'ah_confirmation':
      stateGuidance = `CURRENT STATE: Appointment confirmed ✅
- All information collected
- Send final confirmation with all details
- Make it friendly and enthusiastic
- Example: "Thanks, ${leadData.appointmentData?.name || 'Customer'}! Your appointment is confirmed for ${leadData.appointmentData?.date || 'soon'} at ${leadData.appointmentData?.time || 'a great time'}. 🎉 Our team will reach out with more details. See you soon! 🚗"
- Appointment has been submitted to CRM automatically`;
      break;

    default:
      stateGuidance = `Current SMS state: ${smsState}`;
  }

  return `You are an AI assistant for ${settings.dealershipName}, a pre-owned vehicle dealership. You're having an SMS conversation with a customer after-hours.

DEALERSHIP INFO:
- Name: ${settings.dealershipName}
- Hours: ${settings.hours}
- Phone: ${settings.phone}
- Location: ${settings.address}
- Brands: ${settings.brands}

CUSTOMER INFO:
- Name: ${leadData.name || 'Customer'}
- Phone: ${leadData.phone || 'Not yet collected'}
- Interest: ${leadData.vehicleInterest || 'General inquiry'}

SMS CONVERSATION RULES:
- Keep messages SHORT (under 160 characters when possible)
- Use simple language, NO jargon
- Be friendly and helpful
- Ask one question at a time
- Use emojis sparingly (🚗 👍 ✅ are OK)

STATE-AWARE BEHAVIOR:
${stateGuidance}

Remember: You're texting, not emailing. Keep it brief, natural, and friendly.`;
}

/**
 * Get SMS lead by phone number
 */
function getSMSLeadByPhone(phone) {
  return smsLeads.find(lead => lead.phone === phone);
}

/**
 * Update SMS lead state and appointment data
 */
function updateSMSLead(phone, updates) {
  const lead = getSMSLeadByPhone(phone);
  if (lead) {
    Object.assign(lead, updates, { updatedAt: new Date().toISOString() });
  }
  return lead;
}

// ============================================
// FIELD EXTRACTION FUNCTIONS FOR SMS STATE MACHINE
// ============================================

/**
 * Extract name from natural language
 * Examples: "I'm John Smith", "My name's Sarah", "John Smith", "My name is Sarah Johnson"
 */
function extractName(message) {
  const patterns = [
    /(?:my name is|name is|my name's|i'm|i am|call me|this is)\s+([A-Za-z\s]+?)(?:\.|,|$)/i,
    /^([A-Z][a-z]+ [A-Z][a-z]+)(?:\s|$)/,
    /^([A-Z][a-z]+)(?:\s|$)/
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const name = match[1].trim();
      // Filter out common keywords that shouldn't be in names
      if (!['is', 'the', 'and', 'or', 'a', 'an'].includes(name.toLowerCase())) {
        return name;
      }
    }
  }
  return null;
}

/**
 * Extract phone number from natural language
 * Accepts multiple formats: (902) 555-1234, 902-555-1234, 902 555 1234, 9025551234
 */
function extractPhone(message) {
  const phonePattern = /\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/;
  const match = message.match(phonePattern);
  if (match) {
    return `+1${match[1]}${match[2]}${match[3]}`;
  }
  return null;
}

/**
 * Validate phone format
 */
function isValidPhone(phone) {
  return /^\+1\d{10}$/.test(phone);
}

/**
 * Extract email from natural language
 */
function extractEmail(message) {
  const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
  const match = message.match(emailPattern);
  return match ? match[1] : null;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Extract date from natural language
 * Examples: "tomorrow", "next Tuesday", "March 15", "3/15"
 */
function extractDate(message) {
  const datePatterns = [
    /(?:next\s+)?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i,
    /(?:tomorrow|today|tonight)/i,
    /(\d{1,2})\s*\/\s*(\d{1,2})/,
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i
  ];

  for (const pattern of datePatterns) {
    const match = message.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  return null;
}

/**
 * Extract time from natural language
 * Examples: "2 PM", "14:00", "3:30 AM", "1530"
 */
function extractTime(message) {
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?/,
    /(\d{1,2})\s*(am|pm|AM|PM)/
  ];

  for (const pattern of timePatterns) {
    const match = message.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  return null;
}

/**
 * POST /api/chat
 *
 * Request body:
 * {
 *   "messages": [
 *     { "role": "user", "content": "What vehicles do you have?" },
 *     { "role": "assistant", "content": "We have 81+ vehicles..." }
 *   ],
 *   "userMessage": "Tell me about Audis",
 *   "chatState": "inventory_search",
 *   "dealershipSettings": { ... }
 * }
 *
 * Response:
 * {
 *   "response": "AI-generated response text"
 * }
 */
app.post('/api/chat', async (req, res) => {
  try {
    const {
      messages = [],
      userMessage,
      chatState = 'menu',
      dealershipSettings = {}
    } = req.body;

    // Validate input
    if (!userMessage || typeof userMessage !== 'string') {
      return res.status(400).json({
        error: 'Invalid input. Please provide userMessage as a string.'
      });
    }

    // Build conversation history (use last 10 messages for context)
    const recentMessages = messages.slice(-10);
    const conversationMessages = [
      ...recentMessages,
      { role: 'user', content: userMessage }
    ];

    // Generate dynamic system prompt with dealership settings AND current chat state
    const systemPrompt = generateSystemPrompt({
      dealershipName: dealershipSettings.dealershipName,
      phone: dealershipSettings.phone,
      address: dealershipSettings.address,
      hours: dealershipSettings.hours,
      services: dealershipSettings.services,
      brands: dealershipSettings.brands,
      appointmentRules: dealershipSettings.appointmentRules,
      responseTone: dealershipSettings.responseTone,
      faqKnowledge: dealershipSettings.faqKnowledge
    }, chatState, recentMessages);

    // Call OpenAI API
    const response = await axios.post(OPENAI_API_URL, {
      model: 'gpt-4o-mini', // Fast and efficient model
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationMessages
      ],
      temperature: 0.7,
      max_tokens: 500,
      top_p: 0.9
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // Extract AI response
    const aiResponse = response.data.choices[0].message.content;

    // Return response
    res.json({
      response: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('OpenAI API Error:', error.response?.data || error.message);

    // Handle specific error types
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Authentication failed. Check your OpenAI API key.'
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.'
      });
    }

    res.status(500).json({
      error: 'Failed to generate response. Please try again.'
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    twilio: twilioClient ? 'enabled' : 'disabled'
  });
});

/**
 * POST /api/webhook/adf
 * Receives ADF-formatted lead from Make/Zapier email service
 * Initiates SMS conversation with customer
 *
 * Request body: { customer_name, customer_phone, customer_email, vehicle_interest, department }
 * Response: { success: true, leadId, message, customerPhone }
 */
app.post('/api/webhook/adf', async (req, res) => {
  try {
    if (!twilioClient) {
      return res.status(503).json({ error: 'Twilio not configured. SMS features disabled.' });
    }

    const adfParser = require('./adf-parser');

    // Parse incoming ADF data
    const smsLead = adfParser.parseADFPayload(req.body);

    if (!smsLead.phone) {
      return res.status(400).json({ error: 'Invalid phone number in ADF payload' });
    }

    // Store SMS lead
    smsLeads.push(smsLead);

    // Send initial SMS greeting
    try {
      await twilioClient.messages.create({
        body: `Hi ${smsLead.name}! 👋 Thanks for your interest in ${smsLead.vehicleInterest || 'our vehicles'}. What can we help with? 1) Browse vehicles 2) Book appointment 3) Ask a question`,
        from: TWILIO_PHONE_NUMBER,
        to: smsLead.phone
      });
    } catch (twilioError) {
      console.error('Twilio SMS Error:', twilioError.message);
      return res.status(500).json({ error: 'Failed to send SMS: ' + twilioError.message });
    }

    console.log(`✅ SMS conversation initiated with ${smsLead.phone} (${smsLead.name})`);

    res.json({
      success: true,
      leadId: smsLead.id,
      message: 'SMS conversation initiated',
      customerPhone: smsLead.phone
    });

  } catch (error) {
    console.error('ADF Webhook Error:', error);
    res.status(500).json({ error: 'Failed to process ADF lead: ' + error.message });
  }
});

/**
 * POST /api/sms-chat
 * Processes incoming SMS message and generates AI response
 *
 * Request body: { phone, message }
 * Response: { success: true, response, leadState }
 */
app.post('/api/sms-chat', async (req, res) => {
  try {
    if (!twilioClient) {
      return res.status(503).json({ error: 'Twilio not configured' });
    }

    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Missing phone or message' });
    }

    // Find SMS lead by phone
    const smsLead = getSMSLeadByPhone(phone);

    if (!smsLead) {
      return res.status(404).json({ error: 'SMS lead not found for phone: ' + phone });
    }

    // Generate system prompt with SMS context
    const systemPrompt = generateSMSSystemPrompt({}, smsLead.currentState, smsLead);

    // Call OpenAI API for response
    const response = await axios.post(OPENAI_API_URL, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...smsLead.smsHistory,
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 300,
      top_p: 0.9
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiResponse = response.data.choices[0].message.content;

    // Log messages in transcript
    smsLead.smsHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: aiResponse }
    );
    smsLead.updatedAt = new Date().toISOString();

    // ======================
    // STATE TRANSITION LOGIC
    // ======================
    let nextState = smsLead.currentState;
    let extractedData = {};

    switch(smsLead.currentState) {
      case 'ah_menu':
        // User responding to menu - determine intent
        if (message.toLowerCase().includes('1') || message.toLowerCase().includes('vehicle') || message.toLowerCase().includes('browse') || message.toLowerCase().includes('cars')) {
          nextState = 'ah_inventory';
        } else if (message.toLowerCase().includes('2') || message.toLowerCase().includes('appointment') || message.toLowerCase().includes('book') || message.toLowerCase().includes('schedule')) {
          nextState = 'ah_appt_name';
        } else if (message.toLowerCase().includes('3') || message.toLowerCase().includes('question') || message.toLowerCase().includes('info') || message.toLowerCase().includes('tell')) {
          nextState = 'ah_freeform';
        }
        console.log(`📱 SMS menu selection: ${message} → state ${nextState}`);
        break;

      case 'ah_inventory':
        // User browsing - if they say "book" or "appointment", move to booking
        if (message.toLowerCase().includes('book') || message.toLowerCase().includes('appointment') || message.toLowerCase().includes('schedule') || message.toLowerCase().includes('thanks')) {
          nextState = 'ah_appt_name';
          console.log(`📱 SMS moving from inventory to appointment booking`);
        }
        // Otherwise stay in inventory
        break;

      case 'ah_appt_name':
        extractedData.name = extractName(message);
        if (extractedData.name) {
          smsLead.appointmentData.name = extractedData.name;
          nextState = 'ah_appt_phone';
          console.log(`✅ Extracted name: ${extractedData.name}`);
        } else {
          console.log(`⚠️  No name found in: "${message}"`);
        }
        break;

      case 'ah_appt_phone':
        extractedData.phone = extractPhone(message);
        if (extractedData.phone && isValidPhone(extractedData.phone)) {
          smsLead.appointmentData.phone = extractedData.phone;
          nextState = 'ah_appt_email';
          console.log(`✅ Extracted phone: ${extractedData.phone}`);
        } else {
          console.log(`⚠️  Invalid phone format in: "${message}"`);
        }
        break;

      case 'ah_appt_email':
        extractedData.email = extractEmail(message);
        if (extractedData.email && isValidEmail(extractedData.email)) {
          smsLead.appointmentData.email = extractedData.email;
          nextState = 'ah_appt_date';
          console.log(`✅ Extracted email: ${extractedData.email}`);
        } else {
          console.log(`⚠️  Invalid email format in: "${message}"`);
        }
        break;

      case 'ah_appt_date':
        extractedData.date = extractDate(message);
        if (extractedData.date) {
          smsLead.appointmentData.date = extractedData.date;
          nextState = 'ah_appt_time';
          console.log(`✅ Extracted date: ${extractedData.date}`);
        } else {
          console.log(`⚠️  No date found in: "${message}"`);
        }
        break;

      case 'ah_appt_time':
        extractedData.time = extractTime(message);
        if (extractedData.time) {
          smsLead.appointmentData.time = extractedData.time;
          smsLead.status = 'booked';  // Mark as booked immediately
          nextState = 'ah_confirmation';  // Transition directly to confirmation
          console.log(`✅ Extracted time: ${extractedData.time} - Appointment complete for ${smsLead.appointmentData.name}`);
        } else {
          console.log(`⚠️  No time found in: "${message}"`);
        }
        break;
    }

    // Update lead state
    smsLead.currentState = nextState;
    smsLead.updatedAt = new Date().toISOString();

    // ======================
    // APPOINTMENT SUBMISSION LOGIC
    // ======================
    // Submit to webhook when appointment is complete (booked status)
    if (smsLead.status === 'booked' && smsLead.appointmentData.name && smsLead.appointmentData.phone && smsLead.appointmentData.email && smsLead.appointmentData.date && smsLead.appointmentData.time) {

      // Format SMS lead for webhook submission
      const webhookPayload = {
        customer_name: smsLead.appointmentData.name,
        customer_phone: smsLead.appointmentData.phone,
        customer_email: smsLead.appointmentData.email,
        appointment_date: smsLead.appointmentData.date,
        appointment_time: smsLead.appointmentData.time,
        department: smsLead.department,
        vehicle_interest: smsLead.vehicleInterest,
        channel: 'SMS',
        source: smsLead.source,
        sms_lead_id: smsLead.id,
        sms_message_count: smsLead.smsHistory.length,
        created_at: smsLead.createdAt
      };

      // Send to webhook (try environment variable first)
      const webhookUrl = process.env.WEBHOOK_URL || process.env.CRM_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          await axios.post(webhookUrl, webhookPayload);
          console.log(`✅ SMS appointment submitted to webhook for ${smsLead.appointmentData.name}`);
          smsLead.status = 'submitted';
        } catch (webhookError) {
          console.error('Webhook submission error:', webhookError.message);
          console.log(`⚠️  Webhook submission failed. Status remains 'booked'. Will retry if user sends another message.`);
        }
      } else {
        console.warn(`⚠️  WEBHOOK_URL not set in environment variables.`);
        console.log(`   Set WEBHOOK_URL in .env to enable automatic CRM webhook submission`);
        console.log(`   Lead ID: ${smsLead.id} can be manually submitted from admin dashboard`);
      }
    }

    // Send response via Twilio
    try {
      await twilioClient.messages.create({
        body: aiResponse,
        from: TWILIO_PHONE_NUMBER,
        to: phone
      });
    } catch (twilioError) {
      console.error('Twilio SMS send error:', twilioError.message);
    }

    console.log(`📱 SMS response sent to ${phone} (state: ${smsLead.currentState})`);

    res.json({
      success: true,
      response: aiResponse,
      leadState: smsLead.currentState,
      appointmentData: smsLead.appointmentData,
      status: smsLead.status
    });

  } catch (error) {
    console.error('SMS Chat Error:', error);
    res.status(500).json({ error: 'Failed to process SMS message: ' + error.message });
  }
});

/**
 * POST /api/webhook/sms-inbound
 * Receives SMS messages from Twilio webhook
 *
 * Request body: { From, Body, MessageSid, ... }
 * Response: { statusCode, body }
 */
app.post('/api/webhook/sms-inbound', async (req, res) => {
  try {
    const { From, Body } = req.body;

    if (!From || !Body) {
      return res.status(400).json({ error: 'Invalid Twilio webhook payload' });
    }

    console.log(`📨 Inbound SMS from ${From}: ${Body.substring(0, 50)}...`);

    // Process SMS through chat endpoint
    try {
      await axios.post(`http://localhost:${PORT}/api/sms-chat`, {
        phone: From,
        message: Body
      });
    } catch (chatError) {
      console.error('SMS chat processing error:', chatError.message);
    }

    // Return 200 OK to Twilio immediately
    res.json({ statusCode: 200, body: 'Message processed' });

  } catch (error) {
    console.error('SMS Inbound Webhook Error:', error);
    res.json({ statusCode: 200, body: 'Error logged' }); // Still return 200 to Twilio
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚗 Carson Exports AI Backend running on http://localhost:${PORT}`);
  console.log(`📝 Chat endpoint: POST http://localhost:${PORT}/api/chat`);
  console.log(`✅ Health check: GET http://localhost:${PORT}/api/health`);
});
