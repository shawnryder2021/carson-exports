# Quick Start Guide - Carson Exports Chat

## 🎯 What's New

### ✅ Vehicle Selection Feature (Ready to Use)
When users search vehicles and see "#1 Mitsubishi RVR", they can:
- **Click** the numbered button, OR
- **Type** "#1" in chat

System displays detailed vehicle info with specs, price, mileage, and VIN.

**Status:** WORKING NOW - No setup required!

### ✨ AI Backend (Ready to Deploy)
Secure backend server for OpenAI integration
**Files created:** `ai-backend.js`, `ai-integration.js`, `package.json`

---

## ⚡ 5-Minute Setup

### Step 1: Regenerate API Key
🚨 **CRITICAL:** Your old key is compromised!
1. Go to: https://platform.openai.com/account/api-keys
2. Delete the old key (the one you shared)
3. Create a new one
4. Copy the new key

### Step 2: Install & Start Backend
```bash
cd "/Users/shawnryder/Claude Code/Carson Exports Chat"
npm install
cp .env.example .env
# Edit .env and paste your new API key
npm start
```

**Expected output:**
```
🚗 Carson Exports AI Backend running on http://localhost:3001
```

### Step 3: Test Backend
```bash
curl http://localhost:3001/api/health
# Should return: {"status":"ok",...}
```

### Step 4: Use in Chat (Optional)
Add to your `index.html`:
```html
<script src="ai-integration.js"></script>
```

Then in your chat functions:
```javascript
const response = await aiChat.generate("What vehicles do you have?");
```

---

## 📂 New Files Created

| File | Purpose |
|------|---------|
| `ai-backend.js` | Node.js backend server |
| `ai-integration.js` | Frontend JavaScript module |
| `package.json` | Dependencies list |
| `.env.example` | Configuration template |
| `AI_INTEGRATION_GUIDE.md` | Complete setup guide |
| `AI_INTEGRATION_EXAMPLE.html` | Interactive demo |
| `IMPLEMENTATION_SUMMARY.md` | Full technical details |
| `QUICK_START.md` | This file |

---

## 🚀 Deployment (Choose One)

### Option 1: Heroku (Easiest)
```bash
heroku login
heroku create carson-exports-ai
heroku config:set OPENAI_API_KEY=your_key_here
git push heroku main
```
Your URL: `https://carson-exports-ai.herokuapp.com/api/chat`

### Option 2: Railway.app (Recommended)
1. Push code to GitHub
2. Sign up at railway.app
3. Create project → Deploy from GitHub
4. Add env var: `OPENAI_API_KEY`
5. Done! URL provided automatically

### Option 3: Self-Hosted
Rent VPS ($5+/month), SSH in, clone repo, run `npm start`

---

## 🧪 Test Everything

### Test Backend
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "What SUVs do you have?",
    "messages": []
  }'
```

### Test Frontend Module
Open `AI_INTEGRATION_EXAMPLE.html` in browser (with backend running)

---

## 📋 Checklist

- [ ] Regenerate API key
- [ ] Run `npm install`
- [ ] Create `.env` file
- [ ] Add new API key to `.env`
- [ ] Run `npm start`
- [ ] Test health endpoint: `curl http://localhost:3001/api/health`
- [ ] Open `AI_INTEGRATION_EXAMPLE.html` to test
- [ ] Deploy backend (Heroku/Railway/VPS)
- [ ] Update `BACKEND_URL` in `ai-integration.js` for production
- [ ] Add `<script src="ai-integration.js"></script>` to HTML
- [ ] Update chat functions to use `aiChat.generate()`

---

## 🔧 Common Commands

```bash
# Install dependencies
npm install

# Start server (development)
npm start

# Start with auto-reload
npm run dev

# Check if server is running
curl http://localhost:3001/api/health

# Stop server
Ctrl + C
```

---

## 📞 Environment Variables

```
# .env file (create from .env.example)
OPENAI_API_KEY=sk-proj-your_new_key_here
PORT=3001
NODE_ENV=production
```

---

## ⚠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| `OPENAI_API_KEY not found` | Check `.env` file exists & has correct key |
| `401 Authentication failed` | Regenerate API key at openai.com |
| `Cannot find module 'express'` | Run `npm install` |
| `Port 3001 already in use` | Change `PORT` in `.env` or kill process: `lsof -i :3001` |
| `Backend not responding` | Make sure `npm start` is running |

---

## 💡 Usage Examples

### Example 1: Simple Response
```javascript
const response = await aiChat.generate("Do you have any SUVs?");
console.log(response); // AI-generated response
```

### Example 2: With Conversation History
```javascript
// First message
await aiChat.generate("What vehicles do you have?", true);

// Second message uses history for context
await aiChat.generate("Show me the SUVs", true);
```

### Example 3: Check if Backend is Ready
```javascript
const isOnline = await aiChat.checkHealth();
if (isOnline) {
  console.log("✅ Ready to use AI!");
}
```

### Example 4: Change Backend URL (for Production)
```javascript
aiChat.setBackendURL('https://your-domain.com/api/chat');
```

---

## 📚 More Info

- **Full setup guide:** Read `AI_INTEGRATION_GUIDE.md`
- **Technical details:** Read `IMPLEMENTATION_SUMMARY.md`
- **Try it out:** Open `AI_INTEGRATION_EXAMPLE.html` in browser
- **Code:** Check `ai-backend.js` and `ai-integration.js`

---

## ✨ Summary

**Vehicle Selection** = Done & working now
**AI Backend** = Ready to deploy in 5 minutes
**Security** = API key protected in backend

**Next Step:**
1. Regenerate your API key
2. Run `npm install && npm start`
3. Test with `AI_INTEGRATION_EXAMPLE.html`
4. Deploy to production when ready

---

**Questions?** See the detailed guides in the project folder!
