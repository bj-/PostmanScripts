// Tests
//   test([Path in responce], [Expected value], [Comparison type [eql|above|below]]

// Equal responce value to expected.
//   {"key": "exp value"}
//   {"key.subkey": "exp value"}
//   {"key[0].subkey": "exp value"}
//   {"[0].key.subkey": "exp value"}
test("info.result", "", "eql")
test("info.data", "ASSIGNED", "eql")
test("assignee.value", "a2c3ac37-6648-4cea-81b8-63d079d4481e", "eql")
// value is NULL. {"key": null}
test("user_task_id", "NULL", "NULL")
// Key exist, values EMPTY. {"key": ""}
test("someKey", "EMPTY", "EMPTY") // No keys in this key like to "someKey: {},"
// Key exist, values in ["" | null | "some value" | EMPTY]. 
//   {"key": ""}
//   {"key": null}
//   {"key": "some value"}
//   {"key": {} }
test("additionalFields.create_dt", "KEY_EXIST", "KEY_EXIST") // Key exist and has any value, or null
// value is random GUID (check for GUID format by regex)
test("user_task_id.value", "(RANDOM_GUID)", "guid")
// value is correspond to mask (check by regex). Supported only this examples
test("created_date_time.value", "YYYY-MM-DDThh:mm:ss.tttZ", "datetime")
// check value by custom regex
test("sequences.name", "/^Test #[0-9]{4}$/", "regex")

// Arrays. { "key": [ { "subkey1": "val1" }, { "subkey2": "val2" }, ... ] }
// Array elements count is equal to XX.
test("key", 10, "array_count")
// Array elements count is more than XX.
test("key", 10, "array_count_above")
// Array elements count is less than XX.
test("key", 10, "array_count_below")
// Array keys exist in expect list (all).
test("key", ["key1", "key2", "key3"], "array_compare_keysInExp")
// Array has keys from expect list (all).
test("key", ["key1", "key2", "key3"], "array_compare_expInKeys")

// TODO. TO BE DESCRIPBE. Special function
test("sequences", ["propertyName","value"], "array")

// INT value: abofe or below
//   expect value more than XX. { "key": 20 }
test("info.result", 10, "above")
//   expect value less than XX. { "key": 5 }
test("info.result", 10, "below")

// For REST and other when code can be placed in collection script (not for gRPC, because in gRPC calls each request should be containt functions localy)
// using if code is Collection's script
utils.test("info.result", "", "eql")


// Headers check
header("Content-Length", 1000, "below")


// Check Parameters
// Parameter [statusCode|responseTime], Expected value, Comparison type [eql|above|below]
check("statusCode", 0, "eql")
//check("statusCode", 1, "eql")
check("responseTime", 1000, "below")
//check("responseTime", 1, "below")
check("responseTime", 1, "above")
 

// Set Variables
// Variable Name, Path in responce, Space [collection|env]
setvar("VariableName", "info.result", "collection"); // collectionVariables
setvar("VariableName", "info.result", "env"); // environment

 
// Get Variables
// val = pm.collectionVariables.get("VariableName")
// val = pm.environment.get("VariableName")

 
// Basic Tests (Status code, content-type)
basictests()