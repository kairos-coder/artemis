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
            'find in', 'search db', 'what do you know about'
        ],
        defaultWeight: 0.7,
        requires: ['supabase_client'],
        produces: ['memory_context'],
        timeout: 3000,
        retryOnFail: true,
        maxRetries: 2,
        // Function reference — loaded dynamically or hard-coded
        execute: null, // Set at runtime: execute: gaiaRecall.run
        cardFile: 'gaiaRecall.js'
    },
    {
        id: 'pollinations_text',
        name: 'Pollinations Text',
        icon: '💬',
        category: 'generation',
        description: 'Generate text via Pollinations.ai free API',
        matchPatterns: [
            'generate', 'write', 'create', 'tell me', 'explain',
            'describe', 'story', 'poem', 'text', 'say', 'what is',
            'how to', 'why', 'think', 'imagine', 'compose'
        ],
        defaultWeight: 0.5,
        requires: [],
        produces: ['text_output'],
        timeout: 15000,
        retryOnFail: true,
        maxRetries: 2,
        execute: null,
        cardFile: 'pollinationsText.js'
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
        matchPatterns: [
            // This card auto-triggers on every routing event — no user patterns needed
        ],
        defaultWeight: 1.0, // Always executes
        requires: ['supabase_client'],
        produces: ['decision_record'],
        timeout: 2000,
        retryOnFail: false,
        maxRetries: 1,
        execute: null,
        autoTrigger: true, // Always runs after routing
        cardFile: 'decisionLog.js'
    }
];

// ============================================
// CATEGORY DEFINITIONS
// ============================================
const CARD_CATEGORIES = {
    memory: {
        label: 'Memory & Recall',
        color: '#a78bfa', // purple
        priority: 2 // Higher priority cards execute first in sequence
    },
    generation: {
        label: 'Content Generation',
        color: '#60a5fa', // blue
        priority: 3
    },
    retrieval: {
        label: 'External Retrieval',
        color: '#f59e0b', // amber
        priority: 3
    },
    meta: {
        label: 'System Operations',
        color: '#6b7280', // gray
        priority: 1 // Meta always first
    }
};

// ============================================
// ROUTER CONFIGURATION
// ============================================
const ROUTER_CONFIG = {
    // Minimum confidence threshold for playing a card
    confidenceThreshold: 0.35,
    
    // Maximum cards to play per turn
    maxCardsPerTurn: 3,
    
    // Allow the same card twice in one turn?
    allowDuplicateCards: false,
    
    // Sequence order: meta → memory → retrieval → generation
    executionOrder: ['meta', 'memory', 'retrieval', 'generation'],
    
    // Learning rate for weight adjustments (0-1)
    learningRate: 0.05,
    
    // Minimum sessions before weights start adjusting
    learningWarmup: 5,
    
    // Classifier mode: 'heuristic' | 'ml' | 'hybrid'
    classifierMode: 'hybrid',
    
    // ML model config (Transformers.js)
    mlModel: {
        task: 'zero-shot-classification',
        model: 'Xenova/distilbert-base-uncased-mnli',
        candidateLabels: [], // Populated dynamically from card matchPatterns
        hypothesisTemplate: "The user wants to {}",
        cacheModel: true
    }
};

// ============================================
// PERSISTENCE CONFIG
// ============================================
const PERSISTENCE_CONFIG = {
    // Supabase table for card decisions
    decisionsTable: 'artemis_decisions',
    
    // Supabase table for learned patterns
    patternsTable: 'artemis_patterns',
    
    // Supabase table for card weight history
    weightsTable: 'artemis_card_weights',
    
    // localStorage keys
    localKeys: {
        compressedMemory: 'artemis_compressed_memory',
        recentActions: 'artemis_recent_actions',
        cardWeights: 'artemis_card_weights',
        decisionHistory: 'artemis_decision_history'
    },
    
    // Max localStorage entries before compression
    maxLocalDecisions: 100
};
// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_CONFIG = {
    // Project URL
    url: 'https://nbdvavzqvxrlxhsbrluz.supabase.co',
    
    // Publishable (anon) key — rotate via Supabase dashboard
    anonKey: 'sb_publishable_6x1xlieXjs3dWqEETQcxnQ_4L1UO2uR',
    
    // Table mapping
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
        PERSISTENCE_CONFIG
    };
}
