// ============================================
// API HUNT CARD — Free API retrieval
// ============================================
// Hunts API_REGISTRY for matching APIs
// Routes queries to Wikipedia, OpenLibrary, Dictionary, Quotes
// Returns structured data for the response builder
// ============================================

var apiHunt = (function() {
    'use strict';

    var id = 'api_hunt';
    var name = 'API Hunt';
    var icon = '🏹';

    // API category routing keywords
    var categoryRouting = {
        knowledge: ['what is', 'who is', 'tell me about', 'explain', 'information about', 'wiki', 'wikipedia', 'encyclopedia'],
        definitions: ['define', 'definition', 'meaning of', 'what does', 'dictionary', 'means'],
        books: ['book', 'author', 'novel', 'published', 'library', 'title', 'openlibrary'],
        quotes: ['quote', 'saying', 'famous', 'wisdom', 'quotable'],
        weather: ['weather', 'temperature', 'forecast', 'climate', 'rain', 'sunny', 'storm']
    };

    async function run(context) {
        var input = context.input || '';
        var inputLower = input.toLowerCase();
        var results = {};
        var errors = [];

        // Determine which APIs to hit
        var targets = routeToAPIs(inputLower);

        console.log('[apiHunt] Hunting: ' + targets.join(', '));

        for (var i = 0; i < targets.length; i++) {
            try {
                var apiResult = await huntAPI(targets[i], input);
                if (apiResult && apiResult.data) {
                    results[targets[i]] = apiResult.data;
                } else if (apiResult && apiResult.error) {
                    errors.push(targets[i] + ': ' + apiResult.error);
                }
            } catch (err) {
                errors.push(targets[i] + ': ' + err.message);
                console.warn('[apiHunt] ' + targets[i] + ' failed: ' + err.message);
            }
        }

        if (Object.keys(results).length > 0) {
            return {
                success: true,
                data: { api_results: results }
            };
        }

        return {
            success: false,
            error: errors.length > 0 ? errors.join('; ') : 'No matching APIs found'
        };
    }

    function routeToAPIs(inputLower) {
        var targets = [];

        for (var api in categoryRouting) {
            var keywords = categoryRouting[api];
            for (var k = 0; k < keywords.length; k++) {
                if (inputLower.indexOf(keywords[k]) > -1) {
                    if (targets.indexOf(api) === -1) {
                        targets.push(api);
                    }
                    break;
                }
            }
        }

        // Default: try knowledge (Wikipedia)
        if (targets.length === 0) {
            targets.push('knowledge');
        }

        return targets;
    }

    async function huntAPI(category, query) {
        var cleanQuery = extractSearchTerm(query, category);

        switch (category) {
            case 'knowledge':
                return await huntWikipedia(cleanQuery);
            case 'definitions':
                return await huntDictionary(cleanQuery);
            case 'books':
                return await huntOpenLibrary(cleanQuery);
            case 'quotes':
                return await huntQuotable(cleanQuery);
            case 'weather':
                return { success: false, error: 'Weather requires location data — not yet implemented' };
            default:
                return { success: false, error: 'Unknown API category: ' + category };
        }
    }

    function extractSearchTerm(query, category) {
        var lower = query.toLowerCase();

        // Strip common prefixes
        var prefixes = [
            'what is', 'who is', 'tell me about', 'define', 'definition of',
            'search for', 'find', 'look up', 'hunt for', 'information about',
            'meaning of', 'what does', 'explain'
        ];

        var term = lower;
        for (var i = 0; i < prefixes.length; i++) {
            if (term.indexOf(prefixes[i]) === 0) {
                term = term.substring(prefixes[i].length).trim();
                break;
            }
        }

        // Remove question marks, extra spaces
        term = term.replace(/[?]/g, '').trim();

        // For Wikipedia: capitalize words for better summary matching
        if (category === 'knowledge') {
            term = term.split(' ').map(function(w) {
                return w.charAt(0).toUpperCase() + w.slice(1);
            }).join(' ');
        }

        return term || query.trim();
    }

    // ── WIKIPEDIA ──
    async function huntWikipedia(query) {
        try {
            var response = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query));
            if (!response.ok) {
                if (response.status === 404) {
                    // Try search
                    var searchResp = await fetch('https://en.wikipedia.org/w/api.php?action=opensearch&search=' + encodeURIComponent(query) + '&limit=3&format=json&origin=*');
                    if (searchResp.ok) {
                        var searchData = await searchResp.json();
                        if (searchData[1] && searchData[1].length > 0) {
                            return {
                                success: true,
                                data: 'Wikipedia found: ' + searchData[1].join(', ') + '. ' + (searchData[2][0] || '')
                            };
                        }
                    }
                    return { success: false, error: 'No Wikipedia article for "' + query + '"' };
                }
                return { success: false, error: 'Wikipedia HTTP ' + response.status };
            }
            var data = await response.json();
            return {
                success: true,
                data: (data.title || query) + ': ' + (data.extract || data.description || 'No summary available').substring(0, 600)
            };
        } catch (err) {
            return { success: false, error: 'Wikipedia fetch failed: ' + err.message };
        }
    }

    // ── FREE DICTIONARY ──
    async function huntDictionary(query) {
        try {
            var response = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(query.toLowerCase()));
            if (!response.ok) {
                return { success: false, error: 'No definition for "' + query + '"' };
            }
            var data = await response.json();
            if (data && data[0] && data[0].meanings && data[0].meanings[0]) {
                var meaning = data[0].meanings[0];
                var defText = query + ': ' + meaning.definitions[0].definition;
                if (meaning.definitions[0].example) {
                    defText += ' (e.g. "' + meaning.definitions[0].example + '")';
                }
                return { success: true, data: defText };
            }
            return { success: false, error: 'No definition data' };
        } catch (err) {
            return { success: false, error: 'Dictionary fetch failed: ' + err.message };
        }
    }

    // ── OPENLIBRARY ──
    async function huntOpenLibrary(query) {
        try {
            var response = await fetch('https://openlibrary.org/search.json?q=' + encodeURIComponent(query) + '&limit=3');
            if (!response.ok) {
                return { success: false, error: 'OpenLibrary HTTP ' + response.status };
            }
            var data = await response.json();
            if (data.docs && data.docs.length > 0) {
                var book = data.docs[0];
                var bookText = '"' + (book.title || 'Unknown') + '"';
                if (book.author_name && book.author_name.length > 0) {
                    bookText += ' by ' + book.author_name[0];
                }
                if (book.first_publish_year) {
                    bookText += ' (' + book.first_publish_year + ')';
                }
                return { success: true, data: bookText + '. Found ' + data.numFound + ' results.' };
            }
            return { success: false, error: 'No books found for "' + query + '"' };
        } catch (err) {
            return { success: false, error: 'OpenLibrary fetch failed: ' + err.message };
        }
    }

    // ── QUOTABLE ──
    async function huntQuotable(query) {
        try {
            var response = await fetch('https://api.quotable.io/search/quotes?query=' + encodeURIComponent(query) + '&limit=2');
            if (!response.ok) {
                return { success: false, error: 'Quotable HTTP ' + response.status };
            }
            var data = await response.json();
            if (data.results && data.results.length > 0) {
                var quote = data.results[0];
                var quoteText = '"' + quote.content + '" — ' + quote.author;
                return { success: true, data: quoteText };
            }
            return { success: false, error: 'No quotes matching "' + query + '"' };
        } catch (err) {
            return { success: false, error: 'Quotable fetch failed: ' + err.message };
        }
    }

    return {
        id: id,
        name: name,
        icon: icon,
        run: run
    };
})();
