// Copyright 2013 Google Inc.
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

function ArrayReduction(array, path, reduceFn, initial) {
  this.array = array;
  this.path = path ? path.trim() : undefined;
  this.reduceFn = reduceFn;
  this.initial = initial;
  this.arrayObserver = new ArrayObserver(array, this.handleSplices, this);
  this.observers = this.path ? [] : undefined;

  this.handleSplices([{
    index: 0,
    removed: [],
    addedCount: array.length
  }]);
}

ArrayReduction.prototype = {
  updateObservers: function(splices) {
    for (var i = 0; i < splices.length; i++) {
      var splice = splices[i];
      var added = [];
      for (var j = 0; j < splice.addedCount; j++) {
        added.push(new PathObserver(this.array[splice.index + j], this.path,
                                    this.reduce, this));
      }

      var spliceArgs = [splice.index, splice.removed.length].concat(added);
      var removed = Array.prototype.splice.apply(this.observers, spliceArgs);

      for (var j = 0; j < removed.length; j++) {
        removed[j].close();
      }
    }
  },

  handleSplices: function(splices) {
    if (this.observers)
      this.updateObservers(splices);

    this.reduce();
  },

  reduce: function() {
    this.value = this.array.reduce(this.reduceFn, this.initial);
  },

  close: function() {
    this.observers.forEach(function(observer) {
      observer.close();
    });
    this.arrayObserver.close();
  },

  deliver: function() {
    this.arrayObserver.deliver();
    this.observers.forEach(function(observer) {
      observer.deliver();
    });
  }
}

ArrayReduction.defineProperty = function(object, name, descriptor) {
  var observer = new ArrayReduction(descriptor.array, descriptor.path,
                                    descriptor.reduce,
                                    descriptor.initial);

  Object.defineProperty(object, name, {
    get: function() {
      observer.deliver();
      return observer.value;
    }
  });

  if (Observer.hasObjectObserve)
    return observer;

  var value = observer.value;
  Object.defineProperty(observer, 'value', {
    get: function() {
      return value;
    },
    set: function(newValue) {
      if (Observer.hasObjectObserve) {
        Object.getNotifier(object).notify({
          object: object,
          type: 'updated',
          name: name,
          oldValue: value
        });
      }
      value = newValue;
    }
  })

  return observer;
}