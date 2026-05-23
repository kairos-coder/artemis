// ============================================
// GAIA RECALL CARD — Memory Retrieval
// ============================================
// Searches GaiaDB conversations table for
// relevant past exchanges. Returns context
// that can be injected into prompts.
// ============================================

const gaiaRecall = {
    id: 'gaia_recall',
    
    async run(context) {
        const { input, supabase } = context;
        
        if (!supabase) {
            return {
                success: false,
                data: { memory_context: null },
                error: 'No Supabase client available'
            };
        }
        
        try {
            // Extract key terms from input for search
            const searchTerms = this._extractSearchTerms(input);
            
            // Query recent conversations
            const { data, error } = await supabase
                .from('conversations')
                .select('role, content, created_at')
                .order('created_at', { ascending: false })
                .limit(20);
            
            if (error) {
                console.warn('[GaiaRecall] Query failed:', error.message);
                return {
                    success: false,
                    data: { memory_context: null },
                    error: error.message
                };
            }
            
            // Filter and format relevant memories
            const relevant = this._filterRelevant(data, searchTerms);
            const memoryContext = this._formatMemoryContext(relevant);
            
            console.log('[GaiaRecall] Found', relevant.length, 'relevant memories');
            
            return {
                success: true,
                data: {
                    memory_context: memoryContext,
                    memory_count: relevant.length,
                    raw_memories: relevant
                }
            };
            
        } catch (err) {
            console.warn('[GaiaRecall] Exception:', err.message);
            return {
                success: false,
                data: { memory_context: null },
                error: err.message
            };
        }
    },
    
    _extractSearchTerms(input) {
        // Simple keyword extraction
        const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 
                          'i', 'you', 'he', 'she', 'it', 'we', 'they',
                          'me', 'him', 'her', 'us', 'them', 'my', 'your',
                          'to', 'of', 'in', 'for', 'on', 'with', 'at',
                          'do', 'did', 'does', 'can', 'could', 'will',
                          'would', 'should', 'what', 'which', 'who',
                          'where', 'when', 'why', 'how'];
        
        return input.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.includes(word));
    },
    
    _filterRelevant(memories, searchTerms) {
        if (!memories || memories.length === 0) return [];
        if (searchTerms.length === 0) return memories.slice(0, 5);
        
        return memories
            .filter(m => {
                const content = (m.content || '').toLowerCase();
                return searchTerms.some(term => content.includes(term));
            })
            .slice(0, 10);
    },
    
    _formatMemoryContext(memories) {
        if (!memories || memories.length === 0) return null;
        
        return memories
            .reverse() // Chronological order
            .map(m => `[${m.role}]: ${m.content}`)
            .join('\n');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = gaiaRecall;
}
