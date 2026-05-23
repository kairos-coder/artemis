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
    _modelName: 'SmolLM2-135M-Instruct-q4f16_1-MLC',
    _modelLabel: 'SmolLM2 135M',
    
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
            var timeout = setTimeout(function() { controller.abort(); }, 8000);
            
            var response = await fetch(
                'https://text.pollinations.ai/' + encodeURIComponent(prompt),
                { signal: controller.signal }
            );
            
            clearTimeout(timeout);
            
            if (response.ok) {
                var text = await response.text();
                if (text && text.trim().length > 0) {
                    console.log('[TextGen] Tier 1 (Pollinations): ' + text.length + ' chars');
                    return {
                        success: true,
                        data: {
                            text_output: text.trim(),
                            text_length: text.trim().length,
                            tier: 'pollinations',
                            model: 'pollinations-free'
                        }
                    };
                }
            }
        } catch (err) {
            console.log('[TextGen] Tier 1 failed: ' + (err.name === 'AbortError' ? 'timeout' : err.message));
        }
        return null;
    },
    
    _buildPrompt: function(input, memoryContext) {
        var prompt = input;
        if (memoryContext && memoryContext.length < 300) {
            prompt = '[Context: ' + memoryContext.substring(0, 300) + ']\n' + prompt;
        }
        if (prompt.length > 800) {
            prompt = prompt.substring(0, 797) + '...';
        }
        return prompt;
    },
    
    // ── TIER 2: BROWSER MODEL ────────────────────
    _startModelLoad: function() {
        var self = this;
        this._modelLoading = true;
        this._modelLoadProgress = 0;
        
        console.log('[TextGen] Starting Tier 2 model load: ' + this._modelLabel);
        
        this._ensureWebLLM().then(function() {
            var CreateMLCEngine = window.CreateMLCEngine;
            if (!CreateMLCEngine) {
                self._modelLoading = false;
                console.warn('[TextGen] WebLLM not available — Tier 2 disabled');
                return;
            }
            
            CreateMLCEngine(self._modelName, {
                initProgressCallback: function(progress) {
                    self._modelLoadProgress = progress.progress;
                    if (progress.progress === 1) {
                        console.log('[TextGen] Tier 2 model cached and ready');
                    }
                }
            }).then(function(engine) {
                self._modelEngine = engine;
                self._modelLoaded = true;
                self._modelLoading = false;
                console.log('[TextGen] Tier 2 ready: ' + self._modelLabel);
            }).catch(function(err) {
                self._modelLoading = false;
                console.warn('[TextGen] Tier 2 load failed: ' + err.message);
            });
        }).catch(function(err) {
            self._modelLoading = false;
            console.warn('[TextGen] WebLLM inject failed: ' + err.message);
        });
    },
    
    _tryBrowserModel: async function(input) {
        try {
            var messages = [
                { role: 'system', content: this._systemPrompt },
                { role: 'user', content: input }
            ];
            
            var chunks = await this._modelEngine.chat.completions.create({
                messages: messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 200
            });
            
            var reply = '';
            for await (var chunk of chunks) {
                reply += chunk.choices[0]?.delta.content ?? '';
            }
            
            console.log('[TextGen] Tier 2 (' + this._modelLabel + '): ' + reply.length + ' chars');
            
            return {
                success: true,
                data: {
                    text_output: reply.trim(),
                    text_length: reply.length,
                    tier: 'browser_model',
                    model: this._modelLabel
                }
            };
        } catch (err) {
            console.warn('[TextGen] Tier 2 generation failed: ' + err.message);
            return null;
        }
    },
    
    _ensureWebLLM: async function() {
        if (typeof window.CreateMLCEngine !== 'undefined') return;
        
        return new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/dist/web-llm.min.js';
            script.onload = function() { resolve(); };
            script.onerror = function() { reject(new Error('WebLLM CDN failed')); };
            document.head.appendChild(script);
        });
    },
    
    // ── TIER 3: SCRIPTED FALLBACK ────────────────
    _scriptedFallback: function(input, memoryContext) {
        var lower = input.toLowerCase();
        
        // Knowledge audit
        if (lower.indexOf('what do you know') > -1 || lower.indexOf('audit') > -1) {
            return this._generateKnowledgeReport();
        }
        
        // Greetings
        if (lower.indexOf('hello') > -1 || lower.indexOf('hi') > -1 || lower.indexOf('hey') > -1 || lower.indexOf("what's up") > -1) {
            var msg = 'Hail, hunter. ';
            if (memoryContext) {
                msg += 'I remember our past exchanges. ';
            }
            msg += 'My text engines are resting, but my cards are ready. What do you seek?';
            return msg;
        }
        
        // Identity
        if (lower.indexOf('who are you') > -1 || lower.indexOf('what are you') > -1) {
            return 'I am Artemis, Goddess of the Hunt, an EaldfornAI routing engine. Six cards in my deck. Monastery phase-lock active. I route queries through memory, generation, and retrieval.';
        }
        
        // Help
        if (lower.indexOf('help') > -1) {
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
        return 'I hear you, hunter. My text engines are offline (Pollinations unavailable, local model not ready). Try STATUS, CARDS, or AUDIT to see what I can do while the models wake.';
    },
    
    _generateKnowledgeReport: function() {
        var parts = [];
        parts.push('Here is everything I know, hunter:\n');
        
        // Session
        var sessionId = localStorage.getItem('artemis_session_id') || 'unknown';
        parts.push('Session: ' + sessionId.substring(0, 20) + '...');
        
        // Decisions
        try {
            var decisions = JSON.parse(localStorage.getItem('artemis_decision_history') || '[]');
            parts.push('Decisions logged: ' + decisions.length);
            if (decisions.length > 0) {
                parts.push('Recent queries:');
                var recent = decisions.slice(-5);
                for (var i = 0; i < recent.length; i++) {
                    parts.push('  "' + (recent[i].input_text || '').substring(0, 60) + '"');
                }
            }
        } catch(e) {}
        
        // Weights
        try {
            var weights = JSON.parse(localStorage.getItem('artemis_card_weights') || '{}');
            var ids = Object.keys(weights);
            if (ids.length > 0) {
                parts.push('Cards learned:');
                for (var j = 0; j < ids.length; j++) {
                    var w = weights[ids[j]];
                    parts.push('  ' + ids[j] + ': ' + w.plays + ' plays, weight ' + w.weight.toFixed(2));
                }
            }
        } catch(e) {}
        
        // Patterns
        try {
            var patterns = JSON.parse(localStorage.getItem('artemis_patterns_local') || '[]');
            if (patterns.length > 0) {
                parts.push('Patterns stored: ' + patterns.length);
                var rp = patterns.slice(-5);
                for (var k = 0; k < rp.length; k++) {
                    parts.push('  [' + rp[k].type + '] ' + (rp[k].value || '').substring(0, 50));
                }
            } else {
                parts.push('Patterns: None yet.');
            }
        } catch(e) {}
        
        parts.push('\nSystem: 7 cards, heuristic classifier, Pollinations ' + (this._pollinationsAvailable ? 'available' : 'offline') + ', local model ' + (this._modelLoaded ? 'ready' : 'loading'));
        parts.push('Artemis EaldfornAI Router — Monastery Phase-Lock: ACTIVE');
        
        return parts.join('\n');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = textGeneration;
}
