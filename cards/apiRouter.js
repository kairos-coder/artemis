var apiRouter = {
    id: 'api_router',
    icon: '🔀',
    category: 'generation',
    description: 'Routes requests through Supabase Edge Function — server-side API access, no CORS, no rate limits',
    
    _endpoint: null,
    
    init: function() {
        var url = (typeof SUPABASE_CONFIG !== 'undefined') ? SUPABASE_CONFIG.url : '';
        this._endpoint = url ? url + '/functions/v1/artemis-api' : null;
        
        if (this._endpoint) {
            console.log('[ApiRouter] Ready — endpoint: ' + this._endpoint);
        } else {
            console.warn('[ApiRouter] No Supabase URL configured');
        }
    },
    
    run: async function(context) {
        if (!this._endpoint) {
            return { success: false, data: { text_output: 'API endpoint not configured.' } };
        }
        
        var input = context.input;
        var sessionToken = context.sessionId || localStorage.getItem('artemis_session_id');
        var memoryContext = context.memoryContext || '';
        
        try {
            var response = await fetch(this._endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: input,
                    session_token: sessionToken,
                    memory_context: memoryContext,
                    compression_token: localStorage.getItem('artemis_compression_token') || ''
                })
            });
            
            if (!response.ok) {
                return { success: false, data: { text_output: 'API returned ' + response.status } };
            }
            
            var data = await response.json();
            
            // Merge all outputs just like other cards
            var result = { success: true, data: {} };
            
            if (data.text) result.data.text_output = data.text;
            if (data.image_url) result.data.image_url = data.image_url;
            if (data.memory_context) result.data.memory_context = data.memory_context;
            if (data.tier) result.data.tier = data.tier;
            
            return result;
            
        } catch (err) {
            return { success: false, data: { text_output: 'API call failed: ' + err.message } };
        }
    }
};

apiRouter.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = apiRouter;
}
