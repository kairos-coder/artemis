// ============================================
// COMPRESS CARD — Pattern Extraction + Ealdforn Compression Token
// ============================================
// Extracts patterns, facts, and preferences from
// conversation. Writes to GaiaDB and updates
// local pattern store. Builds the Ealdforn
// compression token that other cards prepend
// to Pollinations calls for system context.
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
            
            // BUILD EALDFORN COMPRESSION TOKEN — SYSTEM STATE SNAPSHOT
            const token = this._buildEaldfornToken(sessionId);
            this._storeToken(token);
            
            console.log('[Compress] Extracted', patterns.length, 'patterns — Token:', token.length, 'chars');
            
            return {
                success: true,
                data: {
                    compressed_memory: compressed,
                    pattern_count: patterns.length,
                    patterns: patterns,
                    db_stored: !!dbResult,
                    ealdforn_token: token
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
    
    // ── EALDFORN COMPRESSION TOKEN BUILDER ────────────────
    // Encodes Artemis's full system state into a dense,
    // vowel-stripped, pipe-delimited string. Other cards
    // read this from localStorage and prepend to Pollinations
    // calls so the model knows what Artemis can do.
    
    _buildEaldfornToken: function(sessionId) {
        var parts = [];
        
        // Identity
        parts.push('RTMS'); // Artemis
        
        // Cards available — read from registry
        try {
            var cards = [];
            if (typeof window.ArtemisAgent !== 'undefined' && window.ArtemisAgent.TOOL_CARDS) {
                cards = window.ArtemisAgent.TOOL_CARDS;
            }
            // Fallback: known cards
            if (cards.length === 0) {
                cards = [
                    { name: 'gaia_recall' },
                    { name: 'memory_manager' },
                    { name: 'text_generation' },
                    { name: 'pollinations_image' },
                    { name: 'browser_hunt' },
                    { name: 'compress' },
                    { name: 'decision_log' }
                ];
            }
            var cardIds = [];
            for (var i = 0; i < cards.length; i++) {
                cardIds.push(cards[i].name);
            }
            parts.push('CRDS:' + cardIds.join(','));
        } catch(e) {
            parts.push('CRDS:unknown');
        }
        
        // Database status
        var dbBits = [];
        dbBits.push('g=' + (typeof window.supabase !== 'undefined' && window.supabase ? 'cnnctd' : 'ffln'));
        dbBits.push('k=ffln'); // KairosDB placeholder
        parts.push('DB:' + dbBits.join(','));
        
        // Session
        var sess = (sessionId || 'unknown');
        if (sess.length > 12) sess = sess.substring(0, 12);
        parts.push('SSSN:' + sess);
        
        // Memory stats
        try {
            var actions = JSON.parse(localStorage.getItem('artemis_recent_actions') || '[]');
            var memoryGraph = JSON.parse(localStorage.getItem('artemis_memory_graph') || '{}');
            var nodeCount = 0;
            for (var key in memoryGraph) {
                if (memoryGraph.hasOwnProperty(key)) nodeCount++;
            }
            parts.push('MMRY:' + actions.length + 'msgs,' + nodeCount + 'nds');
        } catch(e) {
            parts.push('MMRY:0msgs,0nds');
        }
        
        // Pollinations status
        var pollinationsStatus = 'vlbl'; // available
        if (typeof textGeneration !== 'undefined') {
            if (textGeneration._pollinationsConsecutiveFails >= 3) {
                pollinationsStatus = 'ffln';
            }
        }
        parts.push('PLLNTNS:' + pollinationsStatus);
        
        // Local model status
        var localModelStatus = 'ffln';
        if (typeof textGeneration !== 'undefined') {
            if (textGeneration._modelLoaded) {
                localModelStatus = 'rdy(' + (textGeneration._modelLabel || 'unknown').replace(/\s+/g, '') + ')';
            } else if (textGeneration._modelLoading) {
                var pct = Math.round((textGeneration._modelLoadProgress || 0) * 100);
                localModelStatus = 'ldng' + pct + '%(' + (textGeneration._modelLabel || 'unknown').replace(/\s+/g, '') + ')';
            }
        }
        parts.push('LCL_MDL:' + localModelStatus);
        
        // Pattern store size
        try {
            var patterns = JSON.parse(localStorage.getItem('artemis_patterns_local') || '[]');
            parts.push('PTTRNS:' + patterns.length);
        } catch(e) {
            parts.push('PTTRNS:0');
        }
        
        // Decision history size
        try {
            var decisions = JSON.parse(localStorage.getItem('artemis_decision_history') || '[]');
            parts.push('DCSNS:' + decisions.length);
        } catch(e) {
            parts.push('DCSNS:0');
        }
        
        // Last action
        try {
            var recentActions = JSON.parse(localStorage.getItem('artemis_recent_actions') || '[]');
            if (recentActions.length > 0) {
                var lastAction = recentActions[recentActions.length - 1];
                var toolMatch = lastAction.match(/→\s*(.+)$/);
                if (toolMatch) {
                    var toolName = toolMatch[1].replace(/\s+/g, '').substring(0, 25);
                    parts.push('LST_CTN:' + toolName);
                }
            }
        } catch(e) {}
        
        // Monastery phase
        parts.push('MNSTRY:phs-lckd');
        
        // Ealdforn marker
        parts.push('EALDFRN:1');
        
        return parts.join('|');
    },
    
    _storeToken: function(token) {
        try {
            localStorage.setItem('artemis_compression_token', token);
        } catch(e) {
            console.warn('[Compress] Token storage failed:', e.message);
        }
    },
    
    // Public method — other cards call this to get the current token
    getToken: function() {
        try {
            return localStorage.getItem('artemis_compression_token') || '';
        } catch(e) {
            return '';
        }
    },
    
    // ── ORIGINAL COMPRESS METHODS ─────────────────────────
    
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
        
        // Pattern type: SYSTEM AWARENESS — user is talking about Artemis herself
        const systemAwarenessTerms = [
            'your programming', 'your code', 'your tools', 'your cards',
            'improve you', 'your architecture', 'how you work', 'your system',
            'your context', 'your memory', 'your database'
        ];
        for (const term of systemAwarenessTerms) {
            if (text.indexOf(term) > -1) {
                patterns.push({
                    type: 'system_awareness',
                    signature: text.substring(0, 100),
                    value: term,
                    confidence: 0.85
                });
                break; // One is enough
            }
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
                case 'system_awareness': return `System awareness: ${p.value}`;
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
