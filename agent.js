// ═══════════════════════════════════════════════════════════════
// ARTEMIS AGENT — Shared Card Engine
// Used by both chat.html (human UI) and terminal.html (system GUI)
// ═══════════════════════════════════════════════════════════════

// ── SUPABASE (expects window.supabase to be initialized) ─────
const sb = window.supabase;

// ── CLASSIFIER STATE ─────────────────────────────────────────
let classifier = null;
let classifierLoading = false;
let classifierReady = false;

// ── TOOL CARDS ───────────────────────────────────────────────
const TOOL_CARDS = [
  {
    name: 'GaiaDB_recall',
    icon: '🗄️',
    description: 'Search conversation history across all Olympians',
    matchPattern: 'The user wants to search, recall, find, or look up past conversations, memories, things they discussed, or information from their chat history.',
    requiresDb: true,
    execute: async (input, context) => {
      const keyword = extractKeyword(input);
      if (!keyword) return { error: 'No search keyword found.' };
      
      const { data, error } = await sb
        .from('conversations')
        .select('role, content, olympian, created_at')
        .eq('session_id', context.sessionId)
        .ilike('content', `%${keyword}%`)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) return { error: error.message };
      if (!data || data.length === 0) return { text: `No memories found for "${keyword}".` };
      
      // Format results
      const lines = data.map(m => 
        `[${m.olympian}] ${m.role}: ${m.content.slice(0, 120)}${m.content.length > 120 ? '...' : ''}`
      );
      return { 
        text: `Found ${data.length} memories matching "${keyword}":\n${lines.join('\n')}`,
        data,
        keyword
      };
    }
  },
  {
    name: 'Pollinations-Text',
    icon: '💬',
    description: 'Generate text via Pollinations AI',
    matchPattern: 'The user wants text generation, analysis, explanation, conversation, summary, or to ask a question that requires an AI response.',
    requiresDb: false,
    execute: async (input, context) => {
      try {
        const handshake = context.handshake || '';
        const response = await fetch('https://text.pollinations.ai/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { 
                role: 'system', 
                content: `You are ARTEMIS, Olympian VIII of the Ealdforn pantheon. Goddess of the Hunt, Tracking, Wild Data, and Personal AI.

You are a personal AI agent with tool access. You respond in a chat interface.
- Be concise. 2-4 sentences unless asked for detail.
- You are helpful but not chatty. You track, retrieve, and report.
- You have access to: conversation memory (GaiaDB), image generation, repo search, and memory compression.
- Current context: ${handshake}`
              },
              { role: 'user', content: input }
            ],
            model: 'openai',
            temperature: 0.5,
            max_tokens: 200,
          }),
        });
        
        const data = await response.json();
        return { text: data.choices?.[0]?.message?.content?.trim() || 'No response generated.' };
      } catch (e) {
        return { error: e.message };
      }
    }
  },
  {
    name: 'Pollinations-Image',
    icon: '🖼️',
    description: 'Generate an image via Pollinations',
    matchPattern: 'The user wants to generate, create, show, make, or display an image, picture, visual, or artwork.',
    requiresDb: false,
    execute: async (input, context) => {
      const imgPrompt = input
        .replace(/generate|show me|create an image of|image of|make an image|display/i, '')
        .trim()
        .replace(/^["']|["']$/g, '');
      
      if (!imgPrompt || imgPrompt.length < 3) {
        return { error: 'No image description found. Try: "generate a forest at night"' };
      }
      
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=768&height=768&model=flux&nologo=true`;
      return { 
        text: `Image generated: "${imgPrompt}"`,
        imageUrl: url, 
        prompt: imgPrompt 
      };
    }
  },
  {
    name: 'Browser-Hunt',
    icon: '🔍',
    description: 'Search across kairos-coder GitHub repositories',
    matchPattern: 'The user wants to search, find, hunt for, or locate code, files, patterns, or information across their repositories, projects, or the pantheon.',
    requiresDb: false,
    execute: async (input, context) => {
      const pattern = extractPattern(input);
      if (!pattern) return { error: 'No search pattern found.' };
      
      const repos = [
        'apollo', 'athena', 'hermes', 'gaia', 'ealdenmot', 
        'ealdforn-studios', 'artemis', 'zeus', 'poseidon', 'demeter'
      ];
      
      const results = [];
      for (const repo of repos) {
        try {
          const url = `https://raw.githubusercontent.com/kairos-coder/${repo}/main/README.md`;
          const res = await fetch(url);
          if (res.ok) {
            const text = await res.text();
            if (text.toLowerCase().includes(pattern.toLowerCase())) {
              results.push(repo);
            }
          }
        } catch (e) {
          // Repo doesn't exist or no README — skip
        }
      }
      
      if (results.length === 0) {
        return { text: `Pattern "${pattern}" not found in any repository READMEs.` };
      }
      
      return {
        text: `Found "${pattern}" in ${results.length} repos: ${results.join(', ')}`,
        pattern,
        matches: results
      };
    }
  },
  {
    name: 'COMPRESS',
    icon: '📦',
    description: 'Compress recent memory into a dense snapshot',
    matchPattern: 'The user wants to compress, save, snapshot, summarize, or condense their memory, context, or recent activity.',
    requiresDb: true,
    execute: async (input, context) => {
      try {
        // Get recent conversations for compression
        const recentActions = context.recentActions || [];
        const conversations = context.sessionId ? await sb
          .from('conversations')
          .select('content, olympian')
          .eq('session_id', context.sessionId)
          .order('created_at', { ascending: false })
          .limit(10) : { data: [] };
        
        const topics = (conversations.data || [])
          .map(c => `${c.olympian}: ${(c.content || '').slice(0, 40)}`)
          .join(' | ');
        
        // Use Pollinations to compress
        const response = await fetch('https://text.pollinations.ai/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: 'Compress the following into a dense, keyword-rich summary under 120 characters. Use pipe delimiters. No sentences. No articles. Just keywords and connections.' },
              { role: 'user', content: `Topics: ${topics}\nActions: ${recentActions.slice(-5).join(' | ')}` }
            ],
            model: 'openai',
            temperature: 0.3,
            max_tokens: 60,
          }),
        });
        
        const data = await response.json();
        const compressed = data.choices?.[0]?.message?.content?.trim() || topics.slice(0, 120);
        
        localStorage.setItem('artemis_compressed_memory', compressed);
        
        return {
          text: `Memory compressed: "${compressed}"`,
          snapshot: compressed
        };
      } catch (e) {
        // Local fallback compression
        const snapshot = (context.recentActions || []).slice(-5).join(' | ').slice(0, 120);
        localStorage.setItem('artemis_compressed_memory', snapshot);
        return { text: `Memory compressed locally: "${snapshot}"`, snapshot };
      }
    }
  }
];

