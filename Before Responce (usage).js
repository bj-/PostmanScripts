// =====================================================================
// Before Request — использование (v4)
//
// Первая строка Pre-request - привязка к фреймворку (берите только нужные шаги):
const { login, logout, revokedSession, derive, account, need, needAccounts, needFlag, needEnv,
        set, random, uuid, now, email, longString, pick, call, failLogins, wait, clearCookies } = utils.bind(pm, console);
//
// Шаги выполняются строго по очереди, даже если внутри асинхронные запросы.
// cookie jar очищается до и после подготовки: запрос несёт только cookie из своего заголовка
// (Cookie: __Host-sid={{sid}}). Ошибка шага видна первым тестом в Post-response.
// =====================================================================

// ---- Условия запуска (не выполнено -> запрос пропускается, в отчёте [SKIPPED])
needFlag("allowDestructive")                  // env allowDestructive === "true"
needEnv("LockoutAccount")                     // env задана
needAccounts(2)                               // в AdminAccounts не меньше 2 разных учёток
need(pm.variables.get("x") !== "", "reason")  // произвольное условие

// ---- Учётки (env AdminAccounts: [{"login": "...", "password": "...", "role": "root"}])
account(0)                                    // {{current_login}} / {{current_pass}} = учётка #0
account("other", "b")                         // {{b_login}} / {{b_pass}} = учётка, отличная от current; также "random" | роль
login("sid")                                  // вход учёткой #0: {{sid}} = cookie, {{sid_userId}}, {{sid_role}}, {{sid_login}}, {{sid_pass}}
login("sid_b", "other", { headers: { "User-Agent": "{{ua}}" } })
logout("sid")                                 // закрыть сессию {{sid}}
revokedSession("sid_revoked")                 // вход + выход: значение закрытой сессии
derive("sid_bad", "sid", "tamper")            // испорченная сессия: tamper | truncate | suffix | swapcase

// ---- Данные
set("upper_login", pm.variables.get("current_login").toUpperCase())
random("garbage", 43)                         // случайная строка; random("temp_pass", 12, "Fw-") - с префиксом
uuid("random_uuid")
now("started")                                // ISO-время начала (для проверки аудита)
email("long_email", 255)                      // email ровно 255 символов
longString("pw129", 129, "Z")

// ---- Запросы
pick("layoutId", "/api/layouts", "id", { status: "draft" })               // поле первого подходящего элемента
pick("lang", "/api/layouts/{{layoutId}}/languages", "lang")              // {{...}} подставляется в момент шага
pick("otherId", "/api/layouts", "id", { id: "!{{layoutId}}" })           // "!x" - не равно x
pick("sessionId", "/api/auth/sessions?limit=200", "sessionId", { current: true }, { as: "sid_other" })   // с cookie {{sid_other}}
call("DELETE", "/api/auth/sessions/{{sessionId}}", { as: "sid", expect: 204 })
call("POST", "/api/layouts/{{layoutId}}/validate", { as: "sid", expect: 200 }, { var: "valid", path: "ok" })
failLogins(10, "{{lock_login}}", { xff: true })   // N неудачных входов (с ротацией X-Forwarded-For)
wait(1500)

// ---- Прочее (v3)
utils.convert("base64", "collection", "xml_tiny_signed", "xml_tiny_signed_base64")
let creds = utils.getAdminAccountCreds();     // случайная учётка из AdminAccounts
// utils.randomVal("INT", 1, 100) | ("SNILS_F") | ("TEXT", null, null, 100) | ("DATE", "1950-01-01", "2020-01-01") | ("BOOLEAN")
