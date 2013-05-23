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


(function(global) {
  var objectCount = 100;
  var cycles = 500;
  var arrays;
  var observers;
  var elementCount = 100;
  function callback() {}

  function createAndObserveArrays() {
    arrays = [];
    observers = [];
    for (var i = 0; i < objectCount; i++) {
      var array = [];
      for (var j = 0; j < elementCount; j++)
        array.push(j);

      observers.push(new ArrayObserver(array, callback));
      arrays.push(array);
    }
  }

  function unobserveArrays() {
    for (var i = 0; i < objectCount; i++)
      observers[i].disconnect();
  }

  function mutateArraysAndDeliver(mutationFreq, op, undoOp) {
    var modVal = Math.floor(100/mutationFreq);

    for (var i = 0; i < cycles; i++) {
      for (var j = 0; j < objectCount; j++) {
        if (modVal === Infinity || j % modVal != 0)
          continue;

        var array = arrays[j];
        if (op == 'update') {
          for (var k = 0; k < elementCount; k++) {
            if (k % modVal == 0) {
              array[k] += 1;
            }
          }
          continue;
        }

        if (op == 'length') {
          array.length += (i % 2 ? 1 : -1) * Math.floor(elementCount / modVal);
          continue;
        }

        if (i % 2)
          array[op](j);
        else
          array[undoOp](j);
      }

      for (var j = 0; j < objectCount; j++) {
        observers[j].deliver();
      }
    }
  }

  global.createAndObserveArrays = createAndObserveArrays;
  global.unobserveArrays = unobserveArrays;
  global.mutateArraysAndDeliver = mutateArraysAndDeliver;
})(this);
