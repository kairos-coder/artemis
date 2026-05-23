// ============================================
// ARTEMIS AGENT — EaldfornAI Card Router v2.2
// ============================================
// Loads card registry from config.js
// Reads Supabase config from SUPABASE_CONFIG
// Classifies → Selects → Sequences → Executes → Combines → Logs
// Heuristic classifier with improved scoring
// All persistence via GaiaDB + localStorage
// ============================================

var ArtemisAgent = (function() {
    'use strict';

    // ============================================
    // STATE
    // ============================================
    var cards = [];
    var cardRegistry = [];
    var routerConfig = null;
    var persistenceConfig = null;
    var supabase = null;
    var sessionId = null;
    var isInitialized = false;
    var decisionCount = 0;

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
            // 1. Load config
            loadConfig();

            // 2. Load all card modules
            await loadAllCards();

            // 3. Connect Supabase
            await connectSupabase();

            // 4. Get or create session
            sessionId = getOrCreateSession();

            // 5. Load learned weights
            loadLearnedWeights();

            // 6. Classifier mode
            routerConfig.classifierMode = 'heuristic';
            console.log('[Artemis] Classifier: heuristic (scoring: single-match=' + 
                routerConfig.confidenceThreshold + '+ threshold)');

            isInitialized = true;
            console.log('[Artemis] Initialized — %d cards, session: %s', 
                cards.length, sessionId.substring(0, 16));
            return true;

        } catch (err) {
            console.error('[Artemis] Init failed:', err);
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
        if (typeof ARTEMIS_CARD_DECK !== 'undefined') {
            cardRegistry = ARTEMIS_CARD_DECK;
        } else {
            throw new Error('ARTEMIS_CARD_DECK not found. Is cards/config.js loaded?');
        }

        routerConfig = typeof ROUTER_CONFIG !== 'undefined'
            ? ROUTER_CONFIG
            : {
                confidenceThreshold: 0.35,
                maxCardsPerTurn: 3,
                executionOrder: ['meta', 'memory', 'retrieval', 'generation']
            };

        persistenceConfig = typeof PERSISTENCE_CONFIG !== 'undefined'
            ? PERSISTENCE_CONFIG
            : {
                localKeys: {
                    compressedMemory: 'artemis_compressed_memory',
                    recentActions: 'artemis_recent_actions',
                    cardWeights: 'artemis_card_weights',
                    decisionHistory: 'artemis_decision_history'
                }
            };

        console.log('[Artemis] Config loaded — %d cards in registry', cardRegistry.length);
    }

    // ============================================
    // CARD LOADING
    // ============================================
    async function loadAllCards() {
        var cardFiles = [];
        for (var i = 0; i < cardRegistry.length; i++) {
            if (cardRegistry[i].cardFile) {
                cardFiles.push(cardRegistry[i].cardFile);
            }
        }

        var loaded = 0;
        var failed = 0;

        for (var j = 0; j < cardFiles.length; j++) {
            try {
                var cardModule = await loadCardModule(cardFiles[j]);
                if (cardModule) {
                    cards.push(cardModule);
                    var registryCard = cardRegistry.find(function(c) {
                        return c.cardFile === cardFiles[j];
                    });
                    if (registryCard) {
                        registryCard.execute = cardModule.run.bind(cardModule);
                        registryCard._module = cardModule;
                    }
                    loaded++;
                    console.log('[Artemis]   ✓ Loaded card: %s', cardModule.id);
                }
            } catch (err) {
                failed++;
                console.warn('[Artemis]   ✗ Failed to load %s: %s', cardFiles[j], err.message);
            }
        }

        console.log('[Artemis] Cards loaded: %d/%d (%d failed)', loaded, cardFiles.length, failed);
    }

    async function loadCardModule(cardFile) {
        try {
            var response = await fetch('cards/' + cardFile);
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            var text = await response.text();
            var varName = cardFile.replace('.js', '');
            var moduleFn = new Function(text + '; return ' + varName + ';');
            return moduleFn();
        } catch (fetchErr) {
            var globalName = cardFile.replace('.js', '');
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

        var url = SUPABASE_CONFIG.url;
        var anonKey = SUPABASE_CONFIG.anonKey;

        if (!url || !anonKey) {
            console.warn('[Artemis] Supabase URL or key missing. Running without persistence.');
            return;
        }

        try {
            if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
                supabase = window.supabase.createClient(url, anonKey);
                console.log('[Artemis] Supabase connected — %s', url);
            } else {
                console.warn('[Artemis] Supabase client library not found.');
            }
        } catch (err) {
            console.warn('[Artemis] Supabase connection failed:', err.message);
        }
    }

    // ============================================
    // SESSION MANAGEMENT
    // ============================================
    function getOrCreateSession() {
        var stored = localStorage.getItem('artemis_session_id');
        if (stored) return stored;

        var newSession = 'art_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        localStorage.setItem('artemis_session_id', newSession);

        if (supabase && SUPABASE_CONFIG && SUPABASE_CONFIG.tables) {
            supabase.from(SUPABASE_CONFIG.tables.sessions).insert({
                session_token: newSession,
                last_active: new Date().toISOString()
            }).then(function(result) {
                if (result.error) console.warn('[Artemis] Session persist failed:', result.error.message);
            });
        }

        return newSession;
    }

    // ============================================
    // WEIGHT MANAGEMENT
    // ============================================
    function loadLearnedWeights() {
        try {
            var key = persistenceConfig.localKeys.cardWeights || 'artemis_card_weights';
            var stored = localStorage.getItem(key);
            if (!stored) {
                console.log('[Artemis] No learned weights found. Using defaults.');
                return;
            }

            var learnedWeights = JSON.parse(stored);
            var applied = 0;

            for (var i = 0; i < cardRegistry.length; i++) {
                var card = cardRegistry[i];
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
            var key = persistenceConfig.localKeys.cardWeights || 'artemis_card_weights';
            var stored = localStorage.getItem(key);
            if (!stored) return 1.0;

            var weights = JSON.parse(stored);
            if (!weights[cardId] || weights[cardId].plays < 5) return 1.0;

            var successRate = weights[cardId].successes / Math.max(weights[cardId].plays, 1);
            return 0.7 + (successRate * 0.6);
        } catch (e) {
            return 1.0;
        }
    }

    // ============================================
    // CORE PIPELINE: processInput()
    // ============================================
    async function processInput(userInput, options) {
        if (!isInitialized) {
            await init();
        }

        options = options || {};
        decisionCount++;

        var inputPreview = userInput.length > 80
            ? userInput.substring(0, 77) + '...'
            : userInput;
        console.log('[Artemis] Decision #%d — "%s"', decisionCount, inputPreview);

        // Build execution context
        var context = {
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
        context.votedCards = classifyInput(userInput);
        logVotes(context.votedCards);

        // Phase 2: Select
        var selectedCards = selectCards(context.votedCards);

        // Phase 3: Sequence
        context.executedCards = sequenceCards(selectedCards);
        logExecutionOrder(context.executedCards);

        // Phase 4: Execute
        context.outputs = await executeCards(context.executedCards, context);

        // Phase 5: Combine
        var combined = combineOutputs(context.outputs);

        // Phase 6: Log decision
        await logDecision(context);

        // Phase 7: Run auto cards
        await runAutoCards(context);

        // Phase 8: Save recent action
        saveRecentAction(userInput, combined);

        return {
            text: combined.text,
            imageUrl: combined.imageUrl || null,
            metadata: {
                cardsPlayed: context.executedCards.map(function(c) { return c.id; }),
                voteScores: buildVoteScores(context.votedCards),
                decisionNumber: decisionCount,
                sessionId: sessionId
            }
        };
    }

    function buildVoteScores(votedCards) {
        var scores = {};
        for (var i = 0; i < votedCards.length; i++) {
            scores[votedCards[i].id] = votedCards[i].score;
        }
        return scores;
    }

    // ============================================
    // PHASE 1: CLASSIFY (IMPROVED SCORING)
    // ============================================
    function classifyInput(input) {
        var inputLower = input.toLowerCase();
        var votedCards = [];

        for (var i = 0; i < cardRegistry.length; i++) {
            var card = cardRegistry[i];

            // Skip auto-trigger cards and cards without patterns
            if (card.autoTrigger) continue;
            if (!card.matchPatterns || card.matchPatterns.length === 0) continue;

            // Count how many patterns match
            var matchCount = 0;
            for (var j = 0; j < card.matchPatterns.length; j++) {
                if (inputLower.indexOf(card.matchPatterns[j].toLowerCase()) > -1) {
                    matchCount++;
                }
            }

            // If at least one pattern matched, calculate score
            if (matchCount > 0) {
                // NEW SCORING: base score = defaultWeight
                // Single match gives full defaultWeight
                // Additional matches add a small bonus (up to +0.3)
                var baseScore = card.defaultWeight;
                var matchBonus = Math.min((matchCount - 1) * 0.08, 0.3);
                var score = Math.min(baseScore + matchBonus, 1.0);

                // Apply learned modifier
                var modifier = getLearnedModifier(card.id);
                score *= modifier;

                // Check against threshold
                if (score >= (routerConfig.confidenceThreshold || 0.35)) {
                    votedCards.push({
                        id: card.id,
                        name: card.name,
                        icon: card.icon,
                        category: card.category,
                        score: score,
                        matchCount: matchCount,
                        card: card
                    });
                }
            }
        }

        // Sort by score descending
        votedCards.sort(function(a, b) {
            return b.score - a.score;
        });

        return votedCards;
    }

    function logVotes(votedCards) {
        if (votedCards.length === 0) {
            console.log('[Artemis] No cards voted. Falling back to default.');
            return;
        }
        var parts = [];
        for (var i = 0; i < votedCards.length; i++) {
            var v = votedCards[i];
            parts.push(v.icon + ' ' + v.id + '(' + v.score.toFixed(2) + ')');
        }
        console.log('[Artemis] Votes: ' + parts.join(', '));
    }

    // ============================================
    // PHASE 2: SELECT
    // ============================================
    function selectCards(votedCards) {
        var maxCards = routerConfig.maxCardsPerTurn || 3;

        if (votedCards.length === 0) {
            // Fallback: try text_generation first, then pollinations_image
            var fallback = cardRegistry.find(function(c) {
                return c.id === 'text_generation';
            });
            if (fallback) {
                console.log('[Artemis] No votes — falling back to text_generation');
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
        var order = routerConfig.executionOrder || ['meta', 'memory', 'retrieval', 'generation'];

        return selectedCards.sort(function(a, b) {
            var pa = order.indexOf(a.category);
            var pb = order.indexOf(b.category);
            return (pa >= 0 ? pa : 999) - (pb >= 0 ? pb : 999);
        });
    }

    function logExecutionOrder(cards) {
        if (cards.length === 0) {
            console.log('[Artemis] Execution: none');
            return;
        }
        var parts = [];
        for (var i = 0; i < cards.length; i++) {
            parts.push(cards[i].icon + ' ' + cards[i].id);
        }
        console.log('[Artemis] Execution: ' + parts.join(' → '));
    }

    // ============================================
    // PHASE 4: EXECUTE
    // ============================================
    async function executeCards(sequencedCards, context) {
        var outputs = {};

        for (var i = 0; i < sequencedCards.length; i++) {
            var cardItem = sequencedCards[i];
            var card = cardItem.card;

            if (!card.execute) {
                console.warn('[Artemis] No execute function for: %s', card.id);
                continue;
            }

            console.log('[Artemis] ▶ Executing: %s', card.id);

            try {
                var timeoutMs = card.timeout || 10000;
                var result = await withTimeout(
                    card.execute(context),
                    timeoutMs,
                    'Card "' + card.id + '" timed out after ' + timeoutMs + 'ms'
                );

                if (result && result.success) {
                    if (result.data) {
                        // Merge outputs
                        var keys = Object.keys(result.data);
                        for (var k = 0; k < keys.length; k++) {
                            outputs[keys[k]] = result.data[keys[k]];
                        }
                        // Update context for downstream cards
                        if (result.data.memory_context) {
                            context.memoryContext = result.data.memory_context;
                        }
                    }
                    console.log('[Artemis]   ✓ %s succeeded', card.id);
                } else {
                    console.warn('[Artemis]   ✗ %s failed: %s',
                        card.id, (result && result.error) || 'unknown');
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
            new Promise(function(_, reject) {
                setTimeout(function() {
                    reject(new Error(errorMessage));
                }, ms);
            })
        ]);
    }

    // ============================================
    // PHASE 5: COMBINE OUTPUTS
    // ============================================
    function combineOutputs(outputs) {
        var text = '';
        var imageUrl = null;

        // Memory context first
        if (outputs.memory_context) {
            text += '*From memory:*\n' + outputs.memory_context + '\n\n';
        }

        // Web context
        if (outputs.web_context) {
            text += '*From the web:*\n' + outputs.web_context + '\n\n';
        }

        // Generated text (main response)
        if (outputs.text_output) {
            text += outputs.text_output;
        }

        // Compressed memory note
        if (outputs.compressed_memory) {
            text += '\n\n> *' + outputs.compressed_memory + '*';
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
            text = 'I received your message, but none of my cards produced output. This may mean Pollinations is down and my local model is not yet loaded. Try STATUS to check the system, or AUDIT to see what I know.';
        }

        return { text: text.trim(), imageUrl: imageUrl };
    }

    // ============================================
    // PHASE 6: LOG DECISION
    // ============================================
    async function logDecision(context) {
        var decisionCard = null;
        for (var i = 0; i < cards.length; i++) {
            if (cards[i].id === 'decision_log') {
                decisionCard = cards[i];
                break;
            }
        }
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
        for (var i = 0; i < cardRegistry.length; i++) {
            var cardDef = cardRegistry[i];
            if (!cardDef.autoTrigger) continue;

            var loadedCard = null;
            for (var j = 0; j < cards.length; j++) {
                if (cards[j].id === cardDef.id) {
                    loadedCard = cards[j];
                    break;
                }
            }
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
            var key = persistenceConfig.localKeys.recentActions || 'artemis_recent_actions';
            var existing = JSON.parse(localStorage.getItem(key) || '[]');
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
        } catch (e) {
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
            cardsAvailable: cardRegistry.map(function(c) {
                return {
                    id: c.id,
                    name: c.name,
                    icon: c.icon,
                    category: c.category
                };
            }),
            decisionCount: decisionCount,
            sessionId: sessionId,
            classifierMode: routerConfig ? routerConfig.classifierMode : 'heuristic',
            supabaseConnected: !!supabase
        };
    }

    function getCardRegistry() {
        return cardRegistry.map(function(c) {
            return {
                id: c.id,
                name: c.name,
                icon: c.icon,
                category: c.category,
                description: c.description,
                weight: c.defaultWeight,
                playCount: c.playCount || 0,
                successCount: c.successCount || 0
            };
        });
    }

    return {
        init: init,
        processInput: processInput,
        getStatus: getStatus,
        getCardRegistry: getCardRegistry
    };

})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArtemisAgent;
}
