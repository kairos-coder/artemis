// ============================================
// ARTEMIS AGENT — EaldfornAI Card Router v2.1
// ============================================
// Loads card registry from config.js
// Reads Supabase config from SUPABASE_CONFIG
// Classifies → Selects → Sequences → Executes → Combines → Logs
// Heuristic classifier (ML disabled pending CDN fix)
// All persistence via GaiaDB + localStorage
// ============================================

const ArtemisAgent = (function() {
    'use strict';

    // ============================================
    // STATE
    // ============================================
    let cards = [];
    let cardRegistry = [];
    let routerConfig = null;
    let persistenceConfig = null;
    let supabase = null;
    let sessionId = null;
    let isInitialized = false;
    let decisionCount = 0;

    // ============================================
    // INITIALIZATION
    // ============================================
    async function init() {
        if (isInitialized) {
            console.log('[Artemis] Already initialized.');
            return true;
        }

        console.log('[Artemis] Initializing EaldfornAI Router...');
        printBanner();

        try {
            // 1. Load config (cards, router, persistence, supabase)
            loadConfig();

            // 2. Load all card modules
            await loadAllCards();

            // 3. Connect Supabase
            await connectSupabase();

            // 4. Get or create session
            sessionId = getOrCreateSession();

            // 5. Load learned weights
            loadLearnedWeights();

            // 6. Classifier mode (ML disabled pending CDN fix)
            routerConfig.classifierMode = 'heuristic';
            console.log('[Artemis] Classifier: heuristic (ML disabled — CDN fix pending)');

            isInitialized = true;
            console.log('[Artemis] ✓ Initialized — %d cards, session: %s', cards.length, sessionId.substring(0, 16));
            return true;

        } catch (err) {
            console.error('[Artemis] ✗ Init failed:', err);
            return false;
        }
    }

    function printBanner() {
        console.log('🏹  ═══════════════════════════════════');
        console.log('    ARTEMIS — EaldfornAI Card Router');
        console.log('    Monastery Phase-Lock: ACTIVE');
        console.log('    ═══════════════════════════════════');
    }

    // ============================================
    // CONFIG LOADING
    // ============================================
    function loadConfig() {
        // All configs come from cards/config.js (loaded via <script> tag)
        if (typeof ARTEMIS_CARD_DECK !== 'undefined') {
            cardRegistry = ARTEMIS_CARD_DECK;
        } else {
            throw new Error('ARTEMIS_CARD_DECK not found. Is cards/config.js loaded?');
        }

        routerConfig = typeof ROUTER_CONFIG !== 'undefined' 
            ? ROUTER_CONFIG 
            : { confidenceThreshold: 0.35, maxCardsPerTurn: 3, executionOrder: ['meta', 'memory', 'retrieval', 'generation'] };

        persistenceConfig = typeof PERSISTENCE_CONFIG !== 'undefined'
            ? PERSISTENCE_CONFIG
            : { localKeys: { compressedMemory: 'artemis_compressed_memory', recentActions: 'artemis_recent_actions', cardWeights: 'artemis_card_weights', decisionHistory: 'artemis_decision_history' } };

        console.log('[Artemis] Config loaded — %d cards in registry', cardRegistry.length);
    }

    // ============================================
    // CARD LOADING
    // ============================================
    async function loadAllCards() {
        const cardFiles = cardRegistry
            .map(c => c.cardFile)
            .filter(Boolean);

        let loaded = 0;
        let failed = 0;

        for (const cardFile of cardFiles) {
            try {
                const cardModule = await loadCardModule(cardFile);
                if (cardModule) {
                    cards.push(cardModule);
                    // Link execute function in registry
                    const registryCard = cardRegistry.find(c => c.cardFile === cardFile);
                    if (registryCard) {
                        registryCard.execute = cardModule.run.bind(cardModule);
                        registryCard._module = cardModule;
                    }
                    loaded++;
                    console.log('[Artemis]   ✓ Loaded card: %s', cardModule.id);
                }
            } catch (err) {
                failed++;
                console.warn('[Artemis]   ✗ Failed to load %s: %s', cardFile, err.message);
            }
        }

        console.log('[Artemis] Cards loaded: %d/%d (%d failed)', loaded, cardFiles.length, failed);
    }

    async function loadCardModule(cardFile) {
        // Try dynamic fetch first
        try {
            const response = await fetch(`cards/${cardFile}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const text = await response.text();
            const varName = cardFile.replace('.js', '');
            const moduleFn = new Function(text + '; return ' + varName + ';');
            return moduleFn();
        } catch (fetchErr) {
            // Fallback: check global scope
            const globalName = cardFile.replace('.js', '');
            if (typeof window[globalName] !== 'undefined') {
                return window[globalName];
            }
            throw fetchErr;
        }
    }

    // ============================================
    // SUPABASE
    // ============================================
    async function connectSupabase() {
        if (typeof SUPABASE_CONFIG === 'undefined') {
            console.warn('[Artemis] SUPABASE_CONFIG not found. Running without persistence.');
            return;
        }

        const { url, anonKey } = SUPABASE_CONFIG;

        if (!url || !anonKey) {
            console.warn('[Artemis] Supabase URL or key missing. Running without persistence.');
            return;
        }

        try {
            if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
                supabase = window.supabase.createClient(url, anonKey);
                console.log('[Artemis] Supabase connected — %s', url);
            } else {
                console.warn('[Artemis] Supabase client library not found. Is the CDN script loaded?');
            }
        } catch (err) {
            console.warn('[Artemis] Supabase connection failed:', err.message);
        }
    }

    // ============================================
    // SESSION MANAGEMENT
    // ============================================
    function getOrCreateSession() {
        const stored = localStorage.getItem('artemis_session_id');
        if (stored) return stored;

        const newSession = 'art_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        localStorage.setItem('artemis_session_id', newSession);

        // Also persist to Supabase if available
        if (supabase) {
            supabase.from(SUPABASE_CONFIG.tables.sessions).insert({
                session_token: newSession,
                last_active: new Date().toISOString()
            }).then(({ error }) => {
                if (error) console.warn('[Artemis] Session persist failed:', error.message);
            });
        }

        return newSession;
    }

    // ============================================
    // WEIGHT MANAGEMENT
    // ============================================
    function loadLearnedWeights() {
        try {
            const key = persistenceConfig?.localKeys?.cardWeights || 'artemis_card_weights';
            const stored = localStorage.getItem(key);
            if (!stored) {
                console.log('[Artemis] No learned weights found. Using defaults.');
                return;
            }

            const learnedWeights = JSON.parse(stored);
            let applied = 0;

            for (const card of cardRegistry) {
                if (learnedWeights[card.id]) {
                    card.defaultWeight = learnedWeights[card.id].weight;
                    card.playCount = learnedWeights[card.id].plays || 0;
                    card.successCount = learnedWeights[card.id].successes || 0;
                    applied++;
                }
            }

            console.log('[Artemis] Learned weights applied to %d cards', applied);
        } catch (err) {
            console.warn('[Artemis] Weight load failed:', err.message);
        }
    }

    function getLearnedModifier(cardId) {
        try {
            const key = persistenceConfig?.localKeys?.cardWeights || 'artemis_card_weights';
            const stored = localStorage.getItem(key);
            if (!stored) return 1.0;

            const weights = JSON.parse(stored);
            if (!weights[cardId] || weights[cardId].plays < 5) return 1.0;

            const successRate = weights[cardId].successes / Math.max(weights[cardId].plays, 1);
            return 0.7 + (successRate * 0.6); // Range: 0.7–1.3
        } catch {
            return 1.0;
        }
    }

    // ============================================
    // CORE PIPELINE: processInput()
    // ============================================
    async function processInput(userInput, options = {}) {
        if (!isInitialized) {
            await init();
        }

        decisionCount++;
        const inputPreview = userInput.length > 80 ? userInput.substring(0, 77) + '...' : userInput;
        console.log('[Artemis] Decision #%d — "%s"', decisionCount, inputPreview);

        // Build execution context
        const context = {
            input: userInput,
            sessionId: sessionId,
            supabase: supabase,
            systemPrompt: options.systemPrompt || null,
            conversationHistory: options.conversationHistory || [],
            memoryContext: null,
            votedCards: [],
            executedCards: [],
            outputs: {}
        };

        // Phase 1: Classify
        context.votedCards = await classifyInput(userInput);
        logVotes(context.votedCards);

        // Phase 2: Select
        const selectedCards = selectCards(context.votedCards);

        // Phase 3: Sequence
        context.executedCards = sequenceCards(selectedCards);
        logExecutionOrder(context.executedCards);

        // Phase 4: Execute
        context.outputs = await executeCards(context.executedCards, context);

        // Phase 5: Combine
        const combined = combineOutputs(context.outputs);

        // Phase 6: Log decision (auto-trigger)
        await logDecision(context);

        // Phase 7: Run auto cards
        await runAutoCards(context);

        // Phase 8: Save recent action
        saveRecentAction(userInput, combined);

        return {
            text: combined.text,
            imageUrl: combined.imageUrl || null,
            metadata: {
                cardsPlayed: context.executedCards.map(c => c.id),
                voteScores: Object.fromEntries(context.votedCards.map(c => [c.id, c.score])),
                decisionNumber: decisionCount,
                sessionId: sessionId
            }
        };
    }

    // ============================================
    // PHASE 1: CLASSIFY
    // ============================================
    async function classifyInput(input) {
        const inputLower = input.toLowerCase();
        const votedCards = [];

        for (const card of cardRegistry) {
            if (card.autoTrigger) continue; // Skip auto-trigger cards
            if (!card.matchPatterns || card.matchPatterns.length === 0) continue;

            const matchCount = card.matchPatterns.filter(pattern =>
                inputLower.includes(pattern.toLowerCase())
            ).length;

            if (matchCount > 0) {
                let score = (matchCount / card.matchPatterns.length) * card.defaultWeight;
                score = Math.min(score * 1.2, 1.0); // Bonus for exact matches, capped at 1.0

                // Apply learned modifier
                const modifier = getLearnedModifier(card.id);
                score *= modifier;

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
        }

        // Sort by score descending
        votedCards.sort((a, b) => b.score - a.score);

        return votedCards;
    }

    function logVotes(votedCards) {
        if (votedCards.length === 0) {
            console.log('[Artemis] No cards voted. Falling back to default.');
            return;
        }
        const voteStr = votedCards.map(c => `${c.icon} ${c.id}(${c.score.toFixed(2)})`).join(', ');
        console.log('[Artemis] Votes: ' + voteStr);
    }

    // ============================================
    // PHASE 2: SELECT
    // ============================================
    function selectCards(votedCards) {
        const maxCards = routerConfig.maxCardsPerTurn || 3;

        if (votedCards.length === 0) {
            // Fallback: always try pollinations_text
            const fallback = cardRegistry.find(c => c.id === 'pollinations_text');
            if (fallback) {
                console.log('[Artemis] No votes — falling back to pollinations_text');
                return [{
                    id: fallback.id,
                    name: fallback.name,
                    icon: fallback.icon,
                    category: fallback.category,
                    score: 0.25,
                    card: fallback
                }];
            }
            return [];
        }

        return votedCards.slice(0, maxCards);
    }

    // ============================================
    // PHASE 3: SEQUENCE
    // ============================================
    function sequenceCards(selectedCards) {
        const order = routerConfig.executionOrder || ['meta', 'memory', 'retrieval', 'generation'];

        return selectedCards.sort((a, b) => {
            const pa = order.indexOf(a.category);
            const pb = order.indexOf(b.category);
            return (pa >= 0 ? pa : 999) - (pb >= 0 ? pb : 999);
        });
    }

    function logExecutionOrder(cards) {
        const order = cards.map(c => c.icon + ' ' + c.id).join(' → ');
        console.log('[Artemis] Execution: ' + (order || 'none'));
    }

    // ============================================
    // PHASE 4: EXECUTE
    // ============================================
    async function executeCards(sequencedCards, context) {
        const outputs = {};

        for (const cardItem of sequencedCards) {
            const card = cardItem.card;

            if (!card.execute) {
                console.warn('[Artemis] No execute function for: %s', card.id);
                continue;
            }

            console.log('[Artemis] ▶ Executing: %s', card.id);

            try {
                const timeoutMs = card.timeout || 10000;
                const result = await withTimeout(
                    card.execute(context),
                    timeoutMs,
                    `Card "${card.id}" timed out after ${timeoutMs}ms`
                );

                if (result && result.success) {
                    if (result.data) {
                        Object.assign(outputs, result.data);
                        // Update context for downstream cards
                        if (result.data.memory_context) context.memoryContext = result.data.memory_context;
                        if (result.data.text_output) context.textOutput = result.data.text_output;
                    }
                    console.log('[Artemis]   ✓ %s succeeded', card.id);
                } else {
                    console.warn('[Artemis]   ✗ %s failed: %s', card.id, result?.error || 'unknown');
                }
            } catch (err) {
                console.warn('[Artemis]   ✗ %s error: %s', card.id, err.message);
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
    // PHASE 5: COMBINE OUTPUTS
    // ============================================
    function combineOutputs(outputs) {
        let text = '';
        let imageUrl = null;

        // Memory context
        if (outputs.memory_context) {
            text += `*From memory:*\n${outputs.memory_context}\n\n`;
        }

        // Web context
        if (outputs.web_context) {
            text += `*From the web:*\n${outputs.web_context}\n\n`;
        }

        // Generated text
        if (outputs.text_output) {
            text += outputs.text_output;
        }

        // Compressed memory note
        if (outputs.compressed_memory) {
            text += `\n\n> *${outputs.compressed_memory}*`;
        }

        // Image
        if (outputs.image_url) {
            imageUrl = outputs.image_url;
            if (!text.trim()) {
                text = 'Here is the image you requested:';
            }
        }

        // Ultimate fallback
        if (!text.trim() && !imageUrl) {
            text = 'I received your message, but none of my cards produced output. Try rephrasing?';
        }

        return { text: text.trim(), imageUrl };
    }

    // ============================================
    // PHASE 6: LOG DECISION
    // ============================================
    async function logDecision(context) {
        const decisionCard = cards.find(c => c.id === 'decision_log');
        if (!decisionCard || !decisionCard.run) return;

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

    // ============================================
    // PHASE 7: AUTO CARDS
    // ============================================
    async function runAutoCards(context) {
        const autoCards = cardRegistry.filter(c => c.autoTrigger);
        for (const cardDef of autoCards) {
            const loadedCard = cards.find(c => c.id === cardDef.id);
            if (loadedCard && loadedCard.run) {
                try {
                    await loadedCard.run(context);
                } catch (err) {
                    console.warn('[Artemis] Auto card %s failed: %s', cardDef.id, err.message);
                }
            }
        }
    }

    // ============================================
    // PHASE 8: SAVE RECENT ACTION
    // ============================================
    function saveRecentAction(input, output) {
        try {
            const key = persistenceConfig?.localKeys?.recentActions || 'artemis_recent_actions';
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.push({
                input: input.substring(0, 200),
                output: (output.text || '').substring(0, 200),
                hasImage: !!output.imageUrl,
                timestamp: new Date().toISOString()
            });
            if (existing.length > 50) {
                existing.splice(0, existing.length - 50);
            }
            localStorage.setItem(key, JSON.stringify(existing));
        } catch {
            // Non-critical
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================
    function getStatus() {
        return {
            initialized: isInitialized,
            cardsLoaded: cards.length,
            cardsAvailable: cardRegistry.map(c => ({
                id: c.id,
                name: c.name,
                icon: c.icon,
                category: c.category
            })),
            decisionCount: decisionCount,
            sessionId: sessionId,
            classifierMode: routerConfig?.classifierMode || 'heuristic',
            supabaseConnected: !!supabase
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArtemisAgent;
}
