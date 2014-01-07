[![Build status](http://www.polymer-project.org/build/observe-js/status.png "Build status")](http://build.chromium.org/p/client.polymer/waterfall) [![Analytics](https://ga-beacon.appspot.com/UA-39334307-2/Polymer/observe-js/README)](https://github.com/igrigorik/ga-beacon)

## Learn the tech

### Why observe-js?

observe-js is a library for observing changes in JavaScript data. It exposes a high-level API and uses Object.observe if available, and otherwise performs dirty-checking. observe-js requires ECMAScript 5.

### Observable

observe-js implements a set of observers (PathObserver, ArrayObserver, ObjectObserver, CompoundObserver, ObserverTransform) which all implement the Observable interface:

```JavaScript
{
  // Begins observation. Value changes will be reported by invoking |changeFn| with |opt_receiver| as 
  // the target, if provided. Returns the initial value of the observation.
  open: function(changeFn, opt_receiver) {},
  
  // Report any changes now (does nothing if there are no changes to report).
  deliver: function() {}
  
  // If there are changes to report, ignore them. Returns the current value of the observation.
  discardChanges: function() {},
  
  // Ends observation. Frees resources and drops references to observed objects.
  close: function() {},
}
```

### PathObserver

PathObserver observes a "value-at-a-path" from a given object:

```JavaScript
var obj = { foo: { bar: 'baz' } };
var observer = new PathObserver(obj, 'foo.bar');
observer.open(function(newValue, oldValue) {
  // respond to obj.foo.bar having changed value.
});
```

PathObserver will report a change whenever the value obtained by the corresponding path expression (e.g. `obj.foo.bar`) would return a different value. Note that if the path is ever unreachable, the value is considered to be `undefined`.


### ArrayObserver

ArrayObserver observes the index-positions of an Array and reports changes as the minimal set of "splices" which would have had the same effect.

```JavaScript
var arr = [0, 1, 2, 4];
var observer = new ArrayObserver(arr);
observer.open(function(splices) {
  // respond to changes to the elements of arr.
  splices.forEach(function(splice) {
    splice.index; // index position that the change occurred.
    splice.removed; // an array of values representing the sequence of elements which were removed
    splice.addedCount; // the number of elements which were inserted.
  });
});
```

ArrayObserver also exposes a utility function: `applySplices`. The purpose of `applySplices` is to transform a copy of an old state of an array into a copy of its current state, given the current state and the splices reported from the ArrayObserver.

```JavaScript
AraryObserver.applySplices = function(previous, current, splices) { }
```

### ObjectObserver:

ObjectObserver observes the set of own-properties of an object and their values.

```JavaScript
var myObj = { id: 1, foo: 'bar' };
var observer = new ObjectObserver(myObj);
observer.open(function(added, removed, changed, getOldValueFn) {
  // respond to changes to the obj.
  Object.keys(added).forEach(function(property) {
    property; // a property which has been been added to obj
    added[property]; // its value
  });
  Object.keys(removed).forEach(function(property) {
    property; // a property which has been been removed from obj
    getOldValueFn(property); // its old value
  });
  Object.keys(changed).forEach(function(property) {
    property; // a property on obj which has changed value.
    changed[property]; // its value
    getOldValueFn(property); // its old value
  });
});
```


Multiple path and compound-value observation:

```JavaScript
var obj = {
  a: 1,
  b: 2,
  c: 3
};

function callback(newValues, // array of current path-values, in addPath order
                  oldValues, // array of old path-values, in addPath order.
                  observedObjects) { // array of root objects for observed values
  // respond to one or more path values having changed
}

var observer = new CompoundObserver();
observer.open(callback);
observer.addPath(obj, 'a');
observer.addPath(obj, 'b');
observer.addPath(obj, 'c');
observer.start();

function sum(values) {
  var value = 0;
  for (var i = 0; i < values.length; i++)
    value += values[i]
  return value;
}

function compoundObserverCallback(newValue, // new compound value (sum(newValues))
                                  oldValue, // old comoound value (sum(oldValues)) 
                                            // index properties will only exist for values which are changed
                                  observedObjects) { // array of root objects for observed values
                                  
  // respond to compound value having changed
}

var observer = new CompoundObserver();
observer.open(callback);
observer.addPath(obj, 'a');
observer.addPath(obj, 'b');
observer.addPath(obj, 'c');
observer.start();
```

Constructor:

```JavaScript
function CompoundObserver(
)
```

Path objects:

```JavaScript
// Path.get() takes a string which is a sequence of dot-separated ECMAScript identifiers or integer index values.
var path = Path.get('foo.bar.baz');

// There is a 1:1 correspondence between logical path strings and path objects.
assert(Path.get('foo.bar.baz') === Path.get('foo.bar.baz'));
assert(Path.get('foo.bar.baz') !== Path.get('foo.bar.bat'));

// The value from an object can be retrieved via getValueFrom()
assert(2 == Path.get('foo.bar').getValueFrom({ foo: { bar: 2 }});

// The value from an object can be set via setValueFrom()
var obj = { foo: { bar: 2 }};
Path.get('foo.bar').setValueFrom(obj, 3);
assert(3 == obj.foo.bar);
```

Defining an accessor which creates a synchronous "alias" for a path-value from an object. The created accessor property notifies (if Object.observe is available) when the dependent value changes.

```JavaScript
var obj = { a: { b: 1 } };
var alias = { };

var closer = PathObserver.defineProperty(alias, 'val', obj, 'a.b' );

assert(obj.a.b === alias.val);

obj.a.b = 2;
assert(obj.a.b === alias.val);

alias.val = 3;
assert(obj.a.b === alias.val);
```


Force delivery of any changes:
```JavaScript
var obj = { id: 1 }
var observer = new ObjectObserve(obj, function(added, removed, changed, getOldValueFn) {
  // react.
});

obj.id = 2;
observer.deliver(); // causes the callback to be invoked reporting the change in value to obj.id.
```

Reset an observer to discard any previous changes:
```JavaScript
var arr = [1, 2, 3];
var observer = new ArrayObserver(arr, function(splices) {
  // react.
});

arr.push(4);
observer.reset(); // observer forgets about prior changes
observer.deliver(); // because of the reset, there is nothing to report so callback is not invoked.
```

Close an observer
```JavaScript
var obj = { foo: { bar: 2 } };
var observer = new PathObserver(arr, function(newValue, oldValue) {
  // react.
});
obj.foo.bar = 3;
observer.close(); // the observer is now invalid and will never fire its callback
```
### About path-values

* If a path is unreachable from the provided object, its value is `undefined`
* If a path is empty (`''`), its value is the object provided

### About observing paths

`PathObserver` allows code to react to changes to a `path value`. Details:

* Path observation respects prototype values.

### About observing Arrays

`ArrayObserver` allows code to react to changes in the the indexed valued properties of an Array. Details:

* Changes to non-indexed valued properties are not reported (e.g. arr.foo)
* Regardless of what caused the change (e.g. splice(), arr[4] = 4, arr.length = 4), the effects are reported as splices.
* The changes reported are the minimal set of splices required to transform the previous state of arr to the present state.
  * `ArrayObserver.applySplices(splices, copyOfOldArray);` will do actually do this.
* `ArrayObserver` does not respect prototype values.

### About observing Objects

`ObjectObserver` allows code to react to all property changes of a given object. Details:

* Changes are reported as `added`, `removed`, and `changed` properties. Each is an object whose keys are property names and whose values the present value of that property on the object.
* The forth argument (`getOldValueFn`) provided to callback, will retrieve the previous value of a given property if a change to it was reported.
* `ObjectObserver` does not respect prototype values.

## About delivery of changes

ChangeSummary is intended for use in environments which implement Object.observe, but it supports use in environments which do not.

If `Object.observe` is present, and observers have changes to report, their callbacks will be invoked at the end of the current turn (microtask). In a browser environment, this is generally at the end of an event.

If `Object.observe` is absent, `Platform.performMicrotaskCheckpoint()` must be called to trigger delivery of changes. If `Object.observe` is implemented, `Platform.performMicrotaskCheckpoint()` has no effect.
