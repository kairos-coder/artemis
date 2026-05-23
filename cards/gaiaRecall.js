var gaiaRecall = {
    id: 'gaia_recall',
    icon: '📜',
    description: 'Search GaiaDB with heuristic query routing',
    
    init: function() {
        console.log('[GaiaRecall] Ready — heuristic query classifier');
    },
    
    run: async function(context) {
        var input = context.input;
        var sessionId = context.sessionId;
        var supabase = context.supabase || (typeof window !== 'undefined' && window.supabase);
        
        if (!supabase || !sessionId) {
            return { success: false, data: { text_output: 'Database not connected.' } };
        }
        
        var queryType = this._classifyQuery(input);
        var keyword = this._extractKeyword(input);
        
        if (!keyword || keyword.length < 2) {
            return { success: true, data: { text_output: 'No search keyword found.' } };
        }
        
        var query = supabase.from('conversations')
            .select('role, content, olympian, created_at')
            .eq('session_id', sessionId)
            .ilike('content', '%' + keyword + '%')
            .order('created_at', { ascending: false })
            .limit(5);
        
        // Add Olympian filter if applicable
        if (queryType === 'by_olympian') {
            var olympian = this._extractOlympian(input);
            if (olympian) query = query.eq('olympian', olympian);
        }
        
        var result = await query;
        
        if (result.error) {
            return { success: false, data: { text_output: 'Query failed: ' + result.error.message } };
        }
        
        if (!result.data || result.data.length === 0) {
            return { success: true, data: { text_output: 'No memories found for "' + keyword + '".' } };
        }
        
        var lines = result.data.map(function(m) {
            return '[' + m.olympian + '] ' + m.role + ': ' + (m.content || '').substring(0, 120);
        });
        
        return {
            success: true,
            data: {
                text_output: 'Found ' + result.data.length + ' memories:\n' + lines.join('\n'),
                memory_context: lines.join('\n'),
                query_type: queryType,
                keyword: keyword
            }
        };
    },
    
    _classifyQuery: function(input) {
        var lower = input.toLowerCase();
        
        // Check for time-based queries
        var timeWords = ['yesterday', 'today', 'last week', 'last night', 'earlier', 'previous', 'before', 'past'];
        for (var i = 0; i < timeWords.length; i++) {
            if (lower.indexOf(timeWords[i]) > -1) return 'by_date';
        }
        
        // Check for Olympian names
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
