/*
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

var observer;
var path;
var obj;
var records;

function callback(recs) {
  records = recs;
};

function then(fn) {
  setTimeout(function() {
    observer.deliverAll();
    fn();
  }, 0);

  return {
    then: function(next) {
      return then(next);
    }
  };
}

function doSetup() {
  records = undefined;
  observer = new Observer();
}

function doTeardown() {
  observer.unobserve(callback);
  observer.dispose();
  records = undefined;
}

function assertRecords(expectRecords, dontDeliver) {
  if (!dontDeliver)
    observer.deliver(callback);

  if (expectRecords === records)
    return;

  assert.strictEqual(expectRecords.length, records.length);
  for (var i = 0; i < expectRecords.length; i++) {
    var expect = expectRecords[i];
    var record = records[i];

    assert.strictEqual(expect.object, record.object);
    assert.strictEqual(expect.path, record.path);
    assert.strictEqual(expect.oldValue, record.oldValue);
    assert.strictEqual(expect.value, record.value);
  }

  records = undefined;
}

function assertPathChanges(value, oldValue, dontDeliver) {
  assertRecords([{
    object: obj,
    path: path,
    oldValue: oldValue,
    value: value
  }], dontDeliver);
}

function assertCompoundPathChanges(values, oldValues, paths) {
  var records = [];
  for (var i = 0; i < values.length; i++) {
    records.push({
      object: obj,
      path: Path.get(paths[i]),
      oldValue: oldValues[i],
      value: values[i]
    });
  }

  assertRecords(records);
}

function assertNoChanges() {
  assertRecords(undefined);
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

function assertPath(pathString, expectKeys, expectSerialized) {
  var path = Path.get(pathString);
  if (!expectKeys) {
    assert.isFalse(path.valid);
    return;
  }

  assert.deepEqual(Array.prototype.slice.apply(path), expectKeys);
  assert.strictEqual(path.toString(), expectSerialized);
}

function assertInvalidPath(pathString) {
  assertPath(pathString);
}

suite('Path', function() {

  test('constructor throws', function() {
    assert.throws(function() {
      new Path('foo')
    });
  });

  test('path validity', function() {
    // invalid path get value is always undefined
    var p = Path.get('a b');
    assert.isFalse(p.valid);
    assert.isUndefined(p.getValueFrom({ a: { b: 2 }}));

    assertPath('', [], '');
    assertPath(' ', [], '');
    assertPath(null, [], '');
    assertPath(undefined, [], '');
    assertPath('a', ['a'], 'a');
    assertPath('a.b', ['a', 'b'], 'a.b');
    assertPath('a. b', ['a', 'b'], 'a.b');
    assertPath('a .b', ['a', 'b'], 'a.b');
    assertPath('a . b', ['a', 'b'], 'a.b');
    assertPath(' a . b ', ['a', 'b'], 'a.b');
    assertPath('a[0]', ['a', '0'], 'a[0]');
    assertPath('a [0]', ['a', '0'], 'a[0]');
    assertPath('a[0][1]', ['a', '0', '1'], 'a[0][1]');
    assertPath('a [ 0 ] [ 1 ] ', ['a', '0', '1'], 'a[0][1]');
    assertPath('[1234567890] ', ['1234567890'], '[1234567890]');
    assertPath(' [1234567890] ', ['1234567890'], '[1234567890]');
    assertPath('opt0', ['opt0'], 'opt0');
    assertPath('$foo.$bar._baz', ['$foo', '$bar', '_baz'], '$foo.$bar._baz');
    assertPath('foo["baz"]', ['foo', 'baz'], 'foo.baz');
    assertPath('foo["b\\"az"]', ['foo', 'b"az'], 'foo["b\\"az"]');
    assertPath("foo['b\\'az']", ['foo', "b'az"], 'foo["b\'az"]');
    assertPath(['a', 'b'], ['a', 'b'], 'a.b');
    assertPath([''], [''], '[""]');

    function Foo(val) { this.val = val; }
    Foo.prototype.toString = function() { return 'Foo' + this.val; };
    assertPath([new Foo('a'), new Foo('b')], ['Fooa', 'Foob'], 'Fooa.Foob');

    assertInvalidPath('.');
    assertInvalidPath(' . ');
    assertInvalidPath('..');
    assertInvalidPath('a[4');
    assertInvalidPath('a.b.');
    assertInvalidPath('a,b');
    assertInvalidPath('a["foo]');
    assertInvalidPath('[0x04]');
    assertInvalidPath('[0foo]');
    assertInvalidPath('[foo-bar]');
    assertInvalidPath('foo-bar');
    assertInvalidPath('42');
    assertInvalidPath('a[04]');
    assertInvalidPath(' a [ 04 ]');
    assertInvalidPath('  42   ');
    assertInvalidPath('foo["bar]');
    assertInvalidPath("foo['bar]");
  });

  test('Paths are interned', function() {
    var p = Path.get('foo.bar');
    var p2 = Path.get('foo.bar');
    assert.strictEqual(p, p2);

    var p3 = Path.get('');
    var p4 = Path.get('');
    assert.strictEqual(p3, p4);
  });

  test('null is empty path', function() {
    assert.strictEqual(Path.get(''), Path.get(null));
  });

  test('undefined is empty path', function() {
    assert.strictEqual(Path.get(undefined), Path.get(null));
  });

  test('Path.getValueFrom', function() {
    var obj = {
      a: {
        b: {
          c: 1
        }
      }
    };

    var p1 = Path.get('a');
    var p2 = Path.get('a.b');
    var p3 = Path.get('a.b.c');

    assert.strictEqual(obj.a, p1.getValueFrom(obj));
    assert.strictEqual(obj.a.b, p2.getValueFrom(obj));
    assert.strictEqual(1, p3.getValueFrom(obj));

    obj.a.b.c = 2;
    assert.strictEqual(2, p3.getValueFrom(obj));

    obj.a.b = {
      c: 3
    };
    assert.strictEqual(3, p3.getValueFrom(obj));

    obj.a = {
      b: 4
    };
    assert.strictEqual(undefined, p3.getValueFrom(obj));
    assert.strictEqual(4, p2.getValueFrom(obj));
  });

  test('Path.setValueFrom', function() {
    var obj = {};
    var p2 = Path.get('bar');

    Path.get('foo').setValueFrom(obj, 3);
    assert.equal(3, obj.foo);

    var bar = { baz: 3 };

    Path.get('bar').setValueFrom(obj, bar);
    assert.equal(bar, obj.bar);

    var p = Path.get('bar.baz.bat');
    p.setValueFrom(obj, 'not here');
    assert.equal(undefined, p.getValueFrom(obj));
  });

  test('Degenerate Values', function() {
    var emptyPath = Path.get();
    var foo = {};

    assert.equal(null, emptyPath.getValueFrom(null));
    assert.equal(foo, emptyPath.getValueFrom(foo));
    assert.equal(3, emptyPath.getValueFrom(3));
    assert.equal(undefined, Path.get('a').getValueFrom(undefined));
  });
});

suite('Basic Tests', function() {

  setup(doSetup);

  teardown(doTeardown);

  test('Exception Doesnt Stop Notification', function() {
    var obj = [1];
    var count = 0;

    function callback1() {
      count++;
      throw 'ouch';
    }
    observer.observeObject(callback1, obj);

    function callback2() {
      count++;
      throw 'ouch';
    }
    observer.observe(callback2, obj, '[0]');

    function callback3() {
      count++;
      throw 'ouch';
    }
    observer.observeArray(callback3, obj);

    obj[0] = 2;
    obj[1] = 2;

    observer.deliver(callback1);
    observer.deliver(callback2);
    observer.deliver(callback3);

    assert.equal(3, count);
  });

/*
FIXME: !!!

  test('No Object.observe performMicrotaskCheckpoint', function() {
    if (typeof Object.observe == 'function')
      return;

    var model = [1];
    var count = 0;

    var observer1 = new ObjectObserver(model);
    observer1.open(function() {
      count++;
    });

    var observer2 = new PathObserver(model, '[0]');
    observer2.open(function() {
      count++;
    });

    var observer3 = new ArrayObserver(model);
    observer3.open(function() {
      count++;
    });

    model[0] = 2;
    model[1] = 2;

    Platform.performMicrotaskCheckpoint();
    assert.equal(3, count);

    observer1.close();
    observer2.close();
    observer3.close();
  });
*/
});

