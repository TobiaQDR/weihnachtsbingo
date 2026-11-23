// Attrappe für firebase-app.js im lokalen Testmodus.
import "./fake-env.js";

export function initializeApp(options = {}) {
  return { name: "[lokal]", options };
}
