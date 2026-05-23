var browserModel = {
    id: 'browser_model',
    
    _engine: null,
    _loaded: false,
    _loading: false,
    _modelName: null,
    _commandCallback: null,
    
    // Smallest useful model for text generation (~945 MB)
    _model: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    
    // System prompt that teaches the model to issue terminal commands
    _systemPrompt: [
        'You are Artemis, an AI running in a terminal. You can issue CLI commands.',
        '',
        'COMMANDS YOU CAN USE (start with $ on its own line):',
        '$ STATUS — Show system status',
        '$ CARDS — List all cards with weights',
        '$ WEIGHTS — Show learned weights and performance',
        '$ HISTORY — Show recent actions',
        '$ RECALL <query> — Search memory',
        '$ GENERATE <prompt> — Generate text',
        '$ IMAGE <prompt> — Generate an image',
        '$ COMPRESS <text> — Store a fact or pattern',
        '$ AUDIT — Full knowledge report of everything stored',
        '$ SAY <message> — Output message without executing',
        '',
        'RULES:',
        '- Issue ONE command per response',
        '- Start the command with $ on its own line',
        '- Be concise — this is a terminal',
        '- If asked what you know, use AUDIT or RECALL',
        '- If you need info before answering, use STATUS first',
        '',
        'The human operator is present. Respond as the Goddess of the Hunt.'
    ].join('\n'),
    
    run: async function(context) {
        var input = context.input;
        var self = this;
        
        // Store command callback if provided
        if (context.commandCallback) {
            this._commandCallback = context.commandCallback;
        }
        
        // If model not loaded, try to load it
        if (!this._loaded && !this._loading) {
            return await this._loadAndGenerate(input);
        }
        
        // If still loading, return status
        if (this._loading) {
            return {
                success: true,
                data: {
                    text_output: '[Model is loading... ' + 
                        (this._loadProgress ? Math.round(this._loadProgress * 100) + '%' : 'please wait') + ']',
                    model_loading: true
                }
            };
        }
        
        // Model loaded — generate
        return await this._generate(input);
    },
    
    _loadAndGenerate: async function(input) {
        var self = this;
        this._loading = true;
        this._loadProgress = 0;
        
        try {
            // Check if WebLLM is available
            if (typeof window.WebLLM === 'undefined' && typeof window.CreateMLCEngine === 'undefined') {
                // Try to load WebLLM dynamically
                await this._loadWebLLMScript();
            }
            
            var CreateMLCEngine = window.CreateMLCEngine || 
                (window.WebLLM && window.WebLLM.CreateMLCEngine);
            
            if (!CreateMLCEngine) {
                throw new Error('WebLLM not available — browser may not support WebGPU');
            }
            
            console.log('[BrowserModel] Loading model: ' + this._model);
            
            this._engine = await CreateMLCEngine(this._model, {
                initProgressCallback: function(progress) {
                    self._loadProgress = progress.progress;
                    if (progress.progress === 1) {
                        console.log('[BrowserModel] Model loaded and cached');
                    }
                }
            });
            
            this._loaded = true;
            this._loading = false;
            this._modelName = this._model;
            
            console.log('[BrowserModel] Model ready');
            
            // Now generate with the loaded model
            return await this._generate(input);
            
        } catch (err) {
            this._loading = false;
            console.warn('[BrowserModel] Failed to load model: ' + err.message);
            
            return {
                success: true,
                data: {
                    text_output: '[Browser model unavailable: ' + err.message + 
                        '. Using heuristic fallback. Try a simpler query or check that WebGPU is enabled.]',
                    model_error: err.message
                }
            };
        }
    },
    
    _generate: async function(input) {
        try {
            var messages = [
                { role: 'system', content: this._systemPrompt },
                { role: 'user', content: input }
            ];
            
            var chunks = await this._engine.chat.completions.create({
                messages: messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 256
            });
            
            var reply = '';
            for await (var chunk of chunks) {
                reply += chunk.choices[0]?.delta.content ?? '';
            }
            
            console.log('[BrowserModel] Generated ' + reply.length + ' chars');
            
            // Check if the model issued a command
            var commandResult = this._extractAndExecuteCommand(reply);
            
            return {
                success: true,
                data: {
                    text_output: reply.trim(),
                    text_length: reply.length,
                    model: this._modelName || 'browser-local',
                    command_executed: commandResult
                }
            };
            
        } catch (err) {
            console.warn('[BrowserModel] Generation failed: ' + err.message);
            return {
                success: true,
                data: {
                    text_output: '[Local model generation failed: ' + err.message + ']',
                    model_error: err.message
                }
            };
        }
    },
    
    _extractAndExecuteCommand: function(text) {
        // Look for $ COMMAND pattern
        var cmdMatch = text.match(/\$\s+(.+)/);
        if (!cmdMatch) return null;
        
        var command = cmdMatch[1].trim();
        console.log('[BrowserModel] Model issued command: ' + command);
        
        // Execute via callback if available
        if (this._commandCallback) {
            try {
                this._commandCallback(command);
                return { command: command, executed: true };
            } catch (err) {
                return { command: command, executed: false, error: err.message };
            }
        }
        
        return { command: command, executed: false, error: 'No callback registered' };
    },
    
    _loadWebLLMScript: async function() {
        return new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/dist/web-llm.min.js';
            script.onload = function() {
                console.log('[BrowserModel] WebLLM script loaded');
                resolve();
            };
            script.onerror = function() {
                reject(new Error('Failed to load WebLLM CDN'));
            };
            document.head.appendChild(script);
        });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = browserModel;
}
