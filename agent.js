// ============================================
// ARTEMIS AGENT — EaldfornAI Card Router v3.0
// ============================================
// No Pollinations. No text generation APIs.
// Artemis HUNTS. She classifies, retrieves, correlates, assembles.
// Her voice is assembled from what she finds — not generated.
// ============================================

var ArtemisAgent = (function() {
    'use strict';

    // ── STATE ──
    var cards = [];
    var cardRegistry = [];
    var routerConfig = null;
    var persistenceConfig = null;
    var supabase = null;
    var sessionId = null;
    var isInitialized = false;
    var decisionCount = 0;
    var responseBuilder = null;
    var correlationEngine = null;

    // ── INITIALIZATION ──
    async function init() {
        if (isInitialized) {
            console.log('[Artemis] Already initialized.');
            return true;
        }

        console.log('[Artemis] Initializing Huntress Engine v3.0...');
        printBanner();

        try {
            loadConfig();
            await loadAllCards();
            await connectSupabase();
            sessionId = getOrCreateSession();
            loadLearnedWeights();
            initResponseBuilder();
            initCorrelationEngine();

            routerConfig.classifierMode = 'heuristic';
            console.log('[Artemis] Classifier: heuristic (threshold=' + 
                (routerConfig.confidenceThreshold || 0.3) + ', negativePenalty=' +
                (routerConfig.negativePatternPenalty || 0.5) + ')');
            console.log('[Artemis] Mode: HUNT-ONLY — no text generation APIs');

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
        console.log('    ARTEMIS v3.0 — The Huntress Engine');
        console.log('    Monastery Phase-Lock: ACTIVE');
        console.log('    Hunt-Only Mode: NO TEXT GENERATION');
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
                maxCardsPerTurn: 4,
                negativePatternPenalty: 0.5,
                defaultCard: 'status_report',
                executionOrder: ['meta', 'memory', 'retrieval', 'correlation', 'response']
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

    // ── SUPABASE ──
    async function connectSupabase() {
        if (typeof SUPABASE_CONFIG === 'undefined') {
            console.warn('[Artemis] No SUPABASE_CONFIG. Running without GaiaDB persistence.');
            return;
        }
        var url = SUPABASE_CONFIG.url;
        var anonKey = SUPABASE_CONFIG.anonKey;
        if (!url || !anonKey) {
            console.warn('[Artemis] Supabase config incomplete.');
            return;
        }
        try {
            if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
                supabase = window.supabase.createClient(url, anonKey);
                console.log('[Artemis] Supabase connected');
            }
        } catch (err) {
            console.warn('[Artemis] Supabase connection failed:', err.message);
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

    // ── WEIGHTS (v3 — cardVoter integrated) ──
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
            if (applied > 0) {
                console.log('[Artemis] Learned weights applied to %d cards', applied);
            }
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
        } catch (e) {
            return 1.0;
        }
    }

    function updateCardWeight(cardId, wasSuccessful) {
        try {
            var key = persistenceConfig.localKeys.cardWeights || 'artemis_card_weights_v3';
            var weights = JSON.parse(localStorage.getItem(key) || '{}');
            if (!weights[cardId]) {
                weights[cardId] = { weight: 0.5, plays: 0, successes: 0 };
            }
            weights[cardId].plays++;
            if (wasSuccessful) weights[cardId].successes++;
            weights[cardId].weight = 0.5 + (weights[cardId].successes / weights[cardId].plays) * 0.5;
            localStorage.setItem(key, JSON.stringify(weights));
        } catch (e) {}
    }

    // ── RESPONSE BUILDER INIT ──
    function initResponseBuilder() {
        responseBuilder = {
            templates: {
                hunt_success: 'I found {{count}} track{{plural}}. {{details}}',
                hunt_partial: 'My arrows found something. {{details}} Not all trails were clear.',
                hunt_empty: 'I loosed arrows into {{sources}}, but nothing struck true. Be more specific, mortal.',
                correlation: 'The tracks converge: {{connections}}.',
                status: 'My quiver holds {{cardCount}} arrows. {{activeCards}} are strung. Session: {{sessionId}}. {{recentActivity}}',
                clarification: 'Your words scatter like startled deer. Narrow the hunt — what exactly do you seek?',
                memory_found: 'From the memory cache: {{memory}}.',
                file_found: 'In the repository: {{file}}.',
                api_result: 'From {{source}}: {{data}}.',
                error: 'My bowstring snapped on that hunt. {{error}}.',
                greeting: 'The huntress listens. {{statusBrief}}. Speak your quarry.',
                farewell: 'The trail goes cold. I will wait. {{sessionRef}}'
            },

            assemble: function(huntResults, context) {
                var text = '';
                var hasAnyResult = false;

                // GaiaDB results
                if (huntResults.gaia_results && huntResults.gaia_results.length > 0) {
                    text += '📜 FROM MEMORY:\n';
                    for (var i = 0; i < huntResults.gaia_results.length; i++) {
                        var r = huntResults.gaia_results[i];
                        text += '· ' + (r.summary || r.content || JSON.stringify(r)).substring(0, 300) + '\n';
                    }
                    text += '\n';
                    hasAnyResult = true;
                }

                // API results
                if (huntResults.api_results) {
                    var apiSources = Object.keys(huntResults.api_results);
                    for (var a = 0; a < apiSources.length; a++) {
                        var source = apiSources[a];
                        var data = huntResults.api_results[source];
                        if (data && data !== null) {
                            text += '🏹 FROM ' + source.toUpperCase() + ':\n';
                            text += '· ' + (typeof data === 'string' ? data : JSON.stringify(data)).substring(0, 400) + '\n';
                            text += '\n';
                            hasAnyResult = true;
                        }
                    }
                }

                // Browser hunt results
                if (huntResults.file_results && huntResults.file_results.length > 0) {
                    text += '📁 FROM REPOSITORY:\n';
                    for (var f = 0; f < huntResults.file_results.length; f++) {
                        var fr = huntResults.file_results[f];
                        text += '· ' + (fr.path || fr.name || 'file') + ': ' + (fr.excerpt || fr.content || '').substring(0, 200) + '\n';
                    }
                    text += '\n';
                    hasAnyResult = true;
                }

                // Correlations
                if (huntResults.correlations && huntResults.correlations.length > 0) {
                    text += '⟡ TRACKS CONVERGE:\n';
                    for (var c = 0; c < huntResults.correlations.length; c++) {
                        var corr = huntResults.correlations[c];
                        text += '· ' + corr + '\n';
                    }
                    text += '\n';
                    hasAnyResult = true;
                }

                // Memory context (compressed)
                if (huntResults.memory_context && !hasAnyResult) {
                    text += '📜 ' + huntResults.memory_context + '\n';
                    hasAnyResult = true;
                }

                if (!hasAnyResult) {
                    text = huntResults.clarification || 
                        'I loosed arrows but found no tracks. Narrow your quarry — what specifically do you hunt?';
                }

                return {
                    text: text.trim(),
                    cardsPlayed: context.executedCards ? context.executedCards.map(function(c) { return c.id; }) : [],
                    resultCount: hasAnyResult ? 1 : 0
                };
            }
        };
    }

    // ── CORRELATION ENGINE INIT ──
    function initCorrelationEngine() {
        correlationEngine = {
            findCorrelations: function(huntResults) {
                var correlations = [];
                var allTexts = [];

                // Collect all text from all hunt sources
                if (huntResults.gaia_results) {
                    for (var i = 0; i < huntResults.gaia_results.length; i++) {
                        allTexts.push({
                            source: 'gaia',
                            index: i,
                            text: (huntResults.gaia_results[i].summary || huntResults.gaia_results[i].content || '')
                        });
                    }
                }
                if (huntResults.api_results) {
                    var keys = Object.keys(huntResults.api_results);
                    for (var k = 0; k < keys.length; k++) {
                        var val = huntResults.api_results[keys[k]];
                        allTexts.push({
                            source: 'api:' + keys[k],
                            index: 0,
                            text: typeof val === 'string' ? val : JSON.stringify(val)
                        });
                    }
                }
                if (huntResults.file_results) {
                    for (var f = 0; f < huntResults.file_results.length; f++) {
                        allTexts.push({
                            source: 'file',
                            index: f,
                            text: huntResults.file_results[f].excerpt || huntResults.file_results[f].content || ''
                        });
                    }
                }

                // Compare pairs using word overlap (Jaccard-like)
                for (var a = 0; a < allTexts.length; a++) {
                    for (var b = a + 1; b < allTexts.length; b++) {
                        var score = semanticOverlap(allTexts[a].text, allTexts[b].text);
                        if (score > 0.25) {
                            correlations.push(
                                '[' + allTexts[a].source + '] ↔ [' + allTexts[b].source + '] — ' + 
                                Math.round(score * 100) + '% overlap'
                            );
                        }
                    }
                }

                return correlations;
            }
        };

        function semanticOverlap(textA, textB) {
            if (!textA || !textB) return 0;
            var wordsA = getWordSet(textA);
            var wordsB = getWordSet(textB);
            if (wordsA.length === 0 || wordsB.length === 0) return 0;

            var intersection = 0;
            for (var i = 0; i < wordsA.length; i++) {
                if (wordsB.indexOf(wordsA[i]) > -1) intersection++;
            }
            var union = wordsA.length + wordsB.length - intersection;
            return union > 0 ? intersection / union : 0;
        }

        function getWordSet(text) {
            var words = text.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .filter(function(w) {
                    return w.length > 2 && 
                        ['the','and','for','that','this','with','from','have','are','was',
                         'not','but','you','all','can','had','her','was','one','our','out',
                         'has','been','were','some','they','them','their','will','would',
                         'what','when','which','who','whom','about','into','over','after',
                         'before','between','under','again','then','than','too','very','just',
                         'because','through','during','before','after'].indexOf(w) === -1;
                });
            var unique = [];
            for (var i = 0; i < words.length; i++) {
                if (unique.indexOf(words[i]) === -1) unique.push(words[i]);
            }
            return unique;
        }
    }

    // ════════════════════════════════════════
    // CORE PIPELINE: processInput()
    // ════════════════════════════════════════
    async function processInput(userInput, options) {
        if (!isInitialized) await init();

        options = options || {};
        decisionCount++;

        var inputPreview = userInput.length > 80
            ? userInput.substring(0, 77) + '...'
            : userInput;
        console.log('[Artemis] Hunt #%d — "%s"', decisionCount, inputPreview);

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

        // Phase 1: Classify (heuristic + negative patterns + learned weights)
        context.votedCards = classifyInput(userInput);
        logVotes(context.votedCards);

        // Phase 2: Select (top N + auto-trigger cards)
        context.executedCards = selectCards(context.votedCards);
        logExecutionOrder(context.executedCards);

        // Phase 3: Execute all selected cards
        context.outputs = await executeCards(context.executedCards, context);

        // Phase 4: Run correlation engine
        if (correlationEngine && Object.keys(context.outputs).length > 0) {
            context.outputs.correlations = correlationEngine.findCorrelations(context.outputs);
        }

        // Phase 5: Assemble response via response builder
        var assembled = responseBuilder.assemble(context.outputs, context);
        assembled.text = assembled.text || 'I have nothing to report. The hunt found empty woods.';

        // Phase 6: Log decision + update weights
        await logDecision(context);
        updateWeightsFromHunt(context);

        // Phase 7: Run remaining auto cards
        await runAutoCards(context);

        // Phase 8: Save recent action
        saveRecentAction(userInput, assembled);

        console.log('[Artemis] Hunt complete — ' + assembled.cardsPlayed.length + ' cards played');

        return {
            text: assembled.text,
            imageUrl: null,
            metadata: {
                cardsPlayed: assembled.cardsPlayed,
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

    // ════════════════════════════════════════
    // PHASE 1: CLASSIFY (v3 — refined weights)
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
                if (inputLower.indexOf(card.matchPatterns[j].toLowerCase()) > -1) {
                    matchCount++;
                }
            }

            var negativeCount = 0;
            if (card.negativePatterns && card.negativePatterns.length > 0) {
                for (var k = 0; k < card.negativePatterns.length; k++) {
                    if (inputLower.indexOf(card.negativePatterns[k].toLowerCase()) > -1) {
                        negativeCount++;
                    }
                }
            }

            if (matchCount > 0) {
                var baseScore = card.defaultWeight || 0.5;
                var matchBonus = Math.min((matchCount - 1) * 0.08, 0.3);
                var score = Math.min(baseScore + matchBonus, 1.0);

                if (negativeCount > 0) {
                    score *= Math.pow(penalty, negativeCount);
                }

                var modifier = getLearnedModifier(card.id);
                score *= modifier;

                if (score >= threshold) {
                    votedCards.push({
                        id: card.id,
                        name: card.name,
                        icon: card.icon,
                        category: card.category,
                        score: score,
                        matchCount: matchCount,
                        negativeCount: negativeCount,
                        card: card
                    });
                }
            }
        }

        votedCards.sort(function(a, b) { return b.score - a.score; });
        return votedCards;
    }

    function logVotes(votedCards) {
        if (votedCards.length === 0) {
            console.log('[Artemis] No votes — falling to default.');
            return;
        }
        var parts = [];
        for (var i = 0; i < votedCards.length; i++) {
            var v = votedCards[i];
            parts.push(v.icon + ' ' + v.id + '(' + v.score.toFixed(2) + ')');
        }
        console.log('[Artemis] Votes: ' + parts.join(', '));
    }

    // ════════════════════════════════════════
    // PHASE 2: SELECT
    // ════════════════════════════════════════
    function selectCards(votedCards) {
        var maxCards = routerConfig.maxCardsPerTurn || 4;

        if (votedCards.length === 0) {
            var defaultCardId = routerConfig.defaultCard || 'status_report';
            var fallback = cardRegistry.find(function(c) {
                return c.id === defaultCardId;
            });
            if (fallback) {
                console.log('[Artemis] No votes — using default: ' + defaultCardId);
                return [{
                    id: fallback.id,
                    name: fallback.name,
                    icon: fallback.icon,
                    category: fallback.category,
                    score: 0.1,
                    card: fallback
                }];
            }
            return [];
        }

        // Always include auto-trigger cards
        var selected = votedCards.slice(0, maxCards);
        for (var i = 0; i < cardRegistry.length; i++) {
            if (cardRegistry[i].autoTrigger && cardRegistry[i].id !== 'decision_log') {
                var alreadySelected = false;
                for (var j = 0; j < selected.length; j++) {
                    if (selected[j].id === cardRegistry[i].id) {
                        alreadySelected = true;
                        break;
                    }
                }
                if (!alreadySelected) {
                    selected.push({
                        id: cardRegistry[i].id,
                        name: cardRegistry[i].name,
                        icon: cardRegistry[i].icon,
                        category: cardRegistry[i].category,
                        score: 0.3,
                        card: cardRegistry[i]
                    });
                }
            }
        }

        return selected;
    }

    function logExecutionOrder(cards) {
        if (cards.length === 0) {
            console.log('[Artemis] No cards to execute.');
            return;
        }
        var parts = [];
        for (var i = 0; i < cards.length; i++) {
            parts.push(cards[i].icon + ' ' + cards[i].id);
        }
        console.log('[Artemis] Execution: ' + parts.join(' → '));
    }

    // ════════════════════════════════════════
    // PHASE 3: EXECUTE
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
                var result = await withTimeout(
                    card.execute(context),
                    timeoutMs,
                    'Card "' + card.id + '" timed out after ' + timeoutMs + 'ms'
                );

                if (result && result.success && result.data) {
                    var keys = Object.keys(result.data);
                    for (var k = 0; k < keys.length; k++) {
                        outputs[keys[k]] = result.data[keys[k]];
                    }
                    if (result.data.memory_context) {
                        context.memoryContext = result.data.memory_context;
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
    // PHASE 5: LOG + UPDATE WEIGHTS
    // ════════════════════════════════════════
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
            console.warn('[Artemis] Decision log failed:', err.message);
        }
    }

    function updateWeightsFromHunt(context) {
        var hasResults = Object.keys(context.outputs).length > 0;
        for (var i = 0; i < context.executedCards.length; i++) {
            var cardId = context.executedCards[i].id;
            if (cardId === 'decision_log') continue;
            updateCardWeight(cardId, hasResults);
        }
    }

    // ════════════════════════════════════════
    // PHASE 6: AUTO CARDS
    // ════════════════════════════════════════
    async function runAutoCards(context) {
        for (var i = 0; i < cardRegistry.length; i++) {
            var cardDef = cardRegistry[i];
            if (!cardDef.autoTrigger) continue;
            if (cardDef.id === 'decision_log') continue;

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
                    console.warn('[Artemis] Auto card ' + cardDef.id + ': ' + err.message);
                }
            }
        }
    }

    // ════════════════════════════════════════
    // PHASE 7: SAVE RECENT ACTION
    // ════════════════════════════════════════
    function saveRecentAction(input, output) {
        try {
            var key = persistenceConfig.localKeys.recentActions || 'artemis_recent_actions';
            var existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.push({
                input: input.substring(0, 200),
                output: (output.text || '').substring(0, 200),
                cardsPlayed: output.cardsPlayed || [],
                timestamp: new Date().toISOString()
            });
            if (existing.length > 50) {
                existing.splice(0, existing.length - 50);
            }
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
