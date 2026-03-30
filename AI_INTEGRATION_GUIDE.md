# OpenAI Integration Guide for Carson Exports Chat

## Overview

This guide explains how to securely integrate OpenAI's API into your chat application using a backend server.

## Why Backend Integration?

**Security Issue:** The API key you provided in plain text is now **COMPROMISED** and must be regenerated immediately.

**Why Frontend API Keys Are Dangerous:**
- ❌ Exposed in browser network traffic
- ❌ Visible in browser console and DevTools
- ❌ Can be extracted from minified code
- ❌ Vulnerable to man-in-the-middle attacks
- ❌ Difficult to revoke without rebuilding the entire frontend

**The Solution:** Use a backend server that:
- ✅ Stores API key in environment variables (never exposed)
- ✅ Makes API calls server-to-server (secure)
- ✅ Returns only the generated response to frontend
- ✅ Can implement rate limiting and validation
- ✅ Easy to update/rotate keys without frontend changes

---

## Setup Instructions

### Step 1: Prepare Your System

```bash
cd "/Users/shawnryder/Claude Code/Carson Exports Chat"
```

### Step 2: Install Node.js Dependencies

```bash
# If you haven't installed Node.js yet:
# Download from https://nodejs.org/ (LTS recommended)

# Install dependencies
npm install
```

### Step 3: Create Environment File

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your NEW OpenAI API key
# ⚠️ IMPORTANT: Regenerate your API key first at:
# https://platform.openai.com/account/api-keys
```

**Your .env file should look like:**
```
OPENAI_API_KEY=sk-proj-your_new_regenerated_key_here
PORT=3001
NODE_ENV=production
```

### Step 4: Start the Backend Server

```bash
# Option 1: Simple start
npm start

# Option 2: Development with auto-reload
npm run dev
```

**Expected output:**
```
🚗 Carson Exports AI Backend running on http://localhost:3001
📝 Chat endpoint: POST http://localhost:3001/api/chat
✅ Health check: GET http://localhost:3001/api/health
```

---

## Frontend Integration

### Option A: Simple JavaScript Integration

Add this code to your `index.html` (in the `<script>` section):

```javascript
/**
 * Call OpenAI via secure backend
 * @param {string} userMessage - The user's message
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Promise<string>} - AI-generated response
 */
async function getAIResponse(userMessage, conversationHistory = []) {
  try {
    const response = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: conversationHistory,
        userMessage: userMessage
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate response');
    }

    const data = await response.json();
    return data.response;

  } catch (error) {
    console.error('AI Request Error:', error);
    return "Sorry, I'm having trouble connecting to the AI service. Please try again.";
  }
}
```

### Option B: Integration into processVehicleInterest()

You can enhance the bot responses by calling this function. For example:

```javascript
// In your processVehicleInterest or handleFreeText function
async function handleFreeText(text) {
  // ... existing code ...

  // Use AI for sophisticated responses
  if (chatState === 'vehicle_interest' && shouldUseAI) {
    showTyping(async () => {
      const aiResponse = await getAIResponse(text, conversationHistory);
      addBotMessage(aiResponse);
      showQuickReplies(['Book Test Drive', 'Ask More', 'Back to Menu']);
    });
  }
}
```

---

## Testing the Backend

### Health Check
```bash
curl http://localhost:3001/api/health
```

### Chat Request
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "What SUVs do you have in stock?",
    "messages": []
  }'
```

---

## Deployment Options

### Option 1: Heroku (Easy, Free Tier Available)

```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login to Heroku
heroku login

# Create app
heroku create carson-exports-ai

# Set environment variables
heroku config:set OPENAI_API_KEY=sk-proj-your_key_here

# Deploy
git push heroku main

# Your backend will be at: https://carson-exports-ai.herokuapp.com/api/chat
```

### Option 2: Railway.app (Recommended)

1. Push code to GitHub
2. Sign up at https://railway.app
3. Create new project → Deploy from GitHub repo
4. Add environment variable: `OPENAI_API_KEY`
5. Your backend URL will be provided automatically

### Option 3: AWS Lambda + API Gateway

Uses serverless architecture for cost-effective hosting.

### Option 4: Self-hosted (DigitalOcean, Linode, etc.)

1. Rent a VPS (~$5/month)
2. SSH into server
3. Clone repo, install Node, run `npm start`
4. Use PM2 for process management
5. Set up Nginx reverse proxy

---

## Frontend Update for Deployed Backend

Once your backend is deployed, update the backend URL in your frontend:

```javascript
// Replace localhost:3001 with your deployed URL
const BACKEND_URL = 'https://your-deployed-backend.com/api/chat';

async function getAIResponse(userMessage, conversationHistory = []) {
  const response = await fetch(BACKEND_URL, {
    // ... rest of code
  });
}
```

---

## Security Best Practices

1. **Never commit .env to git:**
   ```bash
   # Add to .gitignore
   .env
   .env.local
   ```

2. **Rotate API keys regularly:**
   - Regenerate at: https://platform.openai.com/account/api-keys
   - Update .env file
   - Restart server

3. **Monitor API usage:**
   - Check OpenAI dashboard for unauthorized usage
   - Set monthly spending limits

4. **Use HTTPS in production:**
   - Obtain SSL certificate (Let's Encrypt is free)
   - Never use HTTP for production

5. **Rate limiting (optional enhancement):**
   ```javascript
   // Add to backend for production
   const rateLimit = require('express-rate-limit');

   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });

   app.post('/api/chat', limiter, async (req, res) => {
     // ... handler
   });
   ```

---

## API Reference

### POST /api/chat

**Request:**
```json
{
  "userMessage": "What's your most popular sedan?",
  "messages": [
    {
      "role": "user",
      "content": "I'm looking for a sedan"
    },
    {
      "role": "assistant",
      "content": "We have several excellent sedans in stock..."
    }
  ]
}
```

**Response (Success):**
```json
{
  "response": "Our most popular sedan is the 2017 Honda Civic Si...",
  "timestamp": "2026-03-29T19:30:00.000Z"
}
```

**Response (Error):**
```json
{
  "error": "Authentication failed. Check your OpenAI API key."
}
```

---

## Troubleshooting

### "OPENAI_API_KEY not found"
- Check .env file exists in project root
- Verify key is set: `echo $OPENAI_API_KEY`
- Restart server after creating/updating .env

### "401 Authentication failed"
- Regenerate API key: https://platform.openai.com/account/api-keys
- Update .env with new key
- Restart server

### "429 Rate limit exceeded"
- OpenAI account rate limited
- Check your usage: https://platform.openai.com/account/billing/overview
- Upgrade plan if needed

### CORS errors
- Make sure `cors` package is installed
- Check that frontend and backend URLs are correct
- For production, configure CORS to specific domains

### Port 3001 already in use
```bash
# Change PORT in .env
PORT=3002

# Or kill existing process
lsof -i :3001
kill -9 <PID>
```

---

## Next Steps

1. ✅ **Regenerate your API key immediately**
2. ⬜ Set up backend server locally
3. ⬜ Test the /api/chat endpoint
4. ⬜ Integrate into frontend chat
5. ⬜ Deploy to production
6. ⬜ Monitor usage and costs

---

## Support

For issues with OpenAI API:
- Docs: https://platform.openai.com/docs
- Status: https://status.openai.com
- Support: https://help.openai.com

For Node.js/Express help:
- Express: https://expressjs.com
- Axios: https://axios-http.com
- Node.js: https://nodejs.org/docs

---

**Remember:** Never expose your API key in frontend code. Always use a secure backend!
