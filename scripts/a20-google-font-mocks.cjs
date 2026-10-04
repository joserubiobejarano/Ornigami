// Build-only fixture responses: keep the guarded production build offline.
// These intentionally contain no font URLs, so the browser uses local system fallbacks.
module.exports = Object.freeze({
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&display=swap": "@font-face { font-family: 'Bricolage Grotesque'; src: local('Arial'); font-style: normal; font-weight: 700 800; }",
  "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;600&display=swap": "@font-face { font-family: 'Geist Mono'; src: local('Consolas'); font-style: normal; font-weight: 400 600; }",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap": "@font-face { font-family: 'Inter'; src: local('Arial'); font-style: normal; font-weight: 400 600; }",
});
