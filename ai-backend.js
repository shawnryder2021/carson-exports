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
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const path = require('path');
const fs = require('fs');

// ─── Supabase Client ────────────────────────────────────────────────────────
const getValidSupabaseKey = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (serviceKey && !serviceKey.includes('your_') && !serviceKey.includes('placeholder') && serviceKey.startsWith('ey')) {
    return { key: serviceKey, type: 'Service Role' };
  }

  if (anonKey && !anonKey.includes('your_') && !anonKey.includes('placeholder') && anonKey.startsWith('ey')) {
    return { key: anonKey, type: 'Anon' };
  }

  return null;
};

const keyConfig = getValidSupabaseKey();
const supabase = (process.env.SUPABASE_URL && keyConfig)
  ? createClient(process.env.SUPABASE_URL, keyConfig.key)
  : null;

if (supabase) {
  console.log(`✅ Supabase connected (${keyConfig.type} Key) — leads and settings will be persisted to database`);
} else {
  console.warn('⚠️  Supabase not configured. Data will be in-memory only (lost on restart).');
  console.warn('   Set SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in .env to enable persistence.');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Google Sheets inventory source
const SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1gNiaM_TTswU8WmuP7O3Vdu_qj2ow1ZaUpHXulP1YUoI/export?format=csv';
const INVENTORY_REFRESH_MS = 4 * 60 * 60 * 1000; // 4 hours

// Admin settings — in-memory cache, persisted to Supabase ce_settings table
let backendAdminSettings = {
  dealerName:       'Carson Exports',
  dealershipName:   'Carson Exports',   // alias used throughout prompts
  phone:            '1-833-706-3093',
  address:          '550 Windmill Road, Dartmouth, NS, B3B 1B3',
  hours:            'Monday–Saturday, 9:00 AM – 8:00 PM (Closed Sundays)',
  afterHoursTime:   '20:00',
  services:         'Sales, Service, Financing, Trade-ins',
  brands:           'Toyota, Honda, Nissan, Hyundai, Ford, Volkswagen, Audi, BMW, and more',
  appointmentRules: 'Appointments available Mon-Sat. Service appointments in 30-min slots from 8AM-5PM. Sales appointments from 9AM-7PM. No Sunday appointments.',
  responseTone:     'friendly',
  faqKnowledge:     '',
  crmEmail:         'carsonexportsleads@gmail.com',
  webhookUrl:       'https://crm.carsonexports.com/api/webhook/leads',
  primaryColor:     '#1e6fff',
  tradeInUrl:       'https://www.carsonexports.com/en/form/exchange-evaluation-new/4',
  quickReplies:     'Book a Service Appointment\nAsk About a Vehicle\nSpeak With Sales\nCheck Inventory\nGet Trade-In Value',
  postReplies:      'Book a Service Appointment\nAsk About a Vehicle\nCheck Inventory\nGet Trade-In Value',
  proactiveEnabled: false,
  proactiveDelay:   15,
  proactiveMessage: ''
};

/**
 * Load settings from Supabase into backendAdminSettings cache
 */
async function loadSettingsFromDB() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('ce_settings').select('key, value');
    if (error) throw error;
    data.forEach(({ key, value }) => {
      backendAdminSettings[key] = value;
      if (key === 'dealerName') backendAdminSettings.dealershipName = value; // keep alias in sync
    });
    console.log(`⚙️  Settings loaded from Supabase (${data.length} keys)`);
  } catch (err) {
    console.warn('⚠️  Could not load settings from Supabase:', err.message);
  }
}

/**
 * Persist a settings key-value pair to Supabase
 */
async function saveSettingToDB(key, value) {
  if (!supabase) return;
  try {
    await supabase.from('ce_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  } catch (err) {
    console.warn(`⚠️  Could not save setting [${key}] to Supabase:`, err.message);
  }
}

/**
 * Persist an entire settings object to Supabase
 */
async function saveAllSettingsToDB(settings) {
  if (!supabase) return;
  const rows = Object.entries(settings).map(([key, value]) => ({
    key,
    value: String(value),
    updated_at: new Date().toISOString()
  }));
  try {
    await supabase.from('ce_settings').upsert(rows, { onConflict: 'key' });
  } catch (err) {
    console.warn('⚠️  Could not save settings to Supabase:', err.message);
  }
}

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
  // Image URL — Google Sheets column is literally named "image[0].url"
  const image = (row['image[0].url'] || '').trim();

  let bodyStyle = (row.body_style || '').trim();

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
    image,
    url: (row.Link || '').trim(),
    bodyStyle,
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
    // Classify body styles for any vehicles missing them (runs in background)
    classifyVehicleBodyStyles();
    return inventory;
  } catch (err) {
    console.warn('⚠️  Google Sheets fetch failed:', err.message);
    // Fall back to local inventory.json
    try {
      inventory = JSON.parse(fs.readFileSync(path.join(__dirname, 'inventory.json'), 'utf8'));
      console.log(`📦 Loaded ${inventory.length} vehicles from inventory.json (fallback)`);
      classifyVehicleBodyStyles();
    } catch (localErr) {
      console.warn('⚠️  Could not load inventory.json either:', localErr.message);
    }
    return inventory;
  }
}

/**
 * Use OpenAI to classify body styles for vehicles that are missing them.
 * Processes in batches of 30 to avoid token limits.
 */
async function classifyVehicleBodyStyles() {
  const unclassified = inventory.filter(v => !v.bodyStyle);
  if (unclassified.length === 0) {
    console.log('✅ All vehicles already have body styles');
    return;
  }

  // Wait for OPENAI_API_KEY to be available (it's defined later in the file)
  await new Promise(r => setTimeout(r, 2000));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  No OpenAI API key — skipping body style classification');
    return;
  }

  console.log(`🔍 Classifying body styles for ${unclassified.length} vehicles via OpenAI...`);

  // Process in batches of 30
  const BATCH_SIZE = 30;
  let classified = 0;

  const validStyles = new Set(['SUV','Sedan','Truck','Van','Coupe','Hatchback','Wagon','Convertible']);

  for (let i = 0; i < unclassified.length; i += BATCH_SIZE) {
    const batch = unclassified.slice(i, i + BATCH_SIZE);
    const vehicleList = batch.map((v, j) => `${j + 1}. ${v.year} ${v.make} ${v.model}`).join('\n');

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-5.4-nano',
        messages: [
          {
            role: 'system',
            content: `You are an automotive expert. Classify each vehicle into its correct body style. Reply ONLY with a JSON array of exactly ${batch.length} strings.

Valid categories:
- "SUV" = SUVs and crossovers (RAV4, CR-V, Tucson, Tiguan, Kicks, Qashqai, RVR, Q3, X5, etc.)
- "Sedan" = 4-door sedans (Civic, Corolla, Camry, Accord, Altima, Elantra, Forte, Jetta, etc.)
- "Truck" = pickup trucks ONLY (F-150, Silverado, RAM, Tacoma, Ranger, etc.)
- "Coupe" = 2-door sports cars (Mustang, Camaro, 370Z, BRZ, Ferrari, Lamborghini, Porsche 911, etc.)
- "Hatchback" = compact hatchbacks (Golf, Mazda3 Sport, Fit, Yaris, etc.)
- "Wagon" = station wagons (Outback wagon, V60, Allroad, etc.)
- "Van" = minivans and cargo vans (Sienna, Odyssey, Pacifica, Transit, etc.)
- "Convertible" = convertible/roadster (Miata, Boxster, Mustang Convertible, etc.)

IMPORTANT: Sports cars, exotics, and muscle cars are "Coupe" NOT "Truck". Pickup trucks have a cargo bed.`
          },
          {
            role: 'user',
            content: vehicleList
          }
        ],
        temperature: 0,
        max_completion_tokens: 800
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const content = response.data.choices[0].message.content.trim();
      const classifications = JSON.parse(content.replace(/```json\n?|```/g, '').trim());

      if (Array.isArray(classifications) && classifications.length >= batch.length) {
        batch.forEach((v, j) => {
          const style = classifications[j] || '';
          v.bodyStyle = validStyles.has(style) ? style : '';
        });
        classified += batch.length;
      } else {
        console.warn(`⚠️  Batch ${Math.floor(i/BATCH_SIZE)+1}: expected ${batch.length}, got ${classifications?.length || 0}`);
      }
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.message;
      console.warn(`⚠️  Batch ${Math.floor(i/BATCH_SIZE)+1} failed:`, detail);
    }
  }

  console.log(`✅ Body styles classified for ${classified}/${unclassified.length} vehicles`);
  const sample = unclassified.slice(0, 8).map(v => `${v.year} ${v.make} ${v.model} → ${v.bodyStyle}`);
  console.log('   Sample:', sample.join(', '));
}

