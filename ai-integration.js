/**
 * Carson Exports AI Integration Module
 *
 * Usage:
 * 1. Include this file in your HTML: <script src="ai-integration.js"></script>
 * 2. Call: const response = await aiChat.generate(userMessage, conversationHistory)
 * 3. The response is a string ready to display
 *
 * Configuration:
 * - Update BACKEND_URL to match your deployed backend
 * - For development: http://localhost:3001/api/chat
 * - For production: https://your-domain.com/api/chat
 */

const aiChat = (() => {
  // ========================================
  // CONFIGURATION
  // ========================================

  // Change this to your deployed backend URL
  const BACKEND_URL = 'http://localhost:3001/api/chat';

  // Conversation history for context
  let conversationHistory = [];

  // Maximum messages to keep in history (for token efficiency)
  const MAX_HISTORY = 10;

  // ========================================
  // PUBLIC API
  // ========================================

  /**
   * Generate an AI response for a user message
   *
   * @param {string} userMessage - The user's message/question
   * @param {boolean} useHistory - Include conversation history (default: true)
   * @param {Object} dealershipSettings - Dealership configuration from admin (default: {})
   * @param {string} chatState - Current conversation state for context-aware responses (default: 'menu')
   * @returns {Promise<string>} - AI-generated response
   */
  async function generate(userMessage, useHistory = true, dealershipSettings = {}, chatState = 'menu') {
    try {
      // Validate input
      if (!userMessage || typeof userMessage !== 'string') {
        throw new Error('Invalid message: must be a non-empty string');
      }

      // Prepare request payload with chatState for context-aware system prompt
      const payload = {
        userMessage: userMessage.trim(),
        messages: useHistory ? conversationHistory : [],
        dealershipSettings: dealershipSettings,
        chatState: chatState || 'menu'
      };

      // Make request to backend
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      // Handle HTTP errors
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Parse response
      const data = await response.json();
      const aiResponse = data.response;

      // Update conversation history
      if (useHistory) {
        addToHistory('user', userMessage);
        addToHistory('assistant', aiResponse);
      }

      return aiResponse;

    } catch (error) {
      console.error('AI Generation Error:', error);

      // Return user-friendly error message
      if (error.message.includes('Failed to fetch')) {
        return "I'm having trouble connecting to the AI service. Is the backend server running?";
      } else if (error.message.includes('Authentication')) {
        return "There's an authentication issue with the AI service. Please check the API key.";
      } else {
        return "I encountered an error while generating a response. Please try again.";
      }
    }
  }

  /**
   * Get current conversation history
   * @returns {Array} - Array of message objects
   */
  function getHistory() {
    return [...conversationHistory];
  }

  /**
   * Clear conversation history
   */
  function clearHistory() {
    conversationHistory = [];
  }

  /**
   * Set a custom backend URL (for switching environments)
   * @param {string} url - New backend URL
   */
  function setBackendURL(url) {
    if (!url.startsWith('http')) {
      throw new Error('Invalid URL: must start with http:// or https://');
    }
    BACKEND_URL = url;
    console.log(`✅ Backend URL updated to: ${url}`);
  }

  /**
   * Check if backend is available
   * @returns {Promise<boolean>} - True if backend responds
   */
  async function checkHealth() {
    try {
      const response = await fetch(BACKEND_URL.replace('/api/chat', '/api/health'));
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  // ========================================
  // PRIVATE FUNCTIONS
  // ========================================

  /**
   * Add a message to conversation history
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   */
  function addToHistory(role, content) {
    conversationHistory.push({
      role: role,
      content: content
    });

    // Keep only recent messages to avoid token limit
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    }
  }

  // ========================================
  // EXPORT PUBLIC API
  // ========================================

  return {
    generate,
    getHistory,
    clearHistory,
    setBackendURL,
    checkHealth,
    // Expose config for debugging
    config: {
      get backendURL() { return BACKEND_URL; },
      get maxHistory() { return MAX_HISTORY; },
      get historyLength() { return conversationHistory.length; }
    }
  };

})();

// ========================================
// EXAMPLE USAGE (Remove after testing)
// ========================================

/*
// Check if backend is available on page load
window.addEventListener('load', async () => {
  const isHealthy = await aiChat.checkHealth();
  if (isHealthy) {
    console.log('✅ AI Backend is connected and ready');
  } else {
    console.warn('⚠️ AI Backend is not responding. Make sure to start the server!');
  }
});

// Example: Generate a response
async function testAI() {
  const response = await aiChat.generate('What SUVs do you have?');
  console.log('AI Response:', response);
}
*/
