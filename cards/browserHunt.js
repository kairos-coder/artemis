// ============================================
// BROWSER HUNT CARD — Web Retrieval
// ============================================
// Attempts to fetch live web data.
// Falls back gracefully when CORS blocks.
// ============================================

const browserHunt = {
    id: 'browser_hunt',
    
    async run(context) {
        const { input } = context;
        
        try {
            const query = this._extractQuery(input);
            
            if (!query) {
                return {
                    success: false,
                    data: { web_context: null },
                    error: 'No search query extracted'
                };
            }
            
            // Try DuckDuckGo HTML (no API key, but often CORS-blocked)
            // This will likely fail in browser due to CORS — that's OK.
            // We handle the failure and signal that a server-side proxy
            // would be needed for production.
            
            let webContext = null;
            let source = 'none';
            
            try {
                const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
                const response = await fetch(ddgUrl);
                
                if (response.ok) {
                    const html = await response.text();
                    webContext = this._parseDdgResults(html, query);
                    source = 'duckduckgo_html';
                }
            } catch (corsErr) {
                // CORS blocked — expected in browser
                console.log('[BrowserHunt] Direct fetch blocked (CORS). Trying alternatives...');
                
                // Fallback: use a CORS proxy or return a helpful message
                webContext = this._offlineFallback(query);
                source = 'offline_fallback';
            }
            
            return {
                success: true,
                data: {
                    web_context: webContext,
                    search_query: query,
                    source: source
                }
            };
            
        } catch (err) {
            console.warn('[BrowserHunt] Failed:', err.message);
            return {
                success: false,
                data: { web_context: null },
                error: err.message
            };
        }
    },
    
    _extractQuery(input) {
        const patterns = [
            /search (?:for|about) (.+)/i,
            /find (?:out )?(?:about )?(.+?)(?: online| on the web)?$/i,
            /what(?:'s| is) the latest (?:on|about) (.+)/i,
            /look up (.+)/i
        ];
        
        for (const pattern of patterns) {
            const match = input.match(pattern);
            if (match) return match[1].trim();
        }
        
        return input.trim();
    },
    
    _parseDdgResults(html, query) {
        // Simple extraction of result snippets
        const snippets = [];
        const regex = /<a[^>]*class="result__a"[^>]*>([^<]+)<\/a>.*?<a[^>]*class="result__snippet"[^>]*>([^<]+)<\/a>/gs;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            snippets.push({
                title: match[1].trim(),
                snippet: match[2].trim()
            });
        }
        
        if (snippets.length === 0) return `No results found for "${query}".`;
        
        return snippets.slice(0, 3)
            .map(s => `${s.title}: ${s.snippet}`)
            .join('\n\n');
    },
    
    _offlineFallback(query) {
        return `[Browser Hunt attempted search for "${query}" but web retrieval is unavailable in this environment. For production, a CORS proxy or server-side endpoint would enable live web search. Currently, I can only work with my trained knowledge and stored memories.]`;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = browserHunt;
}
