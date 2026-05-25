// ============================================
// ARTEMIS CARD REGISTRY v3.5 — Huntress Engine
// ============================================
// 15 cards. Target resolution, intent classification,
// hunt expansion, fallback retrieval, supabase guarding.
// No Pollinations. No text generation APIs.
// ============================================

var ARTEMIS_CARD_DECK = [
    // ═══════════════ SYSTEM CARDS ═══════════════
    {
        id: 'supabase_guard',
        name: 'Supabase Guard',
        icon: '🛡️',
        category: 'system',
        description: 'SHA-256 token hashing, collision prevention, graceful insert handling',
        cardFile: 'supabaseGuard.js',
        defaultWeight: 1.0,
        matchPatterns: [],
        negativePatterns: [],
        requires: [],
        produces: ['token_hash', 'collision_log'],
        timeout: 2000,
        retryOnFail: false,
        maxRetries: 1,
        autoTrigger: true
    },

    // ═══════════════ META CARDS ═══════════════
    {
        id: 'intent_classifier',
        name: 'Intent Classifier',
        icon: '🧠',
        category: 'meta',
        description: 'Classifies user queries into intents: recall, hunt, query, config, debug, meta, greet',
        cardFile: 'intentClassifier.js',
        defaultWeight: 0.9,
        matchPatterns: [],
        negativePatterns: [],
        requires: [],
        produces: ['intent', 'intent_confidence', 'all_scores'],
        timeout: 3000,
        retryOnFail: false,
        maxRetries: 1,
        autoTrigger: true
    },

    {
        id: 'target_resolver',
        name: 'Target Resolver',
        icon: '🎯',
        category: 'meta',
        description: 'Resolves user queries into explicit hunt targets with confidence scoring',
        cardFile: 'targetResolver.js',
        defaultWeight: 0.85,
        matchPatterns: [],
        negativePatterns: [],
        requires: [],
        produces: ['targets', 'primary_target', 'resolved'],
        timeout: 3000,
        retryOnFail: false,
        maxRetries: 1,
        autoTrigger: true
    },

    // ═══════════════ MEMORY CARDS ═══════════════
    {
        id: 'gaia_recall',
        name: 'GaiaDB Recall',
        icon: '📜',
        category: 'memory',
        description: 'Hunts GaiaDB for past conversations and stored knowledge via Olympian Bridge',
        cardFile: 'gaiaRecall.js',
        defaultWeight: 0.7,
        matchPatterns: [
            'remember', 'recall', 'what did', 'past', 'history',
            'last time', 'previous', 'stored', 'memory', 'look up',
            'find in db', 'what do you know about', 'what do you know',
            'what do you remember', 'what have you learned',
            'your memory', 'tell me everything', 'summarize what you know',
            'what do you have on', 'recall everything', 'track', 'trail', 'scent'
        ],
        negativePatterns: ['forget', 'delete', 'clear memory', 'erase'],
        requires: [],
        produces: ['gaia_results'],
        timeout: 10000,
        retryOnFail: true,
        maxRetries: 2
    },

    {
        id: 'memory_manager',
        name: 'Memory Manager',
        icon: '🧿',
        category: 'meta',
        description: 'LocalDB cache, memory graph, session state management',
        cardFile: 'memoryManager.js',
        defaultWeight: 1.0,
        matchPatterns: ['cache', 'stored', 'local', 'saved', 'session data', 'storage'],
        negativePatterns: [],
        requires: [],
        produces: ['memory_cache', 'graph_update', 'session_summary'],
        timeout: 5000,
        retryOnFail: false,
        maxRetries: 1,
        autoTrigger: true
    },

    // ═══════════════ RETRIEVAL CARDS ═══════════════
    {
        id: 'hunt_expander',
        name: 'Hunt Expander',
        icon: '🔀',
        category: 'retrieval',
        description: 'Generates expanded hunt tracks — synonyms, domains, related terms',
        cardFile: 'huntExpander.js',
        defaultWeight: 0.75,
        matchPatterns: [],
        negativePatterns: [],
        requires: [],
        produces: ['expanded_tracks', 'track_count'],
        timeout: 3000,
        retryOnFail: false,
        maxRetries: 1,
        autoTrigger: true
    },

    {
        id: 'api_hunt',
        name: 'API Hunt',
        icon: '🏹',
        category: 'retrieval',
        description: 'Hunts free APIs — Wikipedia, OpenLibrary, Dictionary, Quotable, Weather',
        cardFile: 'apiHunt.js',
        defaultWeight: 0.75,
        matchPatterns: [
            'what is', 'define', 'who is', 'search', 'find',
            'look up', 'wiki', 'wikipedia', 'dictionary', 'meaning',
            'book', 'author', 'quote', 'weather', 'temperature',
            'information', 'about', 'tell me about', 'explain',
            'how does', 'how do', 'why is', 'why does',
            'hunt', 'track down', 'locate', 'discover'
        ],
        negativePatterns: ['code', 'file', 'repo', 'repository', 'memory', 'remember', 'generate image', 'create image', 'draw'],
        requires: [],
        produces: ['api_results'],
        timeout: 15000,
        retryOnFail: true,
        maxRetries: 2
    },

    {
        id: 'browser_hunt',
        name: 'Browser Hunt',
        icon: '🔍',
        category: 'retrieval',
        description: 'Hunts repository files — HTML, JS, CSS, MD, JSON (allowlisted repos)',
        cardFile: 'browserHunt.js',
        defaultWeight: 0.65,
        matchPatterns: [
            'file', 'code', 'repo', 'repository', 'script',
            'html', 'css', 'javascript', 'readme', 'source',
            'project', 'folder', 'directory', 'browse',
            'show me the', 'open', 'scan', 'search files',
            'hunt for', 'search for', 'find in', 'look for',
            'hunt across', 'find across', 'search all projects',
            'find in my code', 'search my code', 'find file',
            'where is the code', 'find in repo'
        ],
        negativePatterns: ['web', 'internet', 'online', 'wikipedia', 'dictionary', 'generate image', 'create image', 'draw'],
        requires: [],
        produces: ['file_results', 'web_context'],
        timeout: 15000,
        retryOnFail: true,
        maxRetries: 2
    },

    {
        id: 'hunt_fallback',
        name: 'Hunt Fallback',
        icon: '🔄',
        category: 'retrieval',
        description: 'Guarantees meaningful output by searching memory, logs, tokens, and actions',
        cardFile: 'huntFallback.js',
        defaultWeight: 0.8,
        matchPatterns: [],
        negativePatterns: [],
        requires: [],
        produces: ['fallback_results', 'fallback_used'],
        timeout: 8000,
        retryOnFail: false,
        maxRetries: 1,
        autoTrigger: true
    },

    // ═══════════════ CORRELATION CARDS ═══════════════
    {
        id: 'card_voter',
        name: 'Card Voter',
        icon: '🗳️',
        category: 'meta',
        description: 'Correlates card outputs and identifies consensus patterns across hunt results',
        cardFile: 'cardVoter.js',
        defaultWeight: 0.55,
        matchPatterns: ['compare', 'correlate', 'connect', 'link', 'related', 'pattern', 'between', 'across', 'overlap', 'match'],
        negativePatterns: [],
        requires: [],
        produces: ['card_votes', 'correlation_data'],
        timeout: 8000,
        retryOnFail: false,
        maxRetries: 0,
        autoTrigger: true
    },

    {
        id: 'compress',
        name: 'COMPRESS',
        icon: '🗜️',
        category: 'memory',
        description: 'Pattern extraction, Ealdforn compression token, GaiaDB write',
        cardFile: 'compress.js',
        defaultWeight: 0.6,
        matchPatterns: ['compress', 'save this', 'remember this', 'store', 'log this', 'note this', 'keep this', 'archive', 'record', 'pattern', 'learn', 'update memory', 'summarize', 'condense'],
        negativePatterns: [],
        requires: [],
        produces: ['compressed_memory', 'pattern_update', 'ealdforn_token'],
        timeout: 10000,
        retryOnFail: true,
        maxRetries: 2
    },

    // ═══════════════ RESPONSE CARDS ═══════════════
    {
        id: 'assemble_phrase',
        name: 'Assemble Phrase',
        icon: '🪶',
        category: 'response',
        description: 'Assembles hunt results into natural huntress speech using weighted templates',
        cardFile: 'assemblePhrase.js',
        defaultWeight: 1.0,
        matchPatterns: [],
        negativePatterns: [],
        requires: [],
        produces: ['assembled_phrase', 'phrase_intent', 'phrase_template'],
        timeout: 3000,
        retryOnFail: false,
        maxRetries: 1,
        autoTrigger: true
    },

    {
        id: 'status_report',
        name: 'Status Report',
        icon: '📊',
        category: 'response',
        description: 'Reports Artemis current state — cards, session, recent hunts',
        cardFile: 'statusReport.js',
        defaultWeight: 0.5,
        matchPatterns: ['status', 'state', 'report', 'how are you', 'what can you do', 'capabilities', 'cards', 'deck', 'quiver', 'ready', 'health', 'check', 'diagnostic', 'audit', 'inventory', 'history', 'recent'],
        negativePatterns: [],
        requires: [],
        produces: ['memory_context'],
        timeout: 5000,
        retryOnFail: false,
        maxRetries: 1
    },

    {
        id: 'greeting',
        name: 'Greeting',
        icon: '🌙',
        category: 'response',
        description: 'Handles greetings, farewells, introductions — huntress voice',
        cardFile: 'greeting.js',
        defaultWeight: 0.4,
        matchPatterns: ['hello', 'hi', 'hey', 'greet', 'good morning', 'good evening', 'goodbye', 'bye', 'farewell', 'who are you', 'introduction', 'thanks', 'thank you'],
        negativePatterns: ['search', 'find', 'hunt', 'memory', 'status', 'code', 'generate', 'image', 'draw'],
        requires: [],
        produces: ['memory_context'],
        timeout: 5000,
        retryOnFail: false,
        maxRetries: 1
    },

    // ═══════════════ SYSTEM CARDS ═══════════════
    {
        id: 'decision_log',
        name: 'Decision Logger',
        icon: '📝',
        category: 'system',
        description: 'Logs every decision for weight learning and audit trail',
        cardFile: 'decisionLog.js',
        defaultWeight: 1.0,
        matchPatterns: [],
        negativePatterns: [],
        requires: [],
        produces: ['decision_record'],
        timeout: 2000,
        retryOnFail: false,
        maxRetries: 1,
        autoTrigger: true
    }
];

