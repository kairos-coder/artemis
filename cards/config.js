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
        // Negative patterns: if ANY of these are present, this card is penalized
        negativePatterns: [],
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
        negativePatterns: [],
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
        id: 'model_deck',
        name: 'Model Deck',
        icon: '🧩',
        category: 'meta',
        description: 'Registry of loaded browser models — reserved for future cross-Olympian model sharing',
        matchPatterns: [],
        negativePatterns: [],
        defaultWeight: 1.0,
        requires: [],
        produces: ['model_inference'],
        timeout: 5000,
        retryOnFail: false,
        maxRetries: 1,
        execute: null,
        autoTrigger: false,
        cardFile: 'modelDeck.js'
    },
    
    {
        id: 'card_voter',
        name: 'Card Voter',
        icon: '🧠',
        category: 'meta',
        description: 'Heuristic card voting engine — no external model required',
        matchPatterns: [],
        negativePatterns: [],
        defaultWeight: 1.0,
        requires: [],
        produces: ['card_votes'],
        timeout: 1000,
        retryOnFail: false,
        maxRetries: 0,
        execute: null,
        autoTrigger: false,
        cardFile: 'cardVoter.js'
    },
    
    {
        id: 'text_generation',
        name: 'Text Generation',
        icon: '💬',
        category: 'generation',
        description: 'Tiered text gen: Pollinations → Scripted fallback',
        matchPatterns: [
            'hello', 'hi', 'hey', "what's up", 'how are you', 'how is it going',
            'how\'s it going', 'good morning', 'good evening',
            'explain', 'tell me', 'what is', 'how to', 'why',
            'describe', 'think', 'help', 'who are you', 'what are you',
            'thanks', 'thank you', 'please',
            'status', 'audit', 'report', 'cards', 'deck', 'weights',
            'history', 'recent', 'help',
            'your programming', 'your code', 'your tools', 'your architecture',
            'improve you', 'how you work', 'your system'
        ],
        negativePatterns: [
            'generate image', 'create image', 'make an image', 'draw me',
            'show me a picture', 'visualize', 'render', 'image of', 'picture of'
        ],
        defaultWeight: 0.55,
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
        description: 'Generate images via Pollinations.ai — only when explicitly requested',
        matchPatterns: [
            'generate an image', 'create an image', 'make an image',
            'generate image', 'create image', 'make image',
            'draw me a', 'draw a', 'show me a picture',
            'visualize this', 'render an image', 'render a',
            'image of a', 'picture of a', 'photo of a',
            'art of a', 'illustration of', 'depict',
            'generate a picture', 'create a picture',
            'show me what', 'what does it look like'
        ],
        negativePatterns: [
            'how', 'what', 'why', 'when', 'where', 'who',
            'hello', 'hi', 'hey', 'thanks', 'status', 'help',
            'your', 'you', 'memory', 'recall', 'remember',
            'compress', 'hunt', 'search', 'find',
            'code', 'programming', 'system', 'card', 'deck'
        ],
        defaultWeight: 0.35,
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
        description: 'Hunt through kairos-coder repos — reads HTML, JS, CSS, MD, and JSON files',
        matchPatterns: [
            'hunt for', 'search for', 'find in', 'look for',
            'browser hunt', 'search the repos', 'hunt across',
            'find across', 'search all projects', 'hunt the repos',
            'find in my code', 'search my code', 'find file',
            'where is the code', 'find in repo'
        ],
        negativePatterns: [
            'generate image', 'create image', 'draw',
            'hello', 'hi', 'hey', 'thanks', 'status'
        ],
        defaultWeight: 0.3,
        requires: [],
        produces: ['web_context', 'fetched_data'],
        timeout: 15000,
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
        description: 'Extract patterns from conversation, build Ealdforn compression token, write to GaiaDB, update weights',
        matchPatterns: [
            'compress', 'save this', 'remember this', 'store',
            'log this', 'note this', 'keep this', 'archive', 'record',
            'pattern', 'learn', 'update memory'
        ],
        negativePatterns: [],
        defaultWeight: 0.6,
        requires: ['supabase_client'],
        produces: ['compressed_memory', 'pattern_update', 'ealdforn_token'],
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
        negativePatterns: [],
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
    // Minimum confidence score for a card to be played
    confidenceThreshold: 0.35,
    
    // Maximum cards that can fire per turn
    maxCardsPerTurn: 3,
    
    // Whether the same card can fire multiple times per turn
    allowDuplicateCards: false,
    
    // Execution order by category priority
    executionOrder: ['meta', 'memory', 'retrieval', 'generation'],
    
    // Weight learning
    learningRate: 0.05,
    learningWarmup: 5,
    
    // Classification mode
    classifierMode: 'heuristic',
    
    // Negative pattern penalty: multiplier applied when negative patterns match
    negativePatternPenalty: 0.6,
    
    // Default card if nothing matches
    defaultCard: 'text_generation'
};

// ============================================
// PERSISTENCE CONFIG
// ============================================
const PERSISTENCE_CONFIG = {
    // GaiaDB tables
    decisionsTable: 'artemis_decisions',
    patternsTable: 'artemis_patterns',
    weightsTable: 'artemis_card_weights',
    
    // LocalStorage keys
    localKeys: {
        compressedMemory: 'artemis_compressed_memory',
        recentActions: 'artemis_recent_actions',
        cardWeights: 'artemis_card_weights',
        decisionHistory: 'artemis_decision_history',
        voterModelState: 'artemis_voter_model_state',
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
// AUTO-TRIGGER CARDS (run every cycle)
// ============================================
const AUTO_TRIGGER_CARDS = ['memory_manager', 'decision_log'];

// ============================================
// EXPORT
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ARTEMIS_CARD_DECK,
        CARD_CATEGORIES,
        ROUTER_CONFIG,
        PERSISTENCE_CONFIG,
        SUPABASE_CONFIG,
        AUTO_TRIGGER_CARDS
    };
}
