var gaiaRecall = {
    id: 'gaia_recall',
    icon: '📜',
    description: 'Search GaiaDB via Olympian Bridge — no direct Supabase calls',

    init: function() {
        console.log('[GaiaRecall] Ready — Olympian Bridge router');
    },

    run: async function(context) {
        var input = context.input;
        var sessionId = context.sessionId;

        // Use the bridge instead of direct Supabase
        if (typeof OlympianBridge === 'undefined' || !OlympianBridge.isReady()) {
            return { success: false, data: { text_output: 'Bridge not connected.' } };
        }

        var queryType = this._classifyQuery(input);
        var keyword = this._extractKeyword(input);

        if (!keyword || keyword.length < 2) {
            return { success: true, data: { text_output: 'No search keyword found.' } };
        }

        // Build query params for the bridge
        var queryParams = {
            select: 'role, content, olympian, created_at',
            eq: {},
            ilike: { content: '%' + keyword + '%' },
            order: 'created_at',
            ascending: false,
            limit: 5
        };

        // Filter by Olympian if detected
        if (queryType === 'by_olympian') {
            var olympian = this._extractOlympian(input);
            if (olympian) queryParams.eq.olympian = olympian;
        }

        // Query GaiaDB through the bridge — no raw Supabase calls
        var result = await OlympianBridge.queryGaiaDB('conversations', queryParams);

        if (result.error) {
            console.warn('[GaiaRecall] Bridge query error:', result.error);
            return { success: false, data: { text_output: 'Memory query failed.' } };
        }

        if (!result.data || result.data.length === 0) {
            return {
                success: true,
                data: {
                    gaia_results: [],
                    text_output: 'No memories found for "' + keyword + '".'
                }
            };
        }

        var lines = result.data.map(function(m) {
            return '[' + (m.olympian || 'unknown') + '] ' + m.role + ': ' + (m.content || '').substring(0, 120);
        });

        return {
            success: true,
            data: {
                gaia_results: result.data.map(function(m) {
                    return {
                        summary: '[' + (m.olympian || 'unknown') + '] ' + m.role + ': ' + (m.content || '').substring(0, 200),
                        content: m.content,
                        olympian: m.olympian,
                        role: m.role,
                        created_at: m.created_at
                    };
                }),
                text_output: 'Found ' + result.data.length + ' memories:\n' + lines.join('\n'),
                memory_context: lines.join('\n'),
                query_type: queryType,
                keyword: keyword
            }
        };
    },

    _classifyQuery: function(input) {
        var lower = input.toLowerCase();

        var timeWords = ['yesterday', 'today', 'last week', 'last night', 'earlier', 'previous', 'before', 'past'];
        for (var i = 0; i < timeWords.length; i++) {
            if (lower.indexOf(timeWords[i]) > -1) return 'by_date';
        }

        var olympians = ['apollo', 'athena', 'artemis', 'zeus', 'hera', 'hermes', 'poseidon', 'demeter', 'persephone', 'hephaestus', 'aphrodite', 'ares'];
        for (var j = 0; j < olympians.length; j++) {
            if (lower.indexOf(olympians[j]) > -1) return 'by_olympian';
        }

        return 'by_topic';
    },

    _extractKeyword: function(input) {
        var cleaned = input
            .replace(/find|search|recall|remember|look up|show me|get|retrieve/gi, '')
            .replace(/what did|when did|where is|who said|tell me about/gi, '')
            .replace(/my |the |about |from |in |for /gi, '')
            .replace(/yesterday|today|last week|last night|earlier/gi, '')
            .replace(/conversations|memories|messages|chats|history|memory/gi, '')
            .replace(/with |about |regarding /gi, '')
            .trim();

        if (!cleaned || cleaned.length < 2) {
            cleaned = input.trim();
        }

        var words = cleaned.split(/\s+/).filter(function(w) { return w.length > 2; });
        return words.slice(0, 4).join(' ');
    },

    _extractOlympian: function(input) {
        var olympians = [
            'apollo', 'athena', 'artemis', 'zeus', 'hera', 'hermes',
            'poseidon', 'demeter', 'persephone', 'hephaestus', 'aphrodite', 'ares'
        ];
        var lower = input.toLowerCase();
        for (var i = 0; i < olympians.length; i++) {
            if (lower.indexOf(olympians[i]) > -1) return olympians[i];
        }
        return null;
    }
};

gaiaRecall.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = gaiaRecall;
}
