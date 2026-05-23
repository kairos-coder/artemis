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
        id: 'model_deck',
        name: 'Model Deck',
        icon: '🧩',
        category: 'meta',
        description: 'Registry of all loaded browser models — allows cards to request specialized inference',
        matchPatterns: [],
        defaultWeight: 1.0,
        requires: [],
        produces: ['model_inference'],
        timeout: 5000,
        retryOnFail: false,
        maxRetries: 1,
        execute: null,
        autoTrigger: true,
        cardFile: 'modelDeck.js'
    },
    {
        id: 'card_voter',
        name: 'Card Voter',
        icon: '🧠',
        category: 'meta',
        description: 'Browser model (SmolLM2 135M ~86MB) that votes YES/NO on tool cards — smart classification above heuristic fallback',
        matchPatterns: [],
        defaultWeight: 1.0,
        requires: [],
        produces: ['card_votes'],
        timeout: 5000,
        retryOnFail: false,
        maxRetries: 1,
        execute: null,
        autoTrigger: true,
        cardFile: 'cardVoter.js'
    },
    
    {
        id: 'text_generation',
        name: 'Text Generation',
        icon: '💬',
        category: 'generation',
        description: 'Tiered text gen: Pollinations → Browser Model (Qwen2 0.5B) → Scripted fallback',
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
        description: 'Extract patterns from conversation, build Ealdforn compression token, write to GaiaDB, update weights',
        matchPatterns: [
            'compress', 'save this', 'remember this', 'store',
            'log', 'note this', 'keep this', 'archive', 'record',
            'pattern', 'learn', 'update memory'
        ],
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
    maxCardsPerTurn: 4,
    
    // Whether the same card can fire multiple times per turn
    allowDuplicateCards: false,
    
    // Execution order by category priority
    executionOrder: ['meta', 'memory', 'retrieval', 'generation'],
    
    // Weight learning
    learningRate: 0.05,
    learningWarmup: 5,
    
    // Classification mode: 'heuristic' or 'ml'
    // ML mode activates when card_voter model is loaded
    classifierMode: 'heuristic',
    
    // Card voter configuration (dedicated decision engine)
    cardVoter: {
        enabled: true,
        primaryModel: 'SmolLM2-135M-Instruct-q4f16_1-MLC-1k',
        primaryLabel: 'SmolLM2 135M',
        primarySize: '~86 MB',
        fallbackModel: 'Qwen2-0.5B-Instruct-q4f16_1-MLC-1k',
        fallbackLabel: 'Qwen2 0.5B',
        loadOnBoot: true,
        warmupPrompt: 'Card: test\nDescription: This is a test card\nUser input: "hello"\n\nDoes this card match the user\'s intent? Answer only YES or NO.',
        fallbackToHeuristic: true
    },
    
    // Legacy ML config (used if card_voter is disabled)
    mlModel: {
        task: 'text-generation',
        model: 'SmolLM2-135M-Instruct-q4f16_1-MLC-1k',
        fallbackModel: 'Qwen2-0.5B-Instruct-q4f16_1-MLC-1k',
        label: 'SmolLM2 135M',
        size: '~86 MB',
        cacheModel: true,
        useForVoting: true,
        candidateLabels: [],
        hypothesisTemplate: "The user wants to {}"
    }
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
// Cards with autoTrigger: true are added here automatically
// by the agent loader. Listed explicitly for clarity.
const AUTO_TRIGGER_CARDS = ['memory_manager', 'card_voter', 'decision_log'];

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