suite('observe Tests', function() {

  function init(objValue, pathString) {
    obj = objValue,
    path = Path.get(pathString || '');
    observer.observe(callback, obj, path);
  }

  setup(doSetup);

  teardown(doTeardown);

  test('Callback args', function() {
    init({ foo: 'bar' }, 'foo');
    obj.foo = 'baz';
    assertPathChanges('baz', 'bar');
  });

  test('Delivery Until No Changes', function() {
    var obj = { foo: { bar: 5 }};
    var callbackCount = 0;

    function callback() {
      callbackCount++;
      if (!obj.foo.bar)
        return;

      obj.foo.bar--;
    }

    observer.observe(callback, obj, 'foo . bar');
    obj.foo.bar--;
    observer.deliver(callback);

    assert.equal(5, callbackCount);
  });

  test('Path disconnect', function() {
    init({ foo: 'bar' }, 'foo');
    obj.foo = 'baz';
    assertPathChanges('baz', 'bar')

    obj.foo = 'bar';
    observer.unobserve(callback);

    obj.foo = 'boo';
    assertNoChanges();
  });

  test('Path discardChanges', function() {
    init({ foo: 'bar' }, 'foo');
    obj.foo = 'baz';
    assertPathChanges('baz', 'bar')

    obj.foo = 'bat';
    observer.discardChanges(callback);
    assertNoChanges();

    obj.foo = 'bag';
    assertPathChanges('bag', 'bat');
  });

  test('Path setValue', function() {
    init({ foo: 'bar' }, 'foo');
    obj.foo = 'baz';

    path.setValueFrom(obj, 'bat');
    assert.strictEqual(obj.foo, 'bat');

    assertPathChanges('bat', 'bar');

    path.setValueFrom(obj, 'bot');
    observer.discardChanges(callback);
    assertNoChanges();
  });

  test('Path NaN', function() {
    init({ val: 1}, 'val');
    obj.val = 0/0;

    // Can't use assertRecords because NaN === NaN is false.
    observer.deliver(callback);
    assert.strictEqual(records.length, 1);
    assert.isTrue(isNaN(records[0].value));
  });

  test('Path Set Value Back To Same', function() {
    init({ foo: 1}, 'foo');

    path.setValueFrom(obj, 2);
    observer.discardChanges(callback);
    assertNoChanges();

    path.setValueFrom(obj, 3);
    path.setValueFrom(obj, 2);
    assertNoChanges();
  });

  test('Path Triple Equals', function() {
    init({}, 'foo');

    obj.foo = null;
    assertPathChanges(null, undefined);

    obj.foo = undefined;
    assertPathChanges(undefined, null);
  });

  test('Path Simple', function() {
    init({ foo: null }, 'foo');
    obj.foo = undefined;

    assertPathChanges(undefined, null);

    obj.foo = 1;
    assertPathChanges(1, undefined);

    obj.foo = 2;
    assertPathChanges(2, 1);

    delete obj.foo;
    assertPathChanges(undefined, 2);
  });

  test('Path - root is initially null', function(done) {
    init({}, 'foo.bar');

    obj.foo = { };
    then(function() {
      obj.foo.bar = 1;

    }).then(function() {
      assertPathChanges(1, undefined, true);

      done();
    });
  });

  test('Path With Indices', function() {
    init([], '[0]');
    obj.push(1);
    assertPathChanges(1, undefined);
  });

  test('Path Observation', function() {
    init({
      a: {
        b: {
          c: 'hello, world'
        }
      }
    }, 'a.b.c');

    obj.a.b.c = 'hello, mom';
    assertPathChanges('hello, mom', 'hello, world');

    obj.a.b = {
      c: 'hello, dad'
    };
    assertPathChanges('hello, dad', 'hello, mom');

    obj.a = {
      b: {
        c: 'hello, you'
      }
    };
    assertPathChanges('hello, you', 'hello, dad');

    obj.a.b = 1;
    assertPathChanges(undefined, 'hello, you');

    // Stop observing
    observer.unobserve(callback);

    obj.a.b = {c: 'hello, back again -- but not observing'};
    assertNoChanges();

    // Resume observing
    observer.observe(callback, obj, path);

    obj.a.b.c = 'hello. Back for reals';
    assertPathChanges('hello. Back for reals',
        'hello, back again -- but not observing');
  });

  test('Path Set To Same As Prototype', function() {
    init(createObject({
      __proto__: {
        id: 1
      }
    }), 'id');

    obj.id = 1;
    assertNoChanges();
  });

  test('Path Set Read Only', function() {
    var obj = {};
    Object.defineProperty(obj, 'x', {
      configurable: true,
      writable: false,
      value: 1
    });
    init(obj, 'x');

    obj.x = 2;

    assertNoChanges();
  });

  test('Path Set Shadows', function() {
    init(createObject({
      __proto__: {
        x: 1
      }
    }), 'x');

    obj.x = 2;
    assertPathChanges(2, 1);
  });

  test('Delete With Same Value On Prototype', function() {
    init(createObject({
      __proto__: {
        x: 1,
      },
      x: 1
    }), 'x');


    delete obj.x;
    assertNoChanges();
  });

  test('Delete With Different Value On Prototype', function() {
    init(createObject({
      __proto__: {
        x: 1,
      },
      x: 2
    }), 'x');

    delete obj.x;
    assertPathChanges(1, 2);
  });

  test('Value Change On Prototype', function() {
    var proto = {
      x: 1
    }
    init(createObject({
      __proto__: proto
    }), 'x');

    obj.x = 2;
    assertPathChanges(2, 1);

    delete obj.x;
    assertPathChanges(1, 2);

    proto.x = 3;
    assertPathChanges(3, 1);
  });

  // FIXME: Need test of observing change on proto.

  test('Delete Of Non Configurable', function() {
    var obj = {};
    Object.defineProperty(obj, 'x', {
      configurable: false,
      value: 1
    });
    init(obj, 'x');

    delete obj.x;
    assertNoChanges();
  });

  test('Notify', function() {
    if (typeof Object.getNotifier !== 'function')
      return;

    var obj = {
      a: {}
    }

    var _b = 2;

    Object.defineProperty(obj.a, 'b', {
      get: function() { return _b; },
      set: function(b) {
        Object.getNotifier(this).notify({
          type: 'update',
          name: 'b',
          oldValue: _b
        });

        _b = b;
      }
    });
    init(obj, 'a.b');

    _b = 3;
    assertPathChanges(3, 2);

    obj.a.b = 4; // will be observed.
    assertPathChanges(4, 3);
  });

  test('issue-161', function(done) {
    var model = { model: 'model' };
    function callback1() {
      called = true;
    }
    observer.observe(callback1, model, 'obj.bar');
    var called = false

    function callback2() {
      model.obj.bar = true;
    }
    observer.observe(callback2, model, 'obj');

    model.obj = { 'obj': 'obj' };
    model.obj.foo = true;

    then(function() {
      assert.strictEqual(called, true);
      done();
    });
  });

  test('Multiple', function() {
    init({ a: 1, b: 2, c: 3 }, 'a');
    observer.observe(callback, obj, 'b');
    observer.observe(callback, obj, Path.get('c'));
    assertNoChanges();

    obj.a = -10;
    obj.b = 20;
    obj.c = 30;

    assertCompoundPathChanges([-10, 20, 30], [1, 2, 3],
                              ['a', 'b', 'c']);

    obj.a = 'a';
    obj.c = 'c';
    assertCompoundPathChanges(['a', 'c'], [-10, 30],
                              ['a', 'c']);

    obj.a = 2;
    obj.b = 3;
    obj.c = 4;

    assertCompoundPathChanges([2, 3, 4], ['a', 20, 'c'],
                              ['a', 'b', 'c']);

    obj.a = 'z';
    obj.b = 'y';
    obj.c = 'x';
    observer.discardChanges(callback);
    assertNoChanges();

    assert.strictEqual('z', obj.a);
    assert.strictEqual('y', obj.b);
    assert.strictEqual('x', obj.c);
    assertNoChanges();
  });

  test('Report Changes From Observe', function() {
    init({ a: 1, b: 2, c: 3 }, 'a');

    obj.a = -10;
    obj.b = 20;
    observer.observe(callback, obj, 'b');
    assertCompoundPathChanges([-10], [1],['a']);

    obj.a = -20;
    obj.b = 40;
    obj.c = 50;
    observer.observe(callback, obj, 'c');
    assertCompoundPathChanges([-20, 40], [-10, 20],['a', 'b']);
  });
});

