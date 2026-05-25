// ============================================
// HUNT EXPANDER v1.0 — Track Generation
// ============================================
// Expands hunt targets into multiple "tracks":
// synonyms, related DB keys, token clusters,
// memory clusters, pattern families.
// Returns weighted expanded target list.
// ============================================

var huntExpander = {
    id: 'hunt_expander',
    name: 'Hunt Expander',
    icon: '🔀',
    category: 'retrieval',
    description: 'Generates expanded hunt tracks from resolved targets',

    // ── SYNONYM MAP ──
    _synonyms: {
        'code': ['script', 'function', 'program', 'source', 'javascript', 'html', 'css'],
        'memory': ['recall', 'history', 'past', 'remember', 'conversation', 'cache'],
        'card': ['deck', 'quiver', 'arrow', 'engine', 'router'],
        'hunt': ['search', 'find', 'track', 'pursue', 'chase', 'range'],
        'god': ['olympian', 'deity', 'pantheon', 'goddess', 'immortal'],
        'garden': ['plant', 'soil', 'seed', 'grow', 'harvest', 'cultivate'],
        'forge': ['build', 'craft', 'make', 'create', 'smith', 'hammer'],
        'data': ['information', 'knowledge', 'facts', 'records', 'database'],
        'config': ['setting', 'threshold', 'weight', 'parameter', 'option'],
        'error': ['bug', 'issue', 'problem', 'failure', 'crash', 'broken']
    },

    // ── DOMAIN EXPANSION ──
    _domainExpansions: {
        'hunt_and_pursuit': ['api_hunt', 'browser_hunt', 'gaia_recall', 'search', 'track'],
        'demeter_cultivation': ['garden', 'plant', 'grow', 'harvest', 'seed', 'soil'],
        'apollo_synthesis': ['image', 'generate', 'art', 'create', 'visual'],
        'poseidon_depth': ['research', 'deep', 'knowledge', 'retrieve', 'data'],
        'hermes_routing': ['cache', 'speed', 'message', 'route', 'quick']
    },

    init: function() {
        console.log('[HuntExpander] Ready — synonym + domain track generation');
    },

    run: async function(context) {
        var input = context.input || '';
        var outputs = context.outputs || {};

        // Get the primary target if target_resolver already ran
        var target = '';
        if (outputs.targets && outputs.targets.length > 0) {
            target = outputs.targets[0].target || '';
        }
        if (!target) {
            target = this._extractCoreTerm(input);
        }

        var tracks = this.expand(target);

        console.log('[HuntExpander] Generated ' + tracks.length + ' tracks from: "' + target + '"');

        return {
            success: true,
            data: {
                expanded_tracks: tracks,
                original_target: target,
                track_count: tracks.length
            }
        };
    },

    // ── MAIN EXPANSION ──
    expand: function(target) {
        if (!target || target.length < 2) return [];

        var lower = target.toLowerCase();
        var tracks = [];
        var seen = {};

        // 1. Original target
        tracks.push({ track: target, weight: 1.0, source: 'original' });
        seen[lower] = true;

        // 2. Synonyms
        var synonyms = this._getSynonyms(lower);
        synonyms.forEach(function(syn) {
            if (!seen[syn]) {
                tracks.push({ track: syn, weight: 0.7, source: 'synonym' });
                seen[syn] = true;
            }
        });

        // 3. Domain expansions
        var domainTracks = this._getDomainExpansions(lower);
        domainTracks.forEach(function(dt) {
            if (!seen[dt]) {
                tracks.push({ track: dt, weight: 0.6, source: 'domain' });
                seen[dt] = true;
            }
        });

        // 4. Word-level expansions
        var words = lower.split(/\s+/);
        words.forEach(function(word) {
            if (word.length > 3 && !seen[word]) {
                var wordSynonyms = this._getSynonyms(word);
                wordSynonyms.slice(0, 2).forEach(function(ws) {
                    if (!seen[ws]) {
                        tracks.push({ track: ws, weight: 0.5, source: 'word_synonym' });
                        seen[ws] = true;
                    }
                });
            }
        }, this);

        // Sort by weight
        tracks.sort(function(a, b) { return b.weight - a.weight; });

        return tracks.slice(0, 10);
    },

    _extractCoreTerm: function(input) {
        var cleaned = input
            .replace(/hunt|find|search|look for|track|locate|recall|remember/gi, '')
            .replace(/what is|who is|tell me about|define|explain/gi, '')
            .replace(/the|a|an|for|in|on|at|to|of/gi, '')
            .trim();

        if (!cleaned || cleaned.length < 2) cleaned = input.trim();

        var words = cleaned.split(/\s+/).filter(function(w) { return w.length > 2; });
        return words.slice(0, 3).join(' ');
    },

    _getSynonyms: function(term) {
        var results = [];
        var self = this;
        Object.keys(this._synonyms).forEach(function(key) {
            if (key.indexOf(term) > -1 || term.indexOf(key) > -1) {
                self._synonyms[key].forEach(function(syn) {
                    if (syn !== term && results.indexOf(syn) === -1) {
                        results.push(syn);
                    }
                });
            }
        });
        return results;
    },

    _getDomainExpansions: function(term) {
        var results = [];
        var self = this;
        Object.keys(this._domainExpansions).forEach(function(domain) {
            var terms = self._domainExpansions[domain];
            for (var i = 0; i < terms.length; i++) {
                if (term.indexOf(terms[i]) > -1 || terms[i].indexOf(term) > -1) {
                    terms.forEach(function(t) {
                        if (t !== term && results.indexOf(t) === -1) {
                            results.push(t);
                        }
                    });
                    break;
                }
            }
        });
        return results;
    }
};

huntExpander.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = huntExpander;
}