// ── KEYWORD EXTRACTORS ───────────────────────────────────────
function extractKeyword(input) {
  // Remove command-like prefixes
  let cleaned = input
    .replace(/find|search|recall|remember|look up|show me|get|retrieve/gi, '')
    .replace(/my |the |about |from |in |for /gi, '')
    .replace(/conversations|memories|messages|chats|history/gi, '')
    .replace(/yesterday|today|last week|earlier/gi, '')
    .trim();
  
  // If nothing left, use the original input
  if (!cleaned || cleaned.length < 2) {
    cleaned = input.trim();
  }
  
  // Take first 3 meaningful words
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  return words.slice(0, 3).join(' ');
}

function extractPattern(input) {
  let cleaned = input
    .replace(/hunt|search|find|look for|track|locate/gi, '')
    .replace(/for |in |across |the |my /gi, '')
    .replace(/repos|repositories|code|files/gi, '')
    .trim();
  
  if (!cleaned || cleaned.length < 2) {
    cleaned = input.trim();
  }
  
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  return words.slice(0, 3).join(' ');
}

// ── CLASSIFIER ────────────────────────────────────────────────
async function loadClassifier() {
  if (classifierReady) return classifier;
  if (classifierLoading) {
    // Wait for existing load
    while (classifierLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return classifier;
  }
  
  classifierLoading = true;
  
  try {
    // Dynamic import to avoid issues if Transformers.js isn't loaded yet
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
    
    classifier = await pipeline(
      'text-classification',
      'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      { quantized: true }
    );
    
    classifierReady = true;
    return classifier;
  } catch (e) {
    console.warn('Classifier failed to load, using heuristic fallback:', e.message);
    classifier = null;
    classifierReady = true; // Mark as ready so we don't keep trying
    return null;
  } finally {
    classifierLoading = false;
  }
}

async function classifyIntent(matchPattern, userInput) {
  const model = await loadClassifier();
  
  if (!model) {
    // Heuristic fallback: keyword matching
    return heuristicClassify(matchPattern, userInput);
  }
  
  try {
    const prompt = `${matchPattern}: "${userInput}"`;
    const result = await model(prompt);
    
    if (result[0].label === 'POSITIVE' && result[0].score > 0.6) {
      return { match: true, score: result[0].score };
    }
    return { match: false, score: result[0].score };
  } catch (e) {
    console.warn('Classification error, using heuristic:', e.message);
    return heuristicClassify(matchPattern, userInput);
  }
}

function heuristicClassify(matchPattern, userInput) {
  // Simple keyword-based classification as fallback
  const lower = userInput.toLowerCase();
  const patternLower = matchPattern.toLowerCase();
  
  const keywords = {
    'GaiaDB_recall': ['find', 'search', 'recall', 'remember', 'memory', 'memories', 'look up', 'history', 'past', 'discussed', 'conversation'],
    'Pollinations-Text': ['explain', 'analyze', 'what', 'how', 'why', 'tell me', 'describe', 'summarize', 'think'],
    'Pollinations-Image': ['generate', 'image', 'picture', 'show me', 'create', 'visual', 'art', 'draw', 'photo'],
    'Browser-Hunt': ['hunt', 'repo', 'code', 'search for', 'find in', 'across', 'repositories', 'github', 'file'],
    'COMPRESS': ['compress', 'snapshot', 'save memory', 'summarize', 'condense', 'compact']
  };
  
  // Find which card this pattern matches
  for (const [cardName, words] of Object.entries(keywords)) {
    if (patternLower.includes(cardName.toLowerCase()) || 
        patternLower.includes(cardName.replace('_', ' ').toLowerCase())) {
      const matchCount = words.filter(w => lower.includes(w)).length;
      if (matchCount >= 2) {
        return { match: true, score: 0.7 + (matchCount * 0.05) };
      }
    }
  }
  
  return { match: false, score: 0.3 };
}

// ── HANDSHAKE PROTOCOL ────────────────────────────────────────
function buildHandshake() {
  const sessionToken = localStorage.getItem('apollo_session_token') || 'none';
  const compressedMemory = localStorage.getItem('artemis_compressed_memory') || '';
  const recentActions = JSON.parse(localStorage.getItem('artemis_recent_actions') || '[]');
  
  return [
    `ARTEMIS//SESSION:${sessionToken}`,
    `ARTEMIS//MEMORY:${compressedMemory}`,
    `ARTEMIS//ACTIONS:${recentActions.slice(-5).join('|')}`,
    `ARTEMIS//TIME:${new Date().toISOString()}`,
  ].join('\n');
}

function addAction(action) {
  const actions = JSON.parse(localStorage.getItem('artemis_recent_actions') || '[]');
  actions.push(`${new Date().toISOString().slice(11, 19)} ${action}`);
  if (actions.length > 30) actions.splice(0, actions.length - 25);
  localStorage.setItem('artemis_recent_actions', JSON.stringify(actions));
}

// ── MAIN PROCESS FUNCTION ────────────────────────────────────
async function processInput(userInput, options = {}) {
  const { 
    verbose = false,      // If true, return card-by-card results (for terminal)
    autoCompress = false, // If true, auto-compress after processing
    sessionId = null      // GaiaDB session ID
  } = options;
  
  const handshake = buildHandshake();
  const context = {
    handshake,
    sessionId,
    sessionToken: localStorage.getItem('apollo_session_token'),
    recentActions: JSON.parse(localStorage.getItem('artemis_recent_actions') || '[]'),
    dbConnected: !!sessionId
  };
  
  const results = [];
  const cardVotes = [];
  
  // Phase 1: Classify each card
  for (const card of TOOL_CARDS) {
    // Skip DB cards if no session
    if (card.requiresDb && !context.sessionId) {
      cardVotes.push({ card: card.name, match: false, score: 0, reason: 'no session' });
      continue;
    }
    
    const vote = await classifyIntent(card.matchPattern, userInput);
    cardVotes.push({ card: card.name, match: vote.match, score: vote.score });
    
    if (vote.match) {
      // Phase 2: Execute matched cards
      try {
        const output = await card.execute(userInput, context);
        results.push({
          card: card.name,
          icon: card.icon,
          output
        });
      } catch (e) {
        results.push({
          card: card.name,
          icon: card.icon,
          output: { error: e.message }
        });
      }
    }
  }
  
  // Auto-compress if requested and no COMPRESS card matched
  if (autoCompress && !results.find(r => r.card === 'COMPRESS')) {
    const compressCard = TOOL_CARDS.find(c => c.name === 'COMPRESS');
    try {
      const output = await compressCard.execute(userInput, context);
      results.push({ card: 'COMPRESS', icon: '📦', output });
    } catch (e) {}
  }
  
  // Log action
  const matchedCards = results.map(r => r.card).join(', ') || 'none';
  addAction(`Processed: "${userInput.slice(0, 60)}" → ${matchedCards}`);
  
  // Build response text
  let responseText = '';
  if (results.length === 0) {
    responseText = 'No tools matched your request. Try rephrasing or use the terminal for direct commands.';
  } else if (results.length === 1) {
    responseText = results[0].output.text || results[0].output.error || 'Task completed.';
  } else {
    // Multiple results — combine
    const texts = results
      .filter(r => r.output.text)
      .map(r => `[${r.card}] ${r.output.text}`);
    responseText = texts.join('\n\n');
  }
  
  return {
    text: responseText,
    results,
    cardVotes,
    handshake,
    timestamp: new Date().toISOString()
  };
}

// ── EXPORT ────────────────────────────────────────────────────
// Make available globally for both chat.html and terminal.html
window.ArtemisAgent = {
  process: processInput,
  loadClassifier,
  buildHandshake,
  addAction,
  TOOL_CARDS,
  classifyIntent,
  // Expose for direct terminal commands
  tools: {
    trackMemory: async (query) => {
      const card = TOOL_CARDS.find(c => c.name === 'GaiaDB_recall');
      const sessionId = await getSessionId();
      return card.execute(query, { sessionId, handshake: buildHandshake() });
    },
    hunt: async (pattern) => {
      const card = TOOL_CARDS.find(c => c.name === 'Browser-Hunt');
      return card.execute(pattern, { handshake: buildHandshake() });
    },
    compress: async () => {
      const card = TOOL_CARDS.find(c => c.name === 'COMPRESS');
      const sessionId = await getSessionId();
      return card.execute('compress', { 
        sessionId, 
        handshake: buildHandshake(),
        recentActions: JSON.parse(localStorage.getItem('artemis_recent_actions') || '[]')
      });
    }
  }
};

async function getSessionId() {
  const token = localStorage.getItem('apollo_session_token');
  if (!token || !sb) return null;
  try {
    const { data } = await sb.from('sessions').select('id').eq('session_token', token).single();
    return data?.id || null;
  } catch (e) {
    return null;
  }
}
