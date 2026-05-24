// ============================================
// CARD VOTER v3.0 — Correlation & Consensus
// ============================================
// No browser models. No ModelDeck.
// Runs as auto-trigger. Examines hunt results.
// Flags correlations between card outputs.
// Updates card weights based on hunt success.
// ============================================

var cardVoter = {
    id: 'card_voter',
    name: 'Card Voter',
    icon: '🗳️',
    category: 'meta',
    description: 'Correlates card outputs, flags consensus, updates learned weights',

    init: function() {
        console.log('[CardVoter v3.0] Ready — heuristic correlation mode');
    },

    run: async function(context) {
        var outputs = context.outputs || {};
        var correlations = [];

        // Collect all text-bearing outputs
        var sources = [];
        
        if (outputs.gaia_results && Array.isArray(outputs.gaia_results)) {
            for (var i = 0; i < outputs.gaia_results.length; i++) {
                var r = outputs.gaia_results[i];
                sources.push({
                    source: 'gaia:' + i,
                    text: (r.summary || r.content || JSON.stringify(r)).toLowerCase()
                });
            }
        }

        if (outputs.api_results && typeof outputs.api_results === 'object') {
            var apiKeys = Object.keys(outputs.api_results);
            for (var k = 0; k < apiKeys.length; k++) {
                var val = outputs.api_results[apiKeys[k]];
                sources.push({
                    source: 'api:' + apiKeys[k],
                    text: (typeof val === 'string' ? val : JSON.stringify(val)).toLowerCase()
                });
            }
        }

        if (outputs.file_results && Array.isArray(outputs.file_results)) {
            for (var f = 0; f < outputs.file_results.length; f++) {
                var fr = outputs.file_results[f];
                sources.push({
                    source: 'file:' + f,
                    text: (fr.excerpt || fr.content || fr.path || '').toLowerCase()
                });
            }
        }

        // Find overlapping keyword pairs
        for (var a = 0; a < sources.length; a++) {
            for (var b = a + 1; b < sources.length; b++) {
                var overlap = findKeywordOverlap(sources[a].text, sources[b].text);
                if (overlap.length >= 2) {
                    correlations.push(
                        '[' + sources[a].source + '] ↔ [' + sources[b].source + ']' +
                        ' share: ' + overlap.slice(0, 4).join(', ')
                    );
                }
            }
        }

        // Update weights for cards that produced output
        if (context.executedCards) {
            var hadResults = (sources.length > 0);
            for (var e = 0; e < context.executedCards.length; e++) {
                var cardId = context.executedCards[e].id;
                if (cardId === 'decision_log' || cardId === 'card_voter') continue;
                updateWeight(cardId, hadResults);
            }
        }

        return {
            success: true,
            data: {
                correlations: correlations,
                sourceCount: sources.length
            }
        };
    },

    // Called by agent during classifyInput — returns null (heuristic handles it)
    voteOnCard: function(card, userInput) {
        return null; // Always defer to heuristic classification
    }
};

// ── Keyword overlap detection ──
function findKeywordOverlap(textA, textB) {
    if (!textA || !textB) return [];

    var stopWords = [
        'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are',
        'was', 'not', 'but', 'you', 'all', 'can', 'had', 'her', 'one', 'our',
        'out', 'has', 'been', 'were', 'some', 'they', 'them', 'their', 'will',
        'would', 'what', 'when', 'which', 'who', 'about', 'into', 'over', 'after',
        'before', 'between', 'under', 'again', 'then', 'than', 'too', 'very',
        'just', 'because', 'through', 'during', 'that'
    ];

    function getWords(text) {
        var cleaned = text.replace(/[^a-z0-9\s]/g, '').split(/\s+/);
        var unique = [];
        for (var i = 0; i < cleaned.length; i++) {
            var w = cleaned[i];
            if (w.length > 3 && stopWords.indexOf(w) === -1 && unique.indexOf(w) === -1) {
                unique.push(w);
            }
        }
        return unique;
    }

    var wordsA = getWords(textA);
    var wordsB = getWords(textB);
    var overlap = [];

    for (var i = 0; i < wordsA.length; i++) {
        if (wordsB.indexOf(wordsA[i]) > -1) {
            overlap.push(wordsA[i]);
        }
    }

    return overlap;
}

// ── Weight updating ──
function updateWeight(cardId, wasSuccessful) {
    try {
        var key = 'artemis_card_weights_v3';
        var weights = JSON.parse(localStorage.getItem(key) || '{}');

        if (!weights[cardId]) {
            weights[cardId] = { weight: 0.5, plays: 0, successes: 0 };
        }

        weights[cardId].plays++;
        if (wasSuccessful) weights[cardId].successes++;

        // Weight = 0.4 base + 0.6 * success rate
        var successRate = weights[cardId].successes / weights[cardId].plays;
        weights[cardId].weight = 0.4 + (successRate * 0.6);

        localStorage.setItem(key, JSON.stringify(weights));
    } catch (e) {
        // localStorage may be full or unavailable
    }
}

cardVoter.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = cardVoter;
}
