// ============================================
// HUNT FALLBACK v1.0 — Guaranteed Meaningful Output
// ============================================
// When no direct match exists, searches:
// compressed memory, decision logs, tokens table,
// browser_hunt patterns, DB metadata.
// Returns best available match with confidence.
// ============================================

var huntFallback = {
    id: 'hunt_fallback',
    name: 'Hunt Fallback',
    icon: '🔄',
    category: 'retrieval',
    description: 'Guarantees meaningful output when no direct hunt match exists',

    init: function() {
        console.log('[HuntFallback] Ready — multi-source fallback search');
    },

    run: async function(context) {
        var input = context.input || '';
        var outputs = context.outputs || {};
        var pattern = this._extractFallbackPattern(input);

        // Check if we even need fallback — only fire if other cards found nothing
        var hasResults = false;
        if (outputs.api_results && Object.keys(outputs.api_results).length > 0) hasResults = true;
        if (outputs.gaia_results && outputs.gaia_results.length > 0) hasResults = true;
        if (outputs.file_results && outputs.file_results.length > 0) hasResults = true;

        if (hasResults) {
            return {
                success: true,
                data: { fallback_used: false, text_output: '' }
            };
        }

        console.log('[HuntFallback] Primary hunt empty — searching fallback sources for: "' + pattern + '"');

        var results = [];
        var bestResult = null;
        var bestConfidence = 0;

        // 1. Search compressed memory (localStorage)
        var memoryResult = this._searchCompressedMemory(pattern);
        if (memoryResult && memoryResult.confidence > bestConfidence) {
            bestResult = memoryResult;
            bestConfidence = memoryResult.confidence;
        }
        if (memoryResult) results.push(memoryResult);

        // 2. Search decision logs (localStorage)
        var decisionResult = this._searchDecisionLogs(pattern);
        if (decisionResult && decisionResult.confidence > bestConfidence) {
            bestResult = decisionResult;
            bestConfidence = decisionResult.confidence;
        }
        if (decisionResult) results.push(decisionResult);

        // 3. Search tokens (via bridge if available)
        var tokenResult = await this._searchTokens(pattern, context);
        if (tokenResult && tokenResult.confidence > bestConfidence) {
            bestResult = tokenResult;
            bestConfidence = tokenResult.confidence;
        }
        if (tokenResult) results.push(tokenResult);

        // 4. Search recent actions (localStorage)
        var recentResult = this._searchRecentActions(pattern);
        if (recentResult && recentResult.confidence > bestConfidence) {
            bestResult = recentResult;
            bestConfidence = recentResult.confidence;
        }
        if (recentResult) results.push(recentResult);

        if (!bestResult) {
            return {
                success: true,
                data: {
                    fallback_used: true,
                    text_output: 'I ranged through memory, logs, and tokens but found no trace. The quarry is unknown to me.',
                    fallback_results: results
                }
            };
        }

        return {
            success: true,
            data: {
                fallback_used: true,
                text_output: bestResult.text,
                fallback_results: results,
                best_source: bestResult.source,
                confidence: bestResult.confidence
            }
        };
    },

    _extractFallbackPattern: function(input) {
        var cleaned = input
            .replace(/hunt|find|search|look for|track|locate|recall|remember/gi, '')
            .replace(/what is|who is|tell me about|define|explain/gi, '')
            .trim();

        if (!cleaned || cleaned.length < 2) cleaned = input.trim();

        var words = cleaned.split(/\s+/).filter(function(w) {
            return w.length > 2 &&
                ['the','and','for','that','this','with','from','have','are','was','not','but','you','all','can'].indexOf(w.toLowerCase()) === -1;
        });

        return words.slice(0, 4).join(' ');
    },

    _searchCompressedMemory: function(pattern) {
        try {
            var key = 'artemis_compressed_memory';
            var stored = localStorage.getItem(key);
            if (!stored) return null;

            var memories = JSON.parse(stored);
            if (!Array.isArray(memories)) memories = [memories];

            var lower = pattern.toLowerCase();
            for (var i = 0; i < memories.length; i++) {
                var mem = typeof memories[i] === 'string' ? memories[i] : JSON.stringify(memories[i]);
                if (mem.toLowerCase().indexOf(lower) > -1) {
                    return {
                        source: 'compressed_memory',
                        text: 'From the memory cache: ' + mem.substring(0, 300),
                        confidence: 0.5,
                        raw: mem
                    };
                }
            }
        } catch (e) {}
        return null;
    },

    _searchDecisionLogs: function(pattern) {
        try {
            var key = 'artemis_decision_history';
            var stored = localStorage.getItem(key);
            if (!stored) return null;

            var logs = JSON.parse(stored);
            if (!Array.isArray(logs)) logs = [];

            var lower = pattern.toLowerCase();
            for (var i = logs.length - 1; i >= 0; i--) {
                var entry = logs[i];
                var entryText = (entry.input || '') + ' ' + (entry.output || '');
                if (entryText.toLowerCase().indexOf(lower) > -1) {
                    return {
                        source: 'decision_log',
                        text: 'From the decision log: ' + (entry.output || entry.input || '').substring(0, 300),
                        confidence: 0.45,
                        raw: entry
                    };
                }
            }
        } catch (e) {}
        return null;
    },

    _searchTokens: async function(pattern, context) {
        if (typeof OlympianBridge === 'undefined' || !OlympianBridge.isReady()) return null;

        try {
            var result = await OlympianBridge.queryKairosDB('tokens', {
                select: 'body, domain, source, created_at',
                ilike: { body: '%' + pattern + '%' },
                order: 'created_at',
                ascending: false,
                limit: 3
            });

            if (result.data && result.data.length > 0) {
                var bodies = result.data.map(function(t) { return t.body; }).join(', ');
                return {
                    source: 'kairos_tokens',
                    text: 'From the token archive: ' + bodies,
                    confidence: 0.55,
                    raw: result.data
                };
            }
        } catch (err) {
            console.warn('[HuntFallback] Token search failed:', err.message);
        }
        return null;
    },

    _searchRecentActions: function(pattern) {
        try {
            var key = 'artemis_recent_actions';
            var stored = localStorage.getItem(key);
            if (!stored) return null;

            var actions = JSON.parse(stored);
            if (!Array.isArray(actions)) actions = [];

            var lower = pattern.toLowerCase();
            for (var i = actions.length - 1; i >= 0; i--) {
                var action = actions[i];
                var actionText = (action.input || '') + ' ' + (action.output || '');
                if (actionText.toLowerCase().indexOf(lower) > -1) {
                    return {
                        source: 'recent_actions',
                        text: 'From recent hunts: ' + (action.output || action.input || '').substring(0, 300),
                        confidence: 0.4,
                        raw: action
                    };
                }
            }
        } catch (e) {}
        return null;
    }
};

huntFallback.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = huntFallback;
}
