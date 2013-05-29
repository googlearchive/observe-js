// Copyright 2012 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

(function(global) {
  'use strict';

  var hasObserve = typeof Object.observe == 'function';

  var hasEval = false;
  try {
    var f = new Function('', 'return true;');
    hasEval = f();
  } catch (ex) {
  }

  function isIndex(s) {
    return +s === s >>> 0;
  }

  function toNumber(s) {
    return +s;
  }

  function isObject(obj) {
    return obj === Object(obj);
  }

  var numberIsNaN = global.Number.isNaN || function isNaN(value) {
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

  var pathIndentPart = '[\$a-z0-9_]+[\$a-z0-9_\\d]*';
  var pathRegExp = new RegExp('^' +
                              '(?:#?' + pathIndentPart + ')?' +
                              '(?:' +
                                '(?:\\.' + pathIndentPart + ')' +
                              ')*' +
                              '$', 'i');

  function isPathValid(s) {
    if (typeof s != 'string')
      return false;
    s = s.replace(/\s/g, '');

    if (s == '')
      return true;

    if (s[0] == '.')
      return false;

    return pathRegExp.test(s);
  }

  function Path(s) {
    if (s.trim() == '')
      return this;

    if (isIndex(s)) {
      this.push(String(s));
      return this;
    }

    s.split(/\./).filter(function(part) {
      return part;
    }).forEach(function(part) {
      this.push(part);
    }, this);
  }

  Path.prototype = createObject({
    __proto__: [],

    toString: function() {
      return this.join('.');
    },

    walkPropertiesFrom: function(val, f, that) {
      var caughtException;
      var prop;
      for (var i = 0; i < this.length + 1; i++) {
        prop = this[i];
        f.call(that, prop, val, i);

        if (i == this.length || val === null || val === undefined)
          val = undefined;
        else
          val = val[prop];
      }
    }
  });

  var MAX_DIRTY_CHECK_CYCLES = 1000;

  function dirtyCheck(observer) {
    var cycles = 0;
    while (cycles < MAX_DIRTY_CHECK_CYCLES && observer.check()) {
      observer.report();
      cycles++;
    }
  }

  function objectIsEmpty(object) {
    for (var prop in object)
      return false;
    return true;
  }

  function diffIsEmpty(diff) {
    return objectIsEmpty(diff.added) &&
           objectIsEmpty(diff.removed) &&
           objectIsEmpty(diff.changed);
  }

  function diffObjectFromOldObject(object, oldObject) {
    var added = {};
    var removed = {};
    var changed = {};
    var oldObjectHas = {};

    for (var prop in oldObject) {
      var newValue = object[prop];

      if (newValue !== undefined && newValue === oldObject[prop])
        continue;

      if (!(prop in object)) {
        removed[prop] = undefined;
        continue;
      }

      if (newValue !== oldObject[prop])
        changed[prop] = newValue;
    }

    for (var prop in object) {
      if (prop in oldObject)
        continue;

      added[prop] = object[prop];
    }

    if (Array.isArray(object) && object.length !== oldObject.length)
      changed.length = object.length;

    return {
      added: added,
      removed: removed,
      changed: changed
    };
  }

  function copyObject(object, opt_copy) {
    var copy = opt_copy || (Array.isArray(object) ? [] : {});
    for (var prop in object) {
      copy[prop] = object[prop];
    };
    if (Array.isArray(object))
      copy.length = object.length;
    return copy;
  }

  function Observer(callback) {
    this.callback = callback;
    this.reporting = true;
    if (hasObserve)
      this.boundInternalCallback = this.internalCallback.bind(this);

    this.valid = true;
    addToAll(this);
    this.connect();
    this.sync(true);
  }

  Observer.prototype = {
    valid: false,

    internalCallback: function(records) {
      if (!this.valid)
        return;
      if (this.reporting && this.check(records)) {
        this.report();
        if (this.testingResults)
          this.testingResults.anyChanged = true;
      }
    },

    close: function() {
      if (!this.valid)
        return;
      this.disconnect();
      this.valid = false;
      removeFromAll(this);
    },

    deliver: function(testingResults) {
      if (!this.valid)
        return;
      if (hasObserve) {
        this.testingResults = testingResults;
        Object.deliverChangeRecords(this.boundInternalCallback);
        this.testingResults = undefined;
      } else {
        dirtyCheck(this);
      }
    },

    report: function() {
      if (!this.reporting)
        return;

      this.sync(false);

      try {
        this.callback.apply(undefined, this.reportArgs);
      } catch (ex) {
        Observer._errorThrownDuringCallback = true;
        console.error('Exception caught during observer callback: ' + ex);
      }

      this.reportArgs = undefined;
    },

    reset: function() {
      if (!this.valid)
        return;

      if (hasObserve) {
        this.reporting = false;
        Object.deliverChangeRecords(this.boundInternalCallback);
        this.reporting = true;
      }

      this.sync(true);
    }
  }

  var collectObservers = !hasObserve || global.forceCollectObservers;
  var allObservers;
  if (collectObservers) {
    allObservers = [];
    Observer._allObserversCount = 0;
  }

  function addToAll(observer) {
    if (!collectObservers)
      return;

    allObservers.push(observer);
    Observer._allObserversCount++;
  }

  function removeFromAll(observer) {
    if (!collectObservers)
      return;

    for (var i = 0; i < allObservers.length; i++) {
      if (allObservers[i] === observer) {
        allObservers[i] = undefined;
        Observer._allObserversCount--;
        break;
      }
    }
  }

  var runningMicrotaskCheckpoint = false;

  global.Platform = global.Platform || {};
  global.Platform.performMicrotaskCheckpoint = function() {
    if (!collectObservers || runningMicrotaskCheckpoint)
      return;

    runningMicrotaskCheckpoint = true;

    var cycles = 0;
    var results = {};

    do {
      cycles++;
      var toCheck = allObservers;
      allObservers = [];
      results.anyChanged = false;

      for (var i = 0; i < toCheck.length; i++) {
        var observer = toCheck[i];
        if (!observer || !observer.valid)
          continue;

        if (hasObserve) {
          observer.deliver(results);
        } else if (observer.check()) {
          results.anyChanged = true;
          observer.report();
        }

        allObservers.push(observer);
      }
    } while (cycles < MAX_DIRTY_CHECK_CYCLES && results.anyChanged);

    Observer._allObserversCount = allObservers.length;
    runningMicrotaskCheckpoint = false;
  };

  if (collectObservers) {
    global.Platform.clearObservers = function() {
      allObservers = [];
    };
  }

  function ObjectObserver(object, callback) {
    this.object = object;
    Observer.call(this, callback);
  }

  ObjectObserver.prototype = createObject({
    __proto__: Observer.prototype,

    connect: function() {
      if (hasObserve)
        Object.observe(this.object, this.boundInternalCallback);
    },

    sync: function(hard) {
      if (!hasObserve)
        this.oldObject = copyObject(this.object);
    },

    check: function(changeRecords) {
      var diff;
      var oldValues;
      if (hasObserve) {
        if (!changeRecords)
          return false;

        oldValues = {};
        diff = diffObjectFromChangeRecords(this.object, changeRecords,
                                           oldValues);
      } else {
        oldValues = this.oldObject;
        diff = diffObjectFromOldObject(this.object, this.oldObject);
      }

      if (diffIsEmpty(diff))
        return false;

      this.reportArgs =
          [diff.added || {}, diff.removed || {}, diff.changed || {}];
      this.reportArgs.push(function(property) {
        return oldValues[property];
      });

      return true;
    },

    disconnect: function() {
      if (!hasObserve)
        this.oldObject = undefined;
      else if (this.object)
        Object.unobserve(this.object, this.boundInternalCallback);

      this.object = undefined;
    }
  });

  function ArrayObserver(array, callback) {
    if (!Array.isArray(array))
      throw Error('Provided object is not an Array');

    this.object = array;

    Observer.call(this, callback);
  }

  ArrayObserver.prototype = createObject({
    __proto__: ObjectObserver.prototype,

    sync: function() {
      if (!hasObserve)
        this.oldObject = this.object.slice();
    },

    check: function(changeRecords) {
      var splices;
      if (hasObserve) {
        if (!changeRecords)
          return false;

        var oldValues = {};
        var diff = diffObjectFromChangeRecords(this.object, changeRecords, oldValues);
        splices = projectArraySplices(this.object, diff, oldValues);
      } else {
        splices = calcSplices(this.object, 0, this.object.length,
                              this.oldObject, 0, this.oldObject.length);
      }

      if (!splices || !splices.length)
        return false;

      this.reportArgs = [splices];
      return true;
    }
  });

  ArrayObserver.applySplices = function(previous, current, splices) {
    splices.forEach(function(splice) {
      var spliceArgs = [splice.index, splice.removed.length];
      var addIndex = splice.index;
      while (addIndex < splice.index + splice.addedCount) {
        spliceArgs.push(current[addIndex]);
        addIndex++;
      }

      Array.prototype.splice.apply(previous, spliceArgs);
    });
  };

  function getPathValue(object, path) {
    if (!path.length)
      return object;

    if (!isObject(object))
      return;

    if (hasEval)
      return compiledGetValueAtPath(object, path);

    var newValue;
    path.walkPropertiesFrom(object, function(prop, value, i) {
      if (i === path.length)
        newValue = value;
    });

    return newValue;
  }

  function setPathValue(obj, path, value) {
    if (!path.length || !isObject(obj))
      return false;

    var changed = false;

    path.walkPropertiesFrom(obj, function(prop, m, i) {
      if (isObject(m) && i == path.length - 1) {
        changed = true;
        m[prop] = value;
      }
    });

    return changed;
  }

  function newCompiledGetValueAtPath(path) {
    var str = '';
    var partStr = 'obj';
    var length = path.length;
    str += 'if (obj'
    for (var i = 0; i < (length - 1); i++) {
      var part = '["' + path[i] + '"]';
      partStr += part;
      str += ' && ' + partStr;
    }
    str += ') ';

    partStr += '["' + path[length - 1] + '"]';

    str += 'return ' + partStr + '; else return undefined;';
    return new Function('obj', str);
  }

  // TODO(rafaelw): Implement LRU cache so this doens't get too big.
  var compiledGettersCache = {};

  function compiledGetValueAtPath(object, path) {
    var pathString = path.toString();
    if (!compiledGettersCache[pathString])
      compiledGettersCache[pathString] = newCompiledGetValueAtPath(path);

    return compiledGettersCache[pathString](object);
  }

  function getPathValueObserved(object, path, currentlyObserved, observedMap,
      callback) {
    var newValue = undefined;

    path.walkPropertiesFrom(object, function(prop, value, i) {
      if (i === path.length) {
        newValue = value;
        return;
      }

      var observed = currentlyObserved[i];
      if (observed && value === observed[0])
        return;

      if (observed) {
        for (var j = 0; j < observed.length; j++) {
          var obj = observed[j];
          var count = observedMap.get(obj);
          if (count == 1) {
            observedMap.delete(obj);
            global.unobserveCount++;
            Object.unobserve(obj, callback);
          } else {
            observedMap.set(obj, count - 1);
          }
        }
      }

      observed = value;
      if (!isObject(observed))
        return;

      var observed = []
      while (isObject(value)) {
        observed.push(value);
        var count = observedMap.get(value);
        if (!count) {
          observedMap.set(value, 1);
          global.observeCount++;
          Object.observe(value, callback);
        } else {
          observedMap.set(value, count + 1);
        }

        value = Object.getPrototypeOf(value);
      }

      currentlyObserved[i] = observed;
    }, this);

    return newValue;
  };

  function PathObserver(object, pathString, callback) {
    this.value = undefined;

    if (!isPathValid(pathString))
      return;

    var path = new Path(pathString);
    if (!path.length) {
      this.value = object;
      return;
    }

    if (!isObject(object))
      return;

    this.object = object;
    this.path = path;

    if (hasObserve) {
      this.observed = new Array(path.length);
      this.observedMap = new Map;
      this.getPathValue = getPathValueObserved;
    } else {
      this.getPathValue = getPathValue;
    }

    Observer.call(this, callback);
  }

  PathObserver.prototype = createObject({
    __proto__: Observer.prototype,

    connect: function() {
    },

    disconnect: function() {
      this.object = undefined;
      this.value = undefined;
      this.sync(true);
    },

    check: function() {
      this.value = this.getPathValue(this.object,
                                     this.path,
                                     this.observed,
                                     this.observedMap,
                                     this.boundInternalCallback);
      if (areSameValue(this.value, this.oldValue))
        return false;

      this.reportArgs = [this.value, this.oldValue];
      return true;
    },

    sync: function(hard) {
      if (hard)
        this.value = this.getPathValue(this.object,
                                       this.path,
                                       this.observed,
                                       this.observedMap,
                                       this.boundInternalCallback);
      this.oldValue = this.value;
    }
  });

  PathObserver.getValueAtPath = function(obj, pathString) {
    if (!isPathValid(pathString))
      return undefined;

    var path = new Path(pathString);
    return getPathValue(obj, path);
  }

  PathObserver.setValueAtPath = function(obj, pathString, value) {
    if (!isPathValid(pathString))
      return;

    var path = new Path(pathString);
    setPathValue(obj, path, value);
  };

  var knownRecordTypes = {
    'new': true,
    'updated': true,
    'deleted': true
  };

  function notifyFunction(object, name) {
    if (typeof Object.observe !== 'function')
      return;

    var notifier = Object.getNotifier(object);
    return function(type, oldValue) {
      var changeRecord = {
        object: object,
        type: type,
        name: name
      };
      if (arguments.length === 2)
        changeRecord.oldValue = oldValue;
      notifier.notify(changeRecord);
    }
  }

  // TODO(rafaelw): It should be possible for the Object.observe case to have
  // every PathObserver used by defineProperty share a single Object.observe
  // callback, and thus get() can simply call observer.deliver() and any changes
  // to any dependent value will be observed.
  PathObserver.defineProperty = function(object, name, descriptor) {
    // TODO(rafaelw): Validate errors
    var obj = descriptor.object;
    var path = new Path(descriptor.path);
    var notify = notifyFunction(object, name);

    var observer = new PathObserver(obj, descriptor.path,
        function(newValue, oldValue) {
          if (notify)
            notify('updated', oldValue);
        }
    );

    Object.defineProperty(object, name, {
      get: function() {
        return getPathValue(obj, path);
      },
      set: function(newValue) {
        setPathValue(obj, path, newValue);
      },
      configurable: true
    });

    return {
      close: function() {
        var oldValue;
        if (notify)
          observer.deliver();
        observer.close();
        delete object[name];
        // FIXME: When notifier.performChange is available, suppress the
        // underlying delete
        // if (notify)
        //  notify('deleted', oldValue);
      }
    };
  }

  function diffObjectFromChangeRecords(object, changeRecords, oldValues) {
    var added = {};
    var removed = {};

    for (var i = 0; i < changeRecords.length; i++) {
      var record = changeRecords[i];
      if (!knownRecordTypes[record.type]) {
        console.error('Unknown changeRecord type: ' + record.type);
        console.error(record);
        continue;
      }

      if (!(record.name in oldValues))
        oldValues[record.name] = record.oldValue;

      if (record.type == 'updated')
        continue;

      if (record.type == 'new') {
        if (record.name in removed)
          delete removed[record.name];
        else
          added[record.name] = true;

        continue;
      }

      // type = 'deleted'
      if (record.name in added) {
        delete added[record.name];
        delete oldValues[record.name];
      } else {
        removed[record.name] = true;
      }
    }

    for (var prop in added)
      added[prop] = object[prop];

    for (var prop in removed)
      removed[prop] = undefined;

    var changed = {};
    for (var prop in oldValues) {
      if (prop in added || prop in removed)
        continue;

      var newValue = object[prop];
      if (oldValues[prop] !== newValue)
        changed[prop] = newValue;
    }

    return {
      added: added,
      removed: removed,
      changed: changed
    };
  }

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
        if (old[oldStart + i - 1] === current[currentStart + j - 1])
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

  var EDIT_LEAVE = 0;
  var EDIT_UPDATE = 1;
  var EDIT_ADD = 2;
  var EDIT_DELETE = 3;

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

  function sharedPrefix(arr1, arr2, searchLength) {
    for (var i = 0; i < searchLength; i++)
      if (arr1[i] !== arr2[i])
        return i;
    return searchLength;
  }

  function sharedSuffix(arr1, arr2, searchLength) {
    var index1 = arr1.length;
    var index2 = arr2.length;
    var count = 0;
    while (count < searchLength && arr1[--index1] === arr2[--index2])
      count++;

    return count;
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

    function newSplice(index, removed, addedCount) {
      return {
        index: index,
        removed: removed,
        addedCount: addedCount
      };
    }

    if (currentStart == currentEnd) {
      var splice = newSplice(currentStart, [], 0);
      while (oldStart < oldEnd)
        splice.removed.push(old[oldStart++]);

      return [ splice ];
    } else if (oldStart == oldEnd)
      return [ newSplice(currentStart, [], currentEnd - currentStart) ];

    var ops = spliceOperationsFromEditDistances(calcEditDistances(current, currentStart, currentEnd,
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

  function createInitialSplicesFromDiff(array, diff, oldValues) {
    var oldLength = 'length' in oldValues ? toNumber(oldValues.length) : array.length;

    var lengthChangeSplice;
    if (array.length > oldLength) {
      lengthChangeSplice = {
        index: oldLength,
        removed: [],
        addedCount: array.length - oldLength
      };
    } else if (array.length < oldLength) {
      lengthChangeSplice = {
        index: array.length,
        removed: new Array(oldLength - array.length),
        addedCount: 0
      };
    }

    var indicesChanged = [];
    function addProperties(properties, oldValues) {
      Object.keys(properties).forEach(function(prop) {
        var index = toNumber(prop);
        if (isNaN(index) || index < 0 || index >= oldLength)
          return;

        var oldValue = oldValues[index];
        if (index < array.length)
          indicesChanged[index] = oldValue;
        else
          lengthChangeSplice.removed[index - array.length] = oldValues[index];
      });
    }

    addProperties(diff.added, oldValues);
    addProperties(diff.removed, oldValues);
    addProperties(diff.changed, oldValues);

    var splices = [];
    var current;

    for (var index in indicesChanged) {
      index = toNumber(index);

      if (current) {
        if (current.index + current.removed.length == index) {
          current.removed.push(indicesChanged[index]);
          continue;
        }

        current.addedCount = Math.min(array.length, current.index + current.removed.length) - current.index;
        splices.push(current);
        current = undefined;
      }

      current = {
        index: index,
        removed: [indicesChanged[index]]
      }
    }

    if (current) {
      current.addedCount = Math.min(array.length, current.index + current.removed.length) - current.index;

      if (lengthChangeSplice) {
        if (current.index + current.removed.length == lengthChangeSplice.index) {
          // Join splices
          current.addedCount = current.addedCount + lengthChangeSplice.addedCount;
          current.removed = current.removed.concat(lengthChangeSplice.removed);
          splices.push(current);
        } else {
          splices.push(current);
          splices.push(lengthChangeSplice);
        }
      } else {
        splices.push(current)
      }
    } else if (lengthChangeSplice) {
      splices.push(lengthChangeSplice);
    }

    return splices;
  }

  function projectArraySplices(array, diff, oldValues) {
    var splices = [];

    createInitialSplicesFromDiff(array, diff, oldValues).forEach(function(splice) {
      splices = splices.concat(calcSplices(array, splice.index, splice.index + splice.addedCount,
                                           splice.removed, 0, splice.removed.length));
    });

    return splices;
  }

  global.Observer = Observer;
  global.ArrayObserver = ArrayObserver;
  global.ObjectObserver = ObjectObserver;
  global.PathObserver = PathObserver;
})(this);
