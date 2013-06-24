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

function EndOfMicrotaskRunner(callbackFn) {
  var observer = new MutationObserver(callbackFn);
  var div = document.createElement('div');
  observer.observe(div, { attributes: true });
  var pingPong = true;

  this.schedule = function() {
    div.setAttribute('ping', pingPong);
    pingPong = !pingPong;
  }
}

function BenchmarkRunner(benchmark, setups, variants, completeFn, statusFn) {
  this.benchmark = benchmark;
  this.setups = setups;
  this.variants = variants;
  this.setup = 0;
  this.variant = 0;
  this.completeFn = completeFn;
  this.statusFn = statusFn;
  this.results = [];
}

BenchmarkRunner.INIT = 0;
BenchmarkRunner.ESTIMATE = 1;
BenchmarkRunner.TESTING = 2;
BenchmarkRunner.maxTime = 400;
BenchmarkRunner.maxRuns = 50;

BenchmarkRunner.prototype = {
  now: function() {
    return performance && performance.now ? performance.now() : Date.now();
  },

  go: function() {
    this.nextVariant();
  },

  nextVariant: function() {
    // Done with all
    if (this.setup === this.setups.length) {
      this.benchmark.destroy();

      var self = this;
      setTimeout(function() {
        // Cleans up observers.
        Platform.performMicrotaskCheckpoint();
        self.completeFn(self.results);
      });
      return;
    }

    // Configure this setup.
    if (this.variant === 0) {
      this.times = [];
      this.benchmark.setup(this.setups[this.setup]);
    }

    // Run the test once before timing.
    this.runSeries(BenchmarkRunner.INIT, 1);
  },

  variantComplete: function(duration) {
    this.times.push(duration);

    this.statusFn(this.setups[this.setup], this.variants[this.variant],
                  this.runCount);

    this.variant++;

    if (this.variant == this.variants.length) {
      this.results.push(this.times);
      this.setup++;
      this.variant = 0;
    }

    var self = this;
    setTimeout(function() {
      if (self.statusFn)
      self.nextVariant();
    }, 0);
  },

  runSeries: function(state, count) {
    this.state = state;
    this.runCount = count;
    this.remaining = count;
    this.start = this.now();
    this.runOne();
  },

  runOne: function() {
    this.benchmark.run(this.variants[this.variant], this);
  },

  resolve: function() {
    this.remaining--;
    if (this.remaining > 0) {
      this.runOne();
      return;
    }

    var duration = (this.now() - this.start) / this.runCount;

    switch (this.state) {
      case BenchmarkRunner.INIT:
        // Run the test twice to estimate its time.
        this.runSeries(BenchmarkRunner.ESTIMATE, 2);
        break;

      case BenchmarkRunner.ESTIMATE:
        // Run as many tests as will fit in maxTime.
        var testingRuns =
            Math.min(Math.round(BenchmarkRunner.maxTime/duration),
                     BenchmarkRunner.maxRuns);

        if (testingRuns >= 4)
          this.runSeries(BenchmarkRunner.TESTING, testingRuns);
        else
          this.variantComplete(duration);
        break;
      case BenchmarkRunner.TESTING:
        this.variantComplete(duration);
        break;
    }
  }
}

function Benchmark() {
  this.objects = [];
  this.observers = []
  this.index = 0;
  this.mutationCount = 0;
  this.boundObserverCallback = this.observerCallback.bind(this);
  this.microtaskRunner =
      new EndOfMicrotaskRunner(this.microtaskCallback.bind(this));
}

Benchmark.prototype = {
  setup: function(objectCount) {
    while (this.objects.length < objectCount) {
      var obj = this.newObject();
      this.objects.push(obj);
      this.observers.push(this.newObserver(obj));
    }
  },

  run: function(mutationCount, deferred) {
    this.deferred = deferred;

    while (mutationCount > 0) {
      var obj = this.objects[this.index];
      mutationCount += -this.mutateObject(obj, mutationCount);
      this.mutationCount++;
      this.index++;
      if (this.index >= this.objects.length)
        this.index = 0;
    }

    this.microtaskRunner.schedule();
  },

  observerCallback: function() {
    this.mutationCount--;
  },

  microtaskCallback: function() {
    Platform.performMicrotaskCheckpoint();

    if (this.mutationCount !== 0)
      alert('Error: mutationCount == ' + this.mutationCount);
    this.deferred.resolve();
  },

  destroy: function() {
    for (var i = 0; i < this.observers.length; i++) {
      var observer = this.observers[i];
      observer.close();
    }
  }
};

function ObjectBenchmark() {
  Benchmark.call(this);
  this.properties = [];
  for (var i = 0; i < ObjectBenchmark.propertyCount; i++) {
    this.properties.push(String.fromCharCode(97 + i));
  }
}

ObjectBenchmark.configs = [];
ObjectBenchmark.propertyCount = 15;

ObjectBenchmark.prototype = createObject({
  __proto__: Benchmark.prototype,

  newObject: function() {
    var obj = {};
    for (var j = 0; j < ObjectBenchmark.propertyCount; j++)
      obj[this.properties[j]] = j;

    return obj;
  },

  newObserver: function(obj) {
    return new ObjectObserver(obj, this.boundObserverCallback);
  },

  mutateObject: function(obj) {
    var size = Math.floor(ObjectBenchmark.propertyCount / 3);
    for (var i = 0; i < size; i++) {
      obj[this.properties[i]]++;
    }

    return size;
  }
});

function ArrayBenchmark(config) {
  Benchmark.call(this);
  var tokens = config.split('/');
  this.operation = tokens[0];
  this.undo = tokens[1];
};

ArrayBenchmark.configs = ['splice', 'update', 'push/pop', 'shift/unshift'];
ArrayBenchmark.elementCount = 100;

ArrayBenchmark.prototype = createObject({
  __proto__: Benchmark.prototype,

  newObject: function() {
    var array = [];
    for (var i = 0; i < ArrayBenchmark.elementCount; i++)
      array.push(i);
    return array;
  },

  newObserver: function(array) {
    return new ArrayObserver(array, this.boundObserverCallback);
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
        val = array[this.undo]();
        array[this.operation](val + 1);
        return 2;
    }
  }
});

function PathBenchmark(config) {
  Benchmark.call(this);
  this.leaf = config === 'leaf';
  this.pathParts = ['foo', 'bar', 'baz'];
  this.pathString = this.pathParts.join('.');
}

PathBenchmark.configs = ['leaf', 'root'];

PathBenchmark.prototype = createObject({
  __proto__: Benchmark.prototype,

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
    return this.newPath(this.pathParts, 1);
  },

  newObserver: function(obj) {
    return new PathObserver(obj, this.pathString, this.boundObserverCallback);
  },

  mutateObject: function(obj) {
    if (this.leaf) {
      val = PathObserver.getValueAtPath(obj, this.pathString);
      PathObserver.setValueAtPath(obj, this.pathString, val + 1);
    } else {
      val = PathObserver.getValueAtPath(obj, this.pathString);
      PathObserver.setValueAtPath(obj, this.pathParts[0],
          this.newPath(this.pathParts.slice(1), val + 1));
    }

    return 1;
  }
});
