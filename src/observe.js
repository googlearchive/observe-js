(function(global) {

  function detectEval() {
    // Don't test for eval if we're running in a Chrome App environment.
    // We check for APIs set that only exist in a Chrome App context.
    if (typeof chrome !== 'undefined' && chrome.app && chrome.app.runtime) {
      return false;
    }

    // Firefox OS Apps do not allow eval. This feature detection is very hacky
    // but even if some other platform adds support for this function this code
    // will continue to work.
    if (global.navigator && navigator.getDeviceStorage) {
      return false;
    }

    try {
      var f = new Function('', 'return true;');
      return f();
    } catch (ex) {
      return false;
    }
  }

  var hasEval = detectEval();

  function isIndex(s) {
    return +s === s >>> 0 && s !== '';
  }

  function toNumber(s) {
    return +s;
  }

  function isObject(obj) {
    return obj === Object(obj);
  }

  var numberIsNaN = global.Number.isNaN || function(value) {
    return typeof value === 'number' && global.isNaN(value);
  }

  function areSameValue(left, right) {
    if (left === right)
      return left !== 0 || 1 / left === 1 / right;
    if (numberIsNaN(left) && numberIsNaN(right))
      return true;

    return left !== left && right !== right;
  }

  var createObject = ('__proto__' in {}) ?
    function(obj) { return obj; } :
    function(obj) {
      var proto = obj.__proto__;
      if (!proto)
        return obj;
      var newObject = Object.create(proto);
      Object.getOwnPropertyNames(obj).forEach(function(name) {
        Object.defineProperty(newObject, name,
                             Object.getOwnPropertyDescriptor(obj, name));
      });
      return newObject;
    };

  var identStart = '[\$_a-zA-Z]';
  var identPart = '[\$_a-zA-Z0-9]';
  var identRegExp = new RegExp('^' + identStart + '+' + identPart + '*' + '$');

  function getPathCharType(char) {
    if (char === undefined)
      return 'eof';

    var code = char.charCodeAt(0);

    switch(code) {
      case 0x5B: // [
      case 0x5D: // ]
      case 0x2E: // .
      case 0x22: // "
      case 0x27: // '
      case 0x30: // 0
        return char;

      case 0x5F: // _
      case 0x24: // $
        return 'ident';

      case 0x20: // Space
      case 0x09: // Tab
      case 0x0A: // Newline
      case 0x0D: // Return
      case 0xA0:  // No-break space
      case 0xFEFF:  // Byte Order Mark
      case 0x2028:  // Line Separator
      case 0x2029:  // Paragraph Separator
        return 'ws';
    }

    // a-z, A-Z
    if ((0x61 <= code && code <= 0x7A) || (0x41 <= code && code <= 0x5A))
      return 'ident';

    // 1-9
    if (0x31 <= code && code <= 0x39)
      return 'number';

    return 'else';
  }

  var pathStateMachine = {
    'beforePath': {
      'ws': ['beforePath'],
      'ident': ['inIdent', 'append'],
      '[': ['beforeElement'],
      'eof': ['afterPath']
    },

    'inPath': {
      'ws': ['inPath'],
      '.': ['beforeIdent'],
      '[': ['beforeElement'],
      'eof': ['afterPath']
    },

    'beforeIdent': {
      'ws': ['beforeIdent'],
      'ident': ['inIdent', 'append']
    },

    'inIdent': {
      'ident': ['inIdent', 'append'],
      '0': ['inIdent', 'append'],
      'number': ['inIdent', 'append'],
      'ws': ['inPath', 'push'],
      '.': ['beforeIdent', 'push'],
      '[': ['beforeElement', 'push'],
      'eof': ['afterPath', 'push']
    },

    'beforeElement': {
      'ws': ['beforeElement'],
      '0': ['afterZero', 'append'],
      'number': ['inIndex', 'append'],
      "'": ['inSingleQuote', 'append', ''],
      '"': ['inDoubleQuote', 'append', '']
    },

    'afterZero': {
      'ws': ['afterElement', 'push'],
      ']': ['inPath', 'push']
    },

    'inIndex': {
      '0': ['inIndex', 'append'],
      'number': ['inIndex', 'append'],
      'ws': ['afterElement'],
      ']': ['inPath', 'push']
    },

    'inSingleQuote': {
      "'": ['afterElement'],
      'eof': ['error'],
      'else': ['inSingleQuote', 'append']
    },

    'inDoubleQuote': {
      '"': ['afterElement'],
      'eof': ['error'],
      'else': ['inDoubleQuote', 'append']
    },

    'afterElement': {
      'ws': ['afterElement'],
      ']': ['inPath', 'push']
    }
  }

  function noop() {}

  function parsePath(path) {
    var keys = [];
    var index = -1;
    var c, newChar, key, type, transition, action, typeMap, mode = 'beforePath';

    var actions = {
      push: function() {
        if (key === undefined)
          return;

        keys.push(key);
        key = undefined;
      },

      append: function() {
        if (key === undefined)
          key = newChar
        else
          key += newChar;
      }
    };

    function maybeUnescapeQuote() {
      if (index >= path.length)
        return;

      var nextChar = path[index + 1];
      if ((mode == 'inSingleQuote' && nextChar == "'") ||
          (mode == 'inDoubleQuote' && nextChar == '"')) {
        index++;
        newChar = nextChar;
        actions.append();
        return true;
      }
    }

    while (mode) {
      index++;
      c = path[index];

      if (c == '\\' && maybeUnescapeQuote(mode))
        continue;

      type = getPathCharType(c);
      typeMap = pathStateMachine[mode];
      transition = typeMap[type] || typeMap['else'] || 'error';

      if (transition == 'error')
        return; // parse error;

      mode = transition[0];
      action = actions[transition[1]] || noop;
      newChar = transition[2] === undefined ? c : transition[2];
      action();

      if (mode === 'afterPath') {
        return keys;
      }
    }

    return; // parse error
  }

  function isIdent(s) {
    return identRegExp.test(s);
  }

  var constructorIsPrivate = {};

  function Path(parts, privateToken) {
    if (privateToken !== constructorIsPrivate)
      throw Error('Use Path.get to retrieve path objects');

    for (var i = 0; i < parts.length; i++) {
      this.push(String(parts[i]));
    }

    if (hasEval && this.length) {
      this.getValueFrom = this.compiledGetValueFromFn();
    }
  }

  // TODO(rafaelw): Make simple LRU cache
  var pathCache = {};

  function getPath(pathString) {
    if (pathString instanceof Path)
      return pathString;

    if (pathString == null || pathString.length == 0)
      pathString = '';

    if (typeof pathString != 'string') {
      if (isIndex(pathString.length)) {
        // Constructed with array-like (pre-parsed) keys
        return new Path(pathString, constructorIsPrivate);
      }

      pathString = String(pathString);
    }

    var path = pathCache[pathString];
    if (path)
      return path;

    var parts = parsePath(pathString);
    if (!parts)
      return invalidPath;

    var path = new Path(parts, constructorIsPrivate);
    pathCache[pathString] = path;
    return path;
  }

  Path.get = getPath;


  function formatAccessor(key) {
    if (isIndex(key)) {
      return '[' + key + ']';
    } else {
      return '["' + key.replace(/"/g, '\\"') + '"]';
    }
  }

  Path.prototype = createObject({
    __proto__: [],
    valid: true,

    toString: function() {
      var pathString = '';
      for (var i = 0; i < this.length; i++) {
        var key = this[i];
        if (isIdent(key)) {
          pathString += i ? '.' + key : key;
        } else {
          pathString += formatAccessor(key);
        }
      }

      return pathString;
    },

    getValueFrom: function(obj, directObserver) {
      for (var i = 0; i < this.length; i++) {
        if (obj == null)
          return;
        obj = obj[this[i]];
      }
      return obj;
    },

    compiledGetValueFromFn: function() {
      var str = 'var unreachable = obj == null;';
      var pathString = 'obj';
      var i = 0;
      var key;
      for (; i < (this.length - 1); i++) {
        key = this[i];
        pathString += isIdent(key) ? '.' + key : formatAccessor(key);
        str += '\nif (!unreachable && ' + pathString + ' == null) unreachable = true;';
        str += '\nif (fn) fn(' + i + ', unreachable ? undefined : ' + pathString + ');';
      }

      var key = this[i];
      pathString += isIdent(key) ? '.' + key : formatAccessor(key);

      str += '\nreturn unreachable ? undefined : ' + pathString + ';';
      return new Function('obj, fn', str);
    },

    setValueFrom: function(obj, value) {
      if (!this.length)
        return false;

      for (var i = 0; i < this.length - 1; i++) {
        if (!isObject(obj))
          return false;
        obj = obj[this[i]];
      }

      if (!isObject(obj))
        return false;

      obj[this[i]] = value;
      return true;
    }
  });

  var invalidPath = new Path('', constructorIsPrivate);
  invalidPath.valid = false;
  invalidPath.getValueFrom = invalidPath.setValueFrom = function() {};

  var lastId = 0;
  var callbackId = Symbol('callbackId');

  function nextId() {
    return ++lastId;
  }

  function getCallbackId(callback) {
    var id = callback[callbackId];
    if (!id) {
      id = nextId();
      callback[callbackId] = id;
    }
    return id;
  }

  function Observed(object, path, callback, receiver, observer) {
    this.object = object;
    this.path = path;
    this.callback = callback;
    this.receiver = receiver;
    this.pathObjects = undefined;
    this.observer = observer;
    this.check(true, true);
  }

  function ObservedValue(object, path, callback, receiver, observer) {
    Observed.call(this, object, path, callback, receiver, observer);
  }

  ObservedValue.prototype = createObject({
    __proto__: Observed.prototype,

    check: function(suppressDelivery, setup) {
      var oldValue = this.value;

      if (setup) {
        this.observer.objectObserve_(this.object);
        if (this.path.length > 1) {
          this.pathObjects = [];
        }
      }

      var self = this;
      var pathObjects = this.pathObjects;
      var observer = this.observer;
      this.value = this.path.getValueFrom(this.object, function(i, obj) {
        if (pathObjects[i] === obj) {
          return;
        }

        pathObjects[i] = obj;
        observer.objectObserve_(obj);
      });

      if (suppressDelivery || areSameValue(this.value, oldValue)) {
        return;
      }

      return {
        object: this.object,
        path: this.path,
        value: this.value,
        oldValue: oldValue
      };
    }
  });

  function ObservedArray(object, path, callback, receiver, observer) {
    Observed.call(this, object, path, callback, receiver, observer);
  }

  ObservedArray.prototype = createObject({
    __proto__: Observed.prototype,

    check: function(suppressDelivery) {
      var oldValue = this.value;
      var value = this.path.getValueFrom(this.object);
      if (!Array.isArray(value)) {
        value = emptyArray;
      }

      if (suppressDelivery) {
        if (!oldValue ||
            value.length !== oldValue.length ||
            sharedPrefix(value, oldValue, value.length) != value.length) {
          this.value = Array.prototype.slice.apply(value);
        }

        return;
      }

      var splices = calculateSplices(value, oldValue);
      if (!splices || !splices.length) {
        return;
      }

      this.value = Array.prototype.slice.apply(value);

      return {
        object: this.object,
        path: this.path,
        splices: splices
      };
    }
  });

  function ObservedObject(object, path, callback, receiver, observer) {
    Observed.call(this, object, path, callback, receiver, observer);
  }

  ObservedObject.prototype = createObject({
    __proto__: Observed.prototype,

    check: function(suppressDelivery) {
      var oldValue = this.value;
      var value = this.path.getValueFrom(this.object);

      if (suppressDelivery) {
        this.value = isObject(value) ? copyObject(value) : emptyObject;
        return;
      }

      var change = diffObjectFromOldObject(value, oldValue, this.object,
                                           this.path);
      if (!change)
        return;

      this.value = isObject(value) ? copyObject(value) : emptyObject;

      return change;
    }
  });

  function Observer() {
    this.observed_ = [];
    this.count_ = 0;
    var self = this;
    this.callback = function(records) {
      self.deliverAll();
    };
  };

  var VALUE_MODE = 1;
  var ARRAY_MODE = 2;
  var OBJECT_MODE = 3;

  var privateAll = {};
  var emptyArray = [];
  var emptyObject = {};

  var N_TUPLE = 6;
  var CALLBACK_OFFSET = 0;
  var RECEIVER_OFFSET = 1;
  var OBJ_OFFSET = 2;
  var PATH_OFFSET = 3;
  var MODE_OFFSET = 4;
  var VALUE_OFFSET = 5;

  Observer.prototype = {
    observe_: function(record) {
      if (typeof record.callback != 'function') {
        throw Error('Callback must be a function');
      }
      this.observed_.push(record);
      this.count_++;
    },

    objectObserve_: function(obj) {
      if (obj == null || typeof obj != 'object') {
        return;
      }

      Object.observe(obj, this.callback);
      var proto = Object.getPrototypeOf(obj);
      while (proto != null) {
        Object.observe(proto, this.callback);
        proto = Object.getPrototypeOf(proto);
      }
    },

    observeValue: function(obj, path, callback, receiver) {
      return this.observe_(new ObservedValue(obj, Path.get(path), callback,
                                             receiver,
                                             this));
    },

    observeArray: function(obj, path, callback, receiver) {
      return this.observe_(new ObservedArray(obj, Path.get(path), callback,
                                             receiver,
                                             this));
    },

    observeObject: function(obj, path, callback, receiver) {
      return this.observe_(new ObservedObject(obj, Path.get(path), callback,
                                              receiver,
                                              this));
    },

    unobserve: function(callback, privateAll_) {
      var all = privateAll_ === privateAll;
      var observed = this.observed_;
      for (var i = 0; i < observed.length; i++) {
        var record = observed[i];
        if (record && (all || record.callback === callback)) {
          observed[i] = null;
          this.count_--;
        }
      }

      if (all) {
        return;
      }

      if (this.count_ < this.observed_.length / 2) {
        if (!this.boundCompact_) {
          var self = this;
          this.boundCompact_ = function() {
            self.compact_();
          }
        }
        Promise.resolve().then(this.boundCompact_);
      }
    },

    compact_: function() {
      if (!this.observed_)
        return;

      var old = this.observed_;
      var observed = this.observed_ = [];
      for (var i = 0; i < old.length; i++) {
        if (old[i] !== null) {
          observed.push(old[i]);
        }
      }

      this.count_ = observed.length;
    },

    deliver: function(callback, privateAll_, suppressDelivery_) {
      var all = privateAll_ === privateAll;
      do {
        var observed = this.observed_;
        for (var i = 0; i < observed.length; i++) {
          var record = observed[i];
          if (record && (all || record.callback === callback)) {
            this.check_(record, suppressDelivery_);
          }
        }
      } while (this.notify_());
    },

    discardChanges: function(callback) {
      this.deliver(callback, undefined, true /* suppressDelivery_ */);
    },

    deliverAll: function() {
      this.deliver(undefined, privateAll);
    },

    dispose: function() {
      this.unobserve(undefined, privateAll);
      this.observed_ = null;
    },

    enqueueChange_: function(record, change) {
      var callback = record.callback;
      var receiver = record.receiver;
      var priority = getCallbackId(callback);

      if (!this.changes_) {
        this.changes_ = {};
        this.changes_[priority] = {
          callback: callback,
          receiver: receiver,
          records: [change]
        };
        return true;
      }

      var observerChanges = this.changes_[priority];
      if (!observerChanges) {
        this.changes_[priority] = {
          callback: callback,
          receiver: receiver,
          records: [change]
        };
        return true;
      }

      observerChanges.records.push(change);
      return true;
    },

    check_: function(record, suppressDelivery_) {
      var change = record.check(suppressDelivery_);
      if (!change) {
        return false;
      }

      return this.enqueueChange_(record, change);
    },

    notify_: function() {
      if (!this.changes_)
        return false;

      var changes = this.changes_;
      this.changes_ = null;
      for (var priority in changes) {
        var observerChanges = changes[priority];
        try {
          var callback = observerChanges.callback;
          var receiver = observerChanges.receiver;
          var records = observerChanges.records;
          callback.call(receiver, records);
        } catch(ex) {
          // TODO(rafaelw): Re-throw at top level.
          if (this.exceptions_)
            this.exceptions_.push(ex);
          else
            this.exceptions_ = [ex];
        }
      }

      return true;
    }
  };

  function newSplice(index, removed, addedCount) {
    return {
      index: index,
      removed: removed,
      addedCount: addedCount
    };
  }

  var EDIT_LEAVE = 0;
  var EDIT_UPDATE = 1;
  var EDIT_ADD = 2;
  var EDIT_DELETE = 3;

  // Note: This function is *based* on the computation of the Levenshtein
  // "edit" distance. The one change is that "updates" are treated as two
  // edits - not one. With Array splices, an update is really a delete
  // followed by an add. By retaining this, we optimize for "keeping" the
  // maximum array items in the original array. For example:
  //
  //   'xxxx123' -> '123yyyy'
  //
  // With 1-edit updates, the shortest path would be just to update all seven
  // characters. With 2-edit updates, we delete 4, leave 3, and add 4. This
  // leaves the substring '123' intact.
  function calcEditDistances(current, currentStart, currentEnd,
                              old, oldStart, oldEnd) {
    // "Deletion" columns
    var rowCount = oldEnd - oldStart + 1;
    var columnCount = currentEnd - currentStart + 1;
    var distances = new Array(rowCount);

    // "Addition" rows. Initialize null column.
    for (var i = 0; i < rowCount; i++) {
      distances[i] = new Array(columnCount);
      distances[i][0] = i;
    }

    // Initialize null row
    for (var j = 0; j < columnCount; j++)
      distances[0][j] = j;

    for (var i = 1; i < rowCount; i++) {
      for (var j = 1; j < columnCount; j++) {
        if (equals(current[currentStart + j - 1], old[oldStart + i - 1]))
          distances[i][j] = distances[i - 1][j - 1];
        else {
          var north = distances[i - 1][j] + 1;
          var west = distances[i][j - 1] + 1;
          distances[i][j] = north < west ? north : west;
        }
      }
    }

    return distances;
  }

  // This starts at the final weight, and walks "backward" by finding
  // the minimum previous weight recursively until the origin of the weight
  // matrix.
  function spliceOperationsFromEditDistances(distances) {
    var i = distances.length - 1;
    var j = distances[0].length - 1;
    var current = distances[i][j];
    var edits = [];
    while (i > 0 || j > 0) {
      if (i == 0) {
        edits.push(EDIT_ADD);
        j--;
        continue;
      }
      if (j == 0) {
        edits.push(EDIT_DELETE);
        i--;
        continue;
      }
      var northWest = distances[i - 1][j - 1];
      var west = distances[i - 1][j];
      var north = distances[i][j - 1];

      var min;
      if (west < north)
        min = west < northWest ? west : northWest;
      else
        min = north < northWest ? north : northWest;

      if (min == northWest) {
        if (northWest == current) {
          edits.push(EDIT_LEAVE);
        } else {
          edits.push(EDIT_UPDATE);
          current = northWest;
        }
        i--;
        j--;
      } else if (min == west) {
        edits.push(EDIT_DELETE);
        i--;
        current = west;
      } else {
        edits.push(EDIT_ADD);
        j--;
        current = north;
      }
    }

    edits.reverse();
    return edits;
  }

  /**
   * Splice Projection functions:
   *
   * A splice map is a representation of how a previous array of items
   * was transformed into a new array of items. Conceptually it is a list of
   * tuples of
   *
   *   <index, removed, addedCount>
   *
   * which are kept in ascending index order of. The tuple represents that at
   * the |index|, |removed| sequence of items were removed, and counting forward
   * from |index|, |addedCount| items were added.
   */

  /**
   * Lacking individual splice mutation information, the minimal set of
   * splices can be synthesized given the previous state and final state of an
   * array. The basic approach is to calculate the edit distance matrix and
   * choose the shortest path through it.
   *
   * Complexity: O(l * p)
   *   l: The length of the current array
   *   p: The length of the old array
   */
  function calcSplices(current, currentStart, currentEnd,
                        old, oldStart, oldEnd) {
    var prefixCount = 0;
    var suffixCount = 0;

    var minLength = Math.min(currentEnd - currentStart, oldEnd - oldStart);
    if (currentStart == 0 && oldStart == 0)
      prefixCount = sharedPrefix(current, old, minLength);

    if (currentEnd == current.length && oldEnd == old.length)
      suffixCount = sharedSuffix(current, old, minLength - prefixCount);

    currentStart += prefixCount;
    oldStart += prefixCount;
    currentEnd -= suffixCount;
    oldEnd -= suffixCount;

    if (currentEnd - currentStart == 0 && oldEnd - oldStart == 0)
      return [];

    if (currentStart == currentEnd) {
      var splice = newSplice(currentStart, [], 0);
      while (oldStart < oldEnd)
        splice.removed.push(old[oldStart++]);

      return [ splice ];
    } else if (oldStart == oldEnd)
      return [ newSplice(currentStart, [], currentEnd - currentStart) ];

    var ops = spliceOperationsFromEditDistances(
        calcEditDistances(current, currentStart, currentEnd,
                               old, oldStart, oldEnd));

    var splice = undefined;
    var splices = [];
    var index = currentStart;
    var oldIndex = oldStart;
    for (var i = 0; i < ops.length; i++) {
      switch(ops[i]) {
        case EDIT_LEAVE:
          if (splice) {
            splices.push(splice);
            splice = undefined;
          }

          index++;
          oldIndex++;
          break;
        case EDIT_UPDATE:
          if (!splice)
            splice = newSplice(index, [], 0);

          splice.addedCount++;
          index++;

          splice.removed.push(old[oldIndex]);
          oldIndex++;
          break;
        case EDIT_ADD:
          if (!splice)
            splice = newSplice(index, [], 0);

          splice.addedCount++;
          index++;
          break;
        case EDIT_DELETE:
          if (!splice)
            splice = newSplice(index, [], 0);

          splice.removed.push(old[oldIndex]);
          oldIndex++;
          break;
      }
    }

    if (splice) {
      splices.push(splice);
    }
    return splices;
  }

  function sharedPrefix(current, old, searchLength) {
    for (var i = 0; i < searchLength; i++)
      if (!equals(current[i], old[i]))
        return i;
    return searchLength;
  }

  function sharedSuffix(current, old, searchLength) {
    var index1 = current.length;
    var index2 = old.length;
    var count = 0;
    while (count < searchLength && equals(current[--index1], old[--index2]))
      count++;

    return count;
  }

  function calculateSplices(current, previous) {
    return calcSplices(current, 0, current.length, previous, 0,
                            previous.length);
  }

  function equals(currentValue, previousValue) {
    return currentValue === previousValue;
  }

  function applySplices(previous, current, splices) {
    splices.forEach(function(splice) {
      var spliceArgs = [splice.index, splice.removed.length];
      var addIndex = splice.index;
      while (addIndex < splice.index + splice.addedCount) {
        spliceArgs.push(current[addIndex]);
        addIndex++;
      }

      Array.prototype.splice.apply(previous, spliceArgs);
    });
  }

  function copyObject(object) {
    var copy = Array.isArray(object) ? [] : {};
    for (var prop in object) {
      copy[prop] = object[prop];
    };
    if (Array.isArray(object))
      copy.length = object.length;
    return copy;
  }

  function diffObjectFromOldObject(object, oldObject, root, path) {
    var record;
    function getRecord() {
      if (!record) {
        record = {
          object: root,
          path: path,
          added: {},
          removed: {},
          changed: {},
          getOldValue: function(prop) {
            return oldObject[prop];
          }
        }
      }
      return record;
    }

    if (!isObject(object)) {
      if (!isObject(oldObject))
        return;
      record = getRecord();
      record.added = oldObject;
      return record;
    }

    if (!isObject(oldObject)) {
      record = getRecord();
      record.removed = object;
      return record;
    }

    for (var prop in oldObject) {
      var newValue = object[prop];

      if (newValue !== undefined && newValue === oldObject[prop])
        continue;

      if (!(prop in object)) {
        getRecord().removed[prop] = undefined;
        continue;
      }

      if (newValue !== oldObject[prop])
        getRecord().changed[prop] = newValue;
    }

    for (var prop in object) {
      if (prop in oldObject)
        continue;

      getRecord().added[prop] = object[prop];
    }

    if (Array.isArray(object) && object.length !== oldObject.length) {
      getRecord().changed.length = object.length;
    }

    return record;
  }

  global.Observer = Observer;
  global.Path = Path;
  global.Observer.applySplices = applySplices;

})(this);
