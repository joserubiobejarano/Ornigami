// Build-only fixture responses: keep the guarded production build offline.
// These intentionally contain no font URLs, so the browser uses local system fallbacks.
module.exports = Object.freeze({
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&display=swap": "/* latin */\n",
  "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;600&display=swap": "/* latin */\n",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap": "/* latin */\n",
});
