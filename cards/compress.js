// ============================================
// COMPRESS CARD — Pattern Extraction + Storage
// ============================================
// Extracts patterns, facts, and preferences from
// conversation. Writes to GaiaDB and updates
// local pattern store. This is how Artemis
// "learns" across sessions.
// ============================================

const compress = {
    id: 'compress',
    
    async run(context) {
        const { input, sessionId, supabase } = context;
        
        try {
            // Extract patterns using lightweight heuristics
            const patterns = this._extractPatterns(input);
            
            // Persist patterns to GaiaDB
            let dbResult = null;
            if (supabase && patterns.length > 0) {
                const patternsTable = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.tables)
                    ? SUPABASE_CONFIG.tables.artemisPatterns
                    : 'artemis_patterns';
                
                try {
                    for (const pattern of patterns) {
                        const { error } = await supabase
                            .from(patternsTable)
                            .insert({
                                session_id: sessionId,
                                input_signature: pattern.signature,
                                pattern_type: pattern.type,
                                pattern_value: pattern.value,
                                confidence: pattern.confidence
                            });
                        
                        if (error) {
                            console.warn('[Compress] Pattern insert failed:', error.message);
                        }
                    }
                    dbResult = { stored: patterns.length };
                } catch (err) {
                    console.warn('[Compress] DB write failed:', err.message);
                }
            }
            
            // Update local pattern store
            this._updateLocalPatterns(patterns);
            
            // Build compressed memory summary
            const compressed = this._buildCompressedMemory(input, patterns);
            
            console.log('[Compress] Extracted', patterns.length, 'patterns');
            
            return {
                success: true,
                data: {
                    compressed_memory: compressed,
                    pattern_count: patterns.length,
                    patterns: patterns,
                    db_stored: !!dbResult
                }
            };
            
        } catch (err) {
            console.warn('[Compress] Failed:', err.message);
            return {
                success: false,
                data: { compressed_memory: null },
                error: err.message
            };
        }
    },
    
    _extractPatterns(input) {
        const patterns = [];
        const text = input.toLowerCase();
        
        // Pattern type: USER PREFERENCE
        const prefPatterns = [
            { regex: /i (like|love|enjoy|prefer) (.+?)(?:\.|,|$| but)/i, type: 'preference_positive' },
            { regex: /i (dislike|hate|don't like) (.+?)(?:\.|,|$| but)/i, type: 'preference_negative' },
            { regex: /my favorite (.+?) is (.+?)(?:\.|,|$)/i, type: 'favorite' },
        ];
        
        for (const pp of prefPatterns) {
            const match = text.match(pp.regex);
            if (match) {
                patterns.push({
                    type: pp.type,
                    signature: match[0].substring(0, 100),
                    value: match[2] || match[1],
                    confidence: 0.7
                });
            }
        }
        
        // Pattern type: FACT STATEMENT
        const factMatch = text.match(/(?:remember|note|fact):?\s*(.+)/i);
        if (factMatch) {
            patterns.push({
                type: 'explicit_fact',
                signature: factMatch[0].substring(0, 100),
                value: factMatch[1].trim(),
                confidence: 0.9
            });
        }
        
        // Pattern type: COMMAND SIGNATURE (how user phrases things)
        if (text.length < 100 && text.split(' ').length > 2) {
            patterns.push({
                type: 'command_signature',
                signature: text.substring(0, 100),
                value: text.substring(0, 100),
                confidence: 0.5
            });
        }
        
        return patterns;
    },
    
    _updateLocalPatterns(newPatterns) {
        try {
            const key = 'artemis_patterns_local';
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            
            for (const pattern of newPatterns) {
                // Avoid exact duplicates
                const isDuplicate = existing.some(
                    e => e.signature === pattern.signature && e.type === pattern.type
                );
                if (!isDuplicate) {
                    existing.push({
                        ...pattern,
                        timestamp: new Date().toISOString()
                    });
                }
            }
            
            // Keep max 200 patterns locally
            const trimmed = existing.slice(-200);
            localStorage.setItem(key, JSON.stringify(trimmed));
            
        } catch (err) {
            console.warn('[Compress] Local pattern update failed:', err.message);
        }
    },
    
    _buildCompressedMemory(input, patterns) {
        if (patterns.length === 0) return `[Session note: ${input.substring(0, 200)}]`;
        
        const summaryParts = patterns.map(p => {
            switch (p.type) {
                case 'preference_positive': return `User likes: ${p.value}`;
                case 'preference_negative': return `User dislikes: ${p.value}`;
                case 'favorite': return `User favorite: ${p.value}`;
                case 'explicit_fact': return `Fact: ${p.value}`;
                case 'command_signature': return `Command: ${p.value}`;
                default: return `Pattern: ${p.value}`;
            }
        });
        
        return summaryParts.join(' | ');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = compress;
}
