// =====================================================================
// After Response — использование
//
// Тесты: test([тип], [путь в ответе], [ожидание], [вид сравнения], ["silent"])
//   тип:  "key" - значение в теле ответа | "check" - statusCode/responseTime/contentLength
//         "header" - заголовок | "schema" - JSON Schema | "basic" - статус + Content-Type
//   "silent" - тест виден в интерфейсе только при падении
// =====================================================================

// ---- Служебные параметры и заголовки
test("check", "statusCode", 200, "eql", "silent")
test("check", "responseTime", 1000, "below", "silent")
test("check", "contentLength", 1000, "below", "silent")
test("header", "Content-Type", "/^application\\/json/", "regex")
test("header", "X-Powered-By", "KEY_NOT_EXIST", "KEY_NOT_EXIST")
test("basic", 200)                                   // статус + Content-Type одним вызовом

// ---- Значения в теле. Путь: "key" | "key.subkey" | "key[0].subkey" | "[0].key" | "" (корень)
test("key", "info.result", "", "eql")
test("key", "info.data", "ASSIGNED", "eql")
test("key", "user_task_id", "NULL", "NULL")                 // {"key": null}
test("key", "someKey", "EMPTY", "EMPTY")                    // {"key": ""} | {} | []
test("key", "additionalFields.create_dt", "KEY_EXIST", "KEY_EXIST")  // ключ есть (значение любое, в т.ч. null)
test("key", "password", "KEY_NOT_EXIST", "KEY_NOT_EXIST")   // ключа НЕТ (не должен утекать в ответ)
test("key", "user_task_id.value", "(RANDOM_GUID)", "guid")
test("key", "createdAt", "YYYY-MM-DDThh:mm:ss.tttZ", "datetime")   // также: YYYY-MM-DDThh:mm:ssZ | YYYY-MM-DD
test("key", "role", "/^(root|admin)$/", "regex")
test("key", "info.result", 10, "above")
test("key", "info.result", 10, "below")

// ---- Массивы. { "key": [ { "subkey1": "val1" }, { "subkey2": "val2" } ] }
test("key", "key", 10, "array_count")                       // ровно XX элементов
test("key", "key", 10, "array_count_above")                 // больше XX
test("key", "key", 10, "array_count_below")                 // меньше XX
test("key", "key", ["key1", "key2"], "array_compare_keysInExp")  // все ключи ответа есть в списке
test("key", "key", ["key1", "key2"], "array_compare_expInKeys")  // все ключи из списка есть в ответе
test("key", "sequences", ["propertyName", "value"], "array")     // в одном из элементов elem.propertyName == value

// ---- Негативные сценарии (форма ошибки: { statusCode, message: string[], error })
test("check", "statusCode", 400, "eql", "silent")
test("key", "statusCode", 400, "eql")
test("key", "error", "Bad Request", "eql")
test("key", "message", 0, "array_count_above")

// ---- Контракт по JSON Schema (из api-1.yaml; nullable поддержан; проверьте, что ajv доступен в вашей версии Postman)
test("schema", "", {
  type: "object",
  required: ["id", "email", "role", "createdAt", "updatedAt"],
  additionalProperties: false,                              // ловит лишние поля, напр. password
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string" },
    role: { type: "string", enum: ["root", "admin"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" }
  }
})

// ---- Переменные: значение берётся из ответа, выставляет его сам запрос
// имя, путь в ответе, пространство [collection|env]
setVar("sessionId", "id", "collection")
// Чтение (не требует вывода в UI, можно напрямую):
// utils.getvar("sessionId")  |  pm.collectionVariables.get("sessionId")  |  pm.environment.get("x")

// ---- Если код лежит в collection-скрипте (не gRPC: в gRPC функции должны быть в каждом запросе):
// utils.test(...) возвращает результат, САМ в интерфейсе ничего не покажет - оборачивайте через test()/report()


// =====================================================================
// ОБЯЗАТЕЛЬНЫЙ БЛОК в каждом запросе. Только код запроса может писать в интерфейс Postman
// (pm.test / console.log) и менять переменные.
// =====================================================================
function test(testtype, path, exp, type, silent = false) {
  let r;
  switch (String(testtype).toUpperCase()) {
    case "CHECK":  r = utils.check(path, exp, type, silent); break;
    case "KEY":    r = utils.test(path, exp, type, silent); break;
    case "HEADER": r = utils.header(path, exp, type, silent); break;
    case "SCHEMA": r = utils.schema(exp, silent); break;
    case "BASIC":  r = utils.basictests(path); break;      // path = ожидаемый статус-код
    default:
      r = { Result: "Unknown test type [" + testtype + "]", Assert: "Use CHECK | KEY | HEADER | SCHEMA | BASIC", Msg: [], Silent: false };
  }
  report(r);
}

function setVar(varName, path, space = "collection") {
  const r = utils.setvar(varName, path, space);
  if (r && r.Value !== undefined) {
    (space === "env" ? pm.environment : pm.collectionVariables).set(varName, r.Value);
  }
  report(r);
}

function report(r) {
  [].concat(r || []).forEach((x) => {
    (x.Msg || []).forEach((m) => console.log(m));
    if (!x.Silent || x.Assert) {
      pm.test(x.Result, () => { if (x.Assert) pm.expect.fail(x.Assert); });
    }
  });
}