suite('observeArray Tests', function() {

  function init(objValue, pathString) {
    obj = objValue,
    path = Path.get(pathString);
    observer.observeArray(callback, obj, path);
  }

  setup(doSetup);

  teardown(doTeardown);

  function assertArrayChanges(expectSplices, dontDeliver) {
    if (!dontDeliver)
      observer.deliver(callback);

    assert.strictEqual(records.length, 1);

    var splices = records[0].splices;

    splices.forEach(function(splice) {
      ensureNonSparse(splice.removed);
    });

    expectSplices.forEach(function(splice) {
      ensureNonSparse(splice.removed);
    });

    assert.deepEqual(expectSplices, splices);
    records = undefined;
  }

  function ensureNonSparse(arr) {
    for (var i = 0; i < arr.length; i++) {
      if (i in arr)
        continue;
      arr[i] = undefined;
    }
  }

  function applySplicesAndAssertDeepEqual(orig, copy) {
    observer.deliver(callback);

    if (records) {
      var splices = records[0].splices;
      Observer.applySplices(copy, orig, splices);
    }

    ensureNonSparse(orig);
    ensureNonSparse(copy);
    assert.deepEqual(orig, copy);
    records = undefined;
  }

  function assertEditDistance(orig, expectDistance) {
    observer.deliver(callback);
    var splices = records[0].splices;
    var actualDistance = 0;

    if (records) {
      splices.forEach(function(splice) {
        actualDistance += splice.addedCount + splice.removed.length;
      });
    }

    assert.deepEqual(expectDistance, actualDistance);
    records = undefined;
  }

  function arrayMutationTest(obj, operations) {
    var copy = obj.slice();
    init(obj);

    operations.forEach(function(op) {
      switch(op.name) {
        case 'delete':
          delete obj[op.index];
          break;

        case 'update':
          obj[op.index] = op.value;
          break;

        default:
          obj[op.name].apply(obj, op.args);
          break;
      }
    });

    applySplicesAndAssertDeepEqual(obj, copy);
  }

  test('Delivery Until No Changes', function() {
    obj = [0, 1, 2, 3, 4];
    path = Path.get('');

    var callbackCount = 0;
    function callback() {
      callbackCount++;
      obj.shift();
    }

    observer.observeArray(callback, obj, path);

    obj.shift();
    observer.deliver(callback);

    assert.equal(5, callbackCount);
  });

  test('Ref new array', function() {
    init({ arr: [0] }, 'arr');

    obj.arr[0] = 1;

    assertArrayChanges([{
      index: 0,
      removed: [0],
      addedCount: 1
    }]);

    obj.arr = [1];
    assertNoChanges();

    obj.arr = [2, 3];
    assertArrayChanges([{
      index: 0,
      removed: [1],
      addedCount: 2
    }]);

    obj.arr.pop();
    assertArrayChanges([{
      index: 1,
      removed: [3],
      addedCount: 0
    }]);

    obj.arr = [2, 4];
    assertArrayChanges([{
      index: 1,
      removed: [],
      addedCount: 1
    }]);
  });

  test('Array disconnect', function() {
    init([0]);

    obj[0] = 1;

    assertArrayChanges([{
      index: 0,
      removed: [0],
      addedCount: 1
    }]);

    observer.unobserve(callback);

    obj[1] = 2;
    assertNoChanges();
  });

  test('Array discardChanges', function() {
    init([1]);

    obj.push(2);
    assertArrayChanges([{
      index: 1,
      removed: [],
      addedCount: 1
    }]);

    obj.push(3);
    observer.discardChanges(callback);
    assertNoChanges();

    obj.pop();
    assertArrayChanges([{
      index: 2,
      removed: [3],
      addedCount: 0
    }]);
  });

  test('Array', function() {
    init([0, 1]);

    obj[0] = 2;

    assertArrayChanges([{
      index: 0,
      removed: [0],
      addedCount: 1
    }]);

    obj[1] = 3;
    assertArrayChanges([{
      index: 1,
      removed: [1],
      addedCount: 1
    }]);
  });

  test('Array Set Same', function() {
    init([1]);

    obj[0] = 1;
    assertNoChanges();
  });

  test('Array Splice', function() {
    init([0, 1]);

    obj.splice(1, 1, 2, 3); // [0, 2, 3]
    assertArrayChanges([{
      index: 1,
      removed: [1],
      addedCount: 2
    }]);

    obj.splice(0, 1); // [2, 3]
    assertArrayChanges([{
      index: 0,
      removed: [0],
      addedCount: 0
    }]);

    obj.splice();
    assertNoChanges();

    obj.splice(0, 0);
    assertNoChanges();

    obj.splice(0, -1);
    assertNoChanges();

    obj.splice(-1, 0, 1.5); // [2, 1.5, 3]
    assertArrayChanges([{
      index: 1,
      removed: [],
      addedCount: 1
    }]);

    obj.splice(3, 0, 0); // [2, 1.5, 3, 0]
    assertArrayChanges([{
      index: 3,
      removed: [],
      addedCount: 1
    }]);

    obj.splice(0); // []
    assertArrayChanges([{
      index: 0,
      removed: [2, 1.5, 3, 0],
      addedCount: 0
    }]);
  });

  test('Array Splice Truncate And Expand With Length', function() {
    init(['a', 'b', 'c', 'd', 'e']);

    obj.length = 2;
    assertArrayChanges([{
      index: 2,
      removed: ['c', 'd', 'e'],
      addedCount: 0
    }]);

    obj.length = 5;
    assertArrayChanges([{
      index: 2,
      removed: [],
      addedCount: 3
    }]);
  });

  test('Array Splice Delete Too Many', function() {
    init(['a', 'b', 'c']);

    obj.splice(2, 3); // ['a', 'b']
    assertArrayChanges([{
      index: 2,
      removed: ['c'],
      addedCount: 0
    }]);
  });

  test('Array Length', function() {
    init([0, 1]);

    obj.length = 5; // [0, 1, , , ,];
    assertArrayChanges([{
      index: 2,
      removed: [],
      addedCount: 3
    }]);

    obj.length = 1;
    assertArrayChanges([{
        index: 1,
        removed: [1, , , ,],
        addedCount: 0
    }]);

    obj.length = 1;
    assertNoChanges();
  });

  test('Array Push', function() {
    init([0, 1]);

    obj.push(2, 3); // [0, 1, 2, 3]
    assertArrayChanges([{
      index: 2,
      removed: [],
      addedCount: 2
    }]);

    obj.push();
    assertNoChanges();
  });

  test('Array Pop', function() {
    init([0, 1]);

    obj.pop(); // [0]
    assertArrayChanges([{
      index: 1,
      removed: [1],
      addedCount: 0
    }]);

    obj.pop(); // []
    assertArrayChanges([{
      index: 0,
      removed: [0],
      addedCount: 0
    }]);

    obj.pop();
    assertNoChanges();
  });

  test('Array Shift', function() {
    init([0, 1]);

    obj.shift(); // [1]
    assertArrayChanges([{
      index: 0,
      removed: [0],
      addedCount: 0
    }]);

    obj.shift(); // []
    assertArrayChanges([{
      index: 0,
      removed: [1],
      addedCount: 0
    }]);

    obj.shift();
    assertNoChanges();
  });

  test('Array Unshift', function() {
    init([0, 1]);

    obj.unshift(-1); // [-1, 0, 1]
    assertArrayChanges([{
      index: 0,
      removed: [],
      addedCount: 1
    }]);

    obj.unshift(-3, -2); // []
    assertArrayChanges([{
      index: 0,
      removed: [],
      addedCount: 2
    }]);

    obj.unshift();
    assertNoChanges();
  });

  test('Array Tracker Contained', function() {
    arrayMutationTest(
        ['a', 'b'],
        [
          { name: 'splice', args: [1, 1] },
          { name: 'unshift', args: ['c', 'd', 'e'] },
          { name: 'splice', args: [1, 2, 'f'] }
        ]
    );
  });

  test('Array Tracker Delete Empty', function() {
    arrayMutationTest(
        [],
        [
          { name: 'delete', index: 0 },
          { name: 'splice', args: [0, 0, 'a', 'b', 'c'] }
        ]
    );
  });

  test('Array Tracker Right Non Overlap', function() {
    arrayMutationTest(
        ['a', 'b', 'c', 'd'],
        [
          { name: 'splice', args: [0, 1, 'e'] },
          { name: 'splice', args: [2, 1, 'f', 'g'] }
        ]
    );
  });

  test('Array Tracker Left Non Overlap', function() {
    arrayMutationTest(
        ['a', 'b', 'c', 'd'],
        [
          { name: 'splice', args: [3, 1, 'f', 'g'] },
          { name: 'splice', args: [0, 1, 'e'] }
        ]
    );
  });

  test('Array Tracker Right Adjacent', function() {
    arrayMutationTest(
        ['a', 'b', 'c', 'd'],
        [
          { name: 'splice', args: [1, 1, 'e'] },
          { name: 'splice', args: [2, 1, 'f', 'g'] }
        ]
    );
  });

  test('Array Tracker Left Adjacent', function() {
    arrayMutationTest(
        ['a', 'b', 'c', 'd'],
        [
          { name: 'splice', args: [2, 2, 'e'] },
          { name: 'splice', args: [1, 1, 'f', 'g'] }
        ]
    );
  });

  test('Array Tracker Right Overlap', function() {
    arrayMutationTest(
        ['a', 'b', 'c', 'd'],
        [
          { name: 'splice', args: [1, 1, 'e'] },
          { name: 'splice', args: [1, 1, 'f', 'g'] }
        ]
    );
  });

  test('Array Tracker Left Overlap', function() {
    arrayMutationTest(
        ['a', 'b', 'c', 'd'],
        [
          // a b [e f g] d
          { name: 'splice', args: [2, 1, 'e', 'f', 'g'] },
          // a [h i j] f g d
          { name: 'splice', args: [1, 2, 'h', 'i', 'j'] }
        ]
    );
  });

  test('Array Tracker Prefix And Suffix One In', function() {
    arrayMutationTest(
        ['a', 'b', 'c', 'd'],
        [
          { name: 'unshift', args: ['z'] },
          { name: 'push', arg: ['z'] }
        ]
    );
  });

  test('Array Tracker Shift One', function() {
    arrayMutationTest(
        [16, 15, 15],
        [
          { name: 'shift', args: ['z'] }
        ]
    );
  });

  test('Array Tracker Update Delete', function() {
    arrayMutationTest(
        ['a', 'b', 'c', 'd'],
        [
          { name: 'splice', args: [2, 1, 'e', 'f', 'g'] },
          { name: 'update', index: 0, value: 'h' },
          { name: 'delete', index: 1 }
        ]
    );
  });

  test('Array Tracker Update After Delete', function() {
    arrayMutationTest(
        ['a', 'b', undefined, 'd'],
        [
          { name: 'update', index: 2, value: 'e' }
        ]
    );
  });

  test('Array Tracker Delete Mid Array', function() {
    arrayMutationTest(
        ['a', 'b', 'c', 'd'],
        [
          { name: 'delete', index: 2 }
        ]
    );
  });

  test('Array Random Case 1', function() {
    init(['a','b']);
    var copy = obj.slice();

    obj.splice(0, 1, 'c', 'd', 'e');
    obj.splice(4,0,'f');
    obj.splice(3,2);

    applySplicesAndAssertDeepEqual(obj, copy);
  });

  test('Array Random Case 2', function() {
    init([3,4]);
    var copy = obj.slice();

    obj.splice(2,0,8);
    obj.splice(0,1,0,5);
    obj.splice(2,2);

    applySplicesAndAssertDeepEqual(obj, copy);
  });

  test('Array Random Case 3', function() {
    init([1,3,6]);
    var copy = obj.slice();

    obj.splice(1,1);
    obj.splice(0,2,1,7);
    obj.splice(1,0,3,7);

    applySplicesAndAssertDeepEqual(obj, copy);
  });

  test('Array Tracker Fuzzer', function() {
    var testCount = 64;

    console.log('Fuzzing spliceProjection ' + testCount +
                ' passes with ' + ArrayFuzzer.operationCount + ' operations each.');

    for (var i = 0; i < testCount; i++) {
      console.log('pass: ' + i);
      var fuzzer = new ArrayFuzzer();
      fuzzer.go();
      ensureNonSparse(fuzzer.arr);
      ensureNonSparse(fuzzer.copy);
      assert.deepEqual(fuzzer.arr, fuzzer.copy);
    }
  });

  test('Array Tracker No Proxies Edits 1', function() {
    init([]);

    obj.length = 0;
    obj.push(1, 2, 3);
    assertEditDistance(obj, 3);
  });

  test('Array Tracker No Proxies Edits 2', function() {
    init(['x', 'x', 'x', 'x', '1', '2', '3']);

    obj.length = 0;
    obj.push('1', '2', '3', 'y', 'y', 'y', 'y');
    assertEditDistance(obj, 8);
  });

  test('Array Tracker No Proxies Edits 3', function() {
    init(['1', '2', '3', '4', '5']);

    obj.length = 0;
    obj.push('a', '2', 'y', 'y', '4', '5', 'z', 'z');
    assertEditDistance(obj, 7);
  });
});