// Load inventory data (try Sheets first, fallback to JSON)
let inventory = [];
// Will be populated async after server starts — see bottom of file

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Twilio sends form-encoded webhooks

// Rate Limiters (Phase 1)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 30,               // 30 requests per minute
  message: 'Too many chat requests. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
});

const smsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,               // 10 SMS per minute (safer, Twilio is expensive)
  message: 'Too many SMS requests. Please wait before trying again.',
  standardHeaders: true,
});

const adfLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,                // 5 ADF leads per minute
  message: 'Too many lead submissions. Please wait.',
  standardHeaders: true,
});

const manualLeadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,                // 5 manual leads per minute (testing)
  message: 'Too many manual leads created. Try again in a minute.',
  standardHeaders: true,
});

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

// SMS Leads Storage — in-memory cache loaded from Supabase on startup
let smsLeads = [];

/**
 * Persist a lead to Supabase ce_leads table (upsert by phone)
 */
async function persistLeadToDB(lead) {
  if (!supabase) return;
  try {
    const row = {
      id:               lead.dbId || undefined,
      name:             lead.name || null,
      phone:            lead.phone || null,
      email:            lead.email || null,
      vehicle_interest: lead.vehicleInterest || null,
      source:           lead.channel === 'SMS' ? 'sms' : 'web_chat',
      status:           lead.status === 'active' ? 'new' : (lead.status || 'new'),
      interest_score:   lead.interestScore || 0,
      notes:            lead.notes || null,
      last_message_at:  lead.updatedAt || new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('ce_leads')
      .upsert(row, { onConflict: 'phone' })
      .select('id')
      .single();
    if (error) throw error;
    // Store the DB id back on the in-memory object so future upserts hit same row
    if (data && data.id) lead.dbId = data.id;
  } catch (err) {
    console.warn('⚠️  Could not persist lead to Supabase:', err.message);
  }
}

/**
 * Persist a single message to ce_conversations
 */
async function persistMessageToDB(lead, role, content) {
  if (!supabase || !lead.dbId) return;
  try {
    await supabase.from('ce_conversations').insert({
      lead_id: lead.dbId,
      role,
      content,
      source: lead.channel === 'SMS' ? 'sms' : 'web_chat'
    });
  } catch (err) {
    console.warn('⚠️  Could not persist message to Supabase:', err.message);
  }
}

/**
 * Persist an appointment to ce_appointments
 */
async function persistAppointmentToDB(lead, apptData) {
  if (!supabase) return;
  try {
    await supabase.from('ce_appointments').insert({
      lead_id:          lead.dbId || null,
      lead_name:        lead.name || null,
      lead_phone:       lead.phone || null,
      lead_email:       lead.email || null,
      vehicle_interest: apptData.vehicleInterest || lead.vehicleInterest || null,
      appointment_date: apptData.date || null,
      appointment_time: apptData.time || null,
      appointment_type: apptData.type || 'test_drive',
      status:           'pending',
      notes:            apptData.notes || null
    });
    console.log(`📅 Appointment saved to Supabase for ${lead.name} (${lead.phone})`);
  } catch (err) {
    console.warn('⚠️  Could not persist appointment to Supabase:', err.message);
  }
}

/**
 * Load all leads from Supabase into the in-memory smsLeads cache on startup
 */
async function loadLeadsFromDB() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('ce_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    // Map DB rows back to the in-memory lead format
    smsLeads = (data || []).map(row => ({
      dbId:            row.id,
      id:              row.id,
      phone:           row.phone,
      name:            row.name,
      email:           row.email,
      vehicleInterest: row.vehicle_interest,
      source:          row.source,
      channel:         row.source === 'sms' ? 'SMS' : 'Web',
      status:          row.status === 'new' ? 'active' : row.status,
      interestScore:   row.interest_score || 0,
      notes:           row.notes || '',
      currentState:    'ah_menu',
      smsHistory:      [],
      appointmentData: {},
      clickHistory:    [],
      needsEscalation: false,
      createdAt:       row.created_at,
      updatedAt:       row.last_message_at || row.updated_at
    }));
    console.log(`📥 Loaded ${smsLeads.length} leads from Supabase`);
  } catch (err) {
    console.warn('⚠️  Could not load leads from Supabase:', err.message);
  }
}

/**
 * Delete a lead from Supabase by phone number
 */
