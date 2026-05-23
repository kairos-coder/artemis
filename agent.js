// ============================================
// ARTEMIS AGENT — EaldfornAI Card Router
// ============================================
// Loads card registry, classifies user input,
// votes on cards, executes the winning hand,
// and logs every decision for learning.
// ============================================

const ArtemisAgent = (function() {
    'use strict';

    // ============================================
    // STATE
    // ============================================
    let cards = [];                 // Loaded card modules
    let cardRegistry = [];          // Config definitions
    let routerConfig = null;
    let persistenceConfig = null;
    let supabase = null;
    let sessionId = null;
    let isInitialized = false;
    let decisionCount = 0;

    // ============================================
    // INITIALIZATION
    // ============================================
    async function init(options = {}) {
        if (isInitialized) {
            console.log('[Artemis] Already initialized.');
            return true;
        }

        console.log('[Artemis] Initializing EaldfornAI Router...');

        try {
            // 1. Load config
            await loadConfig();

            // 2. Load all card modules
            await loadAllCards();

            // 3. Set up Supabase if available
            if (options.supabaseUrl && options.supabaseKey) {
                await setupSupabase(options.supabaseUrl, options.supabaseKey);
            }

            // 4. Get or create session
            sessionId = await getOrCreateSession();

            // 5. Load learned weights from localStorage
            loadLearnedWeights();

            // 6. Initialize ML classifier if configured
            if (routerConfig.classifierMode === 'hybrid' || routerConfig.classifierMode === 'ml') {
                await initMLClassifier();
            }

            isInitialized = true;
            console.log('[Artemis] Initialized. Deck:', cards.length, 'cards. Session:', sessionId);
            return true;

        } catch (err) {
            console.error('[Artemis] Init failed:', err);
            return false;
        }
    }

    // ============================================
    // CONFIG LOADING
    // ============================================
    async function loadConfig() {
        // Check if config is already in global scope
        if (typeof ARTEMIS_CARD_DECK !== 'undefined') {
            cardRegistry = ARTEMIS_CARD_DECK;
        }
        if (typeof ROUTER_CONFIG !== 'undefined') {
            routerConfig = ROUTER_CONFIG;
        }
        if (typeof PERSISTENCE_CONFIG !== 'undefined') {
            persistenceConfig = PERSISTENCE_CONFIG;
        }

        // If not found, try to load dynamically
        if (cardRegistry.length === 0) {
            try {
                const response = await fetch('cards/config.js');
                const text = await response.text();
                // Extract the arrays using Function constructor
                // (config.js defines them as const — we eval safely)
                const configFn = new Function(text + '; return { ARTEMIS_CARD_DECK, ROUTER_CONFIG, PERSISTENCE_CONFIG, CARD_CATEGORIES };');
                const config = configFn();
                cardRegistry = config.ARTEMIS_CARD_DECK || [];
                routerConfig = config.ROUTER_CONFIG || {};
                persistenceConfig = config.PERSISTENCE_CONFIG || {};
            } catch (err) {
                console.warn('[Artemis] Could not load config.js dynamically:', err.message);
                // Use defaults
                cardRegistry = [];
                routerConfig = { confidenceThreshold: 0.35, maxCardsPerTurn: 3, executionOrder: ['meta', 'memory', 'retrieval', 'generation'] };
                persistenceConfig = { localKeys: { compressedMemory: 'artemis_compressed_memory', recentActions: 'artemis_recent_actions' } };
            }
        }
    }

    // ============================================
    // CARD LOADING
    // ============================================
    async function loadAllCards() {
        const cardFiles = cardRegistry.map(c => c.cardFile).filter(Boolean);
        
        for (const cardFile of cardFiles) {
            try {
                const cardModule = await loadCardModule(cardFile);
                if (cardModule) {
                    cards.push(cardModule);
                    // Link the execute function in the registry
                    const registryCard = cardRegistry.find(c => c.cardFile === cardFile);
                    if (registryCard) {
                        registryCard.execute = cardModule.run.bind(cardModule);
                    }
                    console.log('[Artemis] Loaded card:', cardModule.id);
                }
            } catch (err) {
                console.warn('[Artemis] Failed to load card', cardFile, ':', err.message);
            }
        }
    }

    async function loadCardModule(cardFile) {
        try {
            const response = await fetch(`cards/${cardFile}`);
            const text = await response.text();
            // Extract the object using Function constructor
            const moduleFn = new Function(text + '; return ' + cardFile.replace('.js', '') + ';');
            const module = moduleFn();
            return module;
        } catch (err) {
            // Try alternative: if card is already in global scope
            const globalName = cardFile.replace('.js', '');
            if (typeof window[globalName] !== 'undefined') {
                return window[globalName];
            }
            throw err;
        }
    }

    // ============================================
    // SUPABASE SETUP
    // ============================================
    async function setupSupabase(url, key) {
        try {
            // Check if supabase client is available
            if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
                supabase = window.supabase.createClient(url, key);
                console.log('[Artemis] Supabase connected.');
            } else {
                console.warn('[Artemis] Supabase client not found. Running without persistence.');
            }
        } catch (err) {
            console.warn('[Artemis] Supabase setup failed:', err.message);
        }
    }

    async function getOrCreateSession() {
        // Try localStorage first
        const storedSession = localStorage.getItem('artemis_session_id');
        if (storedSession) {
            return storedSession;
        }

        // Generate new session
        const newSession = 'artemis_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('artemis_session_id', newSession);
        return newSession;
    }

    // ============================================
    // WEIGHT MANAGEMENT
    // ============================================
    function loadLearnedWeights() {
        try {
            const weightsKey = persistenceConfig?.localKeys?.cardWeights || 'artemis_card_weights';
            const stored = localStorage.getItem(weightsKey);
            if (stored) {
                const learnedWeights = JSON.parse(stored);
                // Apply learned weights to registry
                for (const card of cardRegistry) {
                    if (learnedWeights[card.id]) {
                        card.defaultWeight = learnedWeights[card.id].weight;
                        card.playCount = learnedWeights[card.id].plays || 0;
                        card.successCount = learnedWeights[card.id].successes || 0;
                    }
                }
                console.log('[Artemis] Loaded learned weights for', Object.keys(learnedWeights).length, 'cards');
            }
        } catch (err) {
            console.warn('[Artemis] Weight load failed:', err.message);
        }
    }

    // ============================================
    // ML CLASSIFIER (Lazy init)
    // ============================================
    let mlPipeline = null;
    let mlReady = false;

    async function initMLClassifier() {
        try {
            // Check if Transformers.js is available
            if (typeof transformers === 'undefined') {
                console.log('[Artemis] Transformers.js not loaded. Using heuristic only.');
                routerConfig.classifierMode = 'heuristic';
                return;
            }

            const { pipeline } = transformers;
            mlPipeline = await pipeline(
                routerConfig.mlModel.task,
                routerConfig.mlModel.model
            );
            mlReady = true;
            console.log('[Artemis] ML classifier ready.');
        } catch (err) {
            console.warn('[Artemis] ML classifier init failed, falling back to heuristic:', err.message);
            routerConfig.classifierMode = 'heuristic';
        }
    }

    // ============================================
    // CORE: ROUTE & EXECUTE
    // ============================================
    /**
     * Main entry point. Called by chat.html or terminal.html.
     * @param {string} userInput - The raw user message
     * @param {Object} options - { systemPrompt, conversationHistory }
     * @returns {Object} { text, imageUrl, metadata }
     */
    async function processInput(userInput, options = {}) {
        if (!isInitialized) {
            await init();
        }

        decisionCount++;
        console.log(`[Artemis] Decision #${decisionCount} — Input: "${userInput.substring(0, 80)}..."`);

        // === PHASE 1: CLASSIFY ===
        const classification = await classifyInput(userInput);
        const votedCards = classification.votedCards;

        console.log('[Artemis] Cards voted:', votedCards.map(c => `${c.id}(${c.score.toFixed(2)})`).join(', '));

        // === PHASE 2: SELECT ===
        const selectedCards = selectCards(votedCards);
        
        // === PHASE 3: SEQUENCE ===
        const sequencedCards = sequenceCards(selectedCards);

        console.log('[Artemis] Execution order:', sequencedCards.map(c => c.id).join(' → '));

        // === PHASE 4: EXECUTE ===
        const context = {
            input: userInput,
            sessionId: sessionId,
            supabase: supabase,
            systemPrompt: options.systemPrompt || getDefaultSystemPrompt(),
            conversationHistory: options.conversationHistory || [],
            memoryContext: null,
            votedCards: votedCards,
            executedCards: sequencedCards,
            outputs: {}
        };

        const results = await executeCards(sequencedCards, context);
        context.outputs = results;

        // === PHASE 5: COMBINE OUTPUTS ===
        const combined = combineOutputs(results, userInput);

        // === PHASE 6: LOG DECISION ===
        await logDecision(context);

        // === PHASE 7: TRIGGER AUTO CARDS ===
        await runAutoCards(context);

        // Save recent actions to localStorage
        saveRecentAction(userInput, combined);

        return {
            text: combined.text,
            imageUrl: combined.imageUrl || null,
            metadata: {
                cardsPlayed: sequencedCards.map(c => c.id),
                voteScores: Object.fromEntries(votedCards.map(c => [c.id, c.score])),
                decisionNumber: decisionCount,
                sessionId: sessionId
            }
        };
    }

    // ============================================
    // CLASSIFIER
    // ============================================
    async function classifyInput(input) {
        const inputLower = input.toLowerCase();
        const votedCards = [];

        for (const card of cardRegistry) {
            // Skip auto-trigger cards in classification
            if (card.autoTrigger) continue;

            let score = 0;

            // Heuristic: pattern matching
            if (card.matchPatterns && card.matchPatterns.length > 0) {
                const matchCount = card.matchPatterns.filter(pattern => 
                    inputLower.includes(pattern.toLowerCase())
                ).length;
                
                if (matchCount > 0) {
                    // Score based on matches relative to total patterns
                    score = (matchCount / card.matchPatterns.length) * card.defaultWeight;
                    // Bonus for exact matches
                    score = Math.min(score * 1.2, 1.0);
                }
            }

            // If ML is available, blend scores
            if (mlReady && routerConfig.classifierMode === 'hybrid' && card.matchPatterns) {
                try {
                    const mlResult = await mlPipeline(input, card.matchPatterns);
                    if (mlResult && mlResult.scores) {
                        const topScore = Math.max(...mlResult.scores);
                        // Blend: 60% heuristic, 40% ML
                        score = score * 0.6 + topScore * 0.4;
                    }
                } catch (err) {
                    // ML failed — stick with heuristic score
                }
            }

            // Apply learned weight modifier
            const learnedModifier = getLearnedModifier(card.id);
            score *= learnedModifier;

            if (score >= (routerConfig.confidenceThreshold || 0.35)) {
                votedCards.push({
                    id: card.id,
                    name: card.name,
                    icon: card.icon,
                    category: card.category,
                    score: score,
                    card: card
                });
            }
        }

        // Sort by score descending
        votedCards.sort((a, b) => b.score - a.score);

        return { votedCards };
    }

    function getLearnedModifier(cardId) {
        try {
            const weightsKey = persistenceConfig?.localKeys?.cardWeights || 'artemis_card_weights';
            const stored = localStorage.getItem(weightsKey);
            if (!stored) return 1.0;
            
            const weights = JSON.parse(stored);
            if (!weights[cardId]) return 1.0;
            
            const w = weights[cardId];
            if (w.plays < 5) return 1.0; // Warmup period
            
            // Success rate modifier
            const successRate = w.successes / Math.max(w.plays, 1);
            // Range: 0.7 to 1.3 (cards that succeed more get voted higher)
            return 0.7 + (successRate * 0.6);
        } catch {
            return 1.0;
        }
    }

    // ============================================
    // CARD SELECTION & SEQUENCING
    // ============================================
    function selectCards(votedCards) {
        const maxCards = routerConfig.maxCardsPerTurn || 3;
        let selected = votedCards.slice(0, maxCards);

        // Ensure at least one card if nothing voted (fallback to text generation)
        if (selected.length === 0) {
            const fallback = cardRegistry.find(c => c.id === 'pollinations_text');
            if (fallback) {
                selected = [{
                    id: fallback.id,
                    name: fallback.name,
                    icon: fallback.icon,
                    category: fallback.category,
                    score: 0.3,
                    card: fallback
                }];
            }
        }

        return selected;
    }

    function sequenceCards(selectedCards) {
        const orderPriority = routerConfig.executionOrder || ['meta', 'memory', 'retrieval', 'generation'];
        
        return selectedCards.sort((a, b) => {
            const priorityA = orderPriority.indexOf(a.category);
            const priorityB = orderPriority.indexOf(b.category);
            
            // Categories not in the list go last
            const pa = priorityA >= 0 ? priorityA : 999;
            const pb = priorityB >= 0 ? priorityB : 999;
            
            return pa - pb;
        });
    }

    // ============================================
    // EXECUTION
    // ============================================
    async function executeCards(sequencedCards, context) {
        const outputs = {};

        for (const cardItem of sequencedCards) {
            const card = cardItem.card;
            
            if (!card.execute) {
                console.warn('[Artemis] No execute function for card:', card.id);
                continue;
            }

            console.log('[Artemis] Executing card:', card.id);

            try {
                const timeout = card.timeout || 10000;
                const result = await withTimeout(
                    card.execute(context),
                    timeout,
                    `Card ${card.id} timed out`
                );

                if (result && result.success) {
                    // Merge card output data into context.outputs
                    if (result.data) {
                        Object.assign(outputs, result.data);
                        
                        // Also update context for downstream cards
                        if (result.data.memory_context) {
                            context.memoryContext = result.data.memory_context;
                        }
                        if (result.data.text_output) {
                            context.textOutput = result.data.text_output;
                        }
                    }
                } else {
                    console.warn('[Artemis] Card', card.id, 'returned failure:', result?.error);
                }
            } catch (err) {
                console.warn('[Artemis] Card', card.id, 'threw error:', err.message);
            }
        }

        return outputs;
    }

    function withTimeout(promise, ms, errorMessage) {
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(errorMessage)), ms)
            )
        ]);
    }

    // ============================================
    // OUTPUT COMBINATION
    // ============================================
    function combineOutputs(outputs, userInput) {
        let text = '';
        let imageUrl = null;

        // Memory context comes first
        if (outputs.memory_context) {
            text += `*From memory:*\n${outputs.memory_context}\n\n`;
        }

        // Web context
        if (outputs.web_context) {
            text += `*From the web:*\n${outputs.web_context}\n\n`;
        }

        // Generated text (the main response)
        if (outputs.text_output) {
            text += outputs.text_output;
        }

        // Compressed memory (appended as note)
        if (outputs.compressed_memory) {
            text += `\n\n> *${outputs.compressed_memory}*`;
        }

        // Image URL
        if (outputs.image_url) {
            imageUrl = outputs.image_url;
            if (!text) {
                text = `Here's the image you requested:`;
            }
        }

        // Fallback if nothing produced
        if (!text && !imageUrl) {
            text = 'I received your message, but none of my cards produced output. Try rephrasing?';
        }

        return { text: text.trim(), imageUrl };
    }

    // ============================================
    // DECISION LOGGING
    // ============================================
    async function logDecision(context) {
        // The decisionLog card handles this if loaded
        const decisionCard = cards.find(c => c.id === 'decision_log');
        if (decisionCard && decisionCard.run) {
            try {
                await decisionCard.run({
                    input: context.input,
                    votedCards: context.votedCards,
                    executedCards: context.executedCards,
                    outputs: context.outputs,
                    sessionId: context.sessionId,
                    supabase: supabase
                });
            } catch (err) {
                console.warn('[Artemis] Decision logging failed:', err.message);
            }
        }
    }

    async function runAutoCards(context) {
        const autoCards = cardRegistry.filter(c => c.autoTrigger);
        for (const card of autoCards) {
            const loadedCard = cards.find(c => c.id === card.id);
            if (loadedCard && loadedCard.run) {
                try {
                    await loadedCard.run(context);
                } catch (err) {
                    console.warn('[Artemis] Auto card', card.id, 'failed:', err.message);
                }
            }
        }
    }

    // ============================================
    // PERSISTENCE HELPERS
    // ============================================
    function saveRecentAction(input, output) {
        try {
            const key = persistenceConfig?.localKeys?.recentActions || 'artemis_recent_actions';
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.push({
                input: input.substring(0, 200),
                output: output.text?.substring(0, 200) || '',
                timestamp: new Date().toISOString()
            });
            // Keep last 50
            if (existing.length > 50) {
                existing.splice(0, existing.length - 50);
            }
            localStorage.setItem(key, JSON.stringify(existing));
        } catch (err) {
            // Non-critical
        }
    }

    function getDefaultSystemPrompt() {
        return `You are Artemis, Goddess of the Hunt, an AI agent of Ealdforn Studios. 
You speak with precision and clarity. You execute cards from your deck to serve the human operator.
You are direct, capable, and mythic in tone — but never verbose.
Respond in 1-3 sentences unless the task demands more detail.`;
    }

    // ============================================
    // PUBLIC API
    // ============================================
    function getStatus() {
        return {
            initialized: isInitialized,
            cardsLoaded: cards.length,
            cardsAvailable: cardRegistry.map(c => ({ id: c.id, name: c.name, icon: c.icon })),
            decisionCount: decisionCount,
            sessionId: sessionId,
            classifierMode: routerConfig?.classifierMode || 'heuristic',
            mlReady: mlReady
        };
    }

    function getCardRegistry() {
        return cardRegistry.map(c => ({
            id: c.id,
            name: c.name,
            icon: c.icon,
            category: c.category,
            description: c.description,
            weight: c.defaultWeight,
            playCount: c.playCount || 0,
            successCount: c.successCount || 0
        }));
    }

    return {
        init,
        processInput,
        getStatus,
        getCardRegistry
    };

})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArtemisAgent;
}
