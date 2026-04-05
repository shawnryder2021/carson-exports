const SERVER_URL = window.location.origin || 'http://localhost:3001';

async function loadPersonas() {
  try {
    const res = await fetch(`${SERVER_URL}/api/personas`);
    const personas = await res.json();
    renderPersonas(personas);
  } catch (error) {
    console.error('Failed to load personas:', error);
  }
}

function renderPersonas(personas) {
  const list = document.getElementById('personas-list');
  const loading = document.getElementById('personas-loading');

  if (loading) loading.style.display = 'none';

  if (!personas || personas.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem">No personas created yet. Create one to customize AI behavior.</div>';
    return;
  }

  list.innerHTML = personas.map(p => `
    <div style="background:var(--card-alt);border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:600;margin-bottom:.25rem">${escapeHtml(p.name)}</div>
        <div style="font-size:.8rem;color:var(--text-muted);display:flex;gap:1rem">
          <span><i class="fas fa-microphone"></i> ${p.tone_type}</span>
          <span><i class="fas fa-comment"></i> ${p.response_style}</span>
          ${p.is_active ? '<span style="color:var(--success)"><i class="fas fa-check-circle"></i> Active</span>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:.5rem">
        ${!p.is_active ? `<button class="btn btn-sm btn-primary" onclick="activatePersona('${p.id}')"><i class="fas fa-check"></i> Activate</button>` : ''}
        <button class="btn btn-sm btn-danger" onclick="deletePersona('${p.id}')"><i class="fas fa-trash"></i> Delete</button>
      </div>
    </div>
  `).join('');
}

function openPersonaModal() {
  document.getElementById('persona-modal').style.display = 'flex';
}

function closePersonaModal() {
  document.getElementById('persona-modal').style.display = 'none';
  document.getElementById('persona-name').value = '';
  document.getElementById('persona-tone').value = 'sales';
  document.getElementById('persona-style').value = 'professional';
  document.getElementById('persona-greeting').value = '';
  document.getElementById('persona-prompt').value = '';
}

async function savePersona() {
  const name = document.getElementById('persona-name').value.trim();
  const tone_type = document.getElementById('persona-tone').value;
  const response_style = document.getElementById('persona-style').value;
  const greeting_template = document.getElementById('persona-greeting').value;
  const system_prompt_addition = document.getElementById('persona-prompt').value;

  if (!name) {
    alert('Please enter a persona name');
    return;
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/personas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        tone_type,
        response_style,
        greeting_template,
        system_prompt_addition
      })
    });

    if (res.ok) {
      closePersonaModal();
      loadPersonas();
    } else {
      alert('Failed to save persona');
    }
  } catch (error) {
    console.error('Error saving persona:', error);
    alert('Error saving persona');
  }
}

async function activatePersona(id) {
  try {
    const res = await fetch(`${SERVER_URL}/api/personas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true })
    });

    if (res.ok) {
      loadPersonas();
    } else {
      alert('Failed to activate persona');
    }
  } catch (error) {
    console.error('Error activating persona:', error);
  }
}

async function deletePersona(id) {
  if (!confirm('Are you sure you want to delete this persona?')) return;

  try {
    const res = await fetch(`${SERVER_URL}/api/personas/${id}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      loadPersonas();
    } else {
      const errorData = await res.json().catch(() => ({}));
      alert(errorData.error || 'Failed to delete persona');
    }
  } catch (error) {
    console.error('Error deleting persona:', error);
    alert('Error deleting persona');
  }
}

async function loadTrainingData() {
  try {
    const category = document.getElementById('training-filter').value;
    const url = `${SERVER_URL}/api/training-data${category ? `?category=${category}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    renderTrainingData(data);
  } catch (error) {
    console.error('Failed to load training data:', error);
  }
}

