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
const localtunnel = require('localtunnel');

const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Google Sheets inventory source
const SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1gNiaM_TTswU8WmuP7O3Vdu_qj2ow1ZaUpHXulP1YUoI/export?format=csv';
const INVENTORY_REFRESH_MS = 4 * 60 * 60 * 1000; // 4 hours

// Admin settings — synced from frontend admin panel via /api/admin-settings
let backendAdminSettings = {
  dealershipName: 'Carson Exports',
  phone: '1-833-706-3093',
  address: '550 Windmill Road, Dartmouth, NS, B3B 1B3',
  hours: 'Monday–Saturday, 9:00 AM – 8:00 PM (Closed Sundays)',
  services: 'Sales, Service, Financing, Trade-ins',
  brands: 'Toyota, Honda, Nissan, Hyundai, Ford, Volkswagen, Audi, BMW, and more',
  appointmentRules: 'Appointments available Mon-Sat. Service appointments in 30-min slots from 8AM-5PM. Sales appointments from 9AM-7PM. No Sunday appointments.',
  responseTone: 'friendly',
  faqKnowledge: ''
};

/**
 * Simple RFC 4180 CSV line parser that handles quoted fields with commas
 */
function parseCSVLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * Map a Google Sheets row (as object) to a vehicle object
 */
function mapSheetRowToVehicle(row) {
  const price = parseFloat((row.Price || '0').replace(/[^0-9.]/g, '')) || 0;
  const mileage = parseInt(row['mileage.value'] || '0') || 0;
  const year = parseInt(row.year) || 0;
  const make = (row.make || '').trim();
  const fullModel = (row.model || '').trim();
  // model column is "Honda Civic" — strip make prefix to get just "Civic"
  const modelName = fullModel.startsWith(make + ' ') ? fullModel.slice(make.length + 1) : fullModel;
  // trim is whatever follows "YEAR MAKE MODELNAME" in the title
  const title = (row.title || '').trim();
  const titlePrefix = `${year} ${make} ${modelName}`.trim();
  const trim = title.startsWith(titlePrefix) ? title.slice(titlePrefix.length).trim() : '';

  return {
    id: row.vehicle_id || '',
    year,
    make,
    model: modelName,
    trim,
    price,
    mileage,
    color: '',
    features: [],
    url: (row.Link || '').trim(),
    bodyStyle: (row.body_style || '').trim(),
    description: (row.Description || row.title || '').trim()
  };
}

/**
 * Fetch inventory from Google Sheets CSV export and update in-memory array
 */
async function fetchInventoryFromSheets() {
  try {
    console.log('📊 Fetching inventory from Google Sheets...');
    const response = await axios.get(SHEETS_CSV_URL, { responseType: 'text', timeout: 15000 });
    const lines = response.data.split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('No data rows in sheet');

    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const vehicles = lines.slice(1)
      .map(line => {
        const values = parseCSVLine(line);
        const row = {};
        headers.forEach((h, i) => { row[h] = (values[i] || '').trim(); });
        return row;
      })
      .filter(row => row.Link && row.Link.trim() && row.year && row.make) // only valid rows
      .map(mapSheetRowToVehicle)
      .filter(v => v.url && v.price > 0);

    inventory = vehicles;
    console.log(`✅ Inventory synced: ${inventory.length} vehicles from Google Sheets`);
    return inventory;
  } catch (err) {
    console.warn('⚠️  Google Sheets fetch failed:', err.message);
    // Fall back to local inventory.json
    try {
      inventory = JSON.parse(fs.readFileSync(path.join(__dirname, 'inventory.json'), 'utf8'));
      console.log(`📦 Loaded ${inventory.length} vehicles from inventory.json (fallback)`);
    } catch (localErr) {
      console.warn('⚠️  Could not load inventory.json either:', localErr.message);
    }
    return inventory;
  }
}

// Load inventory data (try Sheets first, fallback to JSON)
let inventory = [];
// Will be populated async after server starts — see bottom of file

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Twilio sends form-encoded webhooks

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

// Tunnel management
let activeTunnel = null;
let originalTwilioWebhookUrl = null; // Stored so we can restore it when tunnel stops
let twilioPhoneSid = null; // Twilio phone number resource SID

