// =====================================================================
// After Response — использование (v4)
//
// Первая строка Post-response каждого запроса - привязка к фреймворку:
const { test, setVar } = utils.bind(pm, console);   // framework hook
//
// Дальше только вызовы:
//   test([тип], [путь/имя], [ожидание], [вид сравнения], ["silent"])
//   "silent" - тест виден в интерфейсе только при падении
// В ожидании можно писать "{{переменная}}" - подставится значение.
// =====================================================================

// ---- Статус и форма ошибки
test("status", 200)                                 // видимая проверка статуса
test("status", [400, 415])                          // один из
test("error", 401)                                  // статус + {statusCode, message, error:"Unauthorized"} + нет утечек
test("error", 400, "password")                      // ... и message упоминает поле
test("noleak")                                      // нет стека/путей к исходникам и ключей password/hash/token/sid

// ---- Служебные параметры и заголовки
test("check", "statusCode", 200, "eql", "silent")
test("check", "statusCode", 200, "not_eql")
test("check", "responseTime", 2000, "below")
test("check", "protocol", "https", "eql")
test("header", "X-Content-Type-Options", "nosniff", "eql")
test("header", "X-Powered-By", "KEY_NOT_EXIST", "KEY_NOT_EXIST")
test("header", "Access-Control-Allow-Origin", "https://evil.example", "not_eql")   // отсутствие заголовка - тоже pass
test("basic", 200)                                  // статус + Content-Type одним вызовом

// ---- Тело ответа. Путь: "key" | "key.subkey" | "key[0].subkey" | "[0].key" | "" (корень)
test("schema", "Account")                           // схема из FW_SCHEMAS (контракт admin)
test("schema", "", { type: "object" })              // или своя схема
test("key", "email", "{{current_login}}", "eql")
test("key", "role", "/^(root|admin)$/", "regex")
test("key", "id", "(RANDOM_GUID)", "guid")
test("key", "createdAt", "YYYY-MM-DDThh:mm:ss.tttZ", "datetime")   // также YYYY-MM-DDThh:mm:ssZ | YYYY-MM-DD | ISO
test("key", "createdAt", 300, "recent")             // не дальше 300 c от текущего времени
test("key", "renewedAt", "{{before}}", "datetime_after")
test("key", "password", "KEY_NOT_EXIST", "KEY_NOT_EXIST")
test("key", "total", "number", "type")              // string | number | integer | boolean | object | array | null
test("key", "", ["id", "email"], "keys_exact")      // также keys_include | keys_exclude
test("key", "", ["password", "hash"], "deep_keys_exclude")
test("key", "", "{{ref_body}}", "json_eql")         // тело целиком равно эталону (объект или JSON-строка)
test("key", "role", ["root", "admin"], "oneof")    // также not_oneof | not_eql | between [min, max]
test("key", "name", 3, "min_length")                // также length | max_length
test("body", "", "EMPTY")                           // 204 без тела

// ---- JWT в теле (разбор без проверки подписи: header, claims, ttl = exp - iat)
test("jwt", "accessToken", { "header.alg": "HS256", "claims.type": "access", "claims.sid": "KEY_EXIST", ttl: [60, 86400] })
test("jwt", "refreshToken", { "claims.sub": "{{sub1}}", "claims.jti": "!{{jti1}}", "claims.type": "/^refresh$/" })
test("body", "", "{{sid}}", "not_contains")         // сырое тело не содержит строку (также contains | regex | not_regex)

// ---- Массивы
test("key", "sessions", 10, "array_count")             // ровно / array_count_above / array_count_below
test("key", "sessions", ["email", "{{sid_login}}"], "array")            // есть элемент с email == ...
test("key", "sessions", ["sessionId", "{{sid}}"], "array_none")         // нет элемента с таким значением
test("key", "items", ["status", "published", "eql"], "array_each")   // каждый элемент: [путь, ожидание, вид]
test("key", "sessions", ["current", true, "email", "{{sid_login}}", "eql"], "array_where")   // элементы с current=true: email == ...
test("key", "", ["key", "version"], "array_sorted")                  // по возрастанию; { by: ["createdAt"], desc: true }
test("key", "", "id", "array_unique")
test("key", "key", ["key1", "key2"], "array_compare_keysInExp")
test("key", "key", ["key1", "key2"], "array_compare_expInKeys")

