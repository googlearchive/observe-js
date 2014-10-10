/*
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

(function(global) {
  'use strict';

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

  function ObservationBenchmark(objectCount) {
    Benchmark.call(this);
    this.objectCount = objectCount;
  }

  ObservationBenchmark.prototype = createObject({
    __proto__: Benchmark.prototype,

    setup: function() {
      this.mutations = 0;

      if (this.objects)
        return;

      this.observer = new Observer();
      this.objects = [];
      this.objectIndex = 0;

      while (this.objects.length < this.objectCount) {
        var obj = this.newObject();
        this.objects.push(obj);
        this.newObserver(obj);
      }
    },

    test: function(mutationCount) {
      while (mutationCount > 0) {
        var obj = this.objects[this.objectIndex];
        mutationCount -= this.mutateObject(obj);
        this.mutations++;
        this.objectIndex++;
        if (this.objectIndex == this.objects.length) {
          this.objectIndex = 0;
        }
      }

      if (typeof Object.observe != 'function')
        this.observer.deliverAll();
    },

    cleanup: function() {
      if (this.mutations !== 0)
        alert('Error: mutations == ' + this.mutations);

      this.mutations = 0;
    },

    dispose: function() {
      this.objects = null;
      this.observer.dispose();
    },

    observerCallback: function(recs) {
      this.mutations -= recs.length;
    }
  });

  function SetupObservationBenchmark(objectCount) {
    Benchmark.call(this);
    this.objectCount = objectCount;
  }

  SetupObservationBenchmark.prototype = createObject({
    __proto__: Benchmark.prototype,

    setup: function() {
      this.mutations = 0;
      this.objects = [];
      while (this.objects.length < this.objectCount) {
        var obj = this.newObject();
        this.objects.push(obj);
      }
    },

    test: function() {
      this.observer = new Observer();
      for (var i = 0; i < this.objects.length; i++) {
        var obj = this.objects[i];
        this.newObserver(obj);
      }
    },

    cleanup: function() {
      this.observer.dispose();
      this.observer = null;
      this.objects = null;
    },

    observerCallback: function() {
    },

    dispose: function() {
    }
  });

  function ObjectBenchmark(config, objectCount) {
    ObservationBenchmark.call(this, objectCount);
    this.properties = [];
    for (var i = 0; i < ObjectBenchmark.propertyCount; i++) {
      this.properties.push(String.fromCharCode(97 + i));
    }
  }

  ObjectBenchmark.configs = [];
  ObjectBenchmark.propertyCount = 15;

  ObjectBenchmark.prototype = createObject({
    __proto__: ObservationBenchmark.prototype,

    newObject: function() {
      var obj = {};
      for (var j = 0; j < ObjectBenchmark.propertyCount; j++)
        obj[this.properties[j]] = j;

      return obj;
    },

    newObserver: function(obj, callback) {
      this.observer.observeObject(obj, '', this.observerCallback, this);
    },

    mutateObject: function(obj) {
      var size = Math.floor(ObjectBenchmark.propertyCount / 3);
      for (var i = 0; i < size; i++) {
        obj[this.properties[i]]++;
      }

      return size;
    }
  });

  function SetupObjectBenchmark(config, objectCount) {
    SetupObservationBenchmark.call(this, objectCount);
    this.properties = [];
    for (var i = 0; i < ObjectBenchmark.propertyCount; i++) {
      this.properties.push(String.fromCharCode(97 + i));
    }
  }

  SetupObjectBenchmark.configs = [];
  SetupObjectBenchmark.propertyCount = 15;

  SetupObjectBenchmark.prototype = createObject({
    __proto__: SetupObservationBenchmark.prototype,

    newObject: function() {
      var obj = {};
      for (var j = 0; j < SetupObjectBenchmark.propertyCount; j++)
        obj[this.properties[j]] = j;

      return obj;
    },

    newObserver: function(obj, callback) {
      this.observer.observeObject(obj, '', this.observerCallback, this);
    }
  });

  function ArrayBenchmark(config, objectCount) {
    ObservationBenchmark.call(this, objectCount);
    var tokens = config.split('/');
    this.operation = tokens[0];
    this.undo = tokens[1];
  };

  ArrayBenchmark.configs = ['splice', 'update', 'push/pop', 'shift/unshift'];
  ArrayBenchmark.elementCount = 100;

  ArrayBenchmark.prototype = createObject({
    __proto__: ObservationBenchmark.prototype,

    newObject: function() {
      var array = [];
      for (var i = 0; i < ArrayBenchmark.elementCount; i++)
        array.push(i);
      return array;
    },

    newObserver: function(array) {
      this.observer.observeArray(array, '', this.observerCallback, this);
    },

    mutateObject: function(array) {
      switch (this.operation) {
        case 'update':
          var mutationsMade = 0;
          var size = Math.floor(ArrayBenchmark.elementCount / 10);
          for (var j = 0; j < size; j++) {
            array[j*size] += 1;
            mutationsMade++;
          }
          return mutationsMade;

        case 'splice':
          var size = Math.floor(ArrayBenchmark.elementCount / 5);
          var removed = array.splice(size, size);
          Array.prototype.splice.apply(array, [size*2, 0].concat(removed));
          return size * 2;

        default:
          var val = array[this.undo]();
          array[this.operation](val + 1);
          return 2;
      }
    }
  });

  function SetupArrayBenchmark(config, objectCount) {
    ObservationBenchmark.call(this, objectCount);
  };

  SetupArrayBenchmark.configs = [];
  SetupArrayBenchmark.propertyCount = 15;

  SetupArrayBenchmark.prototype = createObject({
    __proto__: SetupObservationBenchmark.prototype,

    newObject: function() {
      var array = [];
      for (var i = 0; i < ArrayBenchmark.elementCount; i++)
        array.push(i);
      return array;
    },

    newObserver: function(array, callback) {
      this.observer.observeArray(array, '', this.observerCallback, this);
    }
  });

  function PathBenchmark(config, objectCount) {
    ObservationBenchmark.call(this, objectCount);
    this.leaf = config === 'leaf';
    this.path = Path.get('foo.bar.baz');
    this.firstPathProp = Path.get(this.path[0]);
  }

  PathBenchmark.configs = ['leaf', 'root'];

  PathBenchmark.prototype = createObject({
    __proto__: ObservationBenchmark.prototype,

    newPath: function(parts, value) {
      var obj = {};
      var ref = obj;
      var prop;
      for (var i = 0; i < parts.length - 1; i++) {
        prop = parts[i];
        ref[prop] = {};
        ref = ref[prop];
      }

      prop = parts[parts.length - 1];
      ref[prop] = value;

      return obj;
    },

    newObject: function() {
      return this.newPath(this.path, 1);
    },

    newObserver: function(object) {
      this.observer.observeValue(object, this.path, this.observerCallback, this);
    },

    mutateObject: function(obj) {
      var val = this.path.getValueFrom(obj);
      if (this.leaf) {
        this.path.setValueFrom(obj, val + 1);
      } else {
        this.firstPathProp.setValueFrom(obj, this.newPath(this.path.slice(1), val + 1));
      }

      return 1;
    }
  });

  function SetupPathBenchmark(config, objectCount) {
    ObservationBenchmark.call(this, objectCount);
    this.path = Path.get('foo.bar.baz');
  }

  SetupPathBenchmark.configs = [];

  SetupPathBenchmark.prototype = createObject({
    __proto__: SetupObservationBenchmark.prototype,

    newPath: function(parts, value) {
      var obj = {};
      var ref = obj;
      var prop;
      for (var i = 0; i < parts.length - 1; i++) {
        prop = parts[i];
        ref[prop] = {};
        ref = ref[prop];
      }

      prop = parts[parts.length - 1];
      ref[prop] = value;

      return obj;
    },

    newObject: function() {
      return this.newPath(this.path, 1);
    },

    newObserver: function(obj, callback) {
      this.observer.observeValue(obj, this.path, this.observerCallback, this);
    }
  });

  global.ObjectBenchmark = ObjectBenchmark;
  global.SetupObjectBenchmark = SetupObjectBenchmark;
  global.ArrayBenchmark = ArrayBenchmark;
  global.SetupArrayBenchmark = SetupArrayBenchmark;
  global.PathBenchmark = PathBenchmark;
  global.SetupPathBenchmark = SetupPathBenchmark;

})(this);
