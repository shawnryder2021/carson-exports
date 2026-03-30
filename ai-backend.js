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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Validation
if (!OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY not found in environment variables');
  console.error('Please create a .env file with: OPENAI_API_KEY=your_key_here');
  process.exit(1);
}

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
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚗 Carson Exports AI Backend running on http://localhost:${PORT}`);
  console.log(`📝 Chat endpoint: POST http://localhost:${PORT}/api/chat`);
  console.log(`✅ Health check: GET http://localhost:${PORT}/api/health`);
});