// Link tracking store: { trackingId: { url, leadPhone, label, createdAt, clicks } }
let trackingLinks = {};

/**
 * Create a tracking link for a destination URL, tied to a specific lead
 * @param {string} url - Destination URL
 * @param {string} leadPhone - Lead's phone number (E.164)
 * @param {string} label - Human-readable description (e.g. "2019 Honda CR-V")
 * @returns {string} - Short tracking ID
 */
function createTrackingLink(url, leadPhone, label) {
  const id = Math.random().toString(36).substr(2, 9);
  trackingLinks[id] = { url, leadPhone, label, createdAt: new Date().toISOString(), clicks: 0 };
  return id;
}

/**
 * Derive a human-readable label from a URL
 * e.g. "https://carsonexports.com/inventory/2019-honda-crv" → "2019 Honda CRV listing"
 */
function labelFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const slug = path.split('/').filter(Boolean).pop() || '';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || url;
  } catch {
    return url;
  }
}

/**
 * Wrap any URLs inside a text string with tracking redirect links
 * Only works when activeTunnel is running (otherwise URLs pass through unchanged)
 * @param {string} text - The message text (may contain URLs)
 * @param {string} leadPhone - Lead phone for attribution
 * @returns {string} - Text with URLs replaced by tracking links
 */
