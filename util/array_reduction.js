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
  this.callback_ = undefined;
  this.target_ = undefined;
  this.value_ = undefined;
  this.array_ = array;
  this.path_ = Path.get(path);
  this.reduceFn = reduceFn;
  this.initial = initial;
}

ArrayReduction.prototype = {
  open: function(callback, target) {
    this.callback_ = callback;
    this.target_ = target;

    this.arrayObserver = new ArrayObserver(this.array_);
    this.arrayObserver.open(this.handleSplices, this);
    this.observers = this.path_.valid ? [] : undefined;

    this.handleSplices([{
      index: 0,
      removed: [],
      addedCount: this.array_.length
    }]);

    return this.value_;
  },

  handleSplices: function(splices) {
    this.reduce();

    if (!this.observers)
      return;

    for (var i = 0; i < splices.length; i++) {
      var splice = splices[i];
      var added = [];
      for (var j = 0; j < splice.addedCount; j++) {
        var observer = new PathObserver(this.array_[splice.index + j],
                                        this.path_);
        observer.open(this.reduce, this);
        added.push(observer);

      }

      var spliceArgs = [splice.index, splice.removed.length].concat(added);
      var removed = Array.prototype.splice.apply(this.observers, spliceArgs);

      for (var j = 0; j < removed.length; j++) {
        removed[j].close();
      }
    }
  },

  reduce: function(sync) {
    var value = this.array_.reduce(this.reduceFn, this.initial);
    if (value == this.value_)
      return;

    var oldValue = this.value_;
    this.value_ = value;

    if (!sync)
      this.callback_.call(this.target_, this.value_, oldValue);
  },

  close: function() {
    this.observers.forEach(function(observer) {
      observer.close();
    });

    this.arrayObserver.close();
  },

  discardChanges: function() {
    this.arrayObserver.discardChanges();
    this.observers.forEach(function(observer) {
      observer.discardChanges();
    });

    this.reduce(true);
    return this.value_;
  },

  deliver: function() {
    this.arrayObserver.deliver();
    this.observers.forEach(function(observer) {
      observer.deliver();
    });
  }
}