// ---- Cookie (Set-Cookie ответа)
test("cookie", "__Host-sid", "ISSUED", "state")     // также NOT_ISSUED | CLEARED (Max-Age=0)
test("cookie", "__Host-sid", ["HttpOnly", "Secure", "Path=/", "SameSite=Lax|Strict"], "attrs")
test("cookie", "__Host-sid", ["Domain"], "no_attrs")
test("cookie", "__Host-sid", 86401, "max_age_below")
test("cookie", "__Host-sid", "{{sid_first}}", "not_eql")   // значение cookie: любые виды сравнения
test("cookie", "__Host-sid", ["Secure", "Path=/"], "cleared_attrs")   // атрибуты стирающей cookie (для __Host- обязательны)
test("cookie", "__Host-sid", ["Domain"], "cleared_no_attrs")

// ---- Асинхронные пробы: дополнительные запросы, результаты появятся отдельными тестами
test("session", "{{sid}}", "DEAD")                  // GET /api/auth/sessions с cookie: ALIVE=200, DEAD=401
test("login", ["{{sid_login}}", "{{new_pass}}"], 200)
test("call", { method: "GET", path: "/api/documents/{{documentId}}", cookie: "{{sid}}" }, { status: 200, path: "status", value: "draft" })
test("authMatrix", "no_cookie", 401)                // все 23 защищённые операции (варианты - FW_AUTH_VARIANTS)
test("pathMatrix", "/api/auth/sessions")            // варианты пути без сессии не дают 2xx
test("roleMatrix")                                  // env RoleMatrix + роли в AdminAccounts
test("password", "{{sid_login}}", ["{{sid_pass}}", "{{temp_pass}}"], "CHANGED")   // + автоматический возврат пароля
test("enumTiming", { known: "{{current_login}}", rounds: 5 }, 150)
test("loginLatency", 20, 2000)                      // p95 логина (NFR-1)
test("parallel", { method: "GET", path: "/api/auth/me", cookie: "{{sid}}", count: 10 }, { status: [200] })   // гонки: N запросов разом, без 5xx
test("parallel", { method: "POST", path: "/api/auth/login", body: { email: "{{current_login}}", password: "{{current_pass}}" }, count: 5 },
     { status: [200], distinct: "cookie:__Host-sid" })     // ... и значения поля/заголовка различаются
test("closeSessions", { as: "{{sid}}", emails: ["at-admin@example.com"], userAgent: "/PostmanRuntime/" })   // уборка сессий тестовых учёток
test("todo", "FR-35.2 admin accounts", "not in contract")   // пропущенный (skipped) тест-напоминание

// ---- Переменные: значение берётся из ответа. Пространство: collection (по умолчанию) | env | local
setVar("sessionId", "id", "collection")
setVar("sub1", "jwt:accessToken|claims.sub", "env")   // claim из JWT в теле: "jwt:<путь к токену>|<путь в токене>"
setVar("sid", "cookie:__Host-sid", "local")
setVar("reqId", "header:X-Request-Id", "local")

// ---- Если Before Response (utils.bind) пропустил запрос или упал на подготовке,
//      test() покажет это первым тестом: "[SKIPPED] ..." / "Pre-request setup completed".

// ---- Совместимость с v3: старый обязательный блок function test(...) { utils.check / utils.test ... }
//      в запросах продолжает работать - utils.check/test/header/schema/basictests/setvar не менялись.

// Тестовые значения по ссылке (Test-Library ADR 0009): значения {{TD-...}} запроса не исполнены -
// в ответе нет их признаков detect (env td_detect); у значений без detect - пропуск
test("notExecuted")
