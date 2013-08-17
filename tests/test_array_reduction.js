suite('ArrayReduction Tests',function(){
  var array;
  var obj;
  var reductionObserver;

  setup(function(){
    obj = {};
    array = [
      {id:0},
      {id:1}
    ];

    reductionObserver = ArrayReduction.defineProperty(obj,'reducedValue',{
      array: array,
      path: 'id',
      initial: [],
      reduce: function(value,cur,i){
        value.push([cur.id,i]);
        return value;
      }
    });
  });

  teardown(function(){
    reductionObserver.close();
  });

  function assertReduction(expectedReducedValue){
    assert.deepEqual(obj.reducedValue,expectedReducedValue, 'Reduced Value');

    // Reset the reduced value array for next assertion
    obj.reducedValue.splice(0);
  };

  test('Calls callback with initial values of array',function(){
    assertReduction([
      [0,0],
      [1,1]
    ]);
  });

  test('Array Shift',function(){
    // Reset the reduced value array
    obj.reducedValue.splice(0);

    array.shift();
    assertReduction([
      [1,0]
    ]);

    // Verify PathObserver after splice still work.
    array[0].id = 777;
    assertReduction([
      [777,0]
    ]);

    array.shift();
    assertReduction([]);
  });

  test('Array Unshift',function(){
    // Reset the reduced value array
    obj.reducedValue.splice(0);

    array.unshift({id:-1});
    assertReduction([
      [-1,0],
      [ 0,1],
      [ 1,2]
    ]);

    // Verify PathObserver after splice still work.
    array[1].id = 777;
    assertReduction([
      [ -1,0],
      [777,1],
      [  1,2]
    ]);
  });
});