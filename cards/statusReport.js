// ============================================
// STATUS REPORT CARD — Artemis's default
// ============================================
// Reports current state: cards loaded, session, recent activity
// Fires when no other card votes YES
// ============================================

var statusReport = (function() {
    'use strict';

    var id = 'status_report';
    var name = 'Status Report';
    var icon = '📊';

    async function run(context) {
        try {
            var recentActions = [];
            var recentKey = (typeof PERSISTENCE_CONFIG !== 'undefined' && PERSISTENCE_CONFIG.localKeys)
                ? PERSISTENCE_CONFIG.localKeys.recentActions
                : 'artemis_recent_actions';

            try {
                var stored = localStorage.getItem(recentKey);
                if (stored) {
                    var all = JSON.parse(stored);
                    recentActions = all.slice(-5);
                }
            } catch (e) {}

            var sessionId = context.sessionId || 'unknown';
            var cardCount = (typeof ARTEMIS_CARD_DECK !== 'undefined') ? ARTEMIS_CARD_DECK.length : 0;

            var statusLines = [];
            statusLines.push('Session: ' + sessionId.substring(0, 20) + '...');
            statusLines.push('Cards in quiver: ' + cardCount);

            if (recentActions.length > 0) {
                statusLines.push('Recent hunts:');
                for (var i = recentActions.length - 1; i >= 0; i--) {
                    var action = recentActions[i];
                    var preview = action.input ? action.input.substring(0, 60) : '';
                    if (preview) {
                        statusLines.push('  · "' + preview + '" → ' + (action.cardsPlayed ? action.cardsPlayed.join(', ') : 'no cards'));
                    }
                }
            } else {
                statusLines.push('No hunts yet. The trail is cold.');
            }

            statusLines.push('I hunt: GaiaDB memories, Wikipedia, OpenLibrary, Dictionary, Quotes, and repository files.');

            return {
                success: true,
                data: {
                    memory_context: statusLines.join('\n')
                }
            };

        } catch (err) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    return {
        id: id,
        name: name,
        icon: icon,
        run: run
    };
})();
