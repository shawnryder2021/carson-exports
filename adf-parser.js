/**
 * ADF Parser Module
 * Parses ADF/XML formatted lead data from email service integrations (Make, Zapier, SendGrid)
 * Converts ADF data into SMS lead objects ready for Twilio messaging
 */

/**
 * Parse ADF payload from Make/Zapier email service
 * Converts ADF XML data (as JSON) into lead object
 * @param {Object} data - Parsed ADF data from Make/Zapier
 * @returns {Object} - SMS lead object
 */
function parseADFPayload(data) {
  return {
    id: 'sms_' + Date.now(),
    phone: normalizePhoneNumber(data.customer_phone || data.phone || ''),
    name: data.customer_name || data.name || 'Unknown',
    email: data.customer_email || data.email || '',
    vehicleInterest: data.vehicle_interest || '',
    department: data.department || 'Sales',
    source: 'ADF',
    channel: 'SMS',
    status: 'active',
    currentState: 'ah_menu',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    smsHistory: [],
    appointmentData: {}
  };
}

/**
 * Normalize phone number to E.164 format (+1XXXXXXXXXX for North America)
 * @param {string} phone - Raw phone number
 * @returns {string} - Normalized phone number
 */
function normalizePhoneNumber(phone) {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');

  // Handle different formats
  if (cleaned.length === 10) return '+1' + cleaned;
  if (cleaned.length === 11 && cleaned[0] === '1') return '+' + cleaned;
  if (cleaned.length === 11) return '+1' + cleaned.substring(1);

  // Default: add +1 prefix
  return '+1' + cleaned;
}

module.exports = { parseADFPayload, normalizePhoneNumber };
