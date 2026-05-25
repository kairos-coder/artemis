// ============================================
// TARGET RESOLVER v1.0 — Hunt Target Extraction
// ============================================
// Extracts noun phrases from user input and maps
// them to known target types: tokens, memory keys,
// DB tables, pattern families, config objects.
// Returns structured target for the hunt pipeline.
// ============================================

var targetResolver = {
    id: 'target_resolver',
    name: 'Target Resolver',
    icon: '🎯',
    category: 'meta',
    description: 'Resolves user queries into explicit hunt targets before execution',

    // ── TARGET TYPE REGISTRY ──
    _targetTypes: {
        token: {
            keywords: ['token', 'word', 'term', 'concept', 'idea', 'keyword'],
            sources: ['tokens'],
            confidence: 0.8
        },
        memory: {
            keywords: ['memory', 'remember', 'recall', 'past', 'history', 'conversation', 'session', 'message'],
            sources: ['conversations', 'localdb'],
            confidence: 0.85
        },
        file: {
            keywords: ['file', 'code', 'repo', 'repository', 'script', 'html', 'css', 'javascript', 'readme', 'source', 'project'],
            sources: ['github_raw', 'browser_hunt'],
            confidence: 0.9
        },
        api: {
            keywords: ['wikipedia', 'wiki', 'dictionary', 'define', 'book', 'quote', 'weather', 'search', 'look up', 'find'],
            sources: ['wikipedia', 'openlibrary', 'dictionary', 'quotable'],
            confidence: 0.85
        },
        pattern: {
            keywords: ['pattern', 'correlation', 'connect', 'link', 'relate', 'between', 'overlap'],
            sources: ['card_voter', 'correlation_engine'],
            confidence: 0.7
        },
        config: {
            keywords: ['config', 'setting', 'threshold', 'weight', 'card deck', 'registry', 'route'],
            sources: ['config.js', 'ARTEMIS_CARD_DECK', 'ROUTER_CONFIG'],
            confidence: 0.75
        },
        olympian: {
            keywords: ['artemis', 'apollo', 'athena', 'zeus', 'hera', 'poseidon', 'demeter', 'hermes', 'hephaestus', 'aphrodite', 'ares', 'persephone', 'god', 'goddess', 'olympian', 'pantheon'],
            sources: ['nexus', 'olympian_bridge', 'kairos_telos'],
            confidence: 0.9
        },
        system: {
            keywords: ['status', 'health', 'check', 'diagnostic', 'cards', 'deck', 'session', 'quiver'],
            sources: ['agent.js', 'status_report'],
            confidence: 0.8
        }
    },

    init: function() {
        console.log('[TargetResolver] Ready — noun phrase extraction + target mapping');
    },

    run: async function(context) {
        var input = context.input || '';
        var results = this.resolve(input);

        if (results.length === 0) {
            return {
                success: true,
                data: {
                    targets: [],
                    resolved: false,
                    text_output: 'No hunt target resolved. Try being more specific.'
                }
            };
        }

        // Pick the highest confidence target
        results.sort(function(a, b) { return b.confidence - a.confidence; });
        var primary = results[0];

        console.log('[TargetResolver] Resolved: ' + primary.target + ' → ' + primary.targetType + ' (' + Math.round(primary.confidence * 100) + '%)');

        return {
            success: true,
            data: {
                targets: results,
                primary_target: primary,
                resolved: primary.confidence > 0.5,
                target_count: results.length
            }
        };
    },

    // ── MAIN RESOLUTION LOGIC ──

    resolve: function(input) {
        var lower = input.toLowerCase();
        var targets = [];
        var extractedPhrases = this._extractNounPhrases(input);

        // Check each target type
        var self = this;
        Object.keys(this._targetTypes).forEach(function(typeKey) {
            var typeDef = self._targetTypes[typeKey];
            var score = self._scoreType(lower, extractedPhrases, typeDef);

            if (score > 0.2) {
                var target = self._extractTarget(lower, extractedPhrases, typeKey);
                targets.push({
                    target: target,
                    targetType: typeKey,
                    confidence: Math.min(score, typeDef.confidence),
                    sources: typeDef.sources,
                    matchedKeywords: self._getMatchedKeywords(lower, typeDef.keywords)
                });
            }
        });

        return targets;
    },

    // ── NOUN PHRASE EXTRACTION ──
    _extractNounPhrases: function(input) {
        var cleaned = input
            .replace(/[?!.,;:]+/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        var words = cleaned.split(' ');
        var phrases = [];
        var currentPhrase = [];

        var stopWords = [
            'what', 'is', 'are', 'who', 'where', 'when', 'why', 'how', 'does', 'do',
            'can', 'you', 'will', 'would', 'could', 'should', 'i', 'me', 'my', 'we', 'our',
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
            'with', 'from', 'by', 'about', 'into', 'through', 'during', 'before', 'after',
            'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
            'here', 'there', 'all', 'both', 'each', 'few', 'more', 'most', 'other',
            'some', 'such', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
            'just', 'because', 'now', 'also', 'please', 'thanks', 'hunt', 'find', 'search'
        ];

        for (var i = 0; i < words.length; i++) {
            var word = words[i].toLowerCase();
            
            if (stopWords.indexOf(word) === -1 && word.length > 1) {
                currentPhrase.push(words[i]);
            } else if (currentPhrase.length > 0) {
                phrases.push(currentPhrase.join(' '));
                currentPhrase = [];
            }
        }

        // Don't forget the last phrase
        if (currentPhrase.length > 0) {
            phrases.push(currentPhrase.join(' '));
        }

        // If no phrases extracted, use the whole input
        if (phrases.length === 0 && cleaned.length > 0) {
            phrases.push(cleaned);
        }

        return phrases;
    },

    // ── SCORING ──
    _scoreType: function(lower, phrases, typeDef) {
        var keywordScore = this._keywordScore(lower, typeDef.keywords);
        var phraseScore = this._phraseScore(phrases, typeDef.keywords);
        var combinedScore = (keywordScore * 0.6) + (phraseScore * 0.4);

        return Math.min(combinedScore, 1.0);
    },

    _keywordScore: function(text, keywords) {
        var matches = 0;
        for (var i = 0; i < keywords.length; i++) {
            if (text.indexOf(keywords[i]) > -1) matches++;
        }
        return keywords.length > 0 ? matches / Math.max(keywords.length, 1) : 0;
    },

    _phraseScore: function(phrases, keywords) {
        if (phrases.length === 0) return 0;
        var scored = 0;
        for (var i = 0; i < phrases.length; i++) {
            var phrase = phrases[i].toLowerCase();
            for (var j = 0; j < keywords.length; j++) {
                if (phrase.indexOf(keywords[j]) > -1) {
                    scored++;
                    break;
                }
            }
        }
        return scored / Math.max(phrases.length, 1);
    },

    // ── TARGET EXTRACTION ──
    _extractTarget: function(lower, phrases, targetType) {
        // Return the most specific noun phrase as the target
        if (phrases.length > 0) {
            // Prefer longer phrases for specificity
            phrases.sort(function(a, b) { return b.length - a.length; });
            return phrases[0];
        }

        // Fallback: clean the input
        return lower
            .replace(/hunt|find|search|look for|track|locate/gi, '')
            .replace(/what is|who is|tell me about|define|explain/gi, '')
            .trim() || lower.trim();
    },

    _getMatchedKeywords: function(text, keywords) {
        var matched = [];
        for (var i = 0; i < keywords.length; i++) {
            if (text.indexOf(keywords[i]) > -1) matched.push(keywords[i]);
        }
        return matched;
    }
};

targetResolver.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = targetResolver;
}