async function deleteLeadFromDB(phone) {
  if (!supabase) return;
  try {
    await supabase.from('ce_leads').delete().eq('phone', phone);
  } catch (err) {
    console.warn('⚠️  Could not delete lead from Supabase:', err.message);
  }
}

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
    faqKnowledge: dealershipSettings.faqKnowledge || '',
    tradeInUrl: dealershipSettings.tradeInUrl || backendAdminSettings.tradeInUrl || 'https://www.carsonexports.com/en/form/exchange-evaluation-new/4'
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
- Trade-In Evaluation Form: ${settings.tradeInUrl}
  When customers ask about trade-ins, mention we accept trade-ins with fair market value and direct them to submit details at this form link.

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
${settings.faqKnowledge ? `
FAQ KNOWLEDGE BASE (use these to answer common questions accurately):
${settings.faqKnowledge}

When a customer asks a question that matches an FAQ topic, use the FAQ answer as your primary source but respond naturally in your own words. If the question is not covered by FAQ, use your general knowledge about car dealerships.
` : ''}
FORMAT: Plain text only. Do NOT use markdown (no **bold**, no [links](url), no bullet lists with •). The chat widget renders HTML separately — your job is to write natural conversational text. Keep responses concise (2-4 sentences max unless detailed info was requested).

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

    case 'ah_escalate': {
      // Customer wants to speak with a dealer (Phase 1)
      stateGuidance = `CURRENT STATE: Customer escalation request 🚨
- Customer wants to speak to a dealer/representative
- Be empathetic: "I understand. Let me get someone from our team to help you right away."
- Confirm: "A member of our team will reach out shortly."
- Don't try to solve further in AI mode
- The sales team will contact them directly within a few hours`;
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

  // Helper: check if two strings share a root (handles plurals, partial matches)
  // "nissans" matches "nissan", "suvs" matches "suv", "toyota" matches "toyotas"
  function fuzzyMatch(a, b) {
    if (a.includes(b) || b.includes(a)) return true;
    // Strip trailing 's' or 'es' for plural handling
    const stemA = a.replace(/e?s$/, '');
    const stemB = b.replace(/e?s$/, '');
    if (stemA.includes(stemB) || stemB.includes(stemA)) return true;
    return false;
  }

  // Score each vehicle — track strong (make/model) vs weak (general) matches separately
  const scored = inventory.map(v => {
    const makeLower = (v.make || '').toLowerCase();
    const modelLower = (v.model || '').toLowerCase();
    const haystack = [
      v.make, v.model, v.trim, v.color, v.bodyStyle, String(v.year), String(v.price),
      ...(v.features || [])
    ].join(' ').toLowerCase();

    let score = 0;
    let hasModelMatch = false;
    let hasMakeMatch = false;
    let hasBodyMatch = false;
    for (const term of terms) {
      if (fuzzyMatch(makeLower, term)) { score += 10; hasMakeMatch = true; }
      if (fuzzyMatch(modelLower, term)) { score += 10; hasModelMatch = true; }
      if (haystack.includes(term)) score += 3;
      const stem = term.replace(/e?s$/, '');
      if (stem !== term && haystack.includes(stem)) score += 3;
      if (term.match(/^\d+k?$/) || term === 'under' || term === 'budget') {
        const num = parseInt(term.replace('k', '000'));
        if (num > 1000 && v.price <= num * 1.15) score += 5;
      }
      const bodyLower = (v.bodyStyle || '').toLowerCase();
      if (fuzzyMatch(bodyLower, term)) { score += 8; hasBodyMatch = true; }
    }
    return { vehicle: v, score, hasModelMatch, hasMakeMatch, hasBodyMatch };
  });

  const sorted = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  // Detect if query contains a body type term — if so, strictly require body match
  const bodyTypeTerms = ['suv','suvs','sedan','sedans','truck','trucks','van','vans','coupe','coupes','hatchback','hatchbacks','wagon','wagons','convertible','convertibles','crossover','crossovers'];
  const queryHasBodyType = terms.some(t => bodyTypeTerms.includes(t) || bodyTypeTerms.includes(t.replace(/e?s$/, '')));

  // If any results have a specific model match, only return those model matches
  // This prevents "show me a RAV4" from also returning Corollas, Camrys, etc.
  const modelMatches = sorted.filter(s => s.hasModelMatch);
  if (modelMatches.length > 0) {
    return modelMatches.slice(0, limit).map(s => s.vehicle);
  }

  // If query mentions a body type, strictly filter to vehicles with matching body style
  if (queryHasBodyType) {
    const bodyMatches = sorted.filter(s => s.hasBodyMatch);
    // If also has a make term, further filter by make
    const makeMatches = bodyMatches.filter(s => s.hasMakeMatch);
    if (makeMatches.length > 0) {
      return makeMatches.slice(0, limit).map(s => s.vehicle);
    }
    if (bodyMatches.length > 0) {
      return bodyMatches.slice(0, limit).map(s => s.vehicle);
    }
  }

  // If any results match by make, prefer those over general fuzzy matches
  const makeMatches = sorted.filter(s => s.hasMakeMatch);
  if (makeMatches.length > 0) {
    return makeMatches.slice(0, limit).map(s => s.vehicle);
  }

  // Otherwise fall back to all scored results
  return sorted.slice(0, limit).map(s => s.vehicle);
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
 * Examples: "2 PM", "14:00", "3:30 AM", "morning", "afternoon", "evening"
 */
function extractTime(message) {
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?/,
    /(\d{1,2})\s*(am|pm|AM|PM)/,
    /\b(morning|afternoon|evening|noon|lunchtime|lunch)\b/i
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
 * Calculate dynamic lead interest score (Phase 1)
 * Multi-factor scoring: engagement, price signals, urgency, appointment completion, escalation, recency
 * Score returned dynamically (not stored)
 */
function calculateLeadScore(lead) {
  if (!lead) return 0;
  let score = 0;

  // Base: engagement via message count
  score += (lead.smsHistory?.length || 0) * 0.5;

  // Clicks (existing tracking)
  score += (lead.clickHistory?.length || 0) * 1;

  // Appointment completion (high-intent signals)
  if (lead.status === 'booked') score += 10;
  if (lead.status === 'submitted') score += 15;

  // Price/budget mentions in conversation
  const conversation = (lead.smsHistory || [])
    .map(m => m.content)
    .join(' ')
    .toLowerCase();

  if (conversation.match(/\$?\d+k|\d+,\d{3}|budget|under|price/i)) score += 5;

  // Urgency signals (time-sensitive interest)
  if (conversation.match(/tomorrow|today|this week|asap|urgent|when|soon|right away|immediately/i)) {
    score += 3;
  }

  // Escalation request (customer wants human interaction)
  if (lead.needsEscalation || lead.escalationRequested) score += 8;

  // Recency bonus (recent engagement is more valuable)
  if (lead.updatedAt || lead.createdAt) {
    const lastUpdate = new Date(lead.updatedAt || lead.createdAt);
    const hoursSince = (Date.now() - lastUpdate) / (1000 * 60 * 60);
    if (hoursSince < 2) score += 3;      // Very recent = +3
    else if (hoursSince < 24) score += 2; // Today = +2
  }

  return Math.round(score);
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
app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const {
      messages = [],
      userMessage,
      chatState = 'menu',
      vehicleQuery,
      dealershipSettings = {},
      pageContext = null,
      personaId = null
    } = req.body;

    // Validate input
    if (!userMessage || typeof userMessage !== 'string') {
      return res.status(400).json({
        error: 'Invalid input. Please provide userMessage as a string.'
      });
    }

    // Load active persona if not specified
    let activePersona = null;
    if (supabase) {
      const personaQuery = personaId
        ? supabase.from('ce_ai_personas').select('*').eq('id', personaId)
        : supabase.from('ce_ai_personas').select('*').eq('is_active', true);

      const { data: persona } = await personaQuery.maybeSingle();
      activePersona = persona;
    }

    // Build conversation history (use last 10 messages for context)
    const recentMessages = messages.slice(-10);
    const conversationMessages = [
      ...recentMessages,
      { role: 'user', content: userMessage }
    ];

    // Merge live backend settings as defaults so admin panel changes take effect
    const mergedSettings = {
      dealershipName:   dealershipSettings.dealerName || dealershipSettings.dealershipName || backendAdminSettings.dealershipName,
      phone:            dealershipSettings.phone            || backendAdminSettings.phone,
      address:          dealershipSettings.address          || backendAdminSettings.address,
      hours:            dealershipSettings.hours            || backendAdminSettings.hours,
      services:         dealershipSettings.services         || backendAdminSettings.services,
      brands:           dealershipSettings.brands           || backendAdminSettings.brands,
      appointmentRules: dealershipSettings.appointmentRules || backendAdminSettings.appointmentRules,
      responseTone:     dealershipSettings.responseTone     || backendAdminSettings.responseTone,
      faqKnowledge:     dealershipSettings.faqKnowledge     || backendAdminSettings.faqKnowledge
    };

    // Generate dynamic system prompt with dealership settings AND current chat state
    let systemPrompt = generateSystemPrompt(mergedSettings, chatState, recentMessages);

    // Inject persona-specific instructions if available
    if (activePersona && activePersona.system_prompt_addition) {
      systemPrompt += `\n\n[PERSONA: ${activePersona.name}]\n${activePersona.system_prompt_addition}`;
    }

    // Inject live inventory context — search for relevant vehicles based on the query
    const query = vehicleQuery || userMessage;
    const relevantVehicles = searchInventory(query, 5);
    if (inventory.length > 0) {
      const makes = [...new Set(inventory.map(v => v.make))].join(', ');
      const prices = inventory.map(v => v.price).filter(p => p > 0);
      const priceRange = prices.length > 0
        ? `$${Math.min(...prices).toLocaleString()}–$${Math.max(...prices).toLocaleString()} CAD`
        : 'various prices';
      systemPrompt += `\n\nINVENTORY SUMMARY: ${inventory.length} vehicles in stock. Makes available: ${makes}. Price range: ${priceRange}.`;
    }
    if (relevantVehicles.length > 0) {
      systemPrompt += '\n\nRELEVANT VEHICLES IN STOCK:\n' + relevantVehicles.map(formatVehicleForPrompt).join('\n\n');
      systemPrompt += `\n\nCRITICAL RESPONSE FORMAT RULES:
- The frontend will AUTOMATICALLY display vehicle photo cards with prices, links, and "Book Drive" buttons below your message.
- Do NOT list vehicles with bullet points or numbered lists in your text — the cards handle that.
- Instead, write a SHORT conversational reply (1-3 sentences) acknowledging what was found.
- Example good response: "Great news! We have ${relevantVehicles.length} Nissan${relevantVehicles.length > 1 ? 's' : ''} in stock right now. Take a look and let me know if any catch your eye!"
- Example BAD response: "1. **2022 Nissan Kicks** — $16,511 [View Details](https://...)" ← NEVER do this.
- Do NOT use markdown formatting (no ** for bold, no []() links). Use plain text only.
- EXCEPTION: If the customer specifically asks for a link, URL, or listing page, you SHOULD include the vehicle's link URL in your response as plain text.
- Keep it friendly, brief, and let the vehicle cards do the heavy lifting.`;
    }

    // Inject page context from embedded widget (helps AI act contextually)
    if (pageContext) {
      systemPrompt += '\n\nPAGE CONTEXT (the customer is currently viewing this page on the dealership website):';
      if (pageContext.url) systemPrompt += `\n- URL: ${pageContext.url}`;
      if (pageContext.title) systemPrompt += `\n- Page Title: ${pageContext.title}`;
      if (pageContext.description) systemPrompt += `\n- Description: ${pageContext.description}`;
      if (pageContext.headings && pageContext.headings.length) systemPrompt += `\n- Key Headings: ${pageContext.headings.join('; ')}`;
      if (pageContext.pageType) systemPrompt += `\n- Page Type: ${pageContext.pageType}`;
      if (pageContext.vehicleInfo) systemPrompt += `\n- Vehicle on Page: ${JSON.stringify(pageContext.vehicleInfo)}`;
      systemPrompt += '\nUse this page context to provide relevant, knowledgeable responses. Act like a dealership staff member who can see exactly what the customer is looking at. Reference specific details from the page when helpful.';
    }

    // Call OpenAI API
    const response = await axios.post(OPENAI_API_URL, {
      model: 'gpt-5-nano', // Better conversation model
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationMessages
      ],
      temperature: 0.7,
      max_completion_tokens: 500,
      top_p: 0.9
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // Extract AI response
    const aiResponse = response.data.choices[0].message.content;

    // Return response + matching vehicles so frontend can render cards
    const vehicleCards = relevantVehicles.map(v => ({
      vin: v.vin || v.vehicle_id || '',
      title: [v.year, v.make, v.model, v.trim].filter(Boolean).join(' '),
      year: v.year,
      make: v.make,
      model: v.model,
      price: v.price,
      mileage: v.mileage,
      bodyStyle: v.bodyStyle || v.body_style || '',
      image: v.image || '',
      link: v.url || v.link || '',
      description: v.description || ''
    }));

    res.json({
      response: aiResponse,
      vehicles: vehicleCards,
      timestamp: new Date().toISOString(),
      persona: activePersona ? { id: activePersona.id, name: activePersona.name } : null
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
app.post('/api/admin-settings', async (req, res) => {
  const allowed = ['dealershipName', 'dealerName', 'phone', 'address', 'hours', 'afterHoursTime', 'services', 'brands', 'appointmentRules', 'responseTone', 'faqKnowledge', 'crmEmail', 'webhookUrl', 'primaryColor', 'tradeInUrl', 'quickReplies', 'postReplies', 'proactiveEnabled', 'proactiveDelay', 'proactiveMessage'];
  const updated = {};
  allowed.forEach(key => {
    if (req.body[key] !== undefined) {
      backendAdminSettings[key] = req.body[key];
      updated[key] = req.body[key];
      if (key === 'dealerName') backendAdminSettings.dealershipName = req.body[key];
      if (key === 'dealershipName') backendAdminSettings.dealerName = req.body[key];
    }
  });
  console.log('⚙️  Admin settings updated:', Object.keys(updated).join(', '));
  await saveAllSettingsToDB(updated);
  res.json({ success: true, settings: backendAdminSettings });
});

/**
 * GET /api/settings
 * Returns dealership settings for the frontend settings form
 */
app.get('/api/settings', async (req, res) => {
  // Return the current in-memory settings (already loaded from DB on startup)
  res.json({
    dealerName:       backendAdminSettings.dealerName || backendAdminSettings.dealershipName,
    phone:            backendAdminSettings.phone,
    address:          backendAdminSettings.address,
    hours:            backendAdminSettings.hours,
    afterHoursTime:   backendAdminSettings.afterHoursTime || '20:00',
    crmEmail:         backendAdminSettings.crmEmail,
    webhookUrl:       backendAdminSettings.webhookUrl,
    primaryColor:     backendAdminSettings.primaryColor || '#1e6fff',
    tradeInUrl:       backendAdminSettings.tradeInUrl || 'https://www.carsonexports.com/en/form/exchange-evaluation-new/4',
    quickReplies:     backendAdminSettings.quickReplies || '',
    postReplies:      backendAdminSettings.postReplies || '',
    faqKnowledge:     backendAdminSettings.faqKnowledge || '',
    services:         backendAdminSettings.services || '',
    brands:           backendAdminSettings.brands || '',
    appointmentRules: backendAdminSettings.appointmentRules || '',
    responseTone:     backendAdminSettings.responseTone || 'friendly',
    proactiveEnabled: backendAdminSettings.proactiveEnabled === true || backendAdminSettings.proactiveEnabled === 'true',
    proactiveDelay:   parseInt(backendAdminSettings.proactiveDelay, 10) || 15,
    proactiveMessage: backendAdminSettings.proactiveMessage || ''
  });
});

/**
 * POST /api/settings
 * Save dealership settings from the frontend settings form
 */
app.post('/api/settings', async (req, res) => {
  const allowed = ['dealerName', 'phone', 'address', 'hours', 'afterHoursTime', 'crmEmail', 'webhookUrl', 'primaryColor', 'tradeInUrl', 'quickReplies', 'postReplies', 'proactiveEnabled', 'proactiveDelay', 'proactiveMessage'];
  const updated = {};
  allowed.forEach(key => {
    if (req.body[key] !== undefined) {
      updated[key] = req.body[key];
      backendAdminSettings[key] = req.body[key];
      if (key === 'dealerName') backendAdminSettings.dealershipName = req.body[key];
    }
  });
  await saveAllSettingsToDB(updated);
  console.log('💾 Dealership settings saved to Supabase:', Object.keys(updated).join(', '));
  res.json({ success: true, settings: updated });
});

/**
 * POST /api/submit-lead
 * Accepts lead submissions from the embeddable chat widget.
 * Persists to Supabase and triggers webhook/email notifications.
 */
app.post('/api/submit-lead', chatLimiter, async (req, res) => {
  try {
    const { name, email, phone, department, date, time, vehicleInterest, source, pageContext } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }
    const lead = {
      name, email, phone, department, date, time,
      vehicle_interest: vehicleInterest || '',
      source: source || 'Chat Widget',
      page_url: pageContext?.url || '',
      created_at: new Date().toISOString()
    };
    // Persist to Supabase if available
    if (supabase) {
      try {
        await supabase.from('ce_leads').insert(lead);
      } catch (dbErr) {
        console.error('Lead DB insert error:', dbErr.message);
      }
    }
    // Trigger webhook if configured
    const webhookUrl = backendAdminSettings.webhookUrl;
    if (webhookUrl) {
      axios.post(webhookUrl, lead).catch(err => console.error('Webhook error:', err.message));
    }
    console.log('📋 Lead submitted via widget:', name, phone, department || 'General');
    res.json({ success: true });
  } catch (error) {
    console.error('Submit lead error:', error.message);
    res.status(500).json({ error: 'Failed to submit lead' });
  }
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
 * Ensure widget JS is served with CORS headers for cross-origin embedding
 */
app.get('/chat-widget.js', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  next();
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
app.post('/api/webhook/adf', adfLimiter, async (req, res) => {
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

    // Store SMS lead (in-memory + persist to DB)
    smsLeads.push(smsLead);
    persistLeadToDB(smsLead);

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

      // Log the initial greeting so the AI has full conversation context from message 1
      smsLead.smsHistory.push({ role: 'assistant', content: greetingBody });

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
app.post('/api/sms-chat', smsLimiter, async (req, res) => {
  try {
    if (!twilioClient) {
      return res.status(503).json({ error: 'Twilio not configured' });
    }

    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Missing phone or message' });
    }

    // Find SMS lead by phone — auto-create if this is a direct inbound texter with no ADF lead
    let smsLead = getSMSLeadByPhone(phone);

    if (!smsLead) {
      smsLead = {
        id: 'sms_' + Date.now(),
        phone: phone,
        name: 'Customer',
        email: '',
        vehicleInterest: '',
        department: 'Sales',
        source: 'Direct SMS',
        channel: 'SMS',
        status: 'active',
        currentState: 'ah_menu',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        smsHistory: [],
        appointmentData: { name: '', phone: '', email: '', date: '', time: '' },
        clickHistory: [],
        interestScore: 0
      };
      smsLeads.push(smsLead);
      console.log(`📱 Auto-created SMS lead for new inbound texter: ${phone}`);
    }

    // ======================
    // STATE TRANSITION LOGIC (RUN FIRST)
    // ======================
    let nextState = smsLead.currentState;
    let extractedData = {};

    switch(smsLead.currentState) {
      case 'ah_menu': {
        // User responding to menu - determine intent from natural language or numbered option
        const menuLower = message.toLowerCase();

        // Check for escalation first (Phase 1)
        if (menuLower.match(/escalate|speak.*dealer|talk.*agent|human|person|real person|representative/)) {
          nextState = 'ah_escalate';
        } else if (menuLower.includes('2') || menuLower.includes('appointment') || menuLower.includes('book') || menuLower.includes('schedule') || menuLower.includes('test drive') || menuLower.includes('visit') || menuLower.includes('come in')) {
          nextState = 'ah_appt_name';
        } else if (menuLower.includes('3') || menuLower.includes('question') || menuLower.includes('info') || menuLower.includes('tell') || menuLower.includes('help') || menuLower.includes('hours') || menuLower.includes('location') || menuLower.includes('financing') || menuLower.includes('trade')) {
          nextState = 'ah_freeform';
        } else if (menuLower.includes('1') || menuLower.includes('vehicle') || menuLower.includes('browse') || menuLower.includes('car') || menuLower.includes('truck') || menuLower.includes('suv') || menuLower.includes('sedan') || menuLower.includes('van') || menuLower.includes('looking') || menuLower.includes('show me') || menuLower.includes('interested') || menuLower.includes('inventory')) {
          nextState = 'ah_inventory';
        } else {
          // Default to inventory browsing for unrecognized input — AI will clarify
          nextState = 'ah_inventory';
        }
        console.log(`📱 SMS menu selection: "${message}" → state ${nextState}`);
        break;
      }

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

      case 'ah_freeform': {
        // Allow pivot from freeform to booking or inventory
        const freeformLower = message.toLowerCase();

        // Check for escalation (Phase 1)
        if (freeformLower.match(/escalate|speak.*dealer|talk.*agent|human|person|real person|representative/)) {
          nextState = 'ah_escalate';
        } else if (freeformLower.includes('book') || freeformLower.includes('appointment') || freeformLower.includes('schedule') || freeformLower.includes('test drive') || freeformLower.includes('visit')) {
          nextState = 'ah_appt_name';
          console.log(`📱 SMS freeform → appointment booking`);
        } else if (freeformLower.includes('vehicle') || freeformLower.includes('car') || freeformLower.includes('truck') || freeformLower.includes('suv') || freeformLower.includes('browse') || freeformLower.includes('show me') || freeformLower.includes('looking')) {
          nextState = 'ah_inventory';
          console.log(`📱 SMS freeform → inventory`);
        }
        break;
      }

      case 'ah_confirmation': {
        // After appointment confirmed, allow them to keep browsing or start a new booking
        const confirmLower = message.toLowerCase();
        if (confirmLower.includes('book') || confirmLower.includes('appointment') || confirmLower.includes('schedule')) {
          nextState = 'ah_appt_name';
        } else if (confirmLower.includes('vehicle') || confirmLower.includes('browse') || confirmLower.includes('car') || confirmLower.includes('show me')) {
          nextState = 'ah_inventory';
        } else {
          nextState = 'ah_freeform';
        }
        break;
      }

      case 'ah_escalate': {
        // Customer requested escalation to speak with dealer (Phase 1)
        smsLead.needsEscalation = true;
        smsLead.escalationRequestedAt = new Date().toISOString();
        console.log(`🚨 Escalation requested by ${smsLead.phone} (${smsLead.name})`);
        break;
      }
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
      model: 'gpt-5.4-nano',
      messages: [
        { role: 'system', content: systemPrompt },
        ...smsLead.smsHistory,
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_completion_tokens: 500,
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
        created_at: smsLead.createdAt,
        escalation_requested: smsLead.needsEscalation || false,
        escalation_requested_at: smsLead.escalationRequestedAt || null,
        interest_score: calculateLeadScore(smsLead)
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

    // Calculate score dynamically (Phase 1)
    const currentScore = calculateLeadScore(smsLead);

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
        interestScore: currentScore,
        vehicleInterest: smsLead.vehicleInterest,
        createdAt: smsLead.createdAt,
        updatedAt: smsLead.updatedAt,
        needsEscalation: smsLead.needsEscalation || false
      }
    });
  } catch (error) {
    console.error('SMS Lead Status Error:', error);
    res.status(500).json({ error: 'Failed to get SMS lead status' });
  }
});

/**
 * POST /api/admin/send-message (Phase 1)
 * Admin sends a manual SMS message to a customer
 * Request body: { phone: "+19025551234", message: "Hi John..." }
 * Response: { success: true, messageSid: "SM..." }
 */
app.post('/api/admin/send-message', async (req, res) => {
  try {
    if (!twilioClient) {
      return res.status(503).json({ error: 'Twilio not configured' });
    }

    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Missing phone or message' });
    }

    if (message.trim().length === 0 || message.length > 1600) {
      return res.status(400).json({ error: 'Message must be 1-1600 characters' });
    }

    // Find the SMS lead
    const smsLead = getSMSLeadByPhone(phone);
    if (!smsLead) {
      return res.status(404).json({ error: 'SMS lead not found' });
    }

    // Wrap URLs with tracking
    const messageWithTracking = wrapUrlsWithTracking(message, phone);

    // Send via Twilio
    const twilioResponse = await twilioClient.messages.create({
      body: messageWithTracking,
      from: TWILIO_PHONE_NUMBER,
      to: phone
    });

    // Log message to conversation history with admin marker
    smsLead.smsHistory.push({
      role: 'admin',
      content: messageWithTracking,
      sentAt: new Date().toISOString()
    });

    smsLead.updatedAt = new Date().toISOString();

    console.log(`👨‍💼 Admin message sent to ${phone} (${smsLead.name})`);

    res.json({
      success: true,
      messageSid: twilioResponse.sid,
      sentAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Admin Send Message Error:', error);
    res.status(500).json({ error: 'Failed to send message: ' + error.message });
  }
});

/**
 * POST /api/leads/manual
 * Create a manual SMS lead (for testing or offline customer interactions)
 *
 * Body:
 * {
 *   phone: "+19025551234" (required),
 *   name: "John Smith" (required),
 *   email?: "john@example.com",
 *   vehicleInterest?: "Honda CR-V",
 *   department?: "Sales" | "Service" (default: "Sales"),
 *   initialNotes?: "Called from dealership"
 * }
 *
 * Returns: { success, leadId, message, phone }
 */
app.post('/api/leads/manual', manualLeadLimiter, (req, res) => {
  try {
    const { phone, name, email, vehicleInterest, department = 'Sales', initialNotes } = req.body;

    // Validate required fields
    if (!phone || !name) {
      return res.status(400).json({ error: 'Phone and name are required' });
    }

    // Normalize phone to E.164 format
    let normalizedPhone = phone.replace(/\D/g, '');
    if (!normalizedPhone.startsWith('1')) {
      normalizedPhone = '1' + normalizedPhone;
    }
    const formattedPhone = '+' + normalizedPhone;

    // Check for duplicate phone
    if (getSMSLeadByPhone(formattedPhone)) {
      return res.status(409).json({ error: 'Lead with this phone number already exists' });
    }

    // Create greeting message
    const greeting = `Hi ${name}! 👋 Thanks for your interest in our vehicles. What can we help with? 1) Browse vehicles 2) Book appointment 3) Ask a question`;

    // Create new lead object
    const newLead = {
      id: 'manual_' + Date.now(),
      phone: formattedPhone,
      name: name,
      email: email || '',
      vehicleInterest: vehicleInterest || '',
      department: department,
      source: 'Manual Entry',
      channel: 'SMS',
      status: 'active',
      currentState: 'ah_menu',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      smsHistory: [
        { role: 'assistant', content: greeting }
      ],
      appointmentData: {},
      clickHistory: [],
      interestScore: 0,
      needsEscalation: false,
      notes: initialNotes || ''
    };

    // Add to leads array and persist to DB
    smsLeads.push(newLead);
    persistLeadToDB(newLead);

    // Send greeting SMS via Twilio
    if (twilioClient && TWILIO_PHONE_NUMBER) {
      twilioClient.messages
        .create({
          body: greeting,
          from: TWILIO_PHONE_NUMBER,
          to: formattedPhone
        })
        .then(msg => {
          console.log(`📱 Manual lead created: ${name} (${formattedPhone}) - Greeting SMS sent: ${msg.sid}`);
        })
        .catch(err => {
          console.error(`⚠️  Manual lead created but SMS failed: ${err.message}`);
        });
    }

    res.json({
      success: true,
      leadId: newLead.id,
      message: 'Lead created and greeting SMS sent',
      phone: formattedPhone
    });

  } catch (error) {
    console.error('Manual Lead Creation Error:', error);
    res.status(500).json({ error: 'Failed to create lead: ' + error.message });
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
  if (removed > 0) deleteLeadFromDB(phone);
  console.log(`🗑️  Removed ${removed} SMS lead(s) for ${phone}`);
  res.json({ success: true, removed, message: removed > 0 ? `Cleared lead for ${phone}` : 'No lead found for that phone' });
});

// ─── ANALYTICS API ENDPOINTS ────────────────────────────────────────────────

/**
 * GET /api/analytics/overview
 * Get overview metrics for the analytics dashboard
 */
app.get('/api/analytics/overview', async (req, res) => {
  try {
    const { range = '7d' } = req.query;
    const now = new Date();
    let startDate;

    switch (range) {
      case '1d': startDate = new Date(now - 24 * 60 * 60 * 1000); break;
      case '7d': startDate = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    if (!supabase) {
      return res.json({
        totalConversations: smsLeads.length,
        totalLeads: smsLeads.filter(l => l.name).length,
        totalAppointments: smsLeads.filter(l => l.status === 'booked' || l.status === 'submitted').length,
        conversionRate: 0,
        avgResponseTime: 0,
        channelBreakdown: { sms: smsLeads.filter(l => l.channel === 'SMS').length, web: 0 },
        statusBreakdown: { new: 0, active: smsLeads.filter(l => l.status === 'active').length, booked: smsLeads.filter(l => l.status === 'booked').length, submitted: smsLeads.filter(l => l.status === 'submitted').length }
      });
    }

    const { data: leads } = await supabase
      .from('ce_leads')
      .select('*')
      .gte('created_at', startDate.toISOString());

    const { data: sessions } = await supabase
      .from('ce_chat_sessions')
      .select('*')
      .gte('started_at', startDate.toISOString());

    const { data: appointments } = await supabase
      .from('ce_appointments')
      .select('*')
      .gte('created_at', startDate.toISOString());

    const totalLeads = leads?.length || 0;
    const totalSessions = sessions?.length || 0;
    const totalAppointments = appointments?.length || 0;

    const smsLeadsCount = leads?.filter(l => l.source === 'sms').length || 0;
    const webLeadsCount = leads?.filter(l => l.source === 'web_chat').length || 0;

    const avgResponseTime = sessions?.length > 0
      ? Math.round(sessions.reduce((sum, s) => sum + (s.avg_response_time_ms || 0), 0) / sessions.length)
      : 0;

    const conversionRate = totalSessions > 0
      ? Math.round((totalAppointments / totalSessions) * 100)
      : 0;

    res.json({
      totalConversations: totalSessions,
      totalLeads,
      totalAppointments,
      conversionRate,
      avgResponseTime,
      channelBreakdown: { sms: smsLeadsCount, web: webLeadsCount },
      statusBreakdown: {
        new: leads?.filter(l => l.status === 'new').length || 0,
        active: leads?.filter(l => l.status === 'active').length || 0,
        booked: leads?.filter(l => l.status === 'booked').length || 0,
        submitted: leads?.filter(l => l.status === 'submitted').length || 0
      }
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/analytics/trends
 * Get daily conversation and lead trends
 */
app.get('/api/analytics/trends', async (req, res) => {
  try {
    const { range = '7d' } = req.query;
    const now = new Date();
    let days;

    switch (range) {
      case '1d': days = 1; break;
      case '7d': days = 7; break;
      case '30d': days = 30; break;
      default: days = 7;
    }

    const startDate = new Date(now - days * 24 * 60 * 60 * 1000);
    const trends = [];

    for (let i = 0; i < days; i++) {
      const dayStart = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      trends.push({
        date: dayStart.toISOString().split('T')[0],
        conversations: 0,
        leads: 0,
        appointments: 0
      });
    }

    if (supabase) {
      const { data: leads } = await supabase
        .from('ce_leads')
        .select('created_at')
        .gte('created_at', startDate.toISOString());

      const { data: sessions } = await supabase
        .from('ce_chat_sessions')
        .select('started_at')
        .gte('started_at', startDate.toISOString());

      const { data: appointments } = await supabase
        .from('ce_appointments')
        .select('created_at')
        .gte('created_at', startDate.toISOString());

      leads?.forEach(lead => {
        const date = new Date(lead.created_at).toISOString().split('T')[0];
        const trend = trends.find(t => t.date === date);
        if (trend) trend.leads++;
      });

      sessions?.forEach(session => {
        const date = new Date(session.started_at).toISOString().split('T')[0];
        const trend = trends.find(t => t.date === date);
        if (trend) trend.conversations++;
      });

      appointments?.forEach(appt => {
        const date = new Date(appt.created_at).toISOString().split('T')[0];
        const trend = trends.find(t => t.date === date);
        if (trend) trend.appointments++;
      });
    }

    res.json({ trends });
  } catch (error) {
    console.error('Analytics trends error:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

/**
 * GET /api/analytics/hourly
 * Get hourly distribution of conversations (peak hours)
 */
app.get('/api/analytics/hourly', async (req, res) => {
  try {
    const hourlyData = Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 }));

    if (supabase) {
      const { data: sessions } = await supabase
        .from('ce_chat_sessions')
        .select('started_at')
        .gte('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      sessions?.forEach(session => {
        const hour = new Date(session.started_at).getHours();
        hourlyData[hour].count++;
      });
    }

    res.json({ hourlyData });
  } catch (error) {
    console.error('Analytics hourly error:', error);
    res.status(500).json({ error: 'Failed to fetch hourly data' });
  }
});

/**
 * GET /api/analytics/outcomes
 * Get conversation outcome breakdown
 */
app.get('/api/analytics/outcomes', async (req, res) => {
  try {
    const outcomes = {
      lead_captured: 0,
      appointment_booked: 0,
      abandoned: 0,
      escalated: 0,
      active: 0
    };

    if (supabase) {
      const { data: sessions } = await supabase
        .from('ce_chat_sessions')
        .select('outcome')
        .gte('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      sessions?.forEach(session => {
        if (outcomes.hasOwnProperty(session.outcome)) {
          outcomes[session.outcome]++;
        }
      });
    }

    res.json({ outcomes });
  } catch (error) {
    console.error('Analytics outcomes error:', error);
    res.status(500).json({ error: 'Failed to fetch outcomes' });
  }
});

/**
 * GET /api/analytics/vehicle-interest
 * Get vehicle interest distribution
 */
app.get('/api/analytics/vehicle-interest', async (req, res) => {
  try {
    const vehicleInterest = {};

    if (supabase) {
      const { data: leads } = await supabase
        .from('ce_leads')
        .select('vehicle_interest')
        .not('vehicle_interest', 'eq', '')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      leads?.forEach(lead => {
        const vehicle = lead.vehicle_interest || 'Unknown';
        vehicleInterest[vehicle] = (vehicleInterest[vehicle] || 0) + 1;
      });
    }

    const sorted = Object.entries(vehicleInterest)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([vehicle, count]) => ({ vehicle, count }));

    res.json({ vehicleInterest: sorted });
  } catch (error) {
    console.error('Analytics vehicle interest error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle interest' });
  }
});

/**
 * GET /api/analytics/hot-leads
 * Get leads with highest interest scores
 */
app.get('/api/analytics/hot-leads', async (req, res) => {
  try {
    let hotLeads = [];

    if (supabase) {
      const { data } = await supabase
        .from('ce_leads')
        .select('*')
        .order('interest_score', { ascending: false })
        .limit(10);

      hotLeads = data || [];
    } else {
      hotLeads = [...smsLeads]
        .sort((a, b) => (b.interestScore || 0) - (a.interestScore || 0))
        .slice(0, 10)
        .map(l => ({
          name: l.name,
          phone: l.phone,
          interest_score: l.interestScore,
          source: l.channel === 'SMS' ? 'sms' : 'web_chat',
          status: l.status,
          vehicle_interest: l.vehicleInterest || ''
        }));
    }

    res.json({ hotLeads });
  } catch (error) {
    console.error('Analytics hot leads error:', error);
    res.status(500).json({ error: 'Failed to fetch hot leads' });
  }
});

/**
 * POST /api/analytics/session
 * Create or update a chat session for analytics tracking
 */
app.post('/api/analytics/session', async (req, res) => {
  try {
    const { sessionId, leadId, source, messageCount, userMessageCount, aiMessageCount, outcome, avgResponseTime } = req.body;

    if (!supabase) {
      return res.json({ success: true, message: 'Analytics not available without Supabase' });
    }

    const { data: existing } = await supabase
      .from('ce_chat_sessions')
      .select('id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('ce_chat_sessions')
        .update({
          message_count: messageCount,
          user_message_count: userMessageCount,
          ai_message_count: aiMessageCount,
          outcome: outcome || 'active',
          avg_response_time_ms: avgResponseTime || 0,
          ended_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);
    } else {
      await supabase
        .from('ce_chat_sessions')
        .insert({
          session_id: sessionId,
          lead_id: leadId || null,
          source: source || 'web_chat',
          message_count: messageCount || 0,
          user_message_count: userMessageCount || 0,
          ai_message_count: aiMessageCount || 0,
          outcome: outcome || 'active',
          avg_response_time_ms: avgResponseTime || 0
        });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Analytics session error:', error);
    res.status(500).json({ error: 'Failed to track session' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI PERSONA MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/personas', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { data, error } = await supabase
      .from('ce_ai_personas')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Personas fetch error:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch personas', details: error.message });
  }
});

app.get('/api/personas/active', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { data, error } = await supabase
      .from('ce_ai_personas')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    res.json(data || {});
  } catch (error) {
    console.error('Active persona fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch active persona' });
  }
});

app.post('/api/personas', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { name, tone_type, response_style, greeting_template, system_prompt_addition } = req.body;

    if (!name || !tone_type) {
      return res.status(400).json({ error: 'Name and tone_type are required' });
    }

    const { data, error } = await supabase
      .from('ce_ai_personas')
      .insert({
        name,
        tone_type,
        response_style: response_style || 'professional',
        greeting_template: greeting_template || '',
        system_prompt_addition: system_prompt_addition || '',
        is_active: false
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Persona creation error:', error);
    res.status(500).json({ error: 'Failed to create persona' });
  }
});

app.put('/api/personas/:id', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { id } = req.params;
    const { name, tone_type, response_style, greeting_template, system_prompt_addition, is_active } = req.body;

    if (is_active) {
      await supabase.from('ce_ai_personas').update({ is_active: false }).neq('id', id);
    }

    const { data, error } = await supabase
      .from('ce_ai_personas')
      .update({
        ...(name && { name }),
        ...(tone_type && { tone_type }),
        ...(response_style && { response_style }),
        ...(greeting_template !== undefined && { greeting_template }),
        ...(system_prompt_addition !== undefined && { system_prompt_addition }),
        ...(is_active !== undefined && { is_active }),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Persona update error:', error);
    res.status(500).json({ error: 'Failed to update persona' });
  }
});

app.delete('/api/personas/:id', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { id } = req.params;

    const { data: persona, error: personaError } = await supabase
      .from('ce_ai_personas')
      .select('is_active')
      .eq('id', id)
      .maybeSingle();

    if (personaError) throw personaError;
    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }

    if (persona.is_active) {
      return res.status(400).json({
        error: 'Cannot delete an active persona. Deactivate it first.'
      });
    }

    const { data: activeSessions, error: sessionsError } = await supabase
      .from('ce_chat_sessions')
      .select('id', { count: 'exact', head: 1 })
      .eq('persona_id', id);

    if (sessionsError) throw sessionsError;

    if (activeSessions && activeSessions.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete persona with active sessions. Archive or reassign sessions first.'
      });
    }

    const { error } = await supabase
      .from('ce_ai_personas')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Persona deletion error:', error);
    res.status(500).json({ error: 'Failed to delete persona' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRAINING DATA MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/training-data', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { category, is_approved } = req.query;

    let query = supabase
      .from('ce_training_data')
      .select(`
        id,
        category,
        notes,
        is_approved,
        created_at,
        session_id,
        conversation_id
      `)
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    if (is_approved !== undefined) {
      query = query.eq('is_approved', is_approved === 'true');
    }

    const { data, error } = await query.limit(100);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Training data fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch training data' });
  }
});

app.post('/api/training-data/flag', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { session_id, category, notes } = req.body;
    const validCategories = ['good_answer', 'bad_answer', 'sales_close', 'missed_opportunity'];

    if (!session_id || !category) {
      return res.status(400).json({ error: 'session_id and category are required' });
    }

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    const { data: session, error: sessionError } = await supabase
      .from('ce_chat_sessions')
      .select('id, lead_id')
      .eq('session_id', session_id)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { data: conversations, error: convError } = await supabase
      .from('ce_conversations')
      .select('id')
      .eq('lead_id', session.lead_id)
      .limit(1);

    if (convError) throw convError;

    const { data, error } = await supabase
      .from('ce_training_data')
      .insert({
        session_id: session.id,
        conversation_id: conversations?.[0]?.id || null,
        category,
        notes: notes || '',
        is_approved: false
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Training data flag error:', error);
    res.status(500).json({ error: 'Failed to flag training data' });
  }
});

app.put('/api/training-data/:id/approve', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('ce_training_data')
      .update({ is_approved: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Training data approval error:', error);
    res.status(500).json({ error: 'Failed to approve training data' });
  }
});

app.delete('/api/training-data/:id', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('ce_training_data')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Training data deletion error:', error);
    res.status(500).json({ error: 'Failed to delete training data' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSATION ANALYTICS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/conversations/search', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { query, start_date, end_date, vehicle_interest, limit = '50', offset = '0' } = req.query;
    const limitNum = Math.min(parseInt(limit) || 50, 500);
    const offsetNum = parseInt(offset) || 0;

    let dbQuery = supabase
      .from('ce_chat_sessions')
      .select(`
        id,
        session_id,
        message_count,
        user_message_count,
        ai_message_count,
        outcome,
        started_at,
        ended_at,
        avg_response_time_ms,
        ce_leads(id, name, phone, email, vehicle_interest),
        ce_ai_personas(name, tone_type)
      `, { count: 'exact' });

    if (query) {
      dbQuery = dbQuery.or(`ce_leads.name.ilike.%${query}%,ce_leads.phone.ilike.%${query}%,ce_leads.email.ilike.%${query}%`);
    }

    if (vehicle_interest) {
      dbQuery = dbQuery.eq('ce_leads.vehicle_interest', vehicle_interest);
    }

    if (start_date) {
      dbQuery = dbQuery.gte('started_at', start_date);
    }

    if (end_date) {
      dbQuery = dbQuery.lte('started_at', end_date);
    }

    const { data, error, count } = await dbQuery
      .order('started_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (error) throw error;

    res.json({
      conversations: data,
      total: count,
      limit: limitNum,
      offset: offsetNum
    });
  } catch (error) {
    console.error('Conversation search error:', error);
    res.status(500).json({ error: 'Failed to search conversations' });
  }
});

app.get('/api/conversations/:sessionId', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { sessionId } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('ce_chat_sessions')
      .select(`
        id,
        session_id,
        message_count,
        started_at,
        ended_at,
        outcome,
        ce_leads(id, name, phone, email, vehicle_interest),
        ce_ai_personas(id, name, tone_type)
      `)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { data: messages, error: messagesError } = await supabase
      .from('ce_conversations')
      .select('id, role, content, created_at')
      .eq('lead_id', session.ce_leads?.id)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    res.json({
      session,
      messages
    });
  } catch (error) {
    console.error('Conversation fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK DELIVERY ENDPOINTS & RETRY LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

async function sendConversationWebhook(sessionId, webhookUrl) {
  if (!supabase || !webhookUrl) return;

  try {
    const { data: session, error: sessionError } = await supabase
      .from('ce_chat_sessions')
      .select(`
        id,
        session_id,
        message_count,
        user_message_count,
        ai_message_count,
        started_at,
        ended_at,
        outcome,
        ce_leads(id, name, phone, email, vehicle_interest),
        ce_ai_personas(name, tone_type)
      `)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      console.error('Error fetching session for webhook:', sessionError);
      return;
    }

    const { data: messages, error: messagesError } = await supabase
      .from('ce_conversations')
      .select('role, content, created_at')
      .eq('lead_id', session.ce_leads?.id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages for webhook:', messagesError);
      return;
    }

    const duration = session.ended_at
      ? new Date(session.ended_at) - new Date(session.started_at)
      : new Date() - new Date(session.started_at);

    const payload = {
      event: 'conversation_completed',
      timestamp: new Date().toISOString(),
      session: {
        id: session.session_id,
        started_at: session.started_at,
        ended_at: session.ended_at,
        duration_seconds: Math.floor(duration / 1000),
        message_count: session.message_count,
        user_messages: session.user_message_count,
        ai_messages: session.ai_message_count,
        outcome: session.outcome
      },
      lead: {
        id: session.ce_leads?.id,
        name: session.ce_leads?.name || 'Unknown',
        phone: session.ce_leads?.phone || '',
        email: session.ce_leads?.email || '',
        vehicle_interest: session.ce_leads?.vehicle_interest || ''
      },
      ai: {
        persona: session.ce_ai_personas?.name || 'General Assistant',
        tone_type: session.ce_ai_personas?.tone_type || 'general'
      },
      conversation: messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.created_at
      })),
      summary: {
        total_messages: messages.length,
        first_message: messages[0]?.content?.substring(0, 100) || '',
        conversation_topics: extractTopics(messages.map(m => m.content).join(' ')),
        sentiment: analyzeSentiment(messages.map(m => m.content).join(' '))
      }
    };

    const response = await axios.post(webhookUrl, payload, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });

    await supabase
      .from('ce_webhook_logs')
      .insert({
        session_id: session.id,
        webhook_url: webhookUrl,
        payload: payload,
        status_code: response.status,
        retry_count: 0
      });

    await supabase
      .from('ce_chat_sessions')
      .update({ webhook_sent: true })
      .eq('id', session.id);

    console.log(`✅ Webhook sent successfully for session ${sessionId}`);
  } catch (error) {
    console.error(`❌ Webhook delivery failed for session ${sessionId}:`, error.message);

    try {
      const { data: session } = await supabase
        .from('ce_chat_sessions')
        .select('id')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (session) {
        await supabase
          .from('ce_webhook_logs')
          .insert({
            session_id: session.id,
            webhook_url: webhookUrl,
            payload: { session_id: sessionId, error: 'pending' },
            status_code: null,
            error_message: error.message,
            retry_count: 0,
            next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
          });
      }
    } catch (logError) {
      console.error('Error logging webhook failure:', logError);
    }
  }
}

function extractTopics(text) {
  const topics = [];
  const keywords = ['vehicle', 'service', 'appointment', 'price', 'financing', 'trade', 'test drive', 'maintenance', 'repair'];
  keywords.forEach(keyword => {
    if (text.toLowerCase().includes(keyword)) {
      topics.push(keyword);
    }
  });
  return topics;
}

function analyzeSentiment(text) {
  const positive = ['good', 'great', 'excellent', 'happy', 'satisfied', 'thanks', 'love', 'perfect'];
  const negative = ['bad', 'terrible', 'poor', 'upset', 'disappointed', 'angry', 'hate', 'problem'];
  const textLower = text.toLowerCase();

  let positiveCount = positive.filter(w => textLower.includes(w)).length;
  let negativeCount = negative.filter(w => textLower.includes(w)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

app.get('/api/webhook-logs', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { limit = '50', offset = '0' } = req.query;
    const limitNum = Math.min(parseInt(limit) || 50, 200);
    const offsetNum = parseInt(offset) || 0;

    const { data, error, count } = await supabase
      .from('ce_webhook_logs')
      .select(`
        id,
        webhook_url,
        status_code,
        error_message,
        retry_count,
        created_at,
        ce_chat_sessions(session_id, ce_leads(name, phone))
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (error) throw error;
    res.json({ logs: data, total: count });
  } catch (error) {
    console.error('Webhook logs fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch webhook logs' });
  }
});

app.post('/api/webhook-logs/:id/retry', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  try {
    const { id } = req.params;

    const { data: log, error: logError } = await supabase
      .from('ce_webhook_logs')
      .select('webhook_url, session_id, retry_count')
      .eq('id', id)
      .maybeSingle();

    if (logError || !log) {
      return res.status(404).json({ error: 'Log not found' });
    }

    if (log.retry_count >= 3) {
      return res.status(400).json({ error: 'Maximum retry attempts exceeded' });
    }

    const { data: session } = await supabase
      .from('ce_chat_sessions')
      .select('session_id')
      .eq('id', log.session_id)
      .maybeSingle();

    await sendConversationWebhook(session.session_id, log.webhook_url);

    await supabase
      .from('ce_webhook_logs')
      .update({ retry_count: log.retry_count + 1 })
      .eq('id', id);

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook retry error:', error);
    res.status(500).json({ error: 'Failed to retry webhook' });
  }
});

// Expose webhook sending function for chat completion
app.post('/api/send-webhook', async (req, res) => {
  try {
    const { sessionId, webhookUrl } = req.body;

    if (!sessionId || !webhookUrl) {
      return res.status(400).json({ error: 'sessionId and webhookUrl are required' });
    }

    await sendConversationWebhook(sessionId, webhookUrl);
    res.json({ success: true });
  } catch (error) {
    console.error('Send webhook error:', error);
    res.status(500).json({ error: 'Failed to send webhook' });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚗 Carson Exports AI Backend running on http://localhost:${PORT}`);
  console.log(`📝 Chat endpoint: POST http://localhost:${PORT}/api/chat`);
  console.log(`✅ Health check: GET http://localhost:${PORT}/api/health`);

  // Load persisted settings and leads from Supabase
  await loadSettingsFromDB();
  await loadLeadsFromDB();

  // Fetch live inventory from Google Sheets on startup
  await fetchInventoryFromSheets();

  // Schedule periodic refresh every 4 hours
  setInterval(fetchInventoryFromSheets, INVENTORY_REFRESH_MS);
  console.log(`🔄 Inventory auto-refresh scheduled every ${INVENTORY_REFRESH_MS / 3600000}h`);
});
