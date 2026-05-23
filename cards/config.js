// ============================================
// ARTEMIS CARD REGISTRY — EaldfornAI Core
// ============================================
// Every card Artemis can play. 
// New cards are added here and automatically 
// become available to the router.
// ============================================

const ARTEMIS_CARD_DECK = [
    {
        id: 'gaia_recall',
        name: 'GaiaDB Recall',
        icon: '📜',
        category: 'memory',
        description: 'Search GaiaDB for past conversations and stored knowledge',
        matchPatterns: [
            'remember', 'recall', 'what did', 'past', 'history',
            'last time', 'previous', 'stored', 'memory', 'look up',
            'find in', 'search db', 'what do you know about',
            'what do you know', 'what do you remember',
            'what have you learned', 'your memory',
            'tell me everything', 'summarize what you know',
            'what do you have on', 'recall everything'
        ],
        defaultWeight: 0.7,
        requires: ['supabase_client'],
        produces: ['memory_context'],
        timeout: 3000,
        retryOnFail: true,
        maxRetries: 2,
        execute: null,
        cardFile: 'gaiaRecall.js'
    },
    
    {
    id: 'memory_manager',
    name: 'Memory Manager',
    icon: '🧿',
    category: 'meta',
    description: 'LocalDB cache, memory graph, session timeout with GaiaDB summary push',
    matchPatterns: [],
    defaultWeight: 1.0,
    requires: ['supabase_client'],
    produces: ['memory_cache', 'graph_update', 'session_summary'],
    timeout: 5000,
    retryOnFail: false,
    maxRetries: 1,
    execute: null,
    autoTrigger: true,
    cardFile: 'memoryManager.js'
},       
    {
    id: 'text_generation',
        name: 'Text Generation',
        icon: '💬',
        category: 'generation',
        description: 'Tiered text gen: Pollinations → Browser Model (SmolLM2 135M) → Scripted fallback',
        matchPatterns: [
            'hello', 'hi', 'hey', "what's up",
            'generate', 'write', 'create', 'tell me', 'explain',
            'describe', 'story', 'poem', 'text', 'say', 'what is',
            'how to', 'why', 'think', 'imagine', 'compose',
            'what do you know', 'what do you remember', 'audit',
            'status', 'report', 'help', 'who are you', 'what are you',
            'remember', 'recall', 'memory'
        ],
        defaultWeight: 0.6,
        requires: [],
        produces: ['text_output'],
        timeout: 60000,
        retryOnFail: false,
        maxRetries: 1,
        execute: null,
        cardFile: 'textGeneration.js'
    },
    {
        id: 'pollinations_image',
        name: 'Pollinations Image',
        icon: '🎨',
        category: 'generation',
        description: 'Generate images via Pollinations.ai',
        matchPatterns: [
            'image', 'picture', 'draw', 'visual', 'show me',
            'generate image', 'create image', 'art', 'photo',
            'illustration', 'depict', 'render', 'sketch'
        ],
        defaultWeight: 0.4,
        requires: [],
        produces: ['image_output', 'image_url'],
        timeout: 20000,
        retryOnFail: false,
        maxRetries: 1,
        execute: null,
        cardFile: 'pollinationsImage.js'
    },
    {
        id: 'browser_hunt',
        name: 'Browser Hunt',
        icon: '🏹',
        category: 'retrieval',
        description: 'Search the web or fetch live data',
        matchPatterns: [
            'search', 'find online', 'look up on', 'google',
            'fetch', 'retrieve url', 'get from web', 'latest',
            'current', 'news', 'real time', 'live data'
        ],
        defaultWeight: 0.3,
        requires: [],
        produces: ['web_context', 'fetched_data'],
        timeout: 10000,
        retryOnFail: true,
        maxRetries: 2,
        execute: null,
        cardFile: 'browserHunt.js'
    },
    {
        id: 'compress',
        name: 'COMPRESS',
        icon: '🗜️',
        category: 'memory',
        description: 'Extract patterns from conversation, write to GaiaDB, update weights',
        matchPatterns: [
            'compress', 'save this', 'remember this', 'store',
            'log', 'note this', 'keep this', 'archive', 'record',
            'pattern', 'learn', 'update memory'
        ],
        defaultWeight: 0.6,
        requires: ['supabase_client'],
        produces: ['compressed_memory', 'pattern_update'],
        timeout: 10000,
        retryOnFail: true,
        maxRetries: 2,
        execute: null,
        cardFile: 'compress.js'
    },
    {
        id: 'decision_log',
        name: 'Decision Logger',
        icon: '📊',
        category: 'meta',
        description: 'Log card decisions and outcomes for weight learning',
        matchPatterns: [],
        defaultWeight: 1.0,
        requires: ['supabase_client'],
        produces: ['decision_record'],
        timeout: 2000,
        retryOnFail: false,
        maxRetries: 1,
        execute: null,
        autoTrigger: true,
        cardFile: 'decisionLog.js'
    }
];

// ============================================
// CATEGORY DEFINITIONS
// ============================================
const CARD_CATEGORIES = {
    memory: {
        label: 'Memory & Recall',
        color: '#a78bfa',
        priority: 2
    },
    generation: {
        label: 'Content Generation',
        color: '#60a5fa',
        priority: 3
    },
    retrieval: {
        label: 'External Retrieval',
        color: '#f59e0b',
        priority: 3
    },
    meta: {
        label: 'System Operations',
        color: '#6b7280',
        priority: 1
    }
};

// ============================================
// ROUTER CONFIGURATION
// ============================================
const ROUTER_CONFIG = {
    confidenceThreshold: 0.35,
    maxCardsPerTurn: 3,
    allowDuplicateCards: false,
    executionOrder: ['meta', 'memory', 'retrieval', 'generation'],
    learningRate: 0.05,
    learningWarmup: 5,
    classifierMode: 'heuristic',
    mlModel: {
        task: 'zero-shot-classification',
        model: 'Xenova/distilbert-base-uncased-mnli',
        candidateLabels: [],
        hypothesisTemplate: "The user wants to {}",
        cacheModel: true
    }
};

// ============================================
// PERSISTENCE CONFIG
// ============================================
const PERSISTENCE_CONFIG = {
    decisionsTable: 'artemis_decisions',
    patternsTable: 'artemis_patterns',
    weightsTable: 'artemis_card_weights',
    localKeys: {
        compressedMemory: 'artemis_compressed_memory',
        recentActions: 'artemis_recent_actions',
        cardWeights: 'artemis_card_weights',
        decisionHistory: 'artemis_decision_history'
    },
    maxLocalDecisions: 100
};

// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_CONFIG = {
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
// EXPORT
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ARTEMIS_CARD_DECK,
        CARD_CATEGORIES,
        ROUTER_CONFIG,
        PERSISTENCE_CONFIG,
        SUPABASE_CONFIG
    };
}