// ============================================
// CATEGORY DEFINITIONS
// ============================================
var CARD_CATEGORIES = {
    system: { label: 'System Guards', color: '#4a5568', priority: 0 },
    meta: { label: 'Meta Processing', color: '#6b7280', priority: 1 },
    memory: { label: 'Memory & Recall', color: '#a78bfa', priority: 2 },
    retrieval: { label: 'External Retrieval', color: '#f59e0b', priority: 3 },
    correlation: { label: 'Pattern Correlation', color: '#7eb8a0', priority: 3 },
    response: { label: 'Response Assembly', color: '#9aada0', priority: 4 }
};

// ============================================
// ROUTER CONFIGURATION
// ============================================
var ROUTER_CONFIG = {
    confidenceThreshold: 0.3,
    maxCardsPerTurn: 5,
    allowDuplicateCards: false,
    executionOrder: ['system', 'meta', 'memory', 'retrieval', 'correlation', 'response'],
    learningRate: 0.05,
    learningWarmup: 3,
    classifierMode: 'heuristic',
    negativePatternPenalty: 0.5,
    defaultCard: 'assemble_phrase'
};

// ============================================
// SUPABASE CONFIGURATION (GaiaDB)
// ============================================
var SUPABASE_CONFIG = {
    url: 'https://nbdvavzqvxrlxhsbrluz.supabase.co',
    anonKey: 'sb_publishable_6x1xlieXjs3dWqEETQcxnQ_4L1UO2uR',
    tables: {
        conversations: 'conversations',
        sessions: 'sessions',
        artemisDecisions: 'artemis_decisions',
        artemisPatterns: 'artemis_patterns',
        artemisWeights: 'artemis_card_weights'
    }
};

