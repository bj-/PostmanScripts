// Tests
// Path in responce,  Expected value, Comparison type [eql|above|below]
test("info.result", "", "eql")
test("info.data", "ASSIGNED", "eql")
test("user_task_id", "NULL", "NULL")
test("user_task_id.value", "(RANDOM_GUID)", "guid")
test("created_date_time.value", "YYYY-MM-DDThh:mm:ss.tttZ", "datetime")
test("assignee.value", "a2c3ac37-6648-4cea-81b8-63d079d4481e", "eql")
test("sequences.name", "/^Test #[0-9]{4}$/", "regex")
test("sequences", ["propertyName","value"], "array")
test("someKey", "EMPTY", "EMPTY") // No keys in this key like to "someKey: {},"
test("additionalFields.create_dt", "KEY_EXIST", "KEY_EXIST") // Key exist and has any value, or null

// using if code is Collection's script
utils.test("info.result", "", "eql")

header("Content-Length", 1000, "below")
 
// Check Parameter
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
 
// Basic Tests
basictests()