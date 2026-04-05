/**
 * Carson Exports — Embeddable AI Chat Widget
 *
 * Usage: Add to <head> of any website:
 *
 *   <script>
 *   window.DealerAIConfig = {
 *     serverUrl: "https://carsons.shawnryder.com",
 *     dealerName: "Carson Exports"
 *   };
 *   </script>
 *   <script src="https://carsons.shawnryder.com/chat-widget.js" defer crossorigin="anonymous"></script>
 *
 * Conversation persists across page navigation via sessionStorage.
 * Reads current page context to provide relevant, page-aware responses.
 */
(function() {
  'use strict';
  try {

  // =====================================================
  // 1. CONFIGURATION
  // =====================================================
  const userConfig = window.DealerAIConfig || {};

  // Auto-detect serverUrl from the script's own src if not provided
  function detectServerUrl() {
    if (userConfig.serverUrl) return userConfig.serverUrl.replace(/\/$/, '');
    const scripts = document.querySelectorAll('script[src*="chat-widget"]');
    for (const s of scripts) {
      try {
        const url = new URL(s.src);
        return url.origin;
      } catch(e) {}
    }
    console.warn('[DealerAI] Could not detect serverUrl — set window.DealerAIConfig.serverUrl');
    return '';
  }

  const CONFIG = {
    serverUrl:    detectServerUrl(),
    dealerName:   userConfig.dealerName   || 'Carson Exports',
    primaryColor: userConfig.primaryColor || '#1e6fff',
    position:     userConfig.position     || 'bottom-right',
    theme:        userConfig.theme        || 'light',
    greeting:     userConfig.greeting     || null
  };

  console.log('[DealerAI] Widget loading...', { serverUrl: CONFIG.serverUrl, dealerName: CONFIG.dealerName });

  const STORAGE = 'dealerAI_';

  // =====================================================
  // 2. STATE
  // =====================================================
  let chatOpen = false;
  let chatState = 'idle';
  let chatHistory = [];
  let currentLead = {};
  let selectedVehicle = null;
  let currentSettings = {};
  let proactiveTimer = null;
  let currentSessionId = null;
  let currentPersonaId = null;
  let lastActivityTime = null;
  let inactivityCheckInterval = null;

  // =====================================================
  // 3. FONT AWESOME LOADER
  // =====================================================
  function loadFontAwesome() {
    if (document.querySelector('link[href*="font-awesome"]') || document.querySelector('.fas')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
    document.head.appendChild(link);
  }

  // =====================================================
  // 4. GOOGLE FONTS
  // =====================================================
  function loadFont() {
    if (document.querySelector('link[href*="fonts.googleapis.com/css2?family=Inter"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap';
    document.head.appendChild(link);
  }

  // =====================================================
  // 5. CSS INJECTION
  // =====================================================
  function injectCSS() {
    const accent = CONFIG.primaryColor;
    const isLeft = CONFIG.position === 'bottom-left';
    const pos = isLeft ? 'left:1.5rem' : 'right:1.5rem';

    // Theme variables
    let lightVars = `--dai-primary:#0d2137;--dai-primary-light:#1a3a6b;--dai-accent:${accent};--dai-accent-hover:#0052e0;--dai-accent-glow:rgba(30,111,255,.15);--dai-bg:#f0f2f5;--dai-card:#fff;--dai-card-alt:#f8fafc;--dai-text:#1a1a2e;--dai-text-muted:#64748b;--dai-border:#e2e8f0;--dai-shadow:0 2px 12px rgba(0,0,0,.06);--dai-shadow-lg:0 8px 32px rgba(0,0,0,.10);--dai-radius:12px;--dai-radius-lg:16px;--dai-radius-sm:8px;--dai-chat-user:${accent};--dai-chat-bot:#f1f5f9;--dai-chat-bot-text:#1a1a2e`;
    let darkVars = `--dai-primary:#0a1628;--dai-primary-light:#162a4a;--dai-accent:${accent};--dai-accent-hover:#0052e0;--dai-accent-glow:rgba(30,111,255,.15);--dai-bg:#0a0f1e;--dai-card:#111827;--dai-card-alt:#1a2236;--dai-text:#f1f5f9;--dai-text-muted:#94a3b8;--dai-border:#1e293b;--dai-shadow:0 2px 12px rgba(0,0,0,.25);--dai-shadow-lg:0 8px 32px rgba(0,0,0,.4);--dai-radius:12px;--dai-radius-lg:16px;--dai-radius-sm:8px;--dai-chat-user:${accent};--dai-chat-bot:#1e293b;--dai-chat-bot-text:#f1f5f9`;

    let themeBlock = '';
    if (CONFIG.theme === 'dark') {
      themeBlock = `#dai-container{${darkVars}}`;
    } else if (CONFIG.theme === 'auto') {
      themeBlock = `#dai-container{${lightVars}} @media(prefers-color-scheme:dark){#dai-container{${darkVars}}}`;
    } else {
      themeBlock = `#dai-container{${lightVars}}`;
    }

    const css = `
${themeBlock}
#dai-container{font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5;box-sizing:border-box;position:relative;z-index:999990}
#dai-container *,#dai-container *::before,#dai-container *::after{box-sizing:border-box;margin:0;padding:0}

/* Bubble */
.dai-bubble{position:fixed;bottom:1.5rem;${pos};width:60px;height:60px;background:linear-gradient(135deg,var(--dai-accent),#4f8fff);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.5rem;box-shadow:0 4px 20px rgba(30,111,255,.4);cursor:pointer;z-index:999991;transition:all .3s;animation:daiPulse 2s infinite}
.dai-bubble:hover{transform:scale(1.08)}
@keyframes daiPulse{0%{box-shadow:0 0 0 0 rgba(30,111,255,.4)}70%{box-shadow:0 0 0 12px rgba(30,111,255,0)}100%{box-shadow:0 0 0 0 rgba(30,111,255,0)}}

/* Window */
.dai-window{position:fixed;bottom:1.5rem;${pos};width:400px;height:600px;max-height:calc(100vh - 80px);background:var(--dai-card);border-radius:var(--dai-radius-lg);box-shadow:var(--dai-shadow-lg);border:1px solid var(--dai-border);display:none;flex-direction:column;z-index:999992;overflow:hidden;animation:daiSlideUp .3s ease}
.dai-window.dai-open{display:flex}
@keyframes daiSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}

/* Header */
.dai-header{background:linear-gradient(135deg,var(--dai-primary),var(--dai-primary-light));color:#fff;padding:1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.dai-header-info{display:flex;align-items:center;gap:.75rem}
.dai-avatar{width:36px;height:36px;background:var(--dai-accent);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0}
.dai-header-text h4{font-size:.9rem;font-weight:600;margin:0;color:#fff}
.dai-header-text span{font-size:.7rem;opacity:.7}
.dai-close{background:none;border:none;color:#fff;font-size:1.1rem;opacity:.7;transition:opacity .2s;padding:.25rem;cursor:pointer}
.dai-close:hover{opacity:1}

/* Status */
.dai-status{padding:.4rem 1rem;font-size:.7rem;text-align:center;font-weight:500;flex-shrink:0;background:#dcfce7;color:#166534}

/* Messages */
.dai-messages{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.75rem;scroll-behavior:smooth}
.dai-msg{max-width:85%;display:flex;flex-direction:column;gap:.2rem;animation:daiFade .3s ease}
@keyframes daiFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.dai-msg.dai-bot{align-self:flex-start}
.dai-msg.dai-user{align-self:flex-end}
.dai-msg-bubble{padding:.75rem 1rem;border-radius:var(--dai-radius);font-size:.85rem;line-height:1.5;word-wrap:break-word}
.dai-msg.dai-bot .dai-msg-bubble{background:var(--dai-chat-bot);color:var(--dai-chat-bot-text);border-bottom-left-radius:4px}
.dai-msg.dai-user .dai-msg-bubble{background:var(--dai-chat-user);color:#fff;border-bottom-right-radius:4px}
.dai-msg-time{font-size:.65rem;color:var(--dai-text-muted);padding:0 .25rem}
.dai-msg.dai-user .dai-msg-time{text-align:right}

/* Vehicle Cards */
.dai-vcard{background:#fff;border-radius:10px;overflow:hidden;margin-top:.5rem;border:1px solid rgba(0,0,0,.1);box-shadow:0 2px 8px rgba(0,0,0,.1);min-width:200px}
.dai-vcard+.dai-vcard{margin-top:.5rem}
.dai-vcard-img{width:100%;height:140px;object-fit:cover;display:block;background:linear-gradient(135deg,#1a3a6b,#0d2137)}
.dai-vcard-body{padding:.7rem}
.dai-vcard-title{font-weight:700;font-size:.82rem;color:#1a1a2e;margin-bottom:.25rem;line-height:1.3}
.dai-vcard-meta{font-size:.7rem;color:#666;margin-bottom:.4rem;display:flex;gap:.6rem;flex-wrap:wrap}
.dai-vcard-price{font-size:.95rem;font-weight:800;color:var(--dai-accent);margin-bottom:.55rem}
.dai-vcard-actions{display:flex;gap:.35rem}
.dai-vca{flex:1;padding:.35rem .4rem;border-radius:6px;font-size:.72rem;font-weight:600;cursor:pointer;border:none;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:.25rem;font-family:inherit}
.dai-vca-primary{background:var(--dai-accent);color:#fff}
.dai-vca-primary:hover{background:#1555d4;color:#fff}
.dai-vca-outline{background:transparent;color:var(--dai-accent);border:1px solid var(--dai-accent)}
.dai-vca-outline:hover{background:var(--dai-accent);color:#fff}

/* Vehicle Link (compact) */
.dai-vlink{display:flex;align-items:center;justify-content:space-between;padding:.55rem .75rem;margin:.3rem 0;background:var(--dai-card-alt);border:1px solid var(--dai-border);border-radius:var(--dai-radius-sm);cursor:pointer;transition:background .2s}
.dai-vlink:hover{background:var(--dai-border)}

/* Quick Replies */
.dai-qr-container{display:flex;flex-wrap:wrap;gap:.4rem;padding:0 1rem .75rem;flex-shrink:0}
.dai-qr{background:var(--dai-accent-glow);color:var(--dai-accent);border:1.5px solid var(--dai-accent);padding:.4rem .85rem;border-radius:2rem;font-size:.78rem;font-weight:500;cursor:pointer;transition:all .2s;white-space:nowrap;font-family:inherit}
.dai-qr:hover{background:var(--dai-accent);color:#fff}

/* Input */
.dai-input-area{padding:.75rem;border-top:1px solid var(--dai-border);display:flex;gap:.5rem;background:var(--dai-card);flex-shrink:0}
.dai-input{flex:1;padding:.6rem .9rem;border:1.5px solid var(--dai-border);border-radius:2rem;font-size:.85rem;background:var(--dai-card-alt);color:var(--dai-text);outline:none;transition:border-color .2s;font-family:inherit}
.dai-input:focus{border-color:var(--dai-accent)}
.dai-send{width:38px;height:38px;border-radius:50%;background:var(--dai-accent);color:#fff;border:none;display:flex;align-items:center;justify-content:center;font-size:.9rem;transition:all .2s;cursor:pointer;flex-shrink:0}
.dai-send:hover{background:var(--dai-accent-hover)}

/* Typing */
.dai-typing{display:flex;gap:4px;padding:4px 0}
.dai-typing-dot{width:6px;height:6px;background:var(--dai-text-muted);border-radius:50%;animation:daiBounce 1.4s infinite}
.dai-typing-dot:nth-child(2){animation-delay:.2s}
.dai-typing-dot:nth-child(3){animation-delay:.4s}
@keyframes daiBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}

/* Mobile */
@media(max-width:480px){
  .dai-window{width:100%;height:100%;max-height:100vh;bottom:0;left:0;right:0;border-radius:0}
  .dai-bubble{bottom:1rem;${isLeft ? 'left:1rem' : 'right:1rem'}}
}

/* Links inside messages */
.dai-msg-bubble a{color:var(--dai-accent);font-weight:600;text-decoration:underline}
.dai-msg.dai-user .dai-msg-bubble a{color:#fff}
`;

    const style = document.createElement('style');
    style.id = 'dai-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // =====================================================
  // 6. HTML CONSTRUCTION
  // =====================================================
  function buildHTML() {
    const container = document.createElement('div');
    container.id = 'dai-container';

    container.innerHTML = `
      <div class="dai-bubble" id="dai-bubble">
        <i class="fas fa-comments"></i>
      </div>
      <div class="dai-window" id="dai-window">
        <div class="dai-header">
          <div class="dai-header-info">
            <div class="dai-avatar"><i class="fas fa-robot"></i></div>
            <div class="dai-header-text">
              <h4>${escapeHtml(CONFIG.dealerName)} AI</h4>
              <span id="dai-online-status">Online</span>
            </div>
          </div>
          <button class="dai-close" id="dai-close-btn"><i class="fas fa-times"></i></button>
        </div>
        <div class="dai-status" id="dai-status"><i class="fas fa-circle" style="font-size:.4rem;vertical-align:middle;color:#22c55e"></i> AI assistant available 24/7</div>
        <div class="dai-messages" id="dai-messages"></div>
        <div class="dai-qr-container" id="dai-qr"></div>
        <div class="dai-input-area">
          <input class="dai-input" id="dai-input" placeholder="Type your message..." autocomplete="off">
          <button class="dai-send" id="dai-send-btn"><i class="fas fa-paper-plane"></i></button>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // Event listeners
    document.getElementById('dai-bubble').addEventListener('click', toggleChat);
    document.getElementById('dai-close-btn').addEventListener('click', toggleChat);
    document.getElementById('dai-send-btn').addEventListener('click', sendUserMessage);
    document.getElementById('dai-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') sendUserMessage();
    });
  }

  // =====================================================
  // 7. SESSION PERSISTENCE
  // =====================================================
  function saveState() {
    try {
      sessionStorage.setItem(STORAGE + 'chatHistory', JSON.stringify(chatHistory));
      sessionStorage.setItem(STORAGE + 'chatState', chatState);
      sessionStorage.setItem(STORAGE + 'chatOpen', chatOpen ? '1' : '0');
      sessionStorage.setItem(STORAGE + 'messagesHTML', document.getElementById('dai-messages').innerHTML);
      sessionStorage.setItem(STORAGE + 'qrHTML', document.getElementById('dai-qr').innerHTML);
      if (selectedVehicle) sessionStorage.setItem(STORAGE + 'selectedVehicle', JSON.stringify(selectedVehicle));
      if (currentLead && Object.keys(currentLead).length) sessionStorage.setItem(STORAGE + 'currentLead', JSON.stringify(currentLead));
    } catch (e) { /* sessionStorage may be full or blocked */ }
  }

  function restoreState() {
    try {
      const hist = sessionStorage.getItem(STORAGE + 'chatHistory');
      const state = sessionStorage.getItem(STORAGE + 'chatState');
      const open = sessionStorage.getItem(STORAGE + 'chatOpen');
      const msgs = sessionStorage.getItem(STORAGE + 'messagesHTML');
      const qr = sessionStorage.getItem(STORAGE + 'qrHTML');
      const veh = sessionStorage.getItem(STORAGE + 'selectedVehicle');
      const lead = sessionStorage.getItem(STORAGE + 'currentLead');

      if (hist) chatHistory = JSON.parse(hist);
      if (state && state !== 'idle') chatState = state;
      if (veh) selectedVehicle = JSON.parse(veh);
      if (lead) currentLead = JSON.parse(lead);

      if (msgs && msgs.trim()) {
        document.getElementById('dai-messages').innerHTML = msgs;
        scrollMessages();
      }
      if (qr) {
        document.getElementById('dai-qr').innerHTML = qr;
        // Re-bind quick reply click handlers with { once: true } to prevent duplicate triggers
        document.querySelectorAll('#dai-qr .dai-qr').forEach(btn => {
          btn.addEventListener('click', function() { handleQuickReply(this.textContent); }, { once: true });
        });
      }

      // Re-bind vehicle card click handlers
      rebindVehicleHandlers();

      if (open === '1' && msgs && msgs.trim()) {
        chatOpen = true;
        document.getElementById('dai-window').classList.add('dai-open');
        document.getElementById('dai-bubble').style.display = 'none';
      }
    } catch (e) { /* ignore restore errors */ }
  }

  function rebindVehicleHandlers() {
    document.querySelectorAll('#dai-messages [data-dai-vehicle]').forEach(el => {
      // Remove any existing handler first to prevent duplicates
      if (el._daiVehicleHandler) {
        el.removeEventListener('click', el._daiVehicleHandler);
      }
      // Create and store new handler
      el._daiVehicleHandler = function(e) {
        if (e.target.tagName === 'A') return;
        try {
          const v = JSON.parse(this.getAttribute('data-dai-vehicle'));
          selectVehicle(v);
        } catch(err) {}
      };
      el.addEventListener('click', el._daiVehicleHandler);
    });
  }

  // =====================================================
  // 8. PAGE CONTEXT EXTRACTION
  // =====================================================
  function getPageContext() {
    const ctx = {
      url: window.location.href,
      title: document.title,
      description: '',
      headings: [],
      vehicleInfo: null,
      pageType: 'other'
    };

    // Meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) ctx.description = (metaDesc.content || '').slice(0, 300);

    // OG tags as fallback
    if (!ctx.description) {
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ctx.description = (ogDesc.content || '').slice(0, 300);
    }

    // Headings
    const h1s = document.querySelectorAll('h1');
    const h2s = document.querySelectorAll('h2');
    h1s.forEach((h, i) => { if (i < 3) ctx.headings.push(h.textContent.trim().slice(0, 100)); });
    h2s.forEach((h, i) => { if (i < 3) ctx.headings.push(h.textContent.trim().slice(0, 100)); });

    // Try JSON-LD structured data
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        items.forEach(item => {
          if (item['@type'] && /vehicle|car|auto|product/i.test(item['@type'])) {
            ctx.vehicleInfo = {
              name: item.name || '',
              price: item.offers?.price || item.price || '',
              description: (item.description || '').slice(0, 200),
              brand: item.brand?.name || item.brand || '',
              model: item.model || '',
              year: item.vehicleModelDate || item.modelDate || '',
              vin: item.vehicleIdentificationNumber || '',
              mileage: item.mileageFromOdometer?.value || ''
            };
          }
        });
      } catch (e) {}
    });

    // Heuristic vehicle detection from page content
    if (!ctx.vehicleInfo) {
      // Check for price elements
      const priceEl = document.querySelector('[class*="price"],[id*="price"],[itemprop="price"]');
      // Check for VIN
      const bodyText = document.body?.innerText || '';
      const vinMatch = bodyText.match(/\bVIN[:\s]*([A-HJ-NPR-Z0-9]{17})\b/i);
      // Check for year/make/model in h1
      const h1Text = document.querySelector('h1')?.textContent || '';
      const ymmMatch = h1Text.match(/\b(19|20)\d{2}\s+\w+\s+\w+/);

      if (ymmMatch || vinMatch || priceEl) {
        ctx.vehicleInfo = {};
        if (ymmMatch) ctx.vehicleInfo.name = ymmMatch[0];
        if (vinMatch) ctx.vehicleInfo.vin = vinMatch[1];
        if (priceEl) ctx.vehicleInfo.price = priceEl.textContent.trim().slice(0, 30);
      }
    }

    // Page type detection
    const path = window.location.pathname.toLowerCase();
    const url = window.location.href.toLowerCase();
    if (ctx.vehicleInfo) {
      ctx.pageType = 'vehicle-detail';
    } else if (/inventory|vehicles|cars|listings|stock/.test(path)) {
      ctx.pageType = 'inventory';
    } else if (path === '/' || path === '/index' || /home/i.test(path)) {
      ctx.pageType = 'home';
    } else if (/financ|credit|loan|payment/.test(path)) {
      ctx.pageType = 'financing';
    } else if (/service|maintenance|repair/.test(path)) {
      ctx.pageType = 'service';
    } else if (/about|team|staff/.test(path)) {
      ctx.pageType = 'about';
    } else if (/contact|direction|location|hours/.test(path)) {
      ctx.pageType = 'contact';
    } else if (/trade|exchange|evaluation/.test(url)) {
      ctx.pageType = 'trade-in';
    }

    return ctx;
  }

  // =====================================================
  // 9. API COMMUNICATION
  // =====================================================
  async function loadSettings() {
    if (!CONFIG.serverUrl) return;
    try {
      const res = await fetch(CONFIG.serverUrl + '/api/settings');
      if (res.ok) {
        currentSettings = await res.json();
      }
    } catch (e) { /* server may not be reachable */ }
  }

  async function callAI(userMessage, state, vehicleQuery) {
    try {
      lastActivityTime = Date.now();
      const res = await fetch(CONFIG.serverUrl + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory.slice(-12),
          userMessage,
          chatState: state || chatState,
          vehicleQuery: vehicleQuery || userMessage,
          dealershipSettings: currentSettings,
          pageContext: getPageContext(),
          personaId: currentPersonaId
        })
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      if (data.persona) {
        currentPersonaId = data.persona.id;
      }
      return {
        response: data.response || "I'd be happy to help! What can I assist you with?",
        vehicles: data.vehicles || []
      };
    } catch (e) {
      console.warn('DealerAI: API call failed:', e.message);
      return {
        response: "I'd be happy to help! You can ask me about our vehicles, hours, financing, or book an appointment.",
        vehicles: []
      };
    }
  }

  async function sendConversationWebhook() {
    if (!CONFIG.serverUrl || !currentSessionId) return;
    try {
      const webhookUrl = currentSettings.webhookUrl;
      if (!webhookUrl) return;

      await fetch(CONFIG.serverUrl + '/api/send-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          webhookUrl: webhookUrl
        })
      });
    } catch (e) {
      console.warn('DealerAI: Webhook send failed:', e.message);
    }
  }

  function startInactivityTimer() {
    if (inactivityCheckInterval) clearInterval(inactivityCheckInterval);
    lastActivityTime = Date.now();
    inactivityCheckInterval = setInterval(() => {
      if (chatOpen && lastActivityTime && Date.now() - lastActivityTime > 10 * 60 * 1000) {
        sendConversationWebhook();
        clearInterval(inactivityCheckInterval);
        inactivityCheckInterval = null;
      }
    }, 30000);
  }

  function stopInactivityTimer() {
    if (inactivityCheckInterval) {
      clearInterval(inactivityCheckInterval);
      inactivityCheckInterval = null;
    }
  }

  async function submitLeadToServer() {
    if (!CONFIG.serverUrl) return;
    try {
      await fetch(CONFIG.serverUrl + '/api/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentLead.name,
          email: currentLead.email,
          phone: currentLead.phone,
          department: currentLead.department,
          date: currentLead.date,
          time: currentLead.time,
          vehicleInterest: currentLead.vehicleInterest,
          source: 'Chat Widget',
          pageContext: getPageContext()
        })
      });
    } catch (e) {
      console.warn('DealerAI: Lead submission failed:', e.message);
    }
  }

  // =====================================================
  // 10. UTILITY FUNCTIONS
  // =====================================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function scrollMessages() {
    const el = document.getElementById('dai-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function getMenuReplies() {
    if (currentSettings.quickReplies) {
      const lines = currentSettings.quickReplies.split('\n').filter(l => l.trim());
      if (lines.length) return lines;
    }
    return ['Book a Service Appointment', 'Ask About a Vehicle', 'Speak With Sales', 'Check Inventory', 'Get Trade-In Value'];
  }

  function getPostReplies() {
    if (currentSettings.postReplies) {
      const lines = currentSettings.postReplies.split('\n').filter(l => l.trim());
      if (lines.length) return lines;
    }
    return ['Book a Service Appointment', 'Ask About a Vehicle', 'Check Inventory', 'Get Trade-In Value'];
  }

  function selectVehicle(v) {
    selectedVehicle = v;
    saveState();
  }

  // =====================================================
  // 11. CHAT UI FUNCTIONS
  // =====================================================
  function toggleChat() {
    chatOpen = !chatOpen;
    const win = document.getElementById('dai-window');
    const bubble = document.getElementById('dai-bubble');
    if (chatOpen) {
      if (proactiveTimer) { clearTimeout(proactiveTimer); proactiveTimer = null; }
      win.classList.add('dai-open');
      bubble.style.display = 'none';
      if (chatState === 'idle') startChat();
      startInactivityTimer();
      document.getElementById('dai-input').focus();
    } else {
      win.classList.remove('dai-open');
      bubble.style.display = 'flex';
      stopInactivityTimer();
      if (chatHistory.length > 0) {
        sendConversationWebhook();
      }
      // If user closes a proactively-opened chat, mark as dismissed
      if (sessionStorage.getItem(STORAGE + 'proactiveFired')) {
        sessionStorage.setItem(STORAGE + 'proactiveDismissed', '1');
      }
    }
    saveState();
  }

  function startChat() {
    const pageCtx = getPageContext();
    let greeting = CONFIG.greeting || `Hi! Welcome to <strong>${escapeHtml(CONFIG.dealerName)}</strong>. I'm your AI assistant and I'm here to help.\n\nWhat can I do for you today?`;

    currentSessionId = 'ses_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // If user is on a vehicle page, customize greeting
    if (pageCtx.pageType === 'vehicle-detail' && pageCtx.vehicleInfo) {
      const vName = pageCtx.vehicleInfo.name || pageCtx.title;
      greeting = `Hi! I see you're looking at the <strong>${escapeHtml(vName)}</strong>. Great choice!\n\nI can help you with details, pricing, financing, or booking a test drive. What would you like to know?`;
    } else if (pageCtx.pageType === 'inventory') {
      greeting = `Hi! Welcome to <strong>${escapeHtml(CONFIG.dealerName)}</strong>. I see you're browsing our inventory.\n\nLooking for something specific? I can help you find the perfect vehicle!`;
    } else if (pageCtx.pageType === 'financing') {
      greeting = `Hi! Welcome to <strong>${escapeHtml(CONFIG.dealerName)}</strong>. I can help answer your financing questions.\n\nWhat would you like to know?`;
    } else if (pageCtx.pageType === 'service') {
      greeting = `Hi! Welcome to <strong>${escapeHtml(CONFIG.dealerName)}</strong>. Need to book a service appointment or have questions about maintenance?\n\nI'm here to help!`;
    } else if (pageCtx.pageType === 'trade-in') {
      greeting = `Hi! Welcome to <strong>${escapeHtml(CONFIG.dealerName)}</strong>. I see you're interested in trading in your vehicle.\n\nI can help you get started with a trade-in evaluation!`;
    }

    // Override with custom proactive message if set and this was a proactive open
    if (currentSettings.proactiveMessage && currentSettings.proactiveMessage.trim() && sessionStorage.getItem(STORAGE + 'proactiveFired')) {
      greeting = currentSettings.proactiveMessage.replace(/\{dealerName\}/g, escapeHtml(CONFIG.dealerName));
    }

    showTyping(() => {
      addBotMessage(greeting);
      chatState = 'menu';
      currentLead = { source: 'Chat Widget', submittedAt: new Date().toISOString() };
      showQuickReplies(getMenuReplies());
    });
  }

  function sendUserMessage() {
    const input = document.getElementById('dai-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    chatHistory.push({ role: 'user', content: text });
    addUserMessage(text);
    clearQuickReplies();
    processMessage(text);
  }

  function handleQuickReply(text) {
    chatHistory.push({ role: 'user', content: text });
    addUserMessage(text);
    clearQuickReplies();
    processMessage(text);
  }

  function linkifyUrls(text) {
    return text.replace(/(https?:\/\/[^\s<>"']+)/g, function(url, _, offset) {
      const before = text.substring(Math.max(0, offset - 10), offset);
      if (/href=["']$/.test(before) || /href=["']/.test(before)) return url;
      return `<a href="${url}" target="_blank" rel="noopener" style="color:var(--dai-accent);word-break:break-all">${url}</a>`;
    });
  }

  function addBotMessage(html) {
    const plainText = html.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim();
    if (plainText) chatHistory.push({ role: 'assistant', content: plainText });

    html = linkifyUrls(html);

    const msgs = document.getElementById('dai-messages');
    const div = document.createElement('div');
    div.className = 'dai-msg dai-bot';
    div.innerHTML = `<div class="dai-msg-bubble">${html.replace(/\n/g, '<br>')}</div><div class="dai-msg-time">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>`;
    msgs.appendChild(div);
    scrollMessages();
    saveState();
  }

  function addUserMessage(text) {
    const msgs = document.getElementById('dai-messages');
    const div = document.createElement('div');
    div.className = 'dai-msg dai-user';
    const textNode = document.createElement('div');
    textNode.className = 'dai-msg-bubble';
    textNode.textContent = text;
    div.appendChild(textNode);
    const timeDiv = document.createElement('div');
    timeDiv.className = 'dai-msg-time';
    timeDiv.textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    div.appendChild(timeDiv);
    msgs.appendChild(div);
    scrollMessages();
    saveState();
  }

  function showTyping(callback) {
    const msgs = document.getElementById('dai-messages');
    const div = document.createElement('div');
    div.className = 'dai-msg dai-bot';
    div.id = 'dai-typing';
    div.innerHTML = '<div class="dai-msg-bubble"><div class="dai-typing"><div class="dai-typing-dot"></div><div class="dai-typing-dot"></div><div class="dai-typing-dot"></div></div></div>';
    msgs.appendChild(div);
    scrollMessages();
    setTimeout(() => {
      const el = document.getElementById('dai-typing');
      if (el) el.remove();
      callback();
    }, 800 + Math.random() * 600);
  }

  function showQuickReplies(options) {
    const container = document.getElementById('dai-qr');
    container.innerHTML = options.map(opt =>
      `<button class="dai-qr">${escapeHtml(opt)}</button>`
    ).join('');
    // Bind click handlers with { once: true } to prevent duplicate triggers
    container.querySelectorAll('.dai-qr').forEach(btn => {
      btn.addEventListener('click', function() { handleQuickReply(this.textContent); }, { once: true });
    });
    saveState();
  }

  function clearQuickReplies() {
    document.getElementById('dai-qr').innerHTML = '';
  }

  function suggestDates() {
    const dates = [];
    const now = new Date();
    for (let i = 1; i <= 5; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      if (d.getDay() !== 0) {
        dates.push(d.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'}));
      }
    }
    showQuickReplies(dates.slice(0, 4));
  }

  // =====================================================
  // 12. VEHICLE CARD RENDERING
  // =====================================================
  function chatVehicleCard(v) {
    const img = v.image
      ? `<img class="dai-vcard-img" src="${escapeHtml(v.image)}" alt="${escapeHtml(v.title)}" onerror="this.style.display='none'">`
      : `<div class="dai-vcard-img" style="display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.3);font-size:2rem"><i class="fas fa-car"></i></div>`;
    const link = v.link ? `<a href="${escapeHtml(v.link)}" target="_blank" rel="noopener" class="dai-vca dai-vca-outline"><i class="fas fa-external-link-alt"></i> View</a>` : '';
    const vData = escapeHtml(JSON.stringify(v));
    return `<div class="dai-vcard" data-dai-vehicle='${vData}'>
      ${img}
      <div class="dai-vcard-body">
        <div class="dai-vcard-title">${escapeHtml(v.title || [v.year, v.make, v.model].filter(Boolean).join(' '))}</div>
        <div class="dai-vcard-meta">${v.mileage ? '<span>' + Number(v.mileage).toLocaleString() + ' km</span>' : ''}${v.bodyStyle ? '<span>' + escapeHtml(v.bodyStyle) + '</span>' : ''}</div>
        <div class="dai-vcard-price">$${Number(v.price).toLocaleString()} CAD</div>
        <div class="dai-vcard-actions">
          <button class="dai-vca dai-vca-primary" onclick="event.stopPropagation();document.getElementById('dai-input').value='I want to book a test drive for the ${escapeHtml((v.title||'').replace(/'/g,''))}';document.getElementById('dai-send-btn').click()"><i class="fas fa-calendar"></i> Book Drive</button>
          ${link}
        </div>
      </div>
    </div>`;
  }

  function chatVehicleLink(v) {
    const link = v.link ? `<a href="${escapeHtml(v.link)}" target="_blank" rel="noopener" style="color:var(--dai-accent);font-weight:600;text-decoration:none;font-size:.75rem"><i class="fas fa-external-link-alt"></i> View</a>` : '';
    const vData = escapeHtml(JSON.stringify(v));
    return `<div class="dai-vlink" data-dai-vehicle='${vData}'>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.year} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</div>
        <div style="font-size:.72rem;color:var(--dai-text-muted)">${v.mileage ? Number(v.mileage).toLocaleString() + ' km' : ''}${v.bodyStyle ? ' · ' + escapeHtml(v.bodyStyle) : ''}</div>
      </div>
      <div style="text-align:right;margin-left:.75rem;flex-shrink:0">
        <div style="font-weight:700;color:var(--dai-accent);font-size:.85rem">$${Number(v.price).toLocaleString()}</div>
        ${link}
      </div>
    </div>`;
  }

  function showAIResponseWithCards(ai, quickReplies) {
    let msg = ai.response;
    if (ai.vehicles && ai.vehicles.length > 0) {
      if (ai.vehicles.length === 1) {
        msg += '\n\n' + chatVehicleCard(ai.vehicles[0]);
      } else {
        const show = ai.vehicles.slice(0, 5);
        msg += '\n\n' + show.map(v => chatVehicleLink(v)).join('');
        if (ai.vehicles.length > 5) {
          msg += `<div style="font-size:.72rem;color:#666;padding:.3rem 0">...and <strong>${ai.vehicles.length - 5} more</strong> in stock</div>`;
        }
      }
      selectedVehicle = ai.vehicles[0];
      chatState = 'vehicle_interest';
    }
    addBotMessage(msg);
    showQuickReplies(quickReplies);
    // Rebind vehicle click handlers on newly added cards
    rebindVehicleHandlers();
  }

  // =====================================================
  // 13. MESSAGE PROCESSING (STATE MACHINE)
  // =====================================================
  function processMessage(text) {
    // Handle appointment confirmation
    if (chatState === 'appt_confirm' && window._daiConfirmHandler) {
      window._daiConfirmHandler(text);
      return;
    }

    const lower = text.toLowerCase();

    switch (chatState) {
      case 'menu':
        processMenuChoice(lower, text);
        break;
      case 'inventory_search':
        processInventorySearch(text);
        break;
      case 'vehicle_interest':
        processVehicleInterest(lower, text);
        break;
      case 'appt_name':
        currentLead.name = text;
        showTyping(() => { addBotMessage("Thanks, " + escapeHtml(text.split(' ')[0]) + "! What's the best <strong>phone number</strong> to reach you?"); chatState = 'appt_phone'; saveState(); });
        break;
      case 'appt_phone':
        currentLead.phone = text;
        showTyping(() => { addBotMessage("Got it. And your <strong>email address</strong>?"); chatState = 'appt_email'; saveState(); });
        break;
      case 'appt_email':
        currentLead.email = text;
        if (!currentLead.department) {
          showTyping(() => { addBotMessage("Is this for <strong>Service</strong> or <strong>Sales</strong>?"); chatState = 'appt_dept'; showQuickReplies(['Service', 'Sales']); saveState(); });
        } else {
          showTyping(() => { addBotMessage("What <strong>date</strong> works best for your appointment?"); chatState = 'appt_date'; suggestDates(); saveState(); });
        }
        break;
      case 'appt_dept':
        currentLead.department = lower.includes('service') ? 'Service' : 'Sales';
        showTyping(() => { addBotMessage("Perfect. What <strong>date</strong> works best for you?"); chatState = 'appt_date'; suggestDates(); saveState(); });
        break;
      case 'appt_date':
        currentLead.date = text;
        showTyping(() => { addBotMessage("And what <strong>time</strong> would you prefer?"); chatState = 'appt_time'; showQuickReplies(['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM']); saveState(); });
        break;
      case 'appt_time':
        currentLead.time = text;
        showTyping(() => { showAppointmentConfirmation(); });
        break;
      case 'complete':
        showTyping(() => { addBotMessage("Is there anything else I can help you with?"); chatState = 'menu'; showQuickReplies(getPostReplies()); saveState(); });
        break;
      default:
        showTyping(() => { handleFreeText(text); });
    }
  }

  function processMenuChoice(choice, originalText) {
    if (choice.includes('service') || choice.includes('book')) {
      currentLead = { source: 'Chat Widget', department: 'Service', submittedAt: new Date().toISOString() };
      showTyping(() => {
        addBotMessage("I'd be happy to help you book a service appointment! Let's get your details.\n\nWhat's your <strong>full name</strong>?");
        chatState = 'appt_name';
        saveState();
      });
    } else if (choice.includes('vehicle') || choice.includes('ask')) {
      showTyping(() => {
        addBotMessage("I'd love to help you find the right vehicle!\n\nWhat are you looking for? You can tell me a:\n- <strong>Make/model</strong> (e.g., Toyota RAV4)\n- <strong>Type</strong> (SUV, sedan, truck)\n- <strong>Budget</strong> (e.g., under $30K)\n- Or just describe what you need!");
        chatState = 'inventory_search';
        saveState();
      });
    } else if (choice.includes('sales') || choice.includes('speak')) {
      currentLead = { source: 'Chat Widget', department: 'Sales', submittedAt: new Date().toISOString() };
      showTyping(() => {
        addBotMessage("I'll connect you with our sales team! First, let me grab your info.\n\nWhat's your <strong>full name</strong>?");
        chatState = 'appt_name';
        saveState();
      });
    } else if (choice.includes('inventory') || choice.includes('check')) {
      showTyping(async () => {
        const ai = await callAI('Show me your full inventory overview', 'inventory_search');
        chatState = 'inventory_search';
        if (ai.vehicles.length > 0) {
          showAIResponseWithCards(ai, ['SUVs', 'Sedans', 'Trucks', 'Under $30K', 'Show me everything']);
        } else {
          addBotMessage(ai.response || "We have a great selection of vehicles! What type are you interested in?");
          showQuickReplies(['SUVs', 'Sedans', 'Trucks', 'Under $30K', 'Show me everything']);
        }
        saveState();
      });
    } else if (choice.includes('trade')) {
      const tradeUrl = currentSettings.tradeInUrl || 'https://www.carsonexports.com/en/form/exchange-evaluation-new/4';
      showTyping(() => {
        addBotMessage(`Great! We'd love to help you get a value for your trade-in.\n\nYou can submit your vehicle details for a free evaluation using our online form:\n\n<a href="${tradeUrl}" target="_blank" rel="noopener">Submit Trade-In Evaluation</a>\n\nOur team will review your submission and get back to you with a fair market value.\n\nHave questions about the process? Just ask!`);
        showQuickReplies(['Browse Inventory', 'Book a Test Drive', 'Ask Another Question', 'Back to Menu']);
        saveState();
      });
    } else {
      handleFreeText(originalText || choice);
    }
  }

  function processInventorySearch(text) {
    showTyping(async () => {
      const ai = await callAI(text, 'inventory_search');
      if (ai.vehicles.length > 0) {
        showAIResponseWithCards(ai, ai.vehicles.length === 1
          ? ['Book a Test Drive', 'See Similar Vehicles', 'Back to Menu']
          : [...ai.vehicles.slice(0, 3).map(v => `${v.year} ${v.make} ${v.model}`), 'Back to Menu']
        );
      } else {
        addBotMessage(ai.response);
        showQuickReplies(['Speak With Sales', 'Back to Menu']);
      }
      saveState();
    });
  }

  function processVehicleInterest(lower, text) {
    if (lower.includes('test drive') || lower.includes('book')) {
      currentLead = { source: 'Chat Widget', department: 'Sales', submittedAt: new Date().toISOString() };
      if (selectedVehicle) currentLead.vehicleInterest = selectedVehicle.title;
      showTyping(() => {
        addBotMessage("Excellent! Let's get you booked for a test drive" + (selectedVehicle ? " of the <strong>" + escapeHtml(selectedVehicle.title) + "</strong>" : "") + ".\n\nWhat's your <strong>full name</strong>?");
        chatState = 'appt_name';
        saveState();
      });
    } else if (lower.includes('similar') || lower.includes('more')) {
      chatState = 'inventory_search';
      if (selectedVehicle) {
        processInventorySearch(selectedVehicle.bodyStyle || selectedVehicle.make);
      }
    } else if (lower.includes('detail') || lower.includes('more info')) {
      if (selectedVehicle) {
        showTyping(async () => {
          const vehicleContext = `Tell me more details about the ${selectedVehicle.title} priced at $${Number(selectedVehicle.price).toLocaleString()} CAD`;
          const ai = await callAI(vehicleContext, 'vehicle_interest', text);
          addBotMessage(ai.response);
          showQuickReplies(['Book a Test Drive', 'Ask About Financing', 'Back to Menu']);
          saveState();
        });
      }
    } else if (lower.includes('menu') || lower.includes('back')) {
      chatState = 'menu';
      showTyping(() => {
        addBotMessage("No problem! What else can I help you with?");
        showQuickReplies(getMenuReplies());
        saveState();
      });
    } else if (/\b(link|url|listing|send.*(it|me|link)|where.*(find|see|view)|share)\b/i.test(lower) && selectedVehicle && selectedVehicle.link) {
      showTyping(() => {
        addBotMessage(`Here's the link to the <strong>${escapeHtml(selectedVehicle.title)}</strong>:\n\n<a href="${escapeHtml(selectedVehicle.link)}" target="_blank" rel="noopener">${escapeHtml(selectedVehicle.link)}</a>`);
        showQuickReplies(['Book a Test Drive', 'Ask About Financing', 'See Similar Vehicles', 'Back to Menu']);
        saveState();
      });
    } else {
      // Free-form question about the vehicle — route through AI
      const isNonVehicleTopic = /\b(financ|loan|payment|apr|interest rate|credit|lease|trade.?in|warranty|service|hour|price match|insur|registr)\b/i.test(lower);
      const isVehicleQuery = !isNonVehicleTopic && /\b(cars?|vehicles?|suvs?|sedans?|trucks?|vans?|autos?|inventory|stock|available)\b/i.test(lower);

      showTyping(async () => {
        const vehicleContext = selectedVehicle
          ? `The customer is looking at a ${selectedVehicle.title} priced at $${Number(selectedVehicle.price).toLocaleString()} CAD. `
          : '';
        const ai = await callAI(vehicleContext + text, 'vehicle_interest', text);
        if (isVehicleQuery && ai.vehicles.length > 0) {
          chatState = 'inventory_search';
          showAIResponseWithCards(ai, ['Book a Test Drive', 'Browse Inventory', 'Back to Menu']);
        } else {
          addBotMessage(ai.response);
          showQuickReplies(['Browse Inventory', 'Book a Test Drive', 'Ask Another Question', 'Back to Menu']);
        }
        saveState();
      });
    }
  }

  function handleFreeText(text) {
    const lower = text.toLowerCase();
    const isNonVehicleTopic = /\b(financ|loan|payment|apr|interest rate|credit|lease|trade.?in|warranty|service|hour|price match|insur|registr)\b/i.test(lower);
    const isVehicleQuery = !isNonVehicleTopic && /\b(cars?|vehicles?|suvs?|sedans?|trucks?|vans?|autos?|toyotas?|fords?|hondas?|nissans?|hyundais?|audis?|bmws?|kias?|mazdas?|chevrolets?|rams?|volkswagens?|inventory|stock|available|civic|altima|rav4|camry|corolla|tucson|tiguan|kicks|qashqai|elantra|explorer)\b/i.test(lower);

    showTyping(async () => {
      const state = chatState === 'idle' ? 'menu' : chatState;
      const ai = await callAI(text, state);
      if (isVehicleQuery && ai.vehicles.length > 0) {
        chatState = 'inventory_search';
        showAIResponseWithCards(ai, ['Book a Test Drive', 'Browse Inventory', 'Back to Menu']);
      } else {
        addBotMessage(ai.response);
        showQuickReplies(['Browse Inventory', 'Book a Test Drive', 'Ask Another Question', 'Back to Menu']);
      }
      saveState();
    });
  }

  // =====================================================
  // 14. APPOINTMENT CONFIRMATION
  // =====================================================
  function showAppointmentConfirmation() {
    const name = escapeHtml(currentLead.name || 'Customer');
    const dept = currentLead.department || 'Sales';
    const date = escapeHtml(currentLead.date || 'TBD');
    const time = escapeHtml(currentLead.time || 'TBD');
    const vehicle = currentLead.vehicleInterest ? `\n- <strong>Vehicle:</strong> ${escapeHtml(currentLead.vehicleInterest)}` : '';

    addBotMessage(`Great! Here's your appointment summary:\n\n- <strong>Name:</strong> ${name}\n- <strong>Department:</strong> ${dept}\n- <strong>Date:</strong> ${date}\n- <strong>Time:</strong> ${time}${vehicle}\n\nShall I confirm this appointment?`);
    chatState = 'appt_confirm';
    showQuickReplies(['Confirm Appointment', 'Change Details', 'Cancel']);
    saveState();

    window._daiConfirmHandler = function(text) {
      const l = text.toLowerCase();
      if (l.includes('confirm') || l.includes('yes') || l.includes('book')) {
        addBotMessage(`<strong>Your appointment request has been submitted!</strong>\n\nOur team will confirm your appointment shortly. You'll receive a confirmation via email.\n\nThank you for choosing ${escapeHtml(CONFIG.dealerName)}!`);
        submitLeadToServer();
        chatState = 'complete';
        showQuickReplies(['Start New Inquiry']);
      } else if (l.includes('change')) {
        addBotMessage("No problem! Let's update your details. What's your <strong>full name</strong>?");
        chatState = 'appt_name';
      } else if (l.includes('cancel')) {
        addBotMessage("Appointment cancelled. Is there anything else I can help with?");
        chatState = 'menu';
        showQuickReplies(getPostReplies());
      }
      window._daiConfirmHandler = null;
      saveState();
    };
  }

  // =====================================================
  // 15. PROACTIVE CHAT TRIGGER
  // =====================================================
  function setupProactiveTrigger() {
    // Guard: only if enabled in settings
    if (!currentSettings.proactiveEnabled) return;
    // Guard: don't re-trigger if already fired this session
    if (sessionStorage.getItem(STORAGE + 'proactiveFired')) return;
    // Guard: don't trigger if chat is already open or conversation already started
    if (chatOpen || chatState !== 'idle') return;
    // Guard: don't trigger if user dismissed proactive this session
    if (sessionStorage.getItem(STORAGE + 'proactiveDismissed')) return;

    const delay = (parseInt(currentSettings.proactiveDelay, 10) || 15) * 1000;
    console.log('[DealerAI] Proactive trigger armed — will fire in ' + (delay / 1000) + 's');

    proactiveTimer = setTimeout(() => {
      // Re-check guards at trigger time
      if (chatOpen || chatState !== 'idle') return;
      if (sessionStorage.getItem(STORAGE + 'proactiveFired')) return;
      if (sessionStorage.getItem(STORAGE + 'proactiveDismissed')) return;

      // Mark as fired so it won't re-trigger on page navigation
      sessionStorage.setItem(STORAGE + 'proactiveFired', '1');
      console.log('[DealerAI] Proactive trigger fired — opening chat');

      // Open the chat
      toggleChat();
    }, delay);
  }

  // =====================================================
  // 16. INITIALIZATION
  // =====================================================
  function init() {
    // Prevent multiple initializations
    if (window._dealerAIInitialized) {
      console.log('[DealerAI] Already initialized, skipping');
      return;
    }
    window._dealerAIInitialized = true;

    console.log('[DealerAI] Widget initializing...', { serverUrl: CONFIG.serverUrl, dealerName: CONFIG.dealerName });
    loadFontAwesome();
    loadFont();
    injectCSS();
    buildHTML();
    loadSettings().then(() => {
      console.log('[DealerAI] Ready — chat bubble visible');
      setupProactiveTrigger();
    }).catch(() => {
      console.log('[DealerAI] Ready (settings load skipped) — chat bubble visible');
    });

    // Restore previous session state
    const hasState = sessionStorage.getItem(STORAGE + 'chatState');
    if (hasState && hasState !== 'idle') {
      restoreState();
    }
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // =====================================================
  // 17. PUBLIC API
  // =====================================================
  window.DealerAI = {
    open: function() { if (!chatOpen) toggleChat(); },
    close: function() { if (chatOpen) toggleChat(); },
    reset: function() {
      chatHistory = [];
      chatState = 'idle';
      currentLead = {};
      selectedVehicle = null;
      document.getElementById('dai-messages').innerHTML = '';
      clearQuickReplies();
      Object.keys(sessionStorage).forEach(k => { if (k.startsWith(STORAGE)) sessionStorage.removeItem(k); });
      if (chatOpen) { startChat(); }
    },
    sendMessage: function(text) {
      if (!chatOpen) toggleChat();
      setTimeout(() => {
        document.getElementById('dai-input').value = text;
        sendUserMessage();
      }, 500);
    }
  };

  } catch(e) {
    console.error('[DealerAI] Widget failed to initialize:', e);
  }
})();
