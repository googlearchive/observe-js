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

// Run ArrayFuzzer under d8, e.g.
// path/to/d8 change_summary tests/d8_path_test.js (--harmony)


(function(global) {
  var objectCount = 500;
  var dirtyCheckTimes = 100;
  var objects;
  var observer = new ChangeSummary(function() {});
  var propertyCount = 20;
  var properties = [];

  for (var i = 0; i < propertyCount; i++) {
    properties.push(String.fromCharCode(97 + i));
  }

  function createAndObserveObjects() {
    objects = [];
    for (var i = 0; i < objectCount; i++) {
      var object = {};
      for (var j = 0; j < propertyCount; j++)
        object[properties[j]] = '';

      observer.observeObject(object);
      objects.push(object);
    }
  }

  function mutateObjectsAndDeliver(mutationFreq) {
    var modVal = mutationFreq ? Math.floor(100/mutationFreq) : 0;
    var modChar = mutationFreq ? Math.max(1, Math.floor(propertyCount * (mutationFreq / 100))) : 0;

    for (var i = 0; i < dirtyCheckTimes; i++) {
      if (modVal) {
        for (var j = 0; j < objects.length; j++) {
          if ((j % modVal == 0)) {
            var object = objects[j];
            for (var k = 0; k < modChar; k++)
              object[properties[k]] += k;
          }
        }
      }

      observer.deliver();
    }
  }

  global.createAndObserveObjects = createAndObserveObjects;
  global.mutateObjectsAndDeliver = mutateObjectsAndDeliver;
})(this);
