var browserHunt = {
    id: 'browser_hunt',
    icon: '🏹',
    description: 'Hunt through kairos-coder repos — reads HTML, JS, CSS, MD, and JSON files',
    
    // Known repos to hunt through
    _repos: [
        'apollo', 'athena', 'artemis', 'zeus', 'hera', 'hermes',
        'poseidon', 'demeter', 'persephone', 'hephaestus', 'aphrodite', 'ares',
        'gaia', 'ealdenmot', 'ealdforn-studios', 'kairos-coder.github.io'
    ],
    
    // File types to check (in priority order)
    _fileTypes: ['index.html', 'chat.html', 'terminal.html', 'agent.js', 'config.js', 'README.md'],
    
    // Cache to avoid re-fetching
    _cache: {},
    _cacheTimeout: 300000, // 5 minutes
    
    run: async function(context) {
        var input = context.input || '';
        var pattern = this._extractHuntPattern(input);
        
        if (!pattern || pattern.length < 2) {
            return {
                success: true,
                data: {
                    text_output: 'No hunt pattern found. Try: "hunt for Apollo in the repos" or "find chat.html across all projects"'
                }
            };
        }
        
        console.log('[BrowserHunt] Hunting for: "' + pattern + '"');
        
        var results = [];
        var totalFilesChecked = 0;
        
        for (var r = 0; r < this._repos.length; r++) {
            var repo = this._repos[r];
            
            for (var f = 0; f < this._fileTypes.length; f++) {
                var file = this._fileTypes[f];
                var cacheKey = repo + '/' + file;
                
                // Check cache first
                if (this._cache[cacheKey] && (Date.now() - this._cache[cacheKey].timestamp) < this._cacheTimeout) {
                    var cachedContent = this._cache[cacheKey].content;
                    if (cachedContent && cachedContent.toLowerCase().indexOf(pattern.toLowerCase()) > -1) {
                        results.push({
                            repo: repo,
                            file: file,
                            url: 'https://github.com/kairos-coder/' + repo + '/blob/main/' + file,
                            rawUrl: 'https://raw.githubusercontent.com/kairos-coder/' + repo + '/main/' + file,
                            matchType: 'content',
                            cached: true
                        });
                    }
                    totalFilesChecked++;
                    continue;
                }
                
                // Fetch from GitHub raw
                try {
                    var rawUrl = 'https://raw.githubusercontent.com/kairos-coder/' + repo + '/main/' + file;
                    
                    var controller = new AbortController();
                    var timeout = setTimeout(function() { controller.abort(); }, 3000);
                    
                    var response = await fetch(rawUrl, { 
                        signal: controller.signal,
                        headers: { 'Accept': 'text/plain, text/html, application/javascript, text/css, application/json' }
                    });
                    
                    clearTimeout(timeout);
                    
                    totalFilesChecked++;
                    
                    if (response.ok) {
                        var content = await response.text();
                        
                        // Cache the content
                        this._cache[cacheKey] = {
                            content: content,
                            timestamp: Date.now()
                        };
                        
                        // Check for pattern match
                        if (content.toLowerCase().indexOf(pattern.toLowerCase()) > -1) {
                            // For HTML files, try to extract a relevant snippet
                            var snippet = this._extractSnippet(content, pattern);
                            
                            results.push({
                                repo: repo,
                                file: file,
                                url: 'https://github.com/kairos-coder/' + repo + '/blob/main/' + file,
                                rawUrl: rawUrl,
                                matchType: 'content',
                                snippet: snippet,
                                cached: false
                            });
                        }
                    }
                } catch (err) {
                    // Repo or file doesn't exist, or network error — skip silently
                    if (err.name !== 'AbortError') {
                        // Only log non-timeout errors occasionally to avoid spam
                    }
                }
            }
        }
        
        // Build response
        var textOutput = '';
        
        if (results.length === 0) {
            textOutput = 'Hunt complete. Checked ' + totalFilesChecked + ' files across ' + this._repos.length + ' repos. Pattern "' + pattern + '" not found.';
        } else {
            textOutput = 'Hunt complete. Found "' + pattern + '" in ' + results.length + ' file(s) across ' + totalFilesChecked + ' checked:\n\n';
            
            for (var i = 0; i < results.length; i++) {
                var r = results[i];
                textOutput += (i + 1) + '. ' + r.repo + '/' + r.file + (r.cached ? ' (cached)' : '') + '\n';
                if (r.snippet) {
                    textOutput += '   "' + r.snippet + '"\n';
                }
                textOutput += '   ' + r.rawUrl + '\n\n';
            }
        }
        
        console.log('[BrowserHunt] ' + results.length + ' matches in ' + totalFilesChecked + ' files');
        
        return {
            success: true,
            data: {
                text_output: textOutput,
                hunt_results: results,
                pattern: pattern,
                files_checked: totalFilesChecked,
                repos_searched: this._repos.length
            }
        };
    },
    
    _extractHuntPattern: function(input) {
        var cleaned = input
            .replace(/hunt|search|find|look for|track|locate|browser hunt/gi, '')
            .replace(/for |in |across |the |my |all /gi, '')
            .replace(/repos|repositories|code|files|html|projects/gi, '')
            .trim();
        
        // If user says "hunt for Apollo" — the pattern is "Apollo"
        // If user says "find chat.html" — the pattern is "chat.html"
        // If user says "search for Supabase" — the pattern is "Supabase"
        
        if (!cleaned || cleaned.length < 2) {
            cleaned = input.trim();
        }
        
        // Extract meaningful keywords
        var words = cleaned.split(/\s+/).filter(function(w) { 
            return w.length > 1 && 
                   w !== 'the' && w !== 'for' && w !== 'in' && w !== 'across';
        });
        
        return words.slice(0, 4).join(' ');
    },
    
    _extractSnippet: function(content, pattern) {
        var lower = content.toLowerCase();
        var idx = lower.indexOf(pattern.toLowerCase());
        
        if (idx === -1) return null;
        
        // Get surrounding context — 40 chars before and after
        var start = Math.max(0, idx - 40);
        var end = Math.min(content.length, idx + pattern.length + 40);
        
        var snippet = content.substring(start, end).replace(/\s+/g, ' ').trim();
        
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';
        
        return snippet;
    },
    
    // Public API — allow other cards to use the hunt
    huntFile: async function(repo, file) {
        var rawUrl = 'https://raw.githubusercontent.com/kairos-coder/' + repo + '/main/' + file;
        
        try {
            var response = await fetch(rawUrl);
            if (response.ok) {
                return await response.text();
            }
        } catch (err) {
            console.warn('[BrowserHunt] Direct fetch failed: ' + repo + '/' + file);
        }
        return null;
    },
    
    // Clear the cache
    clearCache: function() {
        this._cache = {};
        console.log('[BrowserHunt] Cache cleared');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = browserHunt;
}
