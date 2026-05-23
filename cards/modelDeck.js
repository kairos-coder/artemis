var modelDeck = {
    id: 'model_deck',
    icon: '🧩',
    category: 'meta',
    description: 'Registry of all loaded browser models — allows cards to request specialized inference',
    
    _models: {},
    
    init: function() {
        // Scan for shared models loaded by chat.html
        if (window.__artemisTextModelReady && window.__artemisTextModel) {
            this._models['text_generator'] = {
                name: window.__artemisTextModelName || 'LaMini-T5 223M',
                model: window.__artemisTextModel,
                ready: true,
                size: '~200MB',
                capabilities: ['text_generation', 'card_voting', 'classification', 'summarization'],
                pipeline: 'text2text-generation'
            };
        }
        
        if (window.__artemisQueryModelReady && window.__artemisQueryModel) {
            this._models['query_classifier'] = {
                name: window.__artemisQueryModelName || 'DistilBERT 67MB',
                model: window.__artemisQueryModel,
                ready: true,
                size: '~67MB',
                capabilities: ['binary_classification', 'query_routing', 'intent_detection'],
                pipeline: 'text-classification'
            };
        }
        
        var count = Object.keys(this._models).length;
        if (count > 0) {
            console.log('[ModelDeck] Registered ' + count + ' model(s): ' + 
                Object.values(this._models).map(function(m) { return m.name; }).join(', '));
        } else {
            console.log('[ModelDeck] No shared models found — heuristic-only mode');
        }
    },
    
    run: async function(context) {
        // This card doesn't auto-execute — it's a registry other cards query
        return { success: true, data: { models_available: Object.keys(this._models).length } };
    },
    
    // ── Public API ──────────────────────────────
    
    getModel: function(capability) {
        for (var key in this._models) {
            if (this._models[key].ready && this._models[key].capabilities.indexOf(capability) > -1) {
                return this._models[key].model;
            }
        }
        return null;
    },
    
    getModelInfo: function(capability) {
        for (var key in this._models) {
            if (this._models[key].ready && this._models[key].capabilities.indexOf(capability) > -1) {
                return {
                    name: this._models[key].name,
                    size: this._models[key].size,
                    capability: capability
                };
            }
        }
        return null;
    },
    
    isCapabilityReady: function(capability) {
        return this.getModel(capability) !== null;
    },
    
    listModels: function() {
        var result = [];
        for (var key in this._models) {
            result.push({
                id: key,
                name: this._models[key].name,
                ready: this._models[key].ready,
                size: this._models[key].size,
                capabilities: this._models[key].capabilities
            });
        }
        return result;
    },
    
    // Vote on a card using the best available model
    voteOnCard: async function(card, userInput) {
        var model = this.getModel('card_voting');
        
        if (!model) return null; // No model available — caller uses heuristic
        
        try {
            var prompt = 'Card: ' + (card.name || card.id) + '\n' +
                'Description: ' + (card.description || '') + '\n' +
                'User: "' + userInput + '"\n\n' +
                'Question: Does this card match the user\'s intent? Answer YES or NO.';
            
            var result = await model(prompt, {
                max_new_tokens: 5,
                temperature: 0.1,
                do_sample: false
            });
            
            var answer = '';
            if (result?.[0]?.generated_text) {
                answer = result[0].generated_text.trim().toUpperCase();
            }
            
            if (answer.indexOf('YES') > -1 && answer.indexOf('NO') === -1) {
                return { match: true, score: 0.9, method: 'model' };
            }
            if (answer.indexOf('NO') > -1) {
                return { match: false, score: 0.1, method: 'model' };
            }
        } catch (err) {
            console.warn('[ModelDeck] Card voting failed:', err.message);
        }
        
        return null;
    },
    
    // Generate text using the best available model
    generateText: async function(prompt, maxTokens) {
        var model = this.getModel('text_generation');
        if (!model) return null;
        
        try {
            var result = await model(prompt, {
                max_new_tokens: maxTokens || 150,
                temperature: 0.7,
                do_sample: true
            });
            
            if (result?.[0]?.generated_text) {
                return result[0].generated_text.trim();
            }
        } catch (err) {
            console.warn('[ModelDeck] Text generation failed:', err.message);
        }
        
        return null;
    }
};

modelDeck.init();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = modelDeck;
}