// ============================================
// PERSISTENCE CONFIGURATION
// ============================================
var PERSISTENCE_CONFIG = {
    decisionsTable: 'artemis_decisions',
    patternsTable: 'artemis_patterns',
    weightsTable: 'artemis_card_weights',
    localKeys: {
        compressedMemory: 'artemis_compressed_memory',
        recentActions: 'artemis_recent_actions',
        cardWeights: 'artemis_card_weights_v3',
        decisionHistory: 'artemis_decision_history',
        compressionToken: 'artemis_compression_token',
        memoryGraph: 'artemis_memory_graph',
        localDB: 'artemis_localdb'
    },
    maxLocalDecisions: 100,
    maxLocalPatterns: 200,
    maxLocalDBMessages: 200,
    maxGraphNodes: 500
};

// ============================================
// FREE API REGISTRY (for apiHunt.js)
// ============================================
var API_REGISTRY = {
    wikipedia: { name: 'Wikipedia', category: 'knowledge', baseUrl: 'https://en.wikipedia.org/api/rest_v1/page/summary/', method: 'GET', requiresKey: false, description: 'Encyclopedia article summaries' },
    openlibrary: { name: 'OpenLibrary', category: 'books', baseUrl: 'https://openlibrary.org/search.json?q=', method: 'GET', requiresKey: false, description: 'Book search and metadata' },
    dictionary: { name: 'Free Dictionary', category: 'definitions', baseUrl: 'https://api.dictionaryapi.dev/api/v2/entries/en/', method: 'GET', requiresKey: false, description: 'Word definitions, phonetics, examples' },
    quotable: { name: 'Quotable', category: 'quotes', baseUrl: 'https://api.quotable.io/search/quotes?query=', method: 'GET', requiresKey: false, description: 'Quote search by keyword or author' },
    openmeteo: { name: 'Open-Meteo', category: 'weather', baseUrl: 'https://api.open-meteo.com/v1/forecast', method: 'GET', requiresKey: false, description: 'Weather forecasts (requires lat/lon params)' }
};

// ============================================
// AUTO-TRIGGER CARDS (run every cycle)
// ============================================
var AUTO_TRIGGER_CARDS = [
    'supabase_guard',
    'intent_classifier',
    'target_resolver',
    'memory_manager',
    'hunt_expander',
    'card_voter',
    'hunt_fallback',
    'assemble_phrase',
    'decision_log'
];

console.log('🏹 Artemis Card Deck v3.5 loaded — %d cards, %d APIs registered',
    ARTEMIS_CARD_DECK.length, Object.keys(API_REGISTRY).length);
