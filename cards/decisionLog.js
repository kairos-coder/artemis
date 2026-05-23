// ============================================
// DECISION LOG CARD — Artemis Learning Engine
// ============================================
// Auto-triggers after every routing event.
// Logs: what was asked, which cards were voted,
// which were executed, what outputs were produced,
// and implicit approval signals.
// This is how Artemis accumulates knowledge.
// ============================================

const decisionLog = {
    id: 'decision_log',
    
    async run(context) {
        const { input, votedCards, executedCards, outputs, sessionId, supabase } = context;
        
        // Build the decision record
        const decisionRecord = {
            session_id: sessionId,
            input_text: input,
            input_length: input.length,
            cards_voted: votedCards.map(c => c.id),
            vote_scores: votedCards.map(c => ({ id: c.id, score: c.score })),
            cards_executed: executedCards.map(c => c.id),
            output_types: Object.keys(outputs),
            has_image: !!outputs.image_url,
            has_text: !!outputs.text_output,
            has_memory: !!outputs.memory_context,
            timestamp: new Date().toISOString()
        };
        
        // Persist to Supabase
        let dbResult = null;
        if (supabase) {
            try {
                const decisionsTable = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.tables)
                    ? SUPABASE_CONFIG.tables.artemisDecisions
                    : 'artemis_decisions';
                
                const { data, error } = await supabase
                    .from(decisionsTable)
                    .insert(decisionRecord)
                    .select();
                
                if (error) {
                    console.warn('[DecisionLog] Supabase write failed:', error.message);
                    dbResult = { success: false, error: error.message };
                } else {
                    dbResult = { success: true, id: data[0]?.id };
                    console.log('[DecisionLog] Logged decision #' + data[0]?.id);
                }
            } catch (err) {
                console.warn('[DecisionLog] Supabase exception:', err.message);
                dbResult = { success: false, error: err.message };
            }
        }
        
        // Persist to localStorage (always works, even offline)
        try {
            const key = 'artemis_decision_history';
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.push(decisionRecord);
            
            const maxLocal = 100;
            if (existing.length > maxLocal) {
                existing.splice(0, existing.length - maxLocal);
            }
            
            localStorage.setItem(key, JSON.stringify(existing));
            console.log('[DecisionLog] Local log updated (' + existing.length + ' entries)');
        } catch (err) {
            console.warn('[DecisionLog] localStorage write failed:', err.message);
        }
        
        // Update card weights based on this decision
        this._updateWeights(executedCards, outputs, supabase);
        
        return {
            success: true,
            data: {
                logged: true,
                db_stored: dbResult?.success || false,
                local_stored: true,
                record: decisionRecord
            }
        };
    },
    
    _updateWeights(executedCards, outputs, supabase) {
        try {
            const weightsKey = 'artemis_card_weights';
            const weights = JSON.parse(localStorage.getItem(weightsKey) || '{}');
            const weightsTable = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.tables)
                ? SUPABASE_CONFIG.tables.artemisWeights
                : 'artemis_card_weights';

            executedCards.forEach(card => {
                if (!weights[card.id]) {
                    weights[card.id] = {
                        weight: card.card ? (card.card.defaultWeight || 0.5) : 0.5,
                        plays: 0,
                        successes: 0,
                        lastAdjusted: new Date().toISOString()
                    };
                }

                weights[card.id].plays += 1;

                const produced = this._cardProducedOutput(card.id, outputs);
                if (produced) {
                    weights[card.id].successes += 1;
                    weights[card.id].weight = Math.min(0.95, weights[card.id].weight + 0.01);
                }

                weights[card.id].lastAdjusted = new Date().toISOString();

                // Persist to Supabase weights table (fire and forget — don't block)
                if (supabase) {
                    supabase
                        .from(weightsTable)
                        .upsert({
                            card_id: card.id,
                            card_name: card.name || card.id,
                            weight: weights[card.id].weight,
                            plays: weights[card.id].plays,
                            successes: weights[card.id].successes,
                            success_rate: weights[card.id].successes / Math.max(weights[card.id].plays, 1),
                            last_adjusted: new Date().toISOString()
                        }, { onConflict: 'card_id' })
                        .then(({ error }) => {
                            if (error) console.warn('[DecisionLog] Weight DB upsert failed:', error.message);
                        })
                        .catch(err => {
                            console.warn('[DecisionLog] Weight DB upsert error:', err.message);
                        });
                }
            });

            localStorage.setItem(weightsKey, JSON.stringify(weights));
        } catch (err) {
            console.warn('[DecisionLog] Weight update failed:', err.message);
        }
    },
    
    _cardProducedOutput(cardId, outputs) {
        const checks = {
            'gaia_recall': () => outputs.memory_context && outputs.memory_context.length > 0,
            'pollinations_text': () => outputs.text_output && outputs.text_output.length > 10,
            'pollinations_image': () => !!outputs.image_url,
            'browser_hunt': () => outputs.web_context && outputs.web_context.length > 0,
            'compress': () => outputs.compressed_memory || outputs.pattern_update
        };
        
        return checks[cardId] ? checks[cardId]() : false;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = decisionLog;
}