function renderTrainingData(data) {
  const list = document.getElementById('training-data-list');

  if (!data || data.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem">No training data found. Flag conversations as training examples to get started.</div>';
    return;
  }

  list.innerHTML = data.map(item => {
    const session = item.ce_chat_sessions?.[0];
    const lead = session?.ce_leads;
    return `
      <div style="background:var(--card-alt);border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:.5rem">
          <div>
            <div style="font-weight:600">${lead?.name || 'Unknown'}</div>
            <div style="font-size:.8rem;color:var(--text-muted);display:flex;gap:1rem;margin-top:.25rem">
              <span>${lead?.phone || 'No phone'}</span>
              <span style="color:${item.category === 'good_answer' ? 'var(--success)' : item.category === 'bad_answer' ? 'var(--danger)' : 'var(--accent)'}"><i class="fas fa-tag"></i> ${item.category}</span>
            </div>
          </div>
          <div style="display:flex;gap:.5rem">
            ${!item.is_approved ? `<button class="btn btn-sm btn-success" onclick="approveTrainingData('${item.id}')"><i class="fas fa-check"></i> Approve</button>` : '<span style="color:var(--success);font-size:.8rem"><i class="fas fa-check-circle"></i> Approved</span>'}
            <button class="btn btn-sm btn-danger" onclick="deleteTrainingData('${item.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        ${item.notes ? `<div style="font-size:.8rem;color:var(--text-muted);margin-top:.5rem;padding:.5rem;background:var(--bg);border-radius:var(--radius-sm)">${escapeHtml(item.notes)}</div>` : ''}
      </div>
    `;
  }).join('');
}

async function approveTrainingData(id) {
  try {
    const res = await fetch(`${SERVER_URL}/api/training-data/${id}/approve`, {
      method: 'PUT'
    });

    if (res.ok) {
      loadTrainingData();
    } else {
      alert('Failed to approve training data');
    }
  } catch (error) {
    console.error('Error approving training data:', error);
  }
}

