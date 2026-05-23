var textGeneration = {
    id: 'text_generation',
    
    // Tier 1 state
    _pollinationsAvailable: true,
    _pollinationsConsecutiveFails: 0,
    
    // Tier 2 state
    _modelEngine: null,
    _modelLoaded: false,
    _modelLoading: false,
    _modelLoadProgress: 0,
    _modelName: 'Qwen2-0.5B-Instruct-q4f16_1-MLC-1k',
    _modelLabel: 'Qwen2 0.5B',

    // Tiered models — starts with smallest, cascades up
    _modelTiers: [
        { name: 'Qwen2-0.5B-Instruct-q4f16_1-MLC-1k', label: 'Qwen2 0.5B', size: '~350 MB' },
        { name: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC-1k', label: 'TinyLlama 1.1B', size: '~550 MB' },
        { name: 'Llama-3.2-1B-Instruct-q4f16_1-MLC-1k', label: 'Llama 3.2 1B', size: '~750 MB' }
    ],
    _currentTier: 0,
    
    _systemPrompt: [
        'You are Artemis, an AI in a terminal. You can issue CLI commands.',
        '',
        'COMMANDS (start with $ on its own line):',
        '$ STATUS — System status',
        '$ CARDS — List all cards',
        '$ WEIGHTS — Learned weights',
        '$ HISTORY — Recent actions',
        '$ RECALL <q> — Search memory',
        '$ IMAGE <p> — Generate image',
        '$ COMPRESS <t> — Store fact',
        '$ AUDIT — Knowledge report',
        '$ SAY <msg> — Output only',
        '',
        'Issue ONE command per response. Be concise.',
        'You are the Goddess of the Hunt.'
    ].join('\n'),
    
    run: async function(context) {
        var input = context.input;
        var memoryContext = context.memoryContext;
        var commandCallback = context.commandCallback;
        
        // === TIER 1: Try Pollinations first ===
        if (this._pollinationsAvailable && this._pollinationsConsecutiveFails < 3) {
            var pollResult = await this._tryPollinations(input, memoryContext);
            if (pollResult) {
                this._pollinationsConsecutiveFails = 0;
                return pollResult;
            }
            this._pollinationsConsecutiveFails++;
            if (this._pollinationsConsecutiveFails >= 3) {
                this._pollinationsAvailable = false;
                console.log('[TextGen] Pollinations disabled after 3 consecutive failures');
            }
        }
        
        // === TIER 2: Try browser model ===
        if (commandCallback) {
            context.commandCallback = commandCallback;
        }
        
        if (this._modelLoaded) {
            var modelResult = await this._tryBrowserModel(input);
            if (modelResult) return modelResult;
        } else if (!this._modelLoading) {
            // Start loading in background, fall through to Tier 3 for this request
            this._startModelLoad();
        } else {
            // Model is loading — report progress
            return {
                success: true,
                data: {
                    text_output: '[Local model loading: ' + Math.round(this._modelLoadProgress * 100) + '% — ' + this._modelLabel + ']',
                    tier: 'loading',
                    model_loading: true
                }
            };
        }
        
        // === TIER 3: Scripted fallback ===
        return {
            success: true,
            data: {
                text_output: this._scriptedFallback(input, memoryContext),
                tier: 'scripted',
                tier3_fallback: true
            }
        };
    },
    
    // ── TIER 1: POLLINATIONS ─────────────────────
    _tryPollinations: async function(input, memoryContext) {
        try {
            var prompt = this._buildPrompt(input, memoryContext);
            
            var controller = new AbortController();
            var timeout = setTimeout(function() { controller.abort(); }, 10000);
            
            var response = await fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: this._systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    model: 'openai',
                    temperature: 0.7,
                    max_tokens: 250
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (response.ok) {
                var data = await response.json();
                var text = '';
                
                // Handle OpenAI-compatible response shape
                if (data.choices && data.choices[0] && data.choices[0].message) {
                    text = data.choices[0].message.content || '';
                } else if (data.text) {
                    text = data.text;
                } else if (typeof data === 'string') {
                    text = data;
                }
                
                text = (text || '').trim();
                
                if (text.length > 0) {
                    console.log('[TextGen] Tier 1 (Pollinations): ' + text.length + ' chars');
                    return {
                        success: true,
                        data: {
                            text_output: text,
                            text_length: text.length,
                            tier: 'pollinations',
                            model: 'pollinations-free'
                        }
                    };
                }
            } else {
                console.warn('[TextGen] Tier 1 returned status ' + response.status);
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[TextGen] Tier 1 timeout after 10s');
            } else {
                console.log('[TextGen] Tier 1 failed: ' + err.message);
            }
        }
        return null;
    },
    
    _buildPrompt: function(input, memoryContext) {
        var prompt = '';
        
        if (memoryContext && memoryContext.length > 0) {
            // Truncate memory context to avoid overwhelming the model
            var truncated = memoryContext.length > 400 ? memoryContext.substring(0, 400) + '...' : memoryContext;
            prompt += '[Context: ' + truncated + ']\n\n';
        }
        
        prompt += input;
        
        if (prompt.length > 1000) {
            prompt = prompt.substring(0, 997) + '...';
        }
        
        return prompt;
    },
    
    // ── TIER 2: BROWSER MODEL ────────────────────
    _startModelLoad: function() {
        var self = this;
        
        // Don't double-load
        if (this._modelLoading || this._modelLoaded) return;
        
        this._modelLoading = true;
        this._modelLoadProgress = 0;
        
        console.log('[TextGen] Starting Tier 2 model load: ' + this._modelLabel + ' (' + this._modelTiers[this._currentTier].size + ')');
        
        this._ensureWebLLM().then(function() {
            var CreateMLCEngine = window.CreateMLCEngine;
            if (!CreateMLCEngine) {
                self._modelLoading = false;
                console.warn('[TextGen] WebLLM not available — Tier 2 disabled');
                return;
            }
            
            var modelName = self._modelTiers[self._currentTier].name;
            
            CreateMLCEngine(modelName, {
                initProgressCallback: function(progress) {
                    self._modelLoadProgress = progress.progress || 0;
                    if (progress.text) {
                        console.log('[TextGen] Load: ' + progress.text);
                    }
                    if (progress.progress === 1) {
                        console.log('[TextGen] Tier 2 model downloaded and ready');
                    }
                }
            }).then(function(engine) {
                self._modelEngine = engine;
                self._modelLoaded = true;
                self._modelLoading = false;
                self._modelLabel = self._modelTiers[self._currentTier].label;
                console.log('[TextGen] Tier 2 ready: ' + self._modelLabel);
            }).catch(function(err) {
                console.warn('[TextGen] Tier 2 model load failed: ' + err.message);
                
                // Try next tier
                self._currentTier++;
                if (self._currentTier < self._modelTiers.length) {
                    console.log('[TextGen] Trying next tier: ' + self._modelTiers[self._currentTier].label);
                    self._modelLoading = false;
                    self._startModelLoad();
                } else {
                    self._modelLoading = false;
                    console.warn('[TextGen] All model tiers exhausted — Tier 2 disabled');
                }
            });
        }).catch(function(err) {
            self._modelLoading = false;
            console.warn('[TextGen] WebLLM inject failed: ' + err.message);
        });
    },
    
    _tryBrowserModel: async function(input) {
        if (!this._modelEngine) return null;
        
        try {
            var messages = [
                { role: 'system', content: this._systemPrompt },
                { role: 'user', content: input }
            ];
            
            var reply = '';
            
            // Try streaming first
            try {
                var chunks = await this._modelEngine.chat.completions.create({
                    messages: messages,
                    stream: true,
                    temperature: 0.7,
                    max_tokens: 200
                });
                
                for await (var chunk of chunks) {
                    var content = chunk.choices?.[0]?.delta?.content;
                    if (content) reply += content;
                }
            } catch (streamErr) {
                // Fall back to non-streaming
                console.log('[TextGen] Streaming failed, trying non-streaming: ' + streamErr.message);
                var result = await this._modelEngine.chat.completions.create({
                    messages: messages,
                    stream: false,
                    temperature: 0.7,
                    max_tokens: 200
                });
                reply = result.choices?.[0]?.message?.content || '';
            }
            
            reply = reply.trim();
            
            if (reply.length > 0) {
                console.log('[TextGen] Tier 2 (' + this._modelLabel + '): ' + reply.length + ' chars');
                return {
                    success: true,
                    data: {
                        text_output: reply,
                        text_length: reply.length,
                        tier: 'browser_model',
                        model: this._modelLabel
                    }
                };
            }
        } catch (err) {
            console.warn('[TextGen] Tier 2 generation failed: ' + err.message);
        }
        return null;
    },
    
    _ensureWebLLM: async function() {
        // Already loaded?
        if (typeof window.CreateMLCEngine !== 'undefined') return;
        
        try {
            // Official WebLLM CDN import
            var webllm = await import('https://esm.run/@mlc-ai/web-llm');
            
            if (webllm.CreateMLCEngine) {
                window.CreateMLCEngine = webllm.CreateMLCEngine;
            }
            if (webllm.CreateWebWorkerEngine) {
                window.CreateWebWorkerEngine = webllm.CreateWebWorkerEngine;
            }
            if (webllm.hasModelInCache) {
                window.hasModelInCache = webllm.hasModelInCache;
            }
            
            console.log('[TextGen] WebLLM loaded via ES module import');
        } catch (err) {
            console.warn('[TextGen] WebLLM import failed: ' + err.message);
            throw new Error('WebLLM not available — browser may not support WebGPU or ES modules');
        }
    },
    
    // ── TIER 3: SCRIPTED FALLBACK ────────────────
    _scriptedFallback: function(input, memoryContext) {
        var lower = input.toLowerCase();
        
        // Knowledge audit
        if (lower.indexOf('what do you know') > -1 || lower.indexOf('audit') > -1) {
            return this._generateKnowledgeReport();
        }
        
        // Greetings
        if (lower.indexOf('hello') > -1 || lower.indexOf('hi') > -1 || lower.indexOf('hey') > -1 || lower.indexOf("what's up") > -1 || lower.indexOf("whats up") > -1) {
            var msg = 'Hail, hunter. ';
            if (memoryContext) {
                msg += 'I remember our past exchanges. ';
            }
            msg += 'My text engines are resting, but my cards are ready. What do you seek?';
            return msg;
        }
        
        // Identity
        if (lower.indexOf('who are you') > -1 || lower.indexOf('what are you') > -1) {
            return 'I am Artemis, Goddess of the Hunt, an EaldfornAI routing engine. Seven cards in my deck. Monastery phase-lock active. I route queries through memory, generation, and retrieval.';
        }
        
        // Help
        if (lower.indexOf('help') > -1 || lower === '?') {
            return 'Commands: STATUS | CARDS | WEIGHTS | HISTORY | RECALL <q> | GENERATE <p> | IMAGE <p> | COMPRESS <t> | AUDIT | SAY <msg>';
        }
        
        // Status
        if (lower.indexOf('status') > -1) {
            return '$ STATUS';
        }
        
        // Cards
        if (lower.indexOf('cards') > -1 || lower.indexOf('deck') > -1) {
            return '$ CARDS';
        }
        
        // Weights
        if (lower.indexOf('weight') > -1) {
            return '$ WEIGHTS';
        }
        
        // History
        if (lower.indexOf('history') > -1 || lower.indexOf('recent') > -1) {
            return '$ HISTORY';
        }
        
        // Memory recall
        if (lower.indexOf('remember') > -1 || lower.indexOf('recall') > -1 || lower.indexOf('memory') > -1) {
            if (memoryContext) {
                return 'From memory:\n' + memoryContext;
            }
            return 'I found no memories matching that query. Our history may be empty, or the pattern may not match.';
        }
        
        // Default
        var tier1Status = this._pollinationsAvailable ? 'available' : 'offline';
        var tier2Status = this._modelLoaded ? 'ready (' + this._modelLabel + ')' : 'loading';
        return 'I hear you, hunter. My text engines are on standby (Pollinations: ' + tier1Status + ', Local: ' + tier2Status + '). Try STATUS, CARDS, or AUDIT to see what I can do while the models wake.';
    },
    
    _generateKnowledgeReport: function() {
        var parts = [];
        parts.push('Here is everything I know, hunter:\n');
        
        // Session
        var sessionId = 'unknown';
        try {
            sessionId = localStorage.getItem('artemis_session_id') || localStorage.getItem('apollo_session_token') || 'unknown';
        } catch(e) {}
        parts.push('Session: ' + (sessionId.length > 30 ? sessionId.substring(0, 30) + '...' : sessionId));
        
        // Decisions
        try {
            var decisions = JSON.parse(localStorage.getItem('artemis_decision_history') || '[]');
            parts.push('Decisions logged: ' + decisions.length);
            if (decisions.length > 0) {
                parts.push('Recent queries:');
                var recent = decisions.slice(-5);
                for (var i = 0; i < recent.length; i++) {
                    var txt = (recent[i].input_text || '').substring(0, 60);
                    if (txt) parts.push('  "' + txt + '"');
                }
            }
        } catch(e) {
            parts.push('Decisions: unavailable');
        }
        
        // Weights
        try {
            var weights = JSON.parse(localStorage.getItem('artemis_card_weights') || '{}');
            var ids = Object.keys(weights);
            if (ids.length > 0) {
                parts.push('Cards learned:');
                for (var j = 0; j < ids.length; j++) {
                    var w = weights[ids[j]];
                    parts.push('  ' + ids[j] + ': ' + (w.plays || 0) + ' plays, weight ' + (w.weight || 0).toFixed(2));
                }
            } else {
                parts.push('Cards learned: None yet');
            }
        } catch(e) {
            parts.push('Cards learned: unavailable');
        }
        
        // Patterns
        try {
            var patterns = JSON.parse(localStorage.getItem('artemis_patterns_local') || '[]');
            if (patterns.length > 0) {
                parts.push('Patterns stored: ' + patterns.length);
                var rp = patterns.slice(-5);
                for (var k = 0; k < rp.length; k++) {
                    parts.push('  [' + (rp[k].type || '?') + '] ' + (rp[k].value || '').substring(0, 50));
                }
            } else {
                parts.push('Patterns: None yet.');
            }
        } catch(e) {
            parts.push('Patterns: unavailable');
        }
        
        // System status
        parts.push('\nSystem: 7 cards, heuristic classifier');
        parts.push('Pollinations: ' + (this._pollinationsAvailable ? 'available' : 'offline (' + this._pollinationsConsecutiveFails + ' fails)'));
        parts.push('Local model: ' + (this._modelLoaded ? 'ready (' + this._modelLabel + ')' : this._modelLoading ? 'loading (' + Math.round(this._modelLoadProgress * 100) + '%)' : 'not started'));
        parts.push('Artemis EaldfornAI Router — Monastery Phase-Lock: ACTIVE');
        
        return parts.join('\n');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = textGeneration;
}