suite('observeObject Tests', function() {

  function init(objValue, pathString) {
    obj = objValue,
    path = Path.get(pathString);
    observer.observeObject(callback, obj, path);
  }

  setup(doSetup);

  teardown(doTeardown);

  function assertObjectChanges(expect) {
    observer.deliver(callback);

    assert.strictEqual(records.length, 1);

    var added = records[0].added;
    var removed = records[0].removed;
    var changed = records[0].changed;
    var getOldValue = records[0].getOldValue;
    var oldValues = {};

    function collectOldValues(type) {
      Object.keys(type).forEach(function(prop) {
        oldValues[prop] = getOldValue(prop);
      });
    };
    collectOldValues(added);
    collectOldValues(removed);
    collectOldValues(changed);

    assert.deepEqual(expect.added, added);
    assert.deepEqual(expect.removed, removed);
    assert.deepEqual(expect.changed, changed);
    assert.deepEqual(expect.oldValues, oldValues);

    records = undefined;
  }

  test('Delivery Until No Changes', function() {
    var obj = { foo: 5 };
    var callbackCount = 0;
    function callback() {
      callbackCount++;
      if (!obj.foo)
        return;

      obj.foo--;
    }

    observer.observeObject(callback, obj);

    obj.foo--;
    observer.deliver(callback);

    assert.equal(5, callbackCount);
  });

  test('Object disconnect', function() {
    init({ foo: 'bar' });

    obj.foo = 'baz';
    obj.bat = 'bag';
    obj.blaz = 'foo';

    delete obj.foo;
    delete obj.blaz;

    assertObjectChanges({
      added: {
        'bat': 'bag'
      },
      removed: {
        'foo': undefined
      },
      changed: {},
      oldValues: {
        'foo': 'bar',
        'bat': undefined
      }
    });

    obj.foo = 'blarg';

    observer.unobserve(callback);

    obj.bar = 'blaz';
  });

  test('Object discardChanges', function() {
    init({ foo: 'bar' });

    obj.foo = 'baz';
    assertObjectChanges({
      added: {},
      removed: {},
      changed: {
        foo: 'baz'
      },
      oldValues: {
        foo: 'bar'
      }
    });

    obj.blaz = 'bat';
    observer.discardChanges(callback);
    assertNoChanges();

    obj.bat = 'bag';
    assertObjectChanges({
      added: {
        bat: 'bag'
      },
      removed: {},
      changed: {},
      oldValues: {
        bat: undefined
      }
    });
  });

  test('Object observe array', function() {
    init([]);

    obj.length = 5;
    obj.foo = 'bar';
    obj[3] = 'baz';

    assertObjectChanges({
      added: {
        foo: 'bar',
        '3': 'baz'
      },
      removed: {},
      changed: {
        'length': 5
      },
      oldValues: {
        length: 0,
        foo: undefined,
        '3': undefined
      }
    });
  });

  test('Object', function() {
    init({});

    obj.id = 0;
    assertObjectChanges({
      added: {
        id: 0
      },
      removed: {},
      changed: {},
      oldValues: {
        id: undefined
      }
    });

    delete obj.id;
    assertObjectChanges({
      added: {},
      removed: {
        id: undefined
      },
      changed: {},
      oldValues: {
        id: 0
      }
    });

    // Stop observing -- shouldn't see an event
    observer.unobserve(callback);
    obj.id = 101;
    assertNoChanges();

    // Re-observe -- should see an new event again.
    observer.observeObject(callback, obj);
    obj.id2 = 202;;
    assertObjectChanges({
      added: {
        id2: 202
      },
      removed: {},
      changed: {},
      oldValues: {
        id2: undefined
      }
    });
  });

  test('Object Delete Add Delete', function() {
    init({ id: 1 });

    // If mutation occurs in seperate "runs", two events fire.
    delete obj.id;
    assertObjectChanges({
      added: {},
      removed: {
        id: undefined
      },
      changed: {},
      oldValues: {
        id: 1
      }
    });

    obj.id = 1;
    assertObjectChanges({
      added: {
        id: 1
      },
      removed: {},
      changed: {},
      oldValues: {
        id: undefined
      }
    });

    // If mutation occurs in the same "run", no events fire (nothing changed).
    delete obj.id;
    obj.id = 1;
    assertNoChanges();
  });

  test('Object Set Undefined', function() {
    init({});

    obj.x = undefined;
    assertObjectChanges({
      added: {
        x: undefined
      },
      removed: {},
      changed: {},
      oldValues: {
        x: undefined
      }
    });
  });
});
