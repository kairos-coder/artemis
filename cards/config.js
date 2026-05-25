// ============================================
// ARTEMIS CARD REGISTRY v3.1 — Huntress Engine
// ============================================
// No Pollinations. No text generation APIs.
// Artemis hunts data sources: GaiaDB, APIs, files, memory.
// Every card hunts. Every response is assembled from quarry.
// assemble_phrase is the default card — huntress voice layer.
// ============================================

var ARTEMIS_CARD_DECK = [
    // ═══════════════ MEMORY CARDS ═══════════════
    {
        id: 'gaia_recall',
        name: 'GaiaDB Recall',
        icon: '📜',
        category: 'memory',
        description: 'Hunts GaiaDB for past conversations and stored knowledge',
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
        negativePatterns: [
            'forget', 'delete', 'clear memory', 'erase'
        ],
        requires: ['supabase_client'],
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
        matchPatterns: [
            'cache', 'stored', 'local', 'saved', 'session data', 'storage'
        ],
        negativePatterns: [],
        requires: ['supabase_client'],
        produces: ['memory_cache', 'graph_update', 'session_summary'],
        timeout: 5000,
        retryOnFail: false,
        maxRetries: 1,
        autoTrigger: true
    },

    // ═══════════════ RETRIEVAL CARDS ═══════════════
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
        negativePatterns: [
            'code', 'file', 'repo', 'repository', 'memory', 'remember',
            'generate image', 'create image', 'draw'
        ],
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
        description: 'Hunts repository files — HTML, JS, CSS, MD, JSON',
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
        negativePatterns: [
            'web', 'internet', 'online', 'wikipedia', 'dictionary',
            'generate image', 'create image', 'draw'
        ],
        requires: [],
        produces: ['file_results', 'web_context'],
        timeout: 15000,
        retryOnFail: true,
        maxRetries: 2
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
        matchPatterns: [
            'compare', 'correlate', 'connect', 'link', 'related',
            'pattern', 'between', 'across', 'overlap', 'match'
        ],
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
        matchPatterns: [
            'compress', 'save this', 'remember this', 'store',
            'log this', 'note this', 'keep this', 'archive', 'record',
            'pattern', 'learn', 'update memory', 'summarize', 'condense'
        ],
        negativePatterns: [],
        requires: ['supabase_client'],
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
        description: 'Assembles hunt results into natural huntress speech using weighted templates — the voice of Artemis',
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
        matchPatterns: [
            'status', 'state', 'report', 'how are you', 'what can you do',
            'capabilities', 'cards', 'deck', 'quiver', 'ready',
            'health', 'check', 'diagnostic', 'audit', 'inventory',
            'history', 'recent'
        ],
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
        matchPatterns: [
            'hello', 'hi', 'hey', 'greet', 'good morning',
            'good evening', 'goodbye', 'bye', 'farewell',
            'who are you', 'introduction', 'thanks', 'thank you'
        ],
        negativePatterns: [
            'search', 'find', 'hunt', 'memory', 'status', 'code',
            'generate', 'image', 'draw'
        ],
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
        requires: ['supabase_client'],
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
    memory: {
        label: 'Memory & Recall',
        color: '#a78bfa',
        priority: 2
    },
    retrieval: {
        label: 'External Retrieval',
        color: '#f59e0b',
        priority: 3
    },
    correlation: {
        label: 'Pattern Correlation',
        color: '#7eb8a0',
        priority: 3
    },
    response: {
        label: 'Response Assembly',
        color: '#9aada0',
        priority: 4
    },
    meta: {
        label: 'System Operations',
        color: '#6b7280',
        priority: 1
    },
    system: {
        label: 'Logging',
        color: '#4a5568',
        priority: 0
    }
};

// ============================================
// ROUTER CONFIGURATION
// ============================================
var ROUTER_CONFIG = {
    // Minimum confidence score for a card to be played
    confidenceThreshold: 0.3,

    // Maximum cards that can fire per turn
    maxCardsPerTurn: 4,

    // Whether the same card can fire multiple times per turn
    allowDuplicateCards: false,

    // Execution order by category priority
    executionOrder: ['meta', 'memory', 'retrieval', 'correlation', 'response', 'system'],

    // Weight learning
    learningRate: 0.05,
    learningWarmup: 3,

    // Classification mode
    classifierMode: 'heuristic',

    // Negative pattern penalty: multiplier applied when negative patterns match
    negativePatternPenalty: 0.5,

    // Default card if nothing matches — assemble_phrase is the voice layer
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
    // GaiaDB tables
    decisionsTable: 'artemis_decisions',
    patternsTable: 'artemis_patterns',
    weightsTable: 'artemis_card_weights',

    // LocalStorage keys
    localKeys: {
        compressedMemory: 'artemis_compressed_memory',
        recentActions: 'artemis_recent_actions',
        cardWeights: 'artemis_card_weights_v3',
        decisionHistory: 'artemis_decision_history',
        compressionToken: 'artemis_compression_token',
        memoryGraph: 'artemis_memory_graph',
        localDB: 'artemis_localdb'
    },

    // Limits
    maxLocalDecisions: 100,
    maxLocalPatterns: 200,
    maxLocalDBMessages: 200,
    maxGraphNodes: 500
};

// ============================================
// FREE API REGISTRY (for apiHunt.js)
// ============================================
var API_REGISTRY = {
    wikipedia: {
        name: 'Wikipedia',
        category: 'knowledge',
        baseUrl: 'https://en.wikipedia.org/api/rest_v1/page/summary/',
        method: 'GET',
        requiresKey: false,
        description: 'Encyclopedia article summaries'
    },
    openlibrary: {
        name: 'OpenLibrary',
        category: 'books',
        baseUrl: 'https://openlibrary.org/search.json?q=',
        method: 'GET',
        requiresKey: false,
        description: 'Book search and metadata'
    },
    dictionary: {
        name: 'Free Dictionary',
        category: 'definitions',
        baseUrl: 'https://api.dictionaryapi.dev/api/v2/entries/en/',
        method: 'GET',
        requiresKey: false,
        description: 'Word definitions, phonetics, examples'
    },
    quotable: {
        name: 'Quotable',
        category: 'quotes',
        baseUrl: 'https://api.quotable.io/search/quotes?query=',
        method: 'GET',
        requiresKey: false,
        description: 'Quote search by keyword or author'
    },
    openmeteo: {
        name: 'Open-Meteo',
        category: 'weather',
        baseUrl: 'https://api.open-meteo.com/v1/forecast',
        method: 'GET',
        requiresKey: false,
        description: 'Weather forecasts (requires lat/lon params)'
    }
};

// ============================================
// AUTO-TRIGGER CARDS (run every cycle)
// ============================================
var AUTO_TRIGGER_CARDS = ['memory_manager', 'card_voter', 'assemble_phrase', 'decision_log'];

console.log('🏹 Artemis Card Deck v3.1 loaded — %d cards, %d APIs registered',
    ARTEMIS_CARD_DECK.length, Object.keys(API_REGISTRY).length);