async function deleteTrainingData(id) {
  if (!confirm('Delete this training data?')) return;

  try {
    const res = await fetch(`${SERVER_URL}/api/training-data/${id}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      loadTrainingData();
    } else {
      alert('Failed to delete training data');
    }
  } catch (error) {
    console.error('Error deleting training data:', error);
  }
}

async function searchConversations() {
  const query = document.getElementById('conv-search-query').value;
  const startDate = document.getElementById('conv-start-date').value;
  const endDate = document.getElementById('conv-end-date').value;

  try {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const res = await fetch(`${SERVER_URL}/api/conversations/search?${params}`);
    const result = await res.json();
    renderConversations(result.conversations || []);
  } catch (error) {
    console.error('Failed to search conversations:', error);
  }
}

function renderConversations(conversations) {
  const results = document.getElementById('conversations-results');

  if (!conversations || conversations.length === 0) {
    results.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem">No conversations found.</div>';
    return;
  }

  results.innerHTML = conversations.map(conv => {
    const lead = conv.ce_leads;
    const duration = conv.ended_at
      ? Math.floor((new Date(conv.ended_at) - new Date(conv.started_at)) / 1000)
      : Math.floor((Date.now() - new Date(conv.started_at)) / 1000);
    const durationStr = duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m`;

    return `
      <div style="background:var(--card-alt);border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;cursor:pointer" onclick="viewConversationDetail('${conv.session_id}')">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div style="flex:1">
            <div style="font-weight:600;margin-bottom:.25rem">${lead?.name || 'Unknown Lead'}</div>
            <div style="font-size:.8rem;color:var(--text-muted);display:flex;gap:1rem;margin-top:.25rem">
              <span><i class="fas fa-phone"></i> ${lead?.phone || 'N/A'}</span>
              <span><i class="fas fa-envelope"></i> ${lead?.email || 'N/A'}</span>
              <span><i class="fas fa-car"></i> ${lead?.vehicle_interest || 'General'}</span>
              <span><i class="fas fa-clock"></i> ${durationStr}</span>
            </div>
            <div style="font-size:.8rem;color:var(--text-muted);margin-top:.5rem">
              <span style="color:${conv.outcome === 'completed' ? 'var(--success)' : 'var(--warning)'}"><i class="fas fa-circle-dot"></i> ${conv.outcome || 'active'}</span>
              · ${conv.message_count || 0} messages
              ${conv.ce_ai_personas?.name ? `· <i class="fas fa-theater-masks"></i> ${conv.ce_ai_personas.name}` : ''}
            </div>
          </div>
          <div style="font-size:.8rem;color:var(--text-muted);text-align:right">
            ${new Date(conv.started_at).toLocaleString()}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function viewConversationDetail(sessionId) {
  try {
    const res = await fetch(`${SERVER_URL}/api/conversations/${sessionId}`);
    const result = await res.json();
    showConversationModal(result);
  } catch (error) {
    console.error('Failed to load conversation:', error);
  }
}

function showConversationModal(data) {
  const { session, messages } = data;
  const lead = session.ce_leads;

  const modal = document.createElement('div');
  modal.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:3000;align-items:center;justify-content:center;padding:1rem';

  modal.innerHTML = `
    <div style="background:var(--card);border-radius:var(--radius-lg);width:100%;max-width:700px;max-height:90vh;overflow-y:auto;display:flex;flex-direction:column">
      <div style="padding:1.5rem;border-bottom:1px solid var(--border);flex-shrink:0">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem">
          <div>
            <h2 style="margin:0;margin-bottom:.5rem">${escapeHtml(lead?.name || 'Unknown')}</h2>
            <div style="font-size:.85rem;color:var(--text-muted)">
              ${lead?.phone ? `<div><i class="fas fa-phone"></i> ${lead.phone}</div>` : ''}
              ${lead?.email ? `<div><i class="fas fa-envelope"></i> ${lead.email}</div>` : ''}
              ${lead?.vehicle_interest ? `<div><i class="fas fa-car"></i> ${lead.vehicle_interest}</div>` : ''}
            </div>
          </div>
          <button style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-muted)" onclick="this.closest('[style*=inset]').remove()"><i class="fas fa-times"></i></button>
        </div>
        <div style="font-size:.8rem;color:var(--text-muted);display:flex;gap:1rem;margin-top:.75rem">
          <span><i class="fas fa-clock"></i> Started: ${new Date(session.started_at).toLocaleString()}</span>
          ${session.ended_at ? `<span><i class="fas fa-check"></i> Ended: ${new Date(session.ended_at).toLocaleString()}</span>` : ''}
          ${session.ce_ai_personas?.name ? `<span><i class="fas fa-theater-masks"></i> ${session.ce_ai_personas.name}</span>` : ''}
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:1.5rem;display:flex;flex-direction:column;gap:1rem">
        ${messages.map(m => `
          <div style="display:flex;justify-content:${m.role === 'user' ? 'flex-end' : 'flex-start'}">
            <div style="background:${m.role === 'user' ? 'var(--accent)' : 'var(--chat-bot)'};color:${m.role === 'user' ? '#fff' : 'var(--chat-bot-text)'};border-radius:var(--radius-sm);padding:.75rem 1rem;max-width:70%;word-break:break-word">
              ${escapeHtml(m.content)}
              <div style="font-size:.7rem;opacity:.7;margin-top:.25rem">${new Date(m.created_at).toLocaleTimeString()}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div style="padding:1rem;border-top:1px solid var(--border);display:flex;gap:.5rem;flex-shrink:0">
        <button class="btn btn-primary" style="flex:1" onclick="flagConversationAsTraining('${session.session_id}')"><i class="fas fa-flag"></i> Flag for Training</button>
        <button class="btn btn-outline" style="flex:1" onclick="this.closest('[style*=inset]').remove()">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function flagConversationAsTraining(sessionId) {
  const validCategories = ['good_answer', 'bad_answer', 'sales_close', 'missed_opportunity'];
  const categoryList = validCategories.join(', ');
  const category = prompt(`Training category:\n${categoryList}`);
  if (!category) return;

  if (!validCategories.includes(category)) {
    alert(`Invalid category. Must be one of: ${categoryList}`);
    return;
  }

  const notes = prompt('Why is this good/bad training data?', '');

  try {
    const res = await fetch(`${SERVER_URL}/api/training-data/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        category,
        notes
      })
    });

    if (res.ok) {
      alert('Conversation flagged for training');
      document.querySelectorAll('[style*="inset:0"]').forEach(el => el.remove());
    } else {
      const errorData = await res.json().catch(() => ({}));
      alert(errorData.error || 'Failed to flag conversation');
    }
  } catch (error) {
    console.error('Error flagging conversation:', error);
    alert('Error flagging conversation');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('personas-list')) {
    loadPersonas();
    loadTrainingData();
  }
});
