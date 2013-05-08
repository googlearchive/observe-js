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
  var values = [];
  var observers = [];
  var self = this;
  var hasInitial = arguments.length == 4;

  function reduce() {
    self.value = hasInitial ?
      values.reduce(reduceFn, initial) : values.reduce(reduceFn);
  }

  function newCallback(index) {
    return function(value) {
      values[index] = value;
      reduce();
    }
  }

  function handleSplice(splice) {
    var valueArgs = [splice.index, splice.removed.length];
    var observerArgs = [splice.index, splice.removed.length];

    var removeIndex = splice.index;
    while (removeIndex < splice.removed.length) {
      observers[removeIndex].close();
      removeIndex++;
    }

    var addIndex = splice.index;
    while (addIndex < splice.index + splice.addedCount) {
      var itemPath = String(addIndex);
      if (path)
        itemPath += '.' + path;

      valueArgs.push(PathObserver.getValueAtPath(array, itemPath));
      observerArgs.push(new PathObserver(array, itemPath, newCallback(addIndex)));
      addIndex++;
    }

    Array.prototype.splice.apply(values, valueArgs);
    Array.prototype.splice.apply(observers, observerArgs);
  }

  this.arrayObserver = new ArrayObserver(array, function(splices) {
    splices.forEach(handleSplice);
    reduce();
  });

  handleSplice({
    index: 0,
    removed: [],
    addedCount: array.length
  });

  reduce();
}