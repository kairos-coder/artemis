var gaiaRecall = {
    id: 'gaia_recall',
    icon: '📜',
    description: 'Search GaiaDB with intelligent query routing',
    
    _queryModel: null,
    _queryModelLoaded: false,
    _queryModelLoading: false,
    _queryModelName: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    _queryModelLabel: 'DistilBERT 67MB',
    
    init: function() {
        this._startQueryModelLoad();
    },
    
    run: async function(context) {
        var input = context.input;
        var sessionId = context.sessionId;
        var supabase = context.supabase || (typeof window !== 'undefined' && window.supabase);
        
        if (!supabase || !sessionId) {
            return { success: false, data: { text_output: 'Database not connected.' } };
        }
        
        // Classify the query type
        var queryType = await this._classifyQuery(input);
        var keyword = this._extractKeyword(input, queryType);
        
        if (!keyword) {
            return { success: true, data: { text_output: 'No search keyword found in your query.' } };
        }
        
        // Build the query based on type
        var query = supabase.from('conversations')
            .select('role, content, olympian, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false })
            .limit(5);
        
        switch (queryType) {
            case 'by_olympian':
                // Search by specific Olympian name
                var olympian = this._extractOlympian(input);
                if (olympian) query = query.eq('olympian', olympian);
                query = query.ilike('content', '%' + keyword + '%');
                break;
            case 'by_date':
                // Search recent conversations
                query = query.ilike('content', '%' + keyword + '%');
                break;
            case 'by_topic':
            default:
                query = query.ilike('content', '%' + keyword + '%');
                break;
        }
        
        var result = await query;
        
        if (result.error) {
            return { success: false, data: { text_output: 'Query failed: ' + result.error.message } };
        }
        
        if (!result.data || result.data.length === 0) {
            return { success: true, data: { text_output: 'No memories found for "' + keyword + '".' } };
        }
        
        var lines = result.data.map(function(m) {
            return '[' + m.olympian + '] ' + m.role + ': ' + m.content.substring(0, 120);
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
    
    _classifyQuery: async function(input) {
        // Tier 1: Tiny model classifier
        if (this._queryModelLoaded && this._queryModel) {
            try {
                // Check for Olympian names
                var olympianCheck = 'The user is asking about a specific Olympian god: "' + input + '"';
                var olympianResult = await this._queryModel(olympianCheck);
                if (olympianResult[0].label === 'POSITIVE' && olympianResult[0].score > 0.6) {
                    return 'by_olympian';
                }
                
                // Check for date/time queries
                var dateCheck = 'The user is asking about something from the past or a specific time: "' + input + '"';
                var dateResult = await this._queryModel(dateCheck);
                if (dateResult[0].label === 'POSITIVE' && dateResult[0].score > 0.6) {
                    return 'by_date';
                }
            } catch (err) {
                console.warn('[GaiaRecall] Query classification failed: ' + err.message);
            }
        }
        
        // Tier 2: Heuristic
        var lower = input.toLowerCase();
        if (lower.indexOf('yesterday') > -1 || lower.indexOf('last') > -1 || lower.indexOf('earlier') > -1) {
            return 'by_date';
        }
        var olympians = ['apollo', 'athena', 'artemis', 'zeus', 'hera', 'hermes', 'poseidon', 'demeter'];
        for (var i = 0; i < olympians.length; i++) {
            if (lower.indexOf(olympians[i]) > -1) return 'by_olympian';
        }
        return 'by_topic';
    },
    
    _extractKeyword: function(input, queryType) {
        var cleaned = input
            .replace(/find|search|recall|remember|look up|show me|get|retrieve/gi, '')
            .replace(/what did|when did|where is|who said/gi, '')
            .replace(/my |the |about |from |in |for |yesterday|today|last week|earlier/gi, '')
            .replace(/conversations|memories|messages|chats|history/gi, '')
            .trim();
        
        var words = cleaned.split(/\s+/).filter(function(w) { return w.length > 2; });
        return words.slice(0, 4).join(' ');
    },
    
    _extractOlympian: function(input) {
        var olympians = ['apollo', 'athena', 'artemis', 'zeus', 'hera', 'hermes', 'poseidon', 'demeter', 'persephone'];
        var lower = input.toLowerCase();
        for (var i = 0; i < olympians.length; i++) {
            if (lower.indexOf(olympians[i]) > -1) return olympians[i];
        }
        return null;
    },
    
    _startQueryModelLoad: function() {
        var self = this;
        if (this._queryModelLoading || this._queryModelLoaded) return;
        
        this._queryModelLoading = true;
        console.log('[GaiaRecall] Loading query classifier: ' + this._queryModelLabel);
        
        import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js')
            .then(function(module) {
                var pipeline = module.pipeline;
                var env = module.env;
                
                env.localModelPath = null;
                env.allowRemoteModels = true;
                env.useBrowserCache = true;
                env.remoteHost = 'https://huggingface.co';
                env.remotePathTemplate = '{model}/resolve/{revision}/';
                
                return pipeline('text-classification', self._queryModelName, { quantized: true });
            })
            .then(function(model) {
                self._queryModel = model;
                self._queryModelLoaded = true;
                self._queryModelLoading = false;
                console.log('[GaiaRecall] Query classifier ready');
            })
            .catch(function(err) {
                self._queryModelLoading = false;
                console.warn('[GaiaRecall] Query classifier failed: ' + err.message + ' — using heuristic');
            });
    }
};

gaiaRecall.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = gaiaRecall;
}
