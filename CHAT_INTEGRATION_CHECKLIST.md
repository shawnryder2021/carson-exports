# Chat Widget Integration Checklist

## Environment Setup ✅

### Required Environment Variables
All environment variables are configured in `.env`:

- **OPENAI_API_KEY** ✅ - Valid API key (starts with `sk-`)
- **SUPABASE_URL** ✅ - Database connection
- **SUPABASE_ANON_KEY** ✅ - Authentication
- **VITE_SUPABASE_URL** ✅ - Frontend database access
- **VITE_SUPABASE_ANON_KEY** ✅ - Frontend authentication

Optional variables:
- **TWILIO_ACCOUNT_SID** - SMS features (disabled if not set)
- **TWILIO_AUTH_TOKEN** - SMS features (disabled if not set)
- **TWILIO_PHONE_NUMBER** - SMS features (disabled if not set)

## Backend Systems ✅

### Core Services
1. **Express Server** - Running on port 3001
2. **OpenAI Integration** - Connected and functional
3. **Supabase Database** - Connected for persistence
4. **Google Sheets Inventory** - Auto-syncs 99 vehicles
5. **CORS** - Enabled for cross-origin requests

### API Endpoints
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/health` | GET | System health check | ✅ |
| `/api/chat` | POST | AI chat responses | ✅ |
| `/api/settings` | GET | Dealership settings | ✅ |
| `/api/settings` | POST | Update settings | ✅ |
| `/api/personas` | GET/POST/PUT/DELETE | AI personas | ✅ |
| `/api/training-data` | GET/POST/PUT/DELETE | Training data | ✅ |
| `/chat-widget.js` | GET | Embeddable widget | ✅ |
| `/index.html` | GET | Admin dashboard | ✅ |

## Frontend Chat Widget ✅

### Auto-Detection
The widget automatically detects the server URL from:
1. Explicit `window.DealerAIConfig.serverUrl` if provided
2. The script's own `src` attribute
3. Falls back to `window.location.origin`

### Embed Code
To embed the widget on external websites, paste in `<head>`:

```html
<script>
window.DealerAIConfig = {
  serverUrl: "https://your-deployment-url.com",
  dealerName: "Carson Exports",
  primaryColor: "#1e6fff",
  position: "bottom-right",
  theme: "auto"
};
</script>
<script src="https://your-deployment-url.com/chat-widget.js" defer crossorigin="anonymous"></script>
```

The admin panel (at `/`) generates this code dynamically with `window.location.origin`.

## Chat Features ✅

### Core Functionality
- ✅ Natural language vehicle search
- ✅ Inventory browsing with vehicle cards
- ✅ AI-powered responses based on dealership settings
- ✅ Persona-based responses (Sales, Service, General)
- ✅ Page-aware context (reads current page info)
- ✅ Conversation history (sessionStorage persistence)
- ✅ Mobile responsive design

### Response Generation
1. **System Prompt** - Built with dealership settings + chat state
2. **Persona Injection** - Adds persona-specific instructions
3. **Inventory Context** - Includes relevant vehicles in prompt
4. **Page Context** - Adds current page info if embedded
5. **OpenAI Call** - Generates conversational response
6. **Vehicle Cards** - Frontend renders matching vehicles below response

## Deployment Considerations

### Domain/URL Changes
When deploying to a new domain:
1. The embed code **automatically updates** using `window.location.origin`
2. The chat widget **automatically detects** the correct server URL
3. No manual URL configuration needed

### CORS Requirements
✅ All API endpoints serve with CORS headers
✅ Static files include `Access-Control-Allow-Origin: *`
✅ POST requests work from any domain

### SSL/HTTPS
When deploying to production:
- Use HTTPS URLs in embed code
- Chat widget works with both HTTP and HTTPS
- Supabase requires HTTPS

### Environment Variables in Production
Make sure these are set in your deployment platform:
1. `OPENAI_API_KEY` (from OpenAI dashboard)
2. `SUPABASE_URL` (from Supabase settings)
3. `SUPABASE_ANON_KEY` (from Supabase settings)
4. `SUPABASE_SERVICE_ROLE_KEY` (optional, for admin functions)

## Testing Checklist

Before deployment, verify:

```bash
# 1. Backend health
curl http://localhost:3001/api/health

# 2. Chat with search
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"userMessage":"rav4","messages":[],"chatState":"inventory_search"}'

# 3. Widget script loads
curl http://localhost:3001/chat-widget.js

# 4. Settings save/load
curl http://localhost:3001/api/settings
```

## Troubleshooting

### Chat not responding
- Check OpenAI API key is valid
- Verify backend is running
- Check browser console for errors

### Widget not loading
- Verify `serverUrl` is correct and accessible
- Check CORS headers in network tab
- Ensure `chat-widget.js` is being served

### Vehicles not appearing
- Check Google Sheets inventory is up to date
- Verify search results in `/api/chat` response
- Ensure frontend has `vehicles` array in response

### Settings not persisting
- Verify Supabase connection
- Check database has `ce_settings` table
- Confirm RLS policies allow writes

## Production Deployment

1. **Set environment variables** in your hosting platform
2. **Build the project** - `npm run build`
3. **Deploy** - Use your platform's deployment process
4. **Copy embed code** from the admin panel at `/`
5. **Test** on external websites with embed code

The chat system is fully self-contained and will work immediately upon deployment.
