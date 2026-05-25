// ============================================
// INTENT CLASSIFIER v1.0 — Semantic Intent Detection
// ============================================
// Classifies user queries into intent categories:
// recall, hunt, query, config, debug, meta, greet
// Uses keyword heuristics + pattern matching.
// Penalizes meta-commands to avoid false positives.
// ============================================

var intentClassifier = {
    id: 'intent_classifier',
    name: 'Intent Classifier',
    icon: '🧠',
    category: 'meta',
    description: 'Extracts semantic intent from user queries',

    // ── INTENT DEFINITIONS ──
    _intents: {
        recall: {
            keywords: ['remember', 'recall', 'what did', 'what do you know', 'what have you', 'memory', 'past', 'history', 'previous', 'last time', 'what was'],
            penalty: ['search', 'find', 'hunt', 'look up', 'wikipedia'],
            confidence: 0.85
        },
        hunt: {
            keywords: ['hunt', 'search', 'find', 'look for', 'track', 'locate', 'discover', 'seek', 'scour', 'range'],
            penalty: ['memory', 'recall', 'remember'],
            confidence: 0.9
        },
        query: {
            keywords: ['what is', 'who is', 'define', 'explain', 'tell me about', 'how does', 'why is', 'what are', 'meaning of', 'information'],
            penalty: ['code', 'file', 'repo', 'config'],
            confidence: 0.85
        },
        config: {
            keywords: ['config', 'setting', 'threshold', 'weight', 'card', 'deck', 'registry', 'route', 'update', 'change', 'modify'],
            penalty: ['what is', 'explain', 'tell me about'],
            confidence: 0.75
        },
        debug: {
            keywords: ['debug', 'error', 'bug', 'fix', 'broken', 'failed', 'why isn\'t', 'what\'s wrong', 'issue', 'problem'],
            penalty: [],
            confidence: 0.8
        },
        meta: {
            keywords: ['status', 'health', 'check', 'diagnostic', 'how are you', 'what can you do', 'capabilities'],
            penalty: ['hunt', 'search', 'find'],
            confidence: 0.8
        },
        greet: {
            keywords: ['hello', 'hi', 'hey', 'greet', 'good morning', 'good evening', 'goodbye', 'bye', 'farewell', 'thanks', 'thank you'],
            penalty: ['search', 'find', 'hunt', 'status', 'debug', 'code'],
            confidence: 0.95
        }
    },

    init: function() {
        console.log('[IntentClassifier] Ready — semantic intent detection active');
    },

    run: async function(context) {
        var input = context.input || '';
        var result = this.classify(input);

        console.log('[IntentClassifier] Intent: ' + result.intent + ' (' + Math.round(result.confidence * 100) + '%)');

        return {
            success: true,
            data: {
                intent: result.intent,
                confidence: result.confidence,
                all_scores: result.allScores,
                matched_keywords: result.matchedKeywords
            }
        };
    },

    // ── MAIN CLASSIFICATION ──
    classify: function(input) {
        var lower = input.toLowerCase();
        var scores = {};
        var matchedKeywords = {};
        var self = this;

        // Score each intent
        Object.keys(this._intents).forEach(function(intentKey) {
            var intentDef = self._intents[intentKey];
            var keywordScore = self._scoreKeywords(lower, intentDef.keywords);
            var penaltyScore = self._scoreKeywords(lower, intentDef.penalty);
            var finalScore = Math.max(0, keywordScore - (penaltyScore * 0.3));
            scores[intentKey] = Math.min(finalScore, intentDef.confidence);
            matchedKeywords[intentKey] = self._getMatches(lower, intentDef.keywords);
        });

        // Find best intent
        var bestIntent = 'query'; // default
        var bestScore = 0;
        Object.keys(scores).forEach(function(key) {
            if (scores[key] > bestScore) {
                bestScore = scores[key];
                bestIntent = key;
            }
        });

        // If no strong signal, default to query
        if (bestScore < 0.2) {
            bestIntent = 'query';
            bestScore = 0.15;
        }

        return {
            intent: bestIntent,
            confidence: Math.round(bestScore * 100) / 100,
            allScores: scores,
            matchedKeywords: matchedKeywords[bestIntent] || []
        };
    },

    _scoreKeywords: function(text, keywords) {
        if (!keywords || keywords.length === 0) return 0;
        var matches = 0;
        for (var i = 0; i < keywords.length; i++) {
            if (text.indexOf(keywords[i]) > -1) matches++;
        }
        return matches / keywords.length;
    },

    _getMatches: function(text, keywords) {
        var matches = [];
        for (var i = 0; i < keywords.length; i++) {
            if (text.indexOf(keywords[i]) > -1) matches.push(keywords[i]);
        }
        return matches;
    }
};

intentClassifier.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = intentClassifier;
}
