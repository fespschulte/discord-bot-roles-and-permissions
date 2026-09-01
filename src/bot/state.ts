// The HTTP server starts accepting requests before the gateway connects. This flag lets the
// webhook refuse deliveries it could not act on, rather than persisting them and dropping
// the role change.
let ready = false;

export function markBotReady() {
  ready = true;
}

export function isBotReady() {
  return ready;
}
