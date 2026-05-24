// ============================================
// ASSEMBLE PHRASE CARD — Artemis Voice Layer
// ============================================
// Runs LAST in the pipeline after all hunt cards.
// Reads context.outputs holistically.
// Produces assembled_phrase — the huntress voice for chat.
// Canvas gets raw blocks. Chat gets this.
//
// No API calls. No generation. Pure composition.
// Template system trained by CardVoter via templateId.
// ============================================

var assemblePhrase = (function() {
    'use strict';

    var id          = 'assemble_phrase';
    var name        = 'Assemble Phrase';
    var icon        = '🪶';
    var version     = '1.0';

    // ── STOP WORDS for topic extraction ──
    var STOP = [
        'what','is','are','who','where','when','why','how','does','do',
        'the','a','an','and','or','but','in','on','at','to','for','of',
        'can','you','hunt','tell','me','about','find','search','look',
        'up','define','explain','show','give','please','hey','hi','hello',
        'artemis','goddess','huntress','my','your','i','we','they','it',
        'that','this','these','those','from','with','into','across','all'
    ];

    // ── DOMAIN LABELS (human-readable) ──
    var DOMAIN_LABELS = {
        hunt_and_pursuit:           'the hunt domain',
        wilderness_and_threshold:   'the threshold',
        semantic_assembly:          'the semantic layer',
        lunar_and_sacred:           'the lunar domain',
        demeter_cultivation:        'Demeter\'s field',
        apollo_synthesis:           'Apollo\'s light',
        poseidon_depth:             'Poseidon\'s depth',
        hermes_routing:             'Hermes\'s path',
        none:                       'unknown territory'
    };

    // ════════════════════════════════════════
    // TEMPLATE LIBRARY
    // Each template has: id, text, intent[], weight
    // {topic}       — extracted subject
    // {domain}      — matched lexicon domain label
    // {sourceCount} — number of sources that returned data
    // {sources}     — source names joined
    // {cardCount}   — cards in deck
    // {sessionRef}  — short session id
    // {blockCount}  — blocks on canvas
    // {hitTerms}    — matched lexicon terms
    // ════════════════════════════════════════
    var TEMPLATES = {

        // ── HUNT SUCCESS — strong signal ──
        hunt_strong: [
            { id: 'hs_01', weight: 1.0, text: 'The quarry is real. {topic} — tracked across {sourceCount} source{plural}. The trail runs through {domain}. Canvas holds the kill.' },
            { id: 'hs_02', weight: 0.9, text: 'Strong track. {topic} surfaces from {sources}. The scent is clear — see the Canvas.' },
            { id: 'hs_03', weight: 0.85, text: 'I found {topic}. {sourceCount} source{plural} answered the arrow. Domain: {domain}. The blocks are yours to pin or prune.' },
            { id: 'hs_04', weight: 0.8, text: '{topic} — the hunt returned clean. {sources} yielded. Canvas carries the quarry.' }
        ],

        // ── HUNT SUCCESS — weak signal ──
        hunt_weak: [
            { id: 'hw_01', weight: 1.0, text: 'Faint scent. {topic} — something is here but the trail is thin. {sourceCount} source{plural} whispered. Check the Canvas.' },
            { id: 'hw_02', weight: 0.9, text: 'The arrow found soft ground on {topic}. Partial track from {sources}. It may be enough.' },
            { id: 'hw_03', weight: 0.85, text: 'I caught a scent — {topic} — but the woods are dark here. One source answered. Narrow the quarry for a cleaner kill.' }
        ],

        // ── HUNT EMPTY ──
        hunt_empty: [
            { id: 'he_01', weight: 1.0, text: 'I loosed arrows into {sources}. Nothing struck true for {topic}. Narrow the quarry — what exactly do you seek?' },
            { id: 'he_02', weight: 0.9, text: 'Empty woods. {topic} left no track in {sources}. Speak the quarry more plainly.' },
            { id: 'he_03', weight: 0.85, text: 'The arrow missed. {sources} returned nothing for {topic}. Try a different trail.' }
        ],

        // ── MEMORY HIT ──
        memory_found: [
            { id: 'mf_01', weight: 1.0, text: 'The trail is familiar. {topic} — I have hunted this before. Memory surfaces: see the Canvas.' },
            { id: 'mf_02', weight: 0.9, text: 'I know this scent. {topic} lives in the memory cache. The old track and the new one both land on Canvas.' },
            { id: 'mf_03', weight: 0.85, text: 'GaiaDB remembers {topic}. The past hunt and this one converge — check the Canvas for the pattern.' }
        ],

        // ── CORRELATION ──
        correlation: [
            { id: 'co_01', weight: 1.0, text: 'Tracks converge. {sourceCount} sources agree on {topic}. The pattern holds — see the Canvas for the overlap.' },
            { id: 'co_02', weight: 0.9, text: 'The kill is confirmed. {sources} all point to {topic}. Cross-domain signal found — {domain}.' },
            { id: 'co_03', weight: 0.85, text: 'Correlation detected across {sourceCount} source{plural}. {topic} runs deeper than a single trail.' }
        ],

        // ── BARE NOUN — no verb, no question ──
        bare_noun: [
            { id: 'bn_01', weight: 1.0, text: 'You name the quarry without a question. I hunt {topic} anyway — results on Canvas.' },
            { id: 'bn_02', weight: 0.9, text: '{topic}. The huntress reads intent. Arrow loosed — see the Canvas.' },
            { id: 'bn_03', weight: 0.85, text: 'One word. One hunt. {topic} — the arrow is already in the air. Canvas holds what I found.' }
        ],

        // ── CLARIFY needed ──
        clarify: [
            { id: 'cl_01', weight: 1.0, text: 'The scent is faint. What exactly do you seek in {topic}? Define, explore, or hunt a specific trail?' },
            { id: 'cl_02', weight: 0.9, text: '{topic} covers wide ground. Narrow it — a definition, a pattern, a connection to what?' },
            { id: 'cl_03', weight: 0.85, text: 'Many trails lead through {topic}. Point the arrow more precisely.' }
        ],

        // ── GREETING ──
        greeting: [
            { id: 'gr_01', weight: 1.0, text: 'The huntress listens. {cardCount} arrows strung. The Canvas is ready. Speak your quarry.' },
            { id: 'gr_02', weight: 0.9, text: 'I am here. {cardCount} cards in the deck, Canvas clear. What do we hunt?' },
            { id: 'gr_03', weight: 0.85, text: 'Artemis. Silver bow, full quiver. The woods are open — where do we begin?' }
        ],

        // ── STATUS ──
        status: [
            { id: 'st_01', weight: 1.0, text: 'Quiver holds {cardCount} arrows. Session {sessionRef}. {blockCount} block{bplural} on Canvas. All systems hunt.' },
            { id: 'st_02', weight: 0.9, text: '{cardCount} cards strung, {blockCount} block{bplural} accumulated. The engine is clean. Ready.' },
            { id: 'st_03', weight: 0.85, text: 'The huntress reports: {cardCount} cards, session {sessionRef}, Canvas carries {blockCount} block{bplural}. Hunt when ready.' }
        ],

        // ── REPOSITORY / FILE ──
        file_found: [
            { id: 'ff_01', weight: 1.0, text: 'Found in the repository. {topic} — the code carries the scent. Canvas holds the excerpt.' },
            { id: 'ff_02', weight: 0.9, text: 'Repository hunt returned {topic}. The file track is clear — see Canvas.' }
        ],

        // ── FAREWELL ──
        farewell: [
            { id: 'fw_01', weight: 1.0, text: 'The trail goes cold. I will wait in the woods. Session {sessionRef} remains open.' },
            { id: 'fw_02', weight: 0.9, text: 'Until the next hunt. The Canvas holds what we found. I am here when you return.' }
        ]
    };

    // ════════════════════════════════════════
    // INTENT DETECTION
    // Reads outputs + raw input to classify
    // hunt intent — no separate card needed
    // ════════════════════════════════════════
    function detectIntent(input, outputs) {
        var lower = input.toLowerCase().trim();
        var words = lower.split(/\s+/);

        // Greeting
        if (/^(hey|hi|hello|good morning|good evening|greetings|yo)\b/.test(lower)) return 'greeting';
        if (/\b(bye|farewell|goodbye|see you|later)\b/.test(lower)) return 'farewell';

        // Status
        if (/\b(status|state|health|check|diagnostic|how are you|what can you do|cards|quiver)\b/.test(lower)) return 'status';

        // Memory explicit
        if (/\b(remember|recall|what did|what do you know|what have you|past|history|memory)\b/.test(lower)) return 'memory_found';

        // File / repo
        if (/\b(file|code|repo|repository|script|html|css|javascript|readme|source)\b/.test(lower)) return 'file_found';

        // Correlation signal
        if (outputs && outputs.correlations && outputs.correlations.length > 0) return 'correlation';

        // Memory results
        if (outputs && outputs.gaia_results && outputs.gaia_results.length > 0) return 'memory_found';

        // Bare noun — 1-2 words, no question word, no verb
        var hasQuestion = /^(what|who|where|when|why|how|is|are|does|do|can|could|would)\b/.test(lower);
        var hasVerb = /\b(find|hunt|search|look|define|explain|tell|show|give|locate|discover)\b/.test(lower);
        if (!hasQuestion && !hasVerb && words.length <= 3) return 'bare_noun';

        // Empty results
        if (outputs) {
            var hasApiResults = outputs.api_results && Object.keys(outputs.api_results).some(function(k) {
                return outputs.api_results[k] !== null && outputs.api_results[k] !== undefined;
            });
            var hasFileResults = outputs.file_results && outputs.file_results.length > 0;
            var hasGaiaResults = outputs.gaia_results && outputs.gaia_results.length > 0;

            if (!hasApiResults && !hasFileResults && !hasGaiaResults) {
                // Something was clearly asked but nothing came back
                if (hasQuestion || hasVerb) return 'hunt_empty';
                return 'clarify';
            }

            // Assess signal strength from api_results
            if (hasApiResults) {
                var resultText = JSON.stringify(outputs.api_results);
                var wordCount = resultText.split(/\s+/).length;
                return wordCount > 60 ? 'hunt_strong' : 'hunt_weak';
            }
        }

        // Default
        if (hasQuestion || hasVerb) return 'hunt_strong';
        return 'clarify';
    }

    // ════════════════════════════════════════
    // TOPIC EXTRACTION
    // Strips intent verbs and stop words
    // Returns the core subject noun phrase
    // ════════════════════════════════════════
    function extractTopic(input) {
        var cleaned = input
            .toLowerCase()
            .replace(/^(can you |please |hey artemis |artemis |what is |what are |who is |who are |define |explain |tell me about |find |search for |hunt |look up |how does |how do |why is |why does |show me |give me )/i, '')
            .replace(/[?!.,;:]+/g, '')
            .trim();

        var words = cleaned.split(/\s+/).filter(function(w) {
            return w.length > 1 && STOP.indexOf(w) === -1;
        });

        if (words.length === 0) {
            // Fallback — use first content word from original
            var fallback = input.split(/\s+/).find(function(w) {
                return w.length > 2 && STOP.indexOf(w.toLowerCase()) === -1;
            });
            return fallback || 'the quarry';
        }

        // Title-case the result
        return words.slice(0, 4).map(function(w, i) {
            return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w;
        }).join(' ');
    }

    // ════════════════════════════════════════
    // SOURCE INVENTORY
    // What APIs / sources actually fired
    // ════════════════════════════════════════
    function inventorySources(outputs) {
        var sources = [];

        if (outputs.api_results) {
            Object.keys(outputs.api_results).forEach(function(k) {
                if (outputs.api_results[k]) sources.push(k);
            });
        }
        if (outputs.gaia_results && outputs.gaia_results.length > 0) {
            sources.push('GaiaDB');
        }
        if (outputs.file_results && outputs.file_results.length > 0) {
            sources.push('Repository');
        }

        return sources;
    }

    // ════════════════════════════════════════
    // TEMPLATE SELECTOR
    // Picks weighted-random template from family
    // Records templateId for CardVoter training
    // ════════════════════════════════════════
    function selectTemplate(intentFamily) {
        var family = TEMPLATES[intentFamily] || TEMPLATES.hunt_strong;

        // Load learned weights from localStorage
        var learnedKey = 'artemis_phrase_weights';
        var learned = {};
        try {
            learned = JSON.parse(localStorage.getItem(learnedKey) || '{}');
        } catch(e) {}

        // Apply learned weights
        var candidates = family.map(function(t) {
            var boost = learned[t.id] ? learned[t.id].successRate || 1.0 : 1.0;
            return { template: t, effectiveWeight: t.weight * boost };
        });

        // Weighted random pick
        var total = candidates.reduce(function(sum, c) { return sum + c.effectiveWeight; }, 0);
        var rand = Math.random() * total;
        var cumulative = 0;
        for (var i = 0; i < candidates.length; i++) {
            cumulative += candidates[i].effectiveWeight;
            if (rand <= cumulative) return candidates[i].template;
        }
        return family[0];
    }

    // ════════════════════════════════════════
    // VARIABLE RESOLVER
    // Fills template tokens with live values
    // ════════════════════════════════════════
    function resolveTemplate(template, vars) {
        var text = template.text;
        Object.keys(vars).forEach(function(key) {
            text = text.split('{' + key + '}').join(String(vars[key]));
        });
        // Clean any unreplaced tokens
        text = text.replace(/\{[^}]+\}/g, '');
        return text.trim();
    }

    // ════════════════════════════════════════
    // DOMAIN RESOLVER
    // Finds best matching domain from Canvas
    // or from lexicon scoring of output text
    // ════════════════════════════════════════
    function resolveDomain(outputs) {
        // Try to get domain from Canvas if available
        if (typeof Canvas !== 'undefined' && Canvas.getStats) {
            // Canvas scores blocks — we can infer dominant domain
        }

        // Fallback: check output text against lexicon
        if (typeof LEXICON_CONFIG === 'undefined') return 'the hunt';

        var allText = '';
        if (outputs.api_results) allText += JSON.stringify(outputs.api_results);
        if (outputs.gaia_results) allText += JSON.stringify(outputs.gaia_results);
        allText = allText.toLowerCase();

        var bestDomain = 'none';
        var bestHits = 0;

        Object.keys(LEXICON_CONFIG.domains).forEach(function(key) {
            var domain = LEXICON_CONFIG.domains[key];
            if (!domain.terms || domain.weight === 0) return;
            var hits = domain.terms.filter(function(t) {
                return allText.indexOf(t.toLowerCase()) > -1;
            }).length;
            if (hits > bestHits) {
                bestHits = hits;
                bestDomain = key;
            }
        });

        return DOMAIN_LABELS[bestDomain] || 'unknown territory';
    }

    // ════════════════════════════════════════
    // CARD VOTER FEEDBACK
    // Records which template fired so CardVoter
    // can update phrase weights over time
    // ════════════════════════════════════════
    function recordTemplateUse(templateId, intent) {
        try {
            var key = 'artemis_phrase_log';
            var log = JSON.parse(localStorage.getItem(key) || '[]');
            log.push({
                templateId: templateId,
                intent: intent,
                timestamp: new Date().toISOString(),
                feedback: null   // CardVoter fills this in
            });
            if (log.length > 200) log.splice(0, log.length - 200);
            localStorage.setItem(key, JSON.stringify(log));
        } catch(e) {}
    }

    // ════════════════════════════════════════
    // PUBLIC: updatePhraseWeight
    // Called by CardVoter when user rates response
    // ════════════════════════════════════════
    function updatePhraseWeight(templateId, wasSuccessful) {
        try {
            var key = 'artemis_phrase_weights';
            var weights = JSON.parse(localStorage.getItem(key) || '{}');
            if (!weights[templateId]) {
                weights[templateId] = { plays: 0, successes: 0, successRate: 1.0 };
            }
            weights[templateId].plays++;
            if (wasSuccessful) weights[templateId].successes++;
            weights[templateId].successRate =
                weights[templateId].successes / Math.max(weights[templateId].plays, 1);
            localStorage.setItem(key, JSON.stringify(weights));
        } catch(e) {}
    }

    // ════════════════════════════════════════
    // MAIN RUN — card interface
    // ════════════════════════════════════════
    async function run(context) {
        try {
            var input   = context.input || '';
            var outputs = context.outputs || {};

            // 1. Detect intent
            var intent = detectIntent(input, outputs);

            // 2. Extract topic
            var topic = extractTopic(input);

            // 3. Inventory sources
            var sources = inventorySources(outputs);
            var sourceCount = sources.length;
            var sourcesStr = sourceCount > 0
                ? sources.join(', ')
                : 'no sources';

            // 4. Get domain label
            var domainLabel = resolveDomain(outputs);

            // 5. Get card count from context
            var cardCount = context.executedCards
                ? context.executedCards.length
                : '?';

            // 6. Session ref (short)
            var sessionRef = context.sessionId
                ? context.sessionId.substring(0, 8) + '...'
                : 'unknown';

            // 7. Canvas block count if available
            var blockCount = 0;
            if (typeof Canvas !== 'undefined' && Canvas.getStats) {
                blockCount = Canvas.getStats().total;
            }

            // 8. Select template
            var template = selectTemplate(intent);

            // 9. Build variable map
            var vars = {
                topic:       topic,
                domain:      domainLabel,
                sourceCount: sourceCount,
                plural:      sourceCount !== 1 ? 's' : '',
                sources:     sourcesStr,
                cardCount:   cardCount,
                sessionRef:  sessionRef,
                blockCount:  blockCount,
                bplural:     blockCount !== 1 ? 's' : '',
                hitTerms:    '' // reserved for lexicon hit terms
            };

            // 10. Resolve
            var phrase = resolveTemplate(template, vars);

            // 11. Record for CardVoter
            recordTemplateUse(template.id, intent);

            console.log('[AssemblePhrase] Intent: ' + intent + ' | Template: ' + template.id + ' | Topic: ' + topic);

            return {
                success: true,
                data: {
                    assembled_phrase: phrase,
                    phrase_intent:    intent,
                    phrase_template:  template.id,
                    phrase_topic:     topic
                }
            };

        } catch(err) {
            console.warn('[AssemblePhrase] Failed:', err.message);
            return {
                success: false,
                error: err.message,
                data: {
                    assembled_phrase: 'The hunt is complete. See the Canvas for results.'
                }
            };
        }
    }

    return {
        id:                 id,
        name:               name,
        icon:               icon,
        version:            version,
        run:                run,
        updatePhraseWeight: updatePhraseWeight,
        detectIntent:       detectIntent,
        extractTopic:       extractTopic
    };

})();

console.log('🪶 AssemblePhrase v1.0 loaded — huntress voice layer active');