function wrapUrlsWithTracking(text, leadPhone) {
  if (!activeTunnel || !text) return text;
  const urlRegex = /https?:\/\/[^\s<>"]+[^\s<>",.:;?!)'"\]]/g;
  return text.replace(urlRegex, (url) => {
    const label = labelFromUrl(url);
    const id = createTrackingLink(url, leadPhone, label);
    return `${activeTunnel.url}/t/${id}`;
  });
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
 * Generate system prompt for SMS conversations.
 * Uses backendAdminSettings (synced from frontend admin panel) so SMS follows
 * the same rules as the web chat — same FAQ, tone, services, appointment rules.
 * @param {string} smsState - Current SMS state (ah_menu, ah_inventory, ah_appt_*, etc.)
 * @param {Object} leadData - SMS lead data for context
 * @param {string} currentMessage - The current user message (for inventory search)
 * @returns {string} - SMS-optimized system prompt
 */
function generateSMSSystemPrompt(smsState = 'ah_menu', leadData = {}, currentMessage = '') {
  // Use admin settings stored server-side (same as web chat)
  const settings = {
    dealershipName: backendAdminSettings.dealershipName || 'Carson Exports',
    phone: backendAdminSettings.phone || '1-833-706-3093',
    address: backendAdminSettings.address || '550 Windmill Road, Dartmouth, NS, B3B 1B3',
    hours: backendAdminSettings.hours || 'Monday–Saturday, 9:00 AM – 8:00 PM (Closed Sundays)',
    services: backendAdminSettings.services || 'Sales, Service, Financing, Trade-ins',
    brands: backendAdminSettings.brands || 'Toyota, Honda, Nissan, Hyundai, Ford, and more',
    appointmentRules: backendAdminSettings.appointmentRules || 'Appointments available Mon-Sat',
    responseTone: backendAdminSettings.responseTone || 'friendly',
    faqKnowledge: backendAdminSettings.faqKnowledge || ''
  };

  // Same tone logic as web chat
  let toneInstruction = 'Use a friendly, professional tone that feels natural and approachable.';
  if (settings.responseTone === 'formal') toneInstruction = 'Maintain a formal, professional tone at all times.';
  else if (settings.responseTone === 'casual') toneInstruction = 'Use a casual, conversational, friendly tone. Be relaxed and personable.';

  let stateGuidance = '';

  switch(smsState) {
    case 'ah_menu': {
      // If we know what they're interested in, find a quick match to tease
      let vehicleTease = '';
      if (leadData.vehicleInterest) {
        const quickMatch = searchInventory(leadData.vehicleInterest, 1);
        if (quickMatch.length > 0) {
          const v = quickMatch[0];
          vehicleTease = `\n\nWe have a matching vehicle you can mention: ${v.year} ${v.make} ${v.model} ${v.trim} at $${v.price.toLocaleString()} — link: ${v.url}\nFeel free to include this link in the greeting to spark interest.`;
        }
      }
      stateGuidance = `CURRENT STATE: Initial SMS greeting (after-hours)
- Customer just received initial SMS about "${leadData.vehicleInterest || 'vehicles'}"
- If we have a matching vehicle, include its link to drive engagement
- Offer 2-3 clear menu options
- Use emojis to make it friendly${vehicleTease}`;
      break;
    }

    case 'ah_inventory': {
      // Use current message as primary search (it's not in history yet at prompt-generation time)
      // Fall back to last history message, then vehicle interest
      const userMsgs = (leadData.smsHistory || []).filter(m => m.role === 'user');
      const lastHistoryMsg = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : '';
      const searchTerms = (currentMessage.length > 2 ? currentMessage : lastHistoryMsg) || leadData.vehicleInterest || '';
      const matches = searchInventory(searchTerms, 3);
      const inventoryBlock = matches.length > 0
        ? 'MATCHING VEHICLES IN STOCK:\n' + matches.map(formatVehicleForPrompt).join('\n\n')
        : 'No exact matches found — ask the customer for more details about what they want.';

      stateGuidance = `CURRENT STATE: Customer browsing vehicles via SMS

${inventoryBlock}

MANDATORY RULES (MUST follow):
1. You MUST list 1-3 vehicles from MATCHING VEHICLES above in EVERY response — never ask "would you like to see options?" without showing them
2. For EACH vehicle, you MUST include its Link URL on its own line — this is CRITICAL for tracking
3. Format EXACTLY like this for each vehicle:
   🚗 YEAR MAKE MODEL TRIM — $PRICE, MILEAGEk km
   LINK_URL
4. After listing vehicles, ask ONE question: "Want to book a test drive?" or "Which one catches your eye?"
5. NEVER say "would you like to see options" or "do you want to see" — just SHOW them immediately
6. If the vehicles above don't match what the customer asked for, still show the closest matches and explain why

Example response:
"Here is what we have got!
2021 Honda CR-V EX-L AWD — $32,900, 58k km, leather & sunroof!
https://carsonexports.com/inventory/2021-honda-crv-exl
2020 Honda CR-V Sport AWD — $28,500, 74k km, remote start!
https://carsonexports.com/inventory/2020-honda-crv-sport
Want to book a test drive for either one?`;
      break;
    }

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

    case 'ah_freeform': {
      const freeformMatches = searchInventory(currentMessage || leadData.vehicleInterest || '', 2);
      const freeformInventory = freeformMatches.length > 0
        ? '\n\nRELEVANT VEHICLES IN STOCK:\n' + freeformMatches.map(formatVehicleForPrompt).join('\n\n')
        : '';

      stateGuidance = `CURRENT STATE: Answering customer questions
- Answer their question helpfully and concisely
- If the question relates to a vehicle, include a relevant inventory link from below
- Always offer to help with browsing vehicles or booking an appointment
- If they mention wanting to see a vehicle, transition to appointment booking${freeformInventory}`;
      break;
    }

    default:
      stateGuidance = `Current SMS state: ${smsState}`;
  }

  // Build FAQ knowledge block (same as web chat)
  const faqBlock = settings.faqKnowledge
    ? `\nFAQ KNOWLEDGE BASE:\n${settings.faqKnowledge}\n`
    : '';

  return `You are an AI assistant for ${settings.dealershipName}, a pre-owned and exotic vehicle dealership. You're having an SMS text conversation with a customer.

DEALERSHIP INFORMATION:
- Name: ${settings.dealershipName}
- Hours: ${settings.hours}
- Phone: ${settings.phone}
- Location: ${settings.address}
- Services: ${settings.services}
- Brands carried: ${settings.brands}
- Appointment policy: ${settings.appointmentRules}
${faqBlock}
CUSTOMER INFO:
- Name: ${leadData.name || 'Customer'}
- Inquiry interest: ${leadData.vehicleInterest || 'General inquiry'}

YOUR CORE RESPONSIBILITIES (same as web chat):
1. Help customers find vehicles matching their needs
2. Answer questions about dealership info, hours, location, financing, trade-ins accurately
3. Guide customers toward test drive or service appointments
4. Collect appointment information naturally through conversation
5. Be knowledgeable and helpful about all dealership services

TONE: ${toneInstruction}

CRITICAL SMS RULES (text message format):
- Keep each message SHORT — 2-4 sentences max, under 300 characters when possible
- Ask only ONE question at a time — never pile on multiple asks
- Use simple direct language, no jargon
- Use emojis sparingly (🚗 ✅ 👍 are fine, don't overdo it)
- This is a text conversation, not an email — be brief and direct
- When sharing vehicles, list them clearly with price and the link on its own line
- NEVER say "Would you like to see options?" — just show them immediately

STATE-AWARE BEHAVIOR:
${stateGuidance}

Remember: Same knowledge as the web chat, just delivered concisely via text message.`;
}

/**
 * Search inventory by keywords — fuzzy match against make, model, trim, color, features
 * Returns top matches sorted by relevance
 * @param {string} query - Search terms (e.g. "honda crv", "suv under 30k", "red")
 * @param {number} limit - Max results to return
 * @returns {Array} - Matching vehicles
 */
function searchInventory(query, limit = 4) {
  if (!inventory.length || !query) return inventory.slice(0, limit);

  const stopWords = new Set(['the','is','at','in','on','to','for','of','and','or','do','you','have','any','what','how','can','with','this','that','are','was','be','an','it','we','my','me','your','about','would','like','want','some','get','got','see','show','tell','anything','something','does','did']);
  const terms = query.toLowerCase().replace(/[?!.,;:'"]/g, '').split(/[\s,]+/).filter(t => t.length > 1 && !stopWords.has(t));

  // Score each vehicle
  const scored = inventory.map(v => {
    const haystack = [
      v.make, v.model, v.trim, v.color, v.bodyStyle, String(v.year), String(v.price),
      ...(v.features || [])
    ].join(' ').toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (v.make.toLowerCase().includes(term)) score += 10;      // Strong make match
      if (v.model.toLowerCase().includes(term)) score += 10;     // Strong model match
      if (haystack.includes(term)) score += 3;                    // General match
      // Price-based matching
      if (term.match(/^\d+k?$/) || term === 'under' || term === 'budget') {
        const num = parseInt(term.replace('k', '000'));
        if (num > 1000 && v.price <= num * 1.15) score += 5;     // Within budget
      }
    }
    return { vehicle: v, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.vehicle);
}

/**
 * Format a vehicle for inclusion in an SMS system prompt
 * Works with both inventory.json format (has color/features) and Sheets format (has bodyStyle/description)
 */
function formatVehicleForPrompt(v) {
  const name = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
  const km = v.mileage ? `${Math.round(v.mileage / 1000)}k km` : '';
  const details = [v.color, km].filter(Boolean).join(', ');
  const featureStr = v.features && v.features.length > 0
    ? `\n  Features: ${v.features.slice(0, 3).join(', ')}`
    : v.bodyStyle ? `\n  Type: ${v.bodyStyle}` : '';
  return `• ${name} — $${v.price.toLocaleString()}${details ? ', ' + details : ''}${featureStr}\n  Link: ${v.url}`;
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
    twilio: twilioClient ? 'enabled' : 'disabled',
    inventory: inventory.length
  });
});

/**
 * GET /api/admin-settings
 * Returns current backend admin settings (used by SMS system)
 */
app.get('/api/admin-settings', (req, res) => {
  res.json(backendAdminSettings);
});

/**
 * POST /api/admin-settings
 * Stores admin settings from the frontend so SMS chat uses the same rules as web chat.
 * Called automatically when admin saves settings in the dashboard.
 */
app.post('/api/admin-settings', (req, res) => {
  const allowed = ['dealershipName', 'phone', 'address', 'hours', 'services', 'brands', 'appointmentRules', 'responseTone', 'faqKnowledge'];
  allowed.forEach(key => {
    if (req.body[key] !== undefined) backendAdminSettings[key] = req.body[key];
  });
  console.log('⚙️  Admin settings updated:', Object.keys(req.body).filter(k => allowed.includes(k)).join(', '));
  res.json({ success: true, settings: backendAdminSettings });
});

/**
 * POST /api/sync-inventory
 * Manually trigger a sync from Google Sheets.
 * Also called automatically every 4 hours.
 */
app.post('/api/sync-inventory', async (req, res) => {
  const vehicles = await fetchInventoryFromSheets();
  res.json({ success: true, count: vehicles.length, message: `Synced ${vehicles.length} vehicles from Google Sheets` });
});

/**
 * Serve static files (index.html)
 */
app.use(express.static(__dirname));

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

    // Check if a lead already exists for this phone (prevent duplicate SMS)
    const existingLead = getSMSLeadByPhone(smsLead.phone);
    if (existingLead) {
      console.log(`⚠️  Lead already exists for ${smsLead.phone} — skipping duplicate SMS`);
      return res.json({
        success: true,
        leadId: existingLead.id,
        message: 'Existing SMS lead found (no duplicate SMS sent)',
        customerPhone: existingLead.phone,
        existing: true
      });
    }

    // Store SMS lead
    smsLeads.push(smsLead);

    // Send initial SMS greeting — include a vehicle link if we have a match
    try {
      let greetingBody = `Hi ${smsLead.name}! 👋 Thanks for your interest in ${smsLead.vehicleInterest || 'our vehicles'} at Carson Exports.`;

      // Find a matching vehicle to include in the greeting
      if (smsLead.vehicleInterest) {
        const greetingMatch = searchInventory(smsLead.vehicleInterest, 1);
        if (greetingMatch.length > 0) {
          const v = greetingMatch[0];
          const vehicleLink = wrapUrlsWithTracking(v.url, smsLead.phone);
          greetingBody += `\n\n🚗 Check out our ${v.year} ${v.make} ${v.model} ${v.trim} — $${v.price.toLocaleString()}:\n${vehicleLink}`;
        }
      }

      greetingBody += `\n\nWhat can we help with?\n1️⃣ Browse vehicles\n2️⃣ Book appointment\n3️⃣ Ask a question`;

      await twilioClient.messages.create({
        body: greetingBody,
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

    // ======================
    // STATE TRANSITION LOGIC (RUN FIRST)
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

    // Update lead state BEFORE generating prompt
    smsLead.currentState = nextState;
    smsLead.updatedAt = new Date().toISOString();

    // ======================
    // GENERATE SYSTEM PROMPT (NOW WITH NEW STATE)
    // ======================
    const systemPrompt = generateSMSSystemPrompt(nextState, smsLead, message);

    // ======================
    // CALL OPENAI API
    // ======================
    const response = await axios.post(OPENAI_API_URL, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...smsLead.smsHistory,
        { role: 'user', content: message }
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

    const aiResponseRaw = response.data.choices[0].message.content;

    // Wrap any URLs in tracking links so we can see what the lead clicks
    const aiResponse = wrapUrlsWithTracking(aiResponseRaw, phone);

    // Log messages in transcript (store the version with tracking links so admin sees same thing)
    smsLead.smsHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: aiResponse }
    );
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
 * Receives inbound SMS from Twilio webhook.
 * Twilio sends form-encoded data: From, Body, MessageSid, etc.
 * Must return valid TwiML (empty <Response/> since we send replies via API).
 */
app.post('/api/webhook/sms-inbound', async (req, res) => {
  try {
    const From = req.body.From;
    const Body = req.body.Body;

    console.log(`📨 INBOUND SMS received — From: ${From}, Body: "${(Body || '').substring(0, 80)}"`);
    console.log(`📨 Full req.body keys: ${Object.keys(req.body).join(', ')}`);

    if (!From || !Body) {
      console.warn('⚠️  Missing From or Body in Twilio webhook payload');
      res.set('Content-Type', 'text/xml');
      return res.send('<Response></Response>');
    }

    // Process through the SMS chat engine (AI + state machine + sends reply via Twilio API)
    try {
      const chatResult = await axios.post(`http://localhost:${PORT}/api/sms-chat`, {
        phone: From,
        message: Body
      });
      console.log(`✅ Inbound SMS processed — AI replied (state: ${chatResult.data.leadState})`);
    } catch (chatError) {
      console.error('❌ SMS chat processing error:', chatError.response?.data || chatError.message);
    }

    // Return empty TwiML — we already sent the reply via Twilio Messages API in /api/sms-chat
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');

  } catch (error) {
    console.error('SMS Inbound Webhook Error:', error);
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  }
});

/**
 * GET /api/sms-lead-status/:phone
 * Get current status of SMS lead conversation
 * Used for real-time polling in admin dashboard
 *
 * Response: { success: true, lead: { phone, name, currentState, status, smsHistory, appointmentData } }
 */
app.get('/api/sms-lead-status/:phone', (req, res) => {
  try {
    const phone = req.params.phone.startsWith('+') ? req.params.phone : '+1' + req.params.phone.replace(/\D/g, '');
    const smsLead = getSMSLeadByPhone(phone);

    if (!smsLead) {
      return res.json({ success: false, error: 'SMS lead not found' });
    }

    res.json({
      success: true,
      lead: {
        id: smsLead.id,
        phone: smsLead.phone,
        name: smsLead.name,
        currentState: smsLead.currentState,
        status: smsLead.status,
        smsHistory: smsLead.smsHistory,
        appointmentData: smsLead.appointmentData,
        clickHistory: smsLead.clickHistory || [],
        interestScore: smsLead.interestScore || 0,
        vehicleInterest: smsLead.vehicleInterest,
        createdAt: smsLead.createdAt,
        updatedAt: smsLead.updatedAt
      }
    });
  } catch (error) {
    console.error('SMS Lead Status Error:', error);
    res.status(500).json({ error: 'Failed to get SMS lead status' });
  }
});

/**
 * GET /t/:trackingId
 * Link tracking redirect — logs click against the lead and redirects to destination URL
 * This URL is what gets sent in SMS messages when tunnel is active
 */
app.get('/t/:id', (req, res) => {
  const link = trackingLinks[req.params.id];

  if (!link) {
    // Unknown tracking ID — redirect to homepage
    return res.redirect('https://carsonexports.com');
  }

  link.clicks++;

  // Find lead and record click event
  const lead = getSMSLeadByPhone(link.leadPhone);
  if (lead) {
    lead.clickHistory = lead.clickHistory || [];
    lead.clickHistory.push({
      url: link.url,
      label: link.label,
      trackingId: req.params.id,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || '',
      referrer: req.headers['referer'] || ''
    });
    lead.interestScore = (lead.interestScore || 0) + 1;
    lead.updatedAt = new Date().toISOString();
    console.log(`🖱️  Click tracked: "${link.label}" by ${link.leadPhone} (total score: ${lead.interestScore})`);
  }

  res.redirect(link.url);
});

/**
 * Helper: Look up Twilio phone number SID and save current webhook URL
 */
async function getTwilioPhoneInfo() {
  if (!twilioClient) return null;
  try {
    const numbers = await twilioClient.incomingPhoneNumbers.list({ phoneNumber: TWILIO_PHONE_NUMBER });
    if (numbers.length > 0) {
      twilioPhoneSid = numbers[0].sid;
      originalTwilioWebhookUrl = numbers[0].smsUrl || '';
      console.log(`📞 Twilio phone SID: ${twilioPhoneSid}`);
      console.log(`📞 Current webhook: ${originalTwilioWebhookUrl || '(none)'}`);
      return numbers[0];
    }
  } catch (err) {
    console.error('Twilio phone lookup error:', err.message);
  }
  return null;
}

/**
 * Helper: Update Twilio SMS webhook URL
 */
async function setTwilioWebhook(url) {
  if (!twilioClient || !twilioPhoneSid) return false;
  try {
    await twilioClient.incomingPhoneNumbers(twilioPhoneSid).update({
      smsUrl: url,
      smsMethod: 'POST'
    });
    console.log(`✅ Twilio webhook updated to: ${url}`);
    return true;
  } catch (err) {
    console.error('Twilio webhook update error:', err.message);
    return false;
  }
}

/**
 * POST /api/start-tunnel
 * Start a localtunnel and automatically configure Twilio to send inbound SMS here.
 * Saves the original Twilio webhook URL so it can be restored when tunnel stops.
 * Response: { success, url, webhookUrl, twilioConfigured }
 */
app.post('/api/start-tunnel', async (req, res) => {
  try {
    // Return existing tunnel if already running
    if (activeTunnel) {
      const webhookUrl = `${activeTunnel.url}/api/webhook/sms-inbound`;
      return res.json({ success: true, url: activeTunnel.url, webhookUrl, existing: true, twilioConfigured: true });
    }

    console.log('🌐 Starting localtunnel...');
    const tunnel = await localtunnel({ port: PORT });
    activeTunnel = tunnel;

    tunnel.on('close', () => {
      console.log('🌐 Tunnel closed');
      activeTunnel = null;
    });

    tunnel.on('error', (err) => {
      console.error('🌐 Tunnel error:', err.message);
      activeTunnel = null;
    });

    const webhookUrl = `${tunnel.url}/api/webhook/sms-inbound`;
    console.log(`🌐 Tunnel started: ${tunnel.url}`);

    // Auto-configure Twilio to point at this tunnel
    let twilioConfigured = false;
    await getTwilioPhoneInfo();
    if (twilioPhoneSid) {
      twilioConfigured = await setTwilioWebhook(webhookUrl);
    }

    res.json({ success: true, url: tunnel.url, webhookUrl, twilioConfigured });

  } catch (err) {
    console.error('Tunnel start error:', err);
    res.status(500).json({ error: 'Failed to start tunnel: ' + err.message });
  }
});

/**
 * POST /api/stop-tunnel
 * Stop the active localtunnel and restore the original Twilio webhook URL
 */
app.post('/api/stop-tunnel', async (req, res) => {
  try {
    // Restore original Twilio webhook
    if (originalTwilioWebhookUrl && twilioPhoneSid) {
      await setTwilioWebhook(originalTwilioWebhookUrl);
      console.log(`📞 Twilio webhook restored to: ${originalTwilioWebhookUrl}`);
    }

    if (activeTunnel) {
      activeTunnel.close();
      activeTunnel = null;
      console.log('🌐 Tunnel stopped');
    }

    res.json({ success: true, message: 'Tunnel stopped, Twilio webhook restored' });
  } catch (err) {
    console.error('Stop tunnel error:', err.message);
    res.json({ success: true, message: 'Tunnel stopped (webhook restore may have failed)' });
  }
});

/**
 * GET /api/tunnel-status
 * Check if a tunnel is active and get its URL
 */
app.get('/api/tunnel-status', (req, res) => {
  if (activeTunnel) {
    res.json({ active: true, url: activeTunnel.url, webhookUrl: `${activeTunnel.url}/api/webhook/sms-inbound` });
  } else {
    res.json({ active: false, url: null, webhookUrl: null });
  }
});

/**
 * DELETE /api/sms-lead/:phone
 * Reset (delete) an SMS lead by phone number — used to clear test leads
 */
app.delete('/api/sms-lead/:phone', (req, res) => {
  const phone = req.params.phone.startsWith('+') ? req.params.phone : '+1' + req.params.phone.replace(/\D/g, '');
  const beforeCount = smsLeads.length;
  smsLeads = smsLeads.filter(lead => lead.phone !== phone);
  const removed = beforeCount - smsLeads.length;
  console.log(`🗑️  Removed ${removed} SMS lead(s) for ${phone}`);
  res.json({ success: true, removed, message: removed > 0 ? `Cleared lead for ${phone}` : 'No lead found for that phone' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚗 Carson Exports AI Backend running on http://localhost:${PORT}`);
  console.log(`📝 Chat endpoint: POST http://localhost:${PORT}/api/chat`);
  console.log(`✅ Health check: GET http://localhost:${PORT}/api/health`);

  // Fetch live inventory from Google Sheets on startup
  await fetchInventoryFromSheets();

  // Schedule periodic refresh every 4 hours
  setInterval(fetchInventoryFromSheets, INVENTORY_REFRESH_MS);
  console.log(`🔄 Inventory auto-refresh scheduled every ${INVENTORY_REFRESH_MS / 3600000}h`);
});
