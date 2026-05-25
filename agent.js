// ============================================
// ARTEMIS AGENT — EaldfornAI Card Router v3.5
// ============================================
// 15 cards. Cognitive pipeline: guard → intent → target → expand → hunt → fallback → correlate → assemble.
// No Pollinations. No text generation APIs. No inline engines.
// All processing through cards. All database through Olympian Bridge.
// ============================================

var ArtemisAgent = (function() {
    'use strict';

    // ── STATE ──
    var cards = [];
    var cardRegistry = [];
    var routerConfig = null;
    var persistenceConfig = null;
    var sessionId = null;
    var isInitialized = false;
    var decisionCount = 0;

    // ── INITIALIZATION ──
    async function init() {
        if (isInitialized) {
            console.log('[Artemis] Already initialized.');
            return true;
        }

        console.log('[Artemis] Initializing Huntress Engine v3.5...');
        printBanner();

        try {
            loadConfig();
            await loadAllCards();
            sessionId = getOrCreateSession();
            loadLearnedWeights();

            routerConfig.classifierMode = 'heuristic';
            console.log('[Artemis] Classifier: heuristic (threshold=' + 
                (routerConfig.confidenceThreshold || 0.3) + ', negativePenalty=' +
                (routerConfig.negativePatternPenalty || 0.5) + ')');
            console.log('[Artemis] Mode: HUNT-ONLY — cognitive pipeline active');
            console.log('[Artemis] Bridge-powered: all DB through Olympian Bridge');

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
        console.log('    ARTEMIS v3.5 — Huntress Engine');
        console.log('    Order of Olympus — Phase-Lock: ACTIVE');
        console.log('    Cognitive Pipeline: Guard → Intent → Target → Expand → Hunt → Fallback → Correlate → Assemble');
        console.log('    ═══════════════════════════════════');
    }

    // ── CONFIG ──
    function loadConfig() {
        if (typeof ARTEMIS_CARD_DECK !== 'undefined') {
            cardRegistry = ARTEMIS_CARD_DECK;
        } else {
            throw new Error('ARTEMIS_CARD_DECK not found. Is cards/config.js loaded?');
        }

        routerConfig = typeof ROUTER_CONFIG !== 'undefined'
            ? ROUTER_CONFIG
            : {
                confidenceThreshold: 0.3,
                maxCardsPerTurn: 5,
                negativePatternPenalty: 0.5,
                defaultCard: 'assemble_phrase',
                executionOrder: ['system', 'meta', 'memory', 'retrieval', 'correlation', 'response']
            };

        persistenceConfig = typeof PERSISTENCE_CONFIG !== 'undefined'
            ? PERSISTENCE_CONFIG
            : {
                localKeys: {
                    compressedMemory: 'artemis_compressed_memory',
                    recentActions: 'artemis_recent_actions',
                    cardWeights: 'artemis_card_weights_v3',
                    decisionHistory: 'artemis_decision_history'
                }
            };
    }

    // ── CARD LOADING ──
    async function loadAllCards() {
        var loaded = 0;
        var failed = 0;

        for (var i = 0; i < cardRegistry.length; i++) {
            var cardDef = cardRegistry[i];
            if (!cardDef.cardFile) continue;

            try {
                var cardModule = await loadCardModule(cardDef.cardFile);
                if (cardModule) {
                    cards.push(cardModule);
                    cardDef.execute = cardModule.run.bind(cardModule);
                    cardDef._module = cardModule;
                    loaded++;
                    console.log('[Artemis]   ✓ ' + cardModule.id);
                }
            } catch (err) {
                failed++;
                console.warn('[Artemis]   ✗ ' + cardDef.cardFile + ': ' + err.message);
            }
        }

        console.log('[Artemis] Cards loaded: %d/%d', loaded, loaded + failed);
    }

    async function loadCardModule(cardFile) {
        try {
            var response = await fetch('cards/' + cardFile);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            var text = await response.text();
            var varName = cardFile.replace('.js', '');
            var moduleFn = new Function(text + '; return ' + varName + ';');
            return moduleFn();
        } catch (fetchErr) {
            var globalName = cardFile.replace('.js', '');
            if (typeof window[globalName] !== 'undefined') return window[globalName];
            throw fetchErr;
        }
    }

    // ── SESSION ──
    function getOrCreateSession() {
        var stored = localStorage.getItem('artemis_session_id');
        if (stored) return stored;
        var newSession = 'art_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        localStorage.setItem('artemis_session_id', newSession);
        return newSession;
    }

    // ── WEIGHTS ──
    function loadLearnedWeights() {
        try {
            var key = persistenceConfig.localKeys.cardWeights || 'artemis_card_weights_v3';
            var stored = localStorage.getItem(key);
            if (!stored) return;
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
            if (applied > 0) console.log('[Artemis] Learned weights applied to %d cards', applied);
        } catch (err) {
            console.warn('[Artemis] Weight load failed:', err.message);
        }
    }

    function getLearnedModifier(cardId) {
        try {
            var key = persistenceConfig.localKeys.cardWeights || 'artemis_card_weights_v3';
            var stored = localStorage.getItem(key);
            if (!stored) return 1.0;
            var weights = JSON.parse(stored);
            if (!weights[cardId] || weights[cardId].plays < 3) return 1.0;
            var successRate = weights[cardId].successes / Math.max(weights[cardId].plays, 1);
            return 0.6 + (successRate * 0.8);
        } catch (e) { return 1.0; }
    }

    function updateCardWeight(cardId, wasSuccessful) {
        try {
            var key = persistenceConfig.localKeys.cardWeights || 'artemis_card_weights_v3';
            var weights = JSON.parse(localStorage.getItem(key) || '{}');
            if (!weights[cardId]) weights[cardId] = { weight: 0.5, plays: 0, successes: 0 };
            weights[cardId].plays++;
            if (wasSuccessful) weights[cardId].successes++;
            weights[cardId].weight = 0.5 + (weights[cardId].successes / weights[cardId].plays) * 0.5;
            localStorage.setItem(key, JSON.stringify(weights));
        } catch (e) {}
    }

    // ════════════════════════════════════════
    // CORE PIPELINE: processInput() — v3.5
    // ════════════════════════════════════════
    async function processInput(userInput, options) {
        if (!isInitialized) await init();

        options = options || {};
        decisionCount++;

        var inputPreview = userInput.length > 80 ? userInput.substring(0, 77) + '...' : userInput;
        console.log('[Artemis] Hunt #%d — "%s"', decisionCount, inputPreview);

        var context = {
            input: userInput,
            sessionId: sessionId,
            conversationHistory: options.conversationHistory || [],
            votedCards: [],
            executedCards: [],
            outputs: {}
        };

        // ══ PHASE 1: AUTO-TRIGGER CARDS (cognitive layer) ══
        // Run system + meta cards first to establish intent, target, and tracks
        await runCognitiveLayer(context);

        // ══ PHASE 2: CLASSIFY (heuristic voting on hunt cards) ══
        context.votedCards = classifyInput(userInput);
        logVotes(context.votedCards);

        // ══ PHASE 3: SELECT (top N hunt cards) ══
        context.executedCards = selectCards(context.votedCards);
        logExecutionOrder(context.executedCards);

        // ══ PHASE 4: EXECUTE (run selected hunt cards) ══
        context.outputs = await executeCards(context.executedCards, context);

        // ══ PHASE 5: POST-HUNT AUTO CARDS (correlation, fallback, assembly) ══
        await runPostHuntCards(context);

        // ══ PHASE 6: LOG + UPDATE WEIGHTS ══
        await logDecision(context);
        updateWeightsFromHunt(context);

        // ══ PHASE 7: SAVE RECENT ACTION ══
        saveRecentAction(userInput, context.outputs);

        // ══ PHASE 8: BUILD RETURN ══
        var assembledText = context.outputs.assembled_phrase || 
                           context.outputs.memory_context || 
                           context.outputs.text_output || 
                           'The hunt is complete. See the Canvas for results.';

        var allCardsPlayed = [];
        if (context.executedCards) {
            allCardsPlayed = context.executedCards.map(function(c) { return c.id; });
        }

        console.log('[Artemis] Hunt complete — ' + allCardsPlayed.length + ' cards played');

        return {
            text: assembledText,
            imageUrl: null,
            metadata: {
                cardsPlayed: allCardsPlayed,
                voteScores: buildVoteScores(context.votedCards),
                outputs: context.outputs,
                decisionNumber: decisionCount,
                sessionId: sessionId
            }
        };
    }

    // ══ COGNITIVE LAYER ══
    // Runs before classification: guard, intent, target, expand
    async function runCognitiveLayer(context) {
        var cognitiveCards = ['supabase_guard', 'intent_classifier', 'target_resolver', 'hunt_expander', 'memory_manager'];

        for (var i = 0; i < cognitiveCards.length; i++) {
            var cardId = cognitiveCards[i];
            var card = findLoadedCard(cardId);
            if (card && card.run) {
                try {
                    console.log('[Artemis] ▶ ' + cardId + ' (cognitive)');
                    var result = await withTimeout(card.run(context), 5000, cardId + ' timed out');
                    if (result && result.success && result.data) {
                        var keys = Object.keys(result.data);
                        for (var k = 0; k < keys.length; k++) {
                            context.outputs[keys[k]] = result.data[keys[k]];
                        }
                        console.log('[Artemis]   ✓ ' + cardId + ' returned data');
                    }
                } catch (err) {
                    console.warn('[Artemis]   ✗ ' + cardId + ': ' + err.message);
                }
            }
        }
    }

    // ══ POST-HUNT CARDS ══
    // Runs after hunt cards: fallback, voter, assemble, decision
    async function runPostHuntCards(context) {
        var postCards = ['hunt_fallback', 'card_voter', 'assemble_phrase', 'decision_log'];

        for (var i = 0; i < postCards.length; i++) {
            var cardId = postCards[i];
            var card = findLoadedCard(cardId);
            if (card && card.run) {
                try {
                    console.log('[Artemis] ▶ ' + cardId + ' (post-hunt)');
                    var result = await withTimeout(card.run(context), 8000, cardId + ' timed out');
                    if (result && result.success && result.data) {
                        var keys = Object.keys(result.data);
                        for (var k = 0; k < keys.length; k++) {
                            context.outputs[keys[k]] = result.data[keys[k]];
                        }
                        console.log('[Artemis]   ✓ ' + cardId + ' returned data');
                    }
                } catch (err) {
                    console.warn('[Artemis]   ✗ ' + cardId + ': ' + err.message);
                }
            }
        }
    }

    function findLoadedCard(cardId) {
        for (var i = 0; i < cards.length; i++) {
            if (cards[i].id === cardId) return cards[i];
        }
        return null;
    }

    // ════════════════════════════════════════
    // PHASE 2: CLASSIFY (heuristic voting)
    // ════════════════════════════════════════
    function classifyInput(input) {
        var inputLower = input.toLowerCase();
        var votedCards = [];
        var penalty = routerConfig.negativePatternPenalty || 0.5;
        var threshold = routerConfig.confidenceThreshold || 0.3;

        for (var i = 0; i < cardRegistry.length; i++) {
            var card = cardRegistry[i];
            if (card.autoTrigger) continue;
            if (!card.matchPatterns || card.matchPatterns.length === 0) continue;

            var matchCount = 0;
            for (var j = 0; j < card.matchPatterns.length; j++) {
                if (inputLower.indexOf(card.matchPatterns[j].toLowerCase()) > -1) matchCount++;
            }

            var negativeCount = 0;
            if (card.negativePatterns && card.negativePatterns.length > 0) {
                for (var k = 0; k < card.negativePatterns.length; k++) {
                    if (inputLower.indexOf(card.negativePatterns[k].toLowerCase()) > -1) negativeCount++;
                }
            }

            if (matchCount > 0) {
                var baseScore = card.defaultWeight || 0.5;
                var matchBonus = Math.min((matchCount - 1) * 0.08, 0.3);
                var score = Math.min(baseScore + matchBonus, 1.0);
                if (negativeCount > 0) score *= Math.pow(penalty, negativeCount);
                var modifier = getLearnedModifier(card.id);
                score *= modifier;

                if (score >= threshold) {
                    votedCards.push({
                        id: card.id, name: card.name, icon: card.icon,
                        category: card.category, score: score,
                        matchCount: matchCount, negativeCount: negativeCount, card: card
                    });
                }
            }
        }

        votedCards.sort(function(a, b) { return b.score - a.score; });
        return votedCards;
    }

    function logVotes(votedCards) {
        if (votedCards.length === 0) {
            console.log('[Artemis] No votes — cognitive layer already processed.');
            return;
        }
        var parts = [];
        for (var i = 0; i < votedCards.length; i++) {
            parts.push(votedCards[i].icon + ' ' + votedCards[i].id + '(' + votedCards[i].score.toFixed(2) + ')');
        }
        console.log('[Artemis] Votes: ' + parts.join(', '));
    }

    // ════════════════════════════════════════
    // PHASE 3: SELECT
    // ════════════════════════════════════════
    function selectCards(votedCards) {
        var maxCards = routerConfig.maxCardsPerTurn || 5;

        if (votedCards.length === 0) return [];

        return votedCards.slice(0, maxCards);
    }

    function logExecutionOrder(cards) {
        if (cards.length === 0) {
            console.log('[Artemis] No hunt cards selected.');
            return;
        }
        var parts = [];
        for (var i = 0; i < cards.length; i++) {
            parts.push(cards[i].icon + ' ' + cards[i].id);
        }
        console.log('[Artemis] Execution: ' + parts.join(' → '));
    }

    // ════════════════════════════════════════
    // PHASE 4: EXECUTE
    // ════════════════════════════════════════
    async function executeCards(sequencedCards, context) {
        var outputs = {};

        for (var i = 0; i < sequencedCards.length; i++) {
            var cardItem = sequencedCards[i];
            var card = cardItem.card;

            if (!card.execute) {
                console.warn('[Artemis] No execute for: ' + card.id);
                continue;
            }

            console.log('[Artemis] ▶ ' + card.id);

            try {
                var timeoutMs = card.timeout || 15000;
                var result = await withTimeout(card.execute(context), timeoutMs, 'Card "' + card.id + '" timed out');

                if (result && result.success && result.data) {
                    var keys = Object.keys(result.data);
                    for (var k = 0; k < keys.length; k++) {
                        outputs[keys[k]] = result.data[keys[k]];
                    }
                    console.log('[Artemis]   ✓ ' + card.id + ' returned data');
                } else {
                    console.warn('[Artemis]   ○ ' + card.id + ': ' + ((result && result.error) || 'no results'));
                }
            } catch (err) {
                console.warn('[Artemis]   ✗ ' + card.id + ': ' + err.message);
            }
        }

        return outputs;
    }

    function withTimeout(promise, ms, errorMessage) {
        return Promise.race([
            promise,
            new Promise(function(_, reject) {
                setTimeout(function() { reject(new Error(errorMessage)); }, ms);
            })
        ]);
    }

    // ════════════════════════════════════════
    // LOGGING + WEIGHTS
    // ════════════════════════════════════════
    async function logDecision(context) {
        var decisionCard = findLoadedCard('decision_log');
        if (!decisionCard || !decisionCard.run) return;

        try {
            await decisionCard.run({
                input: context.input,
                votedCards: context.votedCards,
                executedCards: context.executedCards,
                outputs: context.outputs,
                sessionId: context.sessionId
            });
        } catch (err) {
            console.warn('[Artemis] Decision log failed:', err.message);
        }
    }

    function updateWeightsFromHunt(context) {
        var hasResults = Object.keys(context.outputs).length > 0;
        if (context.executedCards) {
            for (var i = 0; i < context.executedCards.length; i++) {
                updateCardWeight(context.executedCards[i].id, hasResults);
            }
        }
    }

    function buildVoteScores(votedCards) {
        var scores = {};
        for (var i = 0; i < votedCards.length; i++) {
            scores[votedCards[i].id] = votedCards[i].score;
        }
        return scores;
    }

    function saveRecentAction(input, outputs) {
        try {
            var key = persistenceConfig.localKeys.recentActions || 'artemis_recent_actions';
            var existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.push({
                input: input.substring(0, 200),
                output: (outputs.assembled_phrase || outputs.memory_context || '').substring(0, 200),
                timestamp: new Date().toISOString()
            });
            if (existing.length > 50) existing.splice(0, existing.length - 50);
            localStorage.setItem(key, JSON.stringify(existing));
        } catch (e) {}
    }

    // ════════════════════════════════════════
    // PUBLIC API
    // ════════════════════════════════════════
    function getStatus() {
        return {
            initialized: isInitialized,
            cardsLoaded: cards.length,
            cardsAvailable: cardRegistry.map(function(c) {
                return { id: c.id, name: c.name, icon: c.icon, category: c.category };
            }),
            decisionCount: decisionCount,
            sessionId: sessionId,
            classifierMode: routerConfig ? routerConfig.classifierMode : 'heuristic'
        };
    }

    function getCardRegistry() {
        return cardRegistry.map(function(c) {
            return {
                id: c.id, name: c.name, icon: c.icon, category: c.category,
                description: c.description, weight: c.defaultWeight,
                playCount: c.playCount || 0, successCount: c.successCount || 0
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
