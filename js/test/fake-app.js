// Attrappe für firebase-app.js im lokalen Testmodus.
import "./fake-env.js";

export function initializeApp(options = {}, name = "[DEFAULT]") {
  return { name, options };
}
