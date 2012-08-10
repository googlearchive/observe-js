ChangeSummary
=============

A utility library which depends upon the ECMAScript Object.observe strawman and exposes JS Data Path/Object/Array observation.

* Object.observe strawman: http://wiki.ecmascript.org/doku.php?id=strawman:observe

Overview
--------
The proposed Object.observe() mechanism allows observation of mutations to JavaScript objects. It offers the following abilities:

* Find out when the value of a *data* property changes (changes accessor properties, e.g. getters/setters are not detected -- more on this below).
* Find out when an object has new properties added and existing properties deleted.
* Find out when existing properties are reconfigured.

The basic pattern of interaction is:

* Register an observer, which is just a function with Object.observe(myObj, callback). Sometime later, your callback will be invoked with an Array of change records, representing the in-order sequence of changes which occurred to myObj.

"Sometime later?"
-----------------
Object.observe() in conceptually similar to DOM Mutation Observers (https://developer.mozilla.org/en-US/docs/DOM/DOM_Mutation_Observers), and delivery of change records happens with similar timing. The easiest way to think about this is that your change records will be delivered immediately after the current script invocation exits. In the browser context, this will be most often be after each event handler fires. Delivery continues until there are no more observers with pending change records.

Usage
-----
ChangeSummary uses Object.observe() under the covers and exposes a high-level API, which is conceptually similar to the MutationSummary library (http://code.google.com/p/mutation-summary/).

  var observer = new ChangeSummary(function(summaries) {
    summaries.forEach(function(summary) {
      summary.object; // The object for which this summary describes changes.
      summary.newProperties; // An Array of property names which new since creation or the last callback.
      summary.deletedProperties; // An Array of property names which have been deleted since creation or the last callback.
      summary.arraySplices; // An Array of objects, each of which describes a "splice", if Array.isArray(summary.object).
      summary.pathValueChanged; // An Array of path strings, whose value has changed.
      summary.getOldPathValue(path); // A function which returns previous value of the changed path.
      summary.getNewPathValue(path); // A function which returns the new value (as of callback) of the changed path.
    });
  })

  var obj {
    prop1: 1,
    prop2: 2
  };
  observer.observePropertySet(obj); // Will report any newProperties or deletedProperties on obj.

  var arr = [0, 1, 2];
  observer.observePropertySet(arr); // Will report "splice" mutations which represent changes to index properties of arr,
                                    // as well as any newProperties or deletedProperties which occur with non-index properties.
  var objGraph = {
    foo: {
      bar: 2
    }
  };
  observer.observePathValue(objGraph, 'foo.bar'); // Will report when the value at objGraph.foo.bar changes. If the value is ever
                                                  // unreachable, the value is considered to be undefined.

Observing accessor properties (getter/setters)
----------------------------------------------
The Object.observe() mechanism only reports changes in value to data properties of objects. If a property is configured to be an accessor, nothing is reported about assignments to that accessor.

It is up to the implementation of the accessor to notify when it's value has changed. The ChangeSummary library assumes that any accessor which wishes to be observable does this and does it correctly. E.g.

  var obj = {
    id: 1
  };

  var name_ = '';
  Object.defineOwnProperty(obj. 'name', {
    get: function() { return name_; },
    set: function(name) {
      if (name_ == name)
        return;

      Object.getNotifier(this).notify({
        type: 'updated',
        name: 'name',
        oldValue: _name
      });
      name_ = name;
    }
  })

