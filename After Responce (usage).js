// Tests
// Path in responce,  Expected value, Comparison type [eql|above|below]
test_grpc("info.result", "", "eql")
test_grpc("info.data", "ASSIGNED", "eql")
test_grpc("info.result_code", "TASK_ALREADY_ASSIGNED", "eql")
test_grpc("info.result_message", "TASK_ALREADY_ASSIGNED", "eql")
test_grpc("user_task_id", "NULL", "NULL")
test_grpc("candidate_group", "NULL", "NULL")
//test_grpc("user_task_id.value", "(RANDOM_GUID)", "guid")
//test_grpc("assignee.value", "(RANDOM_GUID)", "guid")
//test_grpc("user_task_id.value", "10b1098a-e43b-45c4-914d-e86ef2a983b1", "eql")
//test_grpc("assignee.value", "a2c3ac37-6648-4cea-81b8-63d079d4481e", "eql")
 
// Check Parameter
// Parameter [statusCode|responseTime], Expected value, Comparison type [eql|above|below]
check("statusCode", "0", "eql")
//check("statusCode", "1", "eql")
check("responseTime", "1000", "below")
//check("responseTime", "1", "below")
//check("responseTime", "1", "above")
 
// Set Variables
// Variable Name, Path in responce, Space [collection|env]
setvar("VariableName", "info.result", "collection"); // collectionVariables
setvar("VariableName", "info.result", "env"); // environment
 
// Get Variables
// val = pm.collectionVariables.get("VariableName")
// val = pm.environment.get("VariableName")
 
// Basic Tests
basictests()