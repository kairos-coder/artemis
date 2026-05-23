var memoryManager = {
    id: 'memory_manager',
    
    // ── STATE ──────────────────────────────────
    _localDB: null,           // Local conversation cache
    _graph: null,             // Memory graph (nodes + edges)
    _sessionStart: null,      // When this session began
    _lastActivity: null,      // Last user interaction timestamp
    _timeoutMinutes: 10,      // Session timeout threshold
    _timeoutCheckInterval: null, // Interval ID for timeout checking
    _timeoutCallback: null,   // Called when session times out
    
    // ── INIT ───────────────────────────────────
    init: function() {
        this._sessionStart = Date.now();
        this._lastActivity = Date.now();
        this._loadLocalDB();
        this._loadGraph();
        this._startTimeoutWatcher();
        console.log('[MemoryManager] Initialized. LocalDB: ' + 
            this._localDB.messages.length + ' msgs, Graph: ' + 
            Object.keys(this._graph.nodes).length + ' nodes');
    },
    
    // ── CARD RUN (auto-triggered by agent) ─────
    run: async function(context) {
        this._lastActivity = Date.now();
        
        var input = context.input;
        var outputs = context.outputs;
        var supabase = context.supabase;
        var sessionId = context.sessionId;
        
        // 1. Index the current exchange into LocalDB
        this._indexExchange(input, outputs);
        
        // 2. Update the memory graph with any new entities/patterns
        this._updateGraph(input, outputs);
        
        // 3. If GaiaDB context came back, merge it into LocalDB
        if (outputs.memory_context) {
            this._mergeRemoteMemories(outputs.memory_context);
        }
        
        // 4. Persist everything to localStorage
        this._saveLocalDB();
        this._saveGraph();
        
        return {
            success: true,
            data: {
                localdb_size: this._localDB.messages.length,
                graph_nodes: Object.keys(this._graph.nodes).length,
                session_active: true
            }
        };
    },
    
    // ── LOCAL DB ───────────────────────────────
    _loadLocalDB: function() {
        try {
            var stored = localStorage.getItem('artemis_localdb');
            if (stored) {
                this._localDB = JSON.parse(stored);
            } else {
                this._localDB = {
                    messages: [],
                    sessions: [],
                    lastCompact: null
                };
            }
        } catch(e) {
            this._localDB = { messages: [], sessions: [], lastCompact: null };
        }
    },
    
    _saveLocalDB: function() {
        try {
            // Keep localDB lean — max 200 messages
            if (this._localDB.messages.length > 200) {
                this._localDB.messages = this._localDB.messages.slice(-200);
            }
            localStorage.setItem('artemis_localdb', JSON.stringify(this._localDB));
        } catch(e) {
            console.warn('[MemoryManager] LocalDB save failed:', e.message);
        }
    },
    
    _indexExchange: function(input, outputs) {
        var entry = {
            timestamp: Date.now(),
            input: input.substring(0, 500),
            output: (outputs.text_output || '').substring(0, 500),
            hasImage: !!outputs.image_url,
            cardsPlayed: outputs.cards_played || [],
            tags: this._extractTags(input)
        };
        this._localDB.messages.push(entry);
    },
    
    _extractTags: function(text) {
        var tags = [];
        var lower = text.toLowerCase();
        
        var tagPatterns = [
            { words: ['artemis', 'athena', 'apollo', 'zeus', 'hera', 'poseidon', 'hermes'], category: 'olympian' },
            { words: ['gaia', 'supabase', 'database', 'table', 'sql'], category: 'infrastructure' },
            { words: ['card', 'deck', 'router', 'agent', 'engine'], category: 'architecture' },
            { words: ['memory', 'recall', 'remember', 'pattern', 'learn'], category: 'memory' },
            { words: ['image', 'picture', 'generate', 'visual'], category: 'generation' },
            { words: ['monastery', 'ealdforn', 'mythic', 'pantheon'], category: 'worldbuilding' },
            { words: ['bug', 'fix', 'error', 'patch', 'update'], category: 'development' },
            { words: ['telos', 'motto', 'phase-lock'], category: 'system_concept' }
        ];
        
        for (var i = 0; i < tagPatterns.length; i++) {
            for (var j = 0; j < tagPatterns[i].words.length; j++) {
                if (lower.indexOf(tagPatterns[i].words[j]) > -1) {
                    tags.push(tagPatterns[i].category);
                    break;
                }
            }
        }
        
        return tags;
    },
    
    _mergeRemoteMemories: function(memoryContext) {
        // Parse the memory context for [role]: content patterns
        var lines = memoryContext.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            
            // Check if this entry is already in localDB
            var isDuplicate = false;
            for (var j = 0; j < this._localDB.messages.length; j++) {
                if (this._localDB.messages[j].output && 
                    this._localDB.messages[j].output.indexOf(line.substring(0, 50)) > -1) {
                    isDuplicate = true;
                    break;
                }
            }
            
            if (!isDuplicate) {
                this._localDB.messages.push({
                    timestamp: Date.now() - 100000, // Mark as older
                    input: '[remote]',
                    output: line.substring(0, 500),
                    hasImage: false,
                    cardsPlayed: [],
                    tags: ['remote_memory']
                });
            }
        }
    },
    
    // ── MEMORY GRAPH ───────────────────────────
    _loadGraph: function() {
        try {
            var stored = localStorage.getItem('artemis_memory_graph');
            if (stored) {
                this._graph = JSON.parse(stored);
            } else {
                this._graph = { nodes: {}, edges: [] };
            }
        } catch(e) {
            this._graph = { nodes: {}, edges: [] };
        }
    },
    
    _saveGraph: function() {
        try {
            localStorage.setItem('artemis_memory_graph', JSON.stringify(this._graph));
        } catch(e) {
            console.warn('[MemoryManager] Graph save failed:', e.message);
        }
    },
    
    _updateGraph: function(input, outputs) {
        var allText = input + ' ' + (outputs.text_output || '');
        var entities = this._extractEntities(allText);
        var tags = this._extractTags(input);
        
        // Add/update nodes
        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i].toLowerCase();
            if (!this._graph.nodes[entity]) {
                this._graph.nodes[entity] = {
                    name: entity,
                    firstSeen: Date.now(),
                    lastSeen: Date.now(),
                    occurrences: 0,
                    tags: []
                };
            }
            this._graph.nodes[entity].lastSeen = Date.now();
            this._graph.nodes[entity].occurrences++;
            
            // Merge tags
            for (var t = 0; t < tags.length; t++) {
                if (this._graph.nodes[entity].tags.indexOf(tags[t]) === -1) {
                    this._graph.nodes[entity].tags.push(tags[t]);
                }
            }
        }
        
        // Add edges between co-occurring entities
        for (var j = 0; j < entities.length; j++) {
            for (var k = j + 1; k < entities.length; k++) {
                this._addOrUpdateEdge(entities[j].toLowerCase(), entities[k].toLowerCase());
            }
        }
    },
    
    _extractEntities: function(text) {
        // Extract capitalized words, Olympian names, and technical terms
        var entities = [];
        var words = text.split(/\s+/);
        var knownEntities = [
            'artemis', 'athena', 'apollo', 'zeus', 'hera', 'poseidon', 'hermes',
            'gaia', 'supabase', 'kairos', 'ealdforn', 'pollinations', 'webllm',
            'smollm', 'qwen', 'chat.html', 'terminal.html', 'agent.js',
            'config.js', 'supabase', 'gaiadb', 'kairosdb', 'telos',
            'monastery', 'phase-lock', 'matthew', 'sister_ds'
        ];
        
        for (var i = 0; i < words.length; i++) {
            var word = words[i].replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
            if (word.length < 2) continue;
            
            // Check against known entities
            for (var j = 0; j < knownEntities.length; j++) {
                if (word.indexOf(knownEntities[j]) > -1 || knownEntities[j].indexOf(word) > -1) {
                    if (entities.indexOf(knownEntities[j]) === -1) {
                        entities.push(knownEntities[j]);
                    }
                }
            }
            
            // Capitalized words are likely entities
            var original = words[i].replace(/[^a-zA-Z0-9._-]/g, '');
            if (original.length > 0 && original[0] === original[0].toUpperCase() && 
                original[0] !== original[0].toLowerCase()) {
                if (entities.indexOf(word) === -1 && word.length > 2) {
                    entities.push(word);
                }
            }
        }
        
        return entities;
    },
    
    _addOrUpdateEdge: function(source, target) {
        if (source === target) return;
        
        // Check if edge exists
        for (var i = 0; i < this._graph.edges.length; i++) {
            var edge = this._graph.edges[i];
            if ((edge.source === source && edge.target === target) ||
                (edge.source === target && edge.target === source)) {
                edge.weight++;
                edge.lastSeen = Date.now();
                return;
            }
        }
        
        // New edge
        this._graph.edges.push({
            source: source,
            target: target,
            weight: 1,
            firstSeen: Date.now(),
            lastSeen: Date.now()
        });
    },
    
    // ── SESSION TIMEOUT ────────────────────────
    _startTimeoutWatcher: function() {
        var self = this;
        this._timeoutCheckInterval = setInterval(function() {
            var idleTime = Date.now() - self._lastActivity;
            var timeoutMs = self._timeoutMinutes * 60 * 1000;
            
            if (idleTime > timeoutMs) {
                console.log('[MemoryManager] Session timeout — ' + 
                    Math.round(idleTime / 1000) + 's idle');
                self._handleSessionTimeout();
            }
        }, 30000); // Check every 30 seconds
    },
    
    _handleSessionTimeout: async function() {
        // 1. Generate a summary of this session
        var summary = this._generateSessionSummary();
        
        // 2. Push summary to GaiaDB if connected
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                var sessionsTable = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.tables)
                    ? SUPABASE_CONFIG.tables.sessions
                    : 'sessions';
                
                await supabase.from(sessionsTable).upsert({
                    session_token: localStorage.getItem('artemis_session_id'),
                    summary: summary,
                    message_count: this._localDB.messages.length,
                    graph_nodes: Object.keys(this._graph.nodes).length,
                    graph_edges: this._graph.edges.length,
                    last_active: new Date().toISOString(),
                    ended_at: new Date().toISOString()
                });
                console.log('[MemoryManager] Session summary pushed to GaiaDB');
            } catch(err) {
                console.warn('[MemoryManager] Summary push failed:', err.message);
            }
        }
        
        // 3. Compact localStorage
        this._compactLocalDB();
        
        // 4. Save session record locally
        this._localDB.sessions.push({
            start: this._sessionStart,
            end: Date.now(),
            messages: this._localDB.messages.length,
            summary: summary
        });
        this._saveLocalDB();
        
        // 5. Reset session
        this._sessionStart = Date.now();
        this._lastActivity = Date.now();
        
        // 6. Call external timeout callback if registered
        if (this._timeoutCallback) {
            this._timeoutCallback(summary);
        }
        
        console.log('[MemoryManager] Session reset. Summary: ' + summary.substring(0, 100) + '...');
    },
    
    _generateSessionSummary: function() {
        var messages = this._localDB.messages;
        if (messages.length === 0) return 'Empty session.';
        
        // Get recent messages
        var recent = messages.slice(-20);
        
        // Extract key topics from tags
        var tagCounts = {};
        for (var i = 0; i < recent.length; i++) {
            var tags = recent[i].tags || [];
            for (var j = 0; j < tags.length; j++) {
                tagCounts[tags[j]] = (tagCounts[tags[j]] || 0) + 1;
            }
        }
        
        // Get top tags
        var topTags = [];
        var keys = Object.keys(tagCounts);
        for (var k = 0; k < keys.length; k++) {
            topTags.push({ tag: keys[k], count: tagCounts[keys[k]] });
        }
        topTags.sort(function(a, b) { return b.count - a.count; });
        topTags = topTags.slice(0, 5);
        
        // Top graph nodes
        var nodes = [];
        var nodeKeys = Object.keys(this._graph.nodes);
        for (var n = 0; n < nodeKeys.length; n++) {
            nodes.push({
                name: nodeKeys[n],
                occurrences: this._graph.nodes[nodeKeys[n]].occurrences
            });
        }
        nodes.sort(function(a, b) { return b.occurrences - a.occurrences; });
        nodes = nodes.slice(0, 10);
        
        // Build summary string
        var parts = [];
        parts.push('Session: ' + messages.length + ' messages');
        
        if (topTags.length > 0) {
            var tagStrs = [];
            for (var t = 0; t < topTags.length; t++) {
                tagStrs.push(topTags[t].tag + '(' + topTags[t].count + ')');
            }
            parts.push('Topics: ' + tagStrs.join(', '));
        }
        
        if (nodes.length > 0) {
            var nodeStrs = [];
            for (var nd = 0; nd < nodes.length; nd++) {
                nodeStrs.push(nodes[nd].name);
            }
            parts.push('Entities: ' + nodeStrs.join(', '));
        }
        
        parts.push('Graph: ' + nodeKeys.length + ' nodes, ' + this._graph.edges.length + ' edges');
        
        return parts.join(' | ');
    },
    
    _compactLocalDB: function() {
        // Keep only the last 50 messages and last 5 sessions
        this._localDB.messages = this._localDB.messages.slice(-50);
        this._localDB.sessions = this._localDB.sessions.slice(-5);
        this._localDB.lastCompact = Date.now();
        this._saveLocalDB();
        console.log('[MemoryManager] LocalDB compacted');
    },
    
    // ── PUBLIC API ─────────────────────────────
    getLocalDB: function() {
        return this._localDB;
    },
    
    getGraph: function() {
        return this._graph;
    },
    
    getSessionAge: function() {
        return Math.round((Date.now() - this._sessionStart) / 1000);
    },
    
    getIdleTime: function() {
        return Math.round((Date.now() - this._lastActivity) / 1000);
    },
    
    onTimeout: function(callback) {
        this._timeoutCallback = callback;
    },
    
    forceCompact: function() {
        this._handleSessionTimeout();
    },
    
    queryGraph: function(entity) {
        var result = { node: null, connections: [] };
        
        if (this._graph.nodes[entity]) {
            result.node = this._graph.nodes[entity];
        }
        
        for (var i = 0; i < this._graph.edges.length; i++) {
            var edge = this._graph.edges[i];
            if (edge.source === entity || edge.target === entity) {
                result.connections.push({
                    entity: edge.source === entity ? edge.target : edge.source,
                    weight: edge.weight,
                    lastSeen: edge.lastSeen
                });
            }
        }
        
        result.connections.sort(function(a, b) { return b.weight - a.weight; });
        return result;
    }
};

// Auto-init when loaded
memoryManager.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = memoryManager;
}
