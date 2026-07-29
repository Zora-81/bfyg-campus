(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MessageThread = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function parentKey(message) {
    if (!message || message.parent_id === null || message.parent_id === undefined) return '';
    return String(message.parent_id);
  }

  function isThreadMessage(message) {
    return parentKey(message) !== '';
  }

  function findPendingIndex(messages, incoming) {
    var list = Array.isArray(messages) ? messages : [];
    var incomingParent = parentKey(incoming);
    for (var i = 0; i < list.length; i++) {
      var candidate = list[i];
      if (candidate && candidate.isPending &&
          candidate.author_id === incoming.author_id &&
          candidate.content === incoming.content &&
          parentKey(candidate) === incomingParent) {
        return i;
      }
    }
    return -1;
  }

  function mergeMessages(first, second) {
    var combined = (Array.isArray(first) ? first : []).concat(Array.isArray(second) ? second : []);
    var merged = [];
    var indexById = Object.create(null);
    combined.forEach(function (message) {
      if (!message) return;
      var id = message.id === null || message.id === undefined ? '' : String(message.id);
      if (!id) {
        merged.push(message);
        return;
      }
      if (indexById[id] !== undefined) {
        merged[indexById[id]] = Object.assign({}, merged[indexById[id]], message);
      } else {
        indexById[id] = merged.length;
        merged.push(message);
      }
    });
    return merged.sort(function (a, b) {
      var at = Date.parse(a && a.created_at ? a.created_at : '') || 0;
      var bt = Date.parse(b && b.created_at ? b.created_at : '') || 0;
      return at - bt;
    });
  }

  function countThreadReplies(messages, rootId) {
    var list = Array.isArray(messages) ? messages : [];
    var queue = [String(rootId)];
    var seenParents = Object.create(null);
    var seenMessages = Object.create(null);
    var count = 0;

    while (queue.length) {
      var parentId = queue.shift();
      if (seenParents[parentId]) continue;
      seenParents[parentId] = true;
      list.forEach(function (message) {
        if (!message || parentKey(message) !== parentId) return;
        var id = message.id === null || message.id === undefined ? '' : String(message.id);
        if (!id || seenMessages[id]) return;
        seenMessages[id] = true;
        count++;
        queue.push(id);
      });
    }
    return count;
  }

  return {
    isThreadMessage: isThreadMessage,
    findPendingIndex: findPendingIndex,
    mergeMessages: mergeMessages,
    countThreadReplies: countThreadReplies
  };
});
