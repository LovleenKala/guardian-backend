let emitter = null;

function setEmit(fn) { emitter = fn; }

function emitToUser(userId, event, payload) {
  if (typeof emitter === 'function') emitter(userId, event, payload);
}

module.exports = { setEmit, emitToUser };
