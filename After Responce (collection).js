// =====================================================================
// After Response — единый файл для скрипта уровня КОЛЛЕКЦИИ (Post-response)
// v4: привязка к запросу (utils.bind), новые типы проверок, асинхронные пробы
//
// ПРАВИЛО: код коллекции сам НЕ вызывает pm.test() / console.log() через
// собственный pm — Postman не показывает такой вывод. Поэтому:
//   1. Функции-проверки только считают и ВОЗВРАЩАЮТ объект результата
//      { Msg: [], Result: "", Assert: null, Silent: false, Value: undefined, Var: null }
//        Result - заголовок pm.test;  Assert - текст ошибки (null = пройден)
//        Silent - показывать только при падении;  Msg - строки для console.log
//   2. Запрос одной строкой отдаёт коллекции СВОИ pm и console:
//        const { test, setVar } = utils.bind(pm, console);
//      и дальше пишет только вызовы test(...). pm.test, console.log и
//      pm.sendRequest выполняются через pm запроса.
// Использование - см. "After Responce (usage).js".
// =====================================================================

// Фасад: его вызывают скрипты запросов
utils = {
  bind:         function (reqPm, reqConsole) { return fwBind(reqPm, reqConsole); },
  // результат-возвращающее API (обратная совместимость с v3)
  statusCode:   function (code) { return statusCode(code); },
  test:         function (path, exp, type, silent) { return test(path, exp, type, silent); },
  check:        function (parameter, exp, type, silent) { return check(parameter, exp, type, silent); },
  header:       function (name, exp, type, silent) { return header(name, exp, type, silent); },
  schema:       function (schemaObj, silent) { return schema(schemaObj, silent); },
  basictests:   function (code) { return basictests(code); },
  cookie:       function (name, exp, type, silent) { return cookie(name, exp, type, silent); },
  body:         function (exp, type, silent) { return body(exp, type, silent); },
  error:        function (code, field) { return error(code, field); },
  setvar:       function (varName, path, space) { return setvar(varName, path, space); },
  getvar:       function (varName, space = "collection") { return getvar(varName, space); },
  randomString: function (length = 1) { return randomString(length); },
  schemas:      function () { return FW_SCHEMAS; },
  endpoints:    function () { return FW_ENDPOINTS; },
};


// ============== Constants ===============
var FW_GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
var FW_CERT_RE = /^[0-9a-fA-F]{40}$/;
var FW_DATETIME_FORMATS = {
  "YYYY-MM-DDThh:mm:ss.tttZ": /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{1,3}Z$/,
  "YYYY-MM-DDThh:mm:ssZ":     /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/,
  "YYYY-MM-DD":               /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  "ISO":                      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/,
};
var FW_SESSION_COOKIE = "__Host-sid";
var FW_STATUS_TEXT = {
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed",
  409: "Conflict", 413: "Payload Too Large", 415: "Unsupported Media Type", 422: "Unprocessable Entity",
  423: "Locked", 429: "Too Many Requests", 500: "Internal Server Error", 501: "Not Implemented",
};
// Признаки утечки внутренностей в теле ответа (стек, ORM, пути к исходникам)
var FW_LEAK_RE = /(\bat \S+ \(.*:\d+:\d+\)|node_modules|\/src\/|\.ts:\d+|QueryFailedError|PrismaClient|SequelizeError|MongoError|ECONNREFUSED|stack"|SELECT .* FROM)/i;
// Ключи, которые не должны появляться в ответах (ищутся на любой глубине, без учёта регистра)
var FW_SECRET_KEYS = ["password", "passwordHash", "hash", "salt", "secret", "token", "sid", "sessionToken", "refreshToken", "currentPassword", "newPassword"];

// Схемы ответов по контракту admin (API административной панели, OpenAPI 0.0.1). test("schema", "<Имя>")
var FW_SCHEMAS = (function () {
  const str = { type: "string" }, num = { type: "number" }, bool = { type: "boolean" };
  const dt = { type: "string", format: "date-time" }, uuid = { type: "string", format: "uuid" };
  const nnum = { type: "number", nullable: true };
  const arr = (items) => ({ type: "array", items: items });
  const o = (props, required) => ({ type: "object", properties: props, required: required || Object.keys(props) });

  const Account = o({ id: uuid, email: str, role: { type: "string", enum: ["root", "admin"] }, createdAt: dt, updatedAt: dt });
  const Session = o({ sessionId: uuid, userId: uuid, email: str, createdAt: dt, renewedAt: dt, ip: str, userAgent: str, current: bool });
  const Pagination = o({ page: num, size: num, count: num, next: nnum, prev: nnum });
  const ErrorAny = o({ statusCode: num, message: { anyOf: [str, arr(str)] }, error: str }, ["statusCode", "message"]);

  return {
    Account:        Account,
    LoginResponse:  Account,          // прежнее имя схемы ответа входа
    Error:          ErrorAny,
    BadRequest:     o({ statusCode: num, message: arr(str), error: str }, ["statusCode", "message"]),
    Session:        Session,
    Pagination:     Pagination,
    Sessions:       o({ sessions: arr(Session), pagination: Pagination }),
  };
})();

// Все защищённые операции контракта admin 0.0.1 (security: Cookie). {uuid} - случайный UUID на каждый вызов,
// регион zz-zz и язык zz не существуют, тела записей пустые (по контракту - 400): даже при обходе
// аутентификации матрица ничего реального не изменит. logout стоит последним: при ошибочном приёме
// сессии он закроет её в конце матрицы.
var FW_ENDPOINTS = [
  { op: "me",                        method: "GET",    path: "/api/auth/me" },
  { op: "getSessions",               method: "GET",    path: "/api/auth/sessions" },
  { op: "deleteSession",             method: "DELETE", path: "/api/auth/sessions/{uuid}" },
  { op: "getDocuments",              method: "GET",    path: "/api/documents" },
  { op: "createDocument",            method: "POST",   path: "/api/documents", body: {} },
  { op: "getDocument",               method: "GET",    path: "/api/documents/{uuid}" },
  { op: "replaceDocument",           method: "PUT",    path: "/api/documents/{uuid}", body: {} },
  { op: "deleteDocument",            method: "DELETE", path: "/api/documents/{uuid}" },
  { op: "uploadFile",                method: "PUT",    path: "/api/documents/{uuid}/files/zz", body: {} },
  { op: "deleteFile",                method: "DELETE", path: "/api/documents/{uuid}/files/zz" },
  { op: "publishDocument",           method: "POST",   path: "/api/documents/{uuid}/publish" },
  { op: "archiveDocument",           method: "POST",   path: "/api/documents/{uuid}/archive" },
  { op: "updateSortOrder",           method: "PUT",    path: "/api/documents/sort-order", body: {} },
  { op: "getSettings",               method: "GET",    path: "/api/settings" },
  { op: "getLanguages",              method: "GET",    path: "/api/settings/languages" },
  { op: "createLanguage",            method: "POST",   path: "/api/settings/languages", body: {} },
  { op: "getDocumentSettings",       method: "GET",    path: "/api/settings/documents" },
  { op: "replaceDocumentSettings",   method: "PUT",    path: "/api/settings/documents", body: {} },
  { op: "getDocumentCategories",     method: "GET",    path: "/api/settings/documents/categories" },
  { op: "getRegions",                method: "GET",    path: "/api/settings/regions" },
  { op: "createRegion",              method: "POST",   path: "/api/settings/regions", body: {} },
  { op: "getRegion",                 method: "GET",    path: "/api/settings/regions/zz-zz" },
  { op: "replaceRegion",             method: "PUT",    path: "/api/settings/regions/zz-zz", body: {} },
  { op: "getCollections",            method: "GET",    path: "/api/collections" },
  { op: "getCollection",             method: "GET",    path: "/api/collections/{uuid}" },
  { op: "replaceCollectionSettings", method: "PUT",    path: "/api/collections/{uuid}/settings", body: {} },
  { op: "getCollectionStories",      method: "GET",    path: "/api/collections/{uuid}/stories" },
  { op: "createStory",               method: "POST",   path: "/api/collections/{uuid}/stories", body: {} },
  { op: "getStory",                  method: "GET",    path: "/api/stories/{uuid}" },
  { op: "updateStory",               method: "PATCH",  path: "/api/stories/{uuid}", body: {} },
  { op: "deleteStory",               method: "DELETE", path: "/api/stories/{uuid}" },
  { op: "updateStorySortOrder",      method: "PUT",    path: "/api/stories/{uuid}/sort-order", body: {} },
  { op: "checkStoryPublish",         method: "GET",    path: "/api/stories/{uuid}/publish-check" },
  { op: "publishStory",              method: "POST",   path: "/api/stories/{uuid}/publish", body: {} },
  { op: "unpublishStory",            method: "POST",   path: "/api/stories/{uuid}/unpublish" },
  { op: "uploadStoryMedia",          method: "POST",   path: "/api/stories/{uuid}/media", body: {} },
  { op: "getStorySlides",            method: "GET",    path: "/api/stories/{uuid}/slides" },
  { op: "createSlide",               method: "POST",   path: "/api/stories/{uuid}/slides", body: {} },
  { op: "getSlide",                  method: "GET",    path: "/api/slides/{uuid}" },
  { op: "replaceSlide",              method: "PUT",    path: "/api/slides/{uuid}", body: {} },
  { op: "deleteSlide",               method: "DELETE", path: "/api/slides/{uuid}" },
  { op: "updateSlideSortOrder",      method: "PUT",    path: "/api/slides/{uuid}/sort-order", body: {} },
  { op: "getUsers",                  method: "GET",    path: "/api/users" },
  { op: "getUser",                   method: "GET",    path: "/api/users/{uuid}" },
  { op: "getUserSessions",           method: "GET",    path: "/api/users/{uuid}/sessions" },
  { op: "changePassword",            method: "POST",   path: "/api/auth/change-password", body: { currentPassword: "fw-wrong-current", newPassword: "fw-new-password-1" } },
  { op: "logout",                    method: "POST",   path: "/api/auth/logout" },
];

// Варианты предъявления сессии для test("authMatrix", <вариант>, 401).
// valid = значение {{sid}} (живая сессия), revoked = {{sid_revoked}} (закрытая).
var FW_AUTH_VARIANTS = {
  no_cookie:          (v) => ({}),
  empty_cookie:       (v) => ({ headers: { Cookie: FW_SESSION_COOKIE + "=" } }),
  garbage_cookie:     (v) => ({ headers: { Cookie: FW_SESSION_COOKIE + "=" + randomString(43) } }),
  uuid_cookie:        (v) => ({ headers: { Cookie: FW_SESSION_COOKIE + "=" + uuid4() } }),
  revoked_cookie:     (v) => ({ headers: { Cookie: FW_SESSION_COOKIE + "=" + v.revoked } }),
  tampered_cookie:    (v) => ({ headers: { Cookie: FW_SESSION_COOKIE + "=" + tamper(v.valid) } }),
  truncated_cookie:   (v) => ({ headers: { Cookie: FW_SESSION_COOKIE + "=" + String(v.valid).slice(0, -1) } }),
  suffixed_cookie:    (v) => ({ headers: { Cookie: FW_SESSION_COOKIE + "=" + v.valid + "x" } }),
  uppercased_cookie:  (v) => ({ headers: { Cookie: FW_SESSION_COOKIE + "=" + swapCase(v.valid) } }),
  wrong_cookie_name:  (v) => ({ headers: { Cookie: "sid=" + v.valid } }),
  no_prefix_cookie:   (v) => ({ headers: { Cookie: "Host-sid=" + v.valid } }),
  lowercase_prefix:   (v) => ({ headers: { Cookie: FW_SESSION_COOKIE.toLowerCase() + "=" + v.valid } }),
  bearer_header:      (v) => ({ headers: { Authorization: "Bearer " + v.valid } }),
  custom_header:      (v) => ({ headers: { [FW_SESSION_COOKIE]: v.valid, "X-Session-Id": v.valid } }),
  query_param:        (v) => ({ query: "sid=" + encodeURIComponent(v.valid) + "&" + encodeURIComponent(FW_SESSION_COOKIE) + "=" + encodeURIComponent(v.valid) }),
  duplicate_garbage_first: (v) => ({ headers: { Cookie: FW_SESSION_COOKIE + "=" + randomString(43) + "; " + FW_SESSION_COOKIE + "=" + v.valid } }),
};


// ============== Binding ===============
// Текущие pm/console запроса (выставляет bind). Все чтения/записи идут через них.
var FW_PM = null;
var FW_CONSOLE = null;
function P() { return FW_PM || pm; }
function C() { return FW_CONSOLE || console; }

function fwBind(reqPm, reqConsole)
{
    FW_PM = reqPm;
    FW_CONSOLE = reqConsole || console;
    const report = (r) => fwReport(reqPm, FW_CONSOLE, r);
    // флаги Before Response имеют вид "<requestId>|<текст>" - чужие (от прошлых запросов) игнорируются
    const own = (name) => {
        const raw = String(reqPm.variables.get(name) || "");
        const i = raw.indexOf("|");
        if (i < 0) return "";
        const id = raw.substring(0, i), text = raw.substring(i + 1);
        if (id && reqPm.info && reqPm.info.requestId && id !== reqPm.info.requestId) return "";
        reqPm.variables.set(name, "");
        return text;
    };

    // Пре-реквест решил пропустить запрос, но Postman его выполнил: проверки не запускаем
    const skipReason = own("fw_skip_reason");
    if (skipReason)
    {
        report({ Result: "[SKIPPED] " + skipReason, Skip: true, Msg: [] });
        const noop = function () {};
        return { test: noop, setVar: noop, report: noop };
    }

    // Ошибка подготовки (Before Response: utils.bind) - первым, видимым тестом
    const setupError = own("fw_setup_error");
    if (setupError)
        report({ Result: "Pre-request setup completed", Assert: setupError, Silent: false, Msg: [] });

    return {
        test: function (testtype, path, exp, type, silent = false) {
            let r;
            try { r = runTest(String(testtype).toUpperCase(), path, exp, type, silent, report); }
            catch (e) { r = { Result: "test(" + testtype + ", " + show(path) + ")", Assert: "Framework error: " + e.message, Silent: false, Msg: [] }; }
            if (r !== undefined) report(r);
        },
        setVar: function (varName, path, space = "collection") {
            const r = setvar(varName, path, space);
            if (r && r.Value !== undefined) varSet(varName, r.Value, space);
            report(r);
        },
        report: report,
    };
}

function fwReport(reqPm, reqConsole, r)
{
    [].concat(r || []).forEach((x) => {
        if (!x) return;
        (x.Msg || []).forEach((m) => reqConsole.log(m));
        if (x.Skip) { reqPm.test.skip(x.Result, () => {}); return; }
        if (!x.Silent || x.Assert)
            reqPm.test(x.Result, () => { if (x.Assert) reqPm.expect.fail(x.Assert); });
    });
}

// Диспетчер типов test(...). Асинхронные типы сами вызывают report и возвращают undefined.
function runTest(T, path, exp, type, silent, report)
{
    exp = resolve(exp);
    switch (T)
    {
        case "STATUS":  return statusIs(path, silent);
        case "CHECK":   return check(path, exp, type, silent);
        case "KEY":     return test(path, exp, type, silent);
        case "HEADER":  return header(path, exp, type, silent);
        case "SCHEMA":  return schema((exp !== undefined && exp !== "") ? exp : path, silent);
        case "BASIC":   return basictests(path);
        case "COOKIE":  return cookie(path, exp, type, silent);
        case "BODY":    return body(exp, type, silent);
        case "ERROR":   return error(path, exp);
        case "NOLEAK":  return noLeak(path);
        case "TODO":    return { Result: "[TODO] " + path + (exp ? " - " + exp : ""), Assert: null, Skip: true, Msg: [] };
        // ---- асинхронные пробы (дополнительные запросы через pm.sendRequest запроса)
        case "SESSION":     asyncSession(path, exp, report); return undefined;
        case "CALL":        asyncCall(path, exp, type, report); return undefined;
        case "LOGIN":       asyncLogin(path, exp, report); return undefined;
        case "AUTHMATRIX":  asyncAuthMatrix(path, exp === undefined ? 401 : exp, report); return undefined;
        case "PATHMATRIX":  asyncPathMatrix(path, report); return undefined;
        case "ROLEMATRIX":  asyncRoleMatrix(report); return undefined;
        case "RESTOREPASSWORD": asyncRestorePassword(path, exp, report); return undefined;
        case "PASSWORD":    asyncPassword(path, exp, type, report); return undefined;
        case "ENUMTIMING":  asyncEnumTiming(path, exp, report); return undefined;
        case "LOGINLATENCY":asyncLoginLatency(path, exp, report); return undefined;
        default:
            return { Result: "Unknown test type [" + T + "]", Silent: false, Msg: [],
                     Assert: "Use STATUS | CHECK | KEY | HEADER | SCHEMA | BASIC | COOKIE | BODY | ERROR | NOLEAK | TODO | SESSION | CALL | LOGIN | AUTHMATRIX | PATHMATRIX | ROLEMATRIX | AUDIT | RESTOREPASSWORD | ENUMTIMING | LOGINLATENCY" };
    }
}


// ============== Public API (sync) ===============

// Проверка значения в теле ответа по пути (a.b[0].c | [0].a | "" - корень)
function test(path, exp, type, silent = false)
{
    const r = newResult(silent);
    exp = resolve(exp);
    const pathF = String(path).replace(".", ": ") + ":";
    r.Result = (String(type).toUpperCase().substring(0, 5) === "ARRAY")
        ? "Array [" + pathF + "]"
        : "Property [" + pathF + "] has value: ";

    const b = readBody(r);
    if (!b.ok) return r;

    const g = getByPath(b.data, path);
    if (!g.found)
    {
        if (String(exp) === "KEY_NOT_EXIST")
        {
            r.Result = "Property [" + path + "] does not exist as expected";
            return r;
        }
        r.Result = "Variable [" + path + "] is undefined";
        r.Assert = "Please check Response Body";
        return r;
    }

    compare(r, g.value, exp, type);
    return r;
}

// Проверка служебных параметров ответа: statusCode | responseTime | contentLength | protocol
function check(parameter, exp, type, silent = false)
{
    const r = newResult(silent);
    exp = resolve(exp);
    let val;
    switch (parameter)
    {
        case "statusCode":
            val = P().response.code;
            r.Result = "Status code is ";
            break;
        case "responseTime":
            val = P().response.responseTime;
            r.Result = "Response Time is ";
            break;
        case "contentLength":
            val = P().response.headers.get("Content-Length");
            r.Result = "Content Length is ";
            break;
        case "protocol":
            val = String(P().request.url.protocol || "").replace(":", "");
            r.Result = "Request protocol is ";
            break;
        default:
            r.Result = "UNEXPECTED parameter [" + parameter + "]";
            r.Assert = "Supported: statusCode | responseTime | contentLength | protocol";
            r.Silent = false;
            return r;
    }
    compare(r, val, exp, type);
    return r;
}

// Проверка заголовка ответа
function header(name, exp, type, silent = false)
{
    const r = newResult(silent);
    exp = resolve(exp);
    const val = P().response.headers.get(name);
    if (val === undefined || val === null)
    {
        if (String(exp) === "KEY_NOT_EXIST" || String(type).toUpperCase() === "KEY_NOT_EXIST")
        {
            r.Result = "Header [" + name + "] does not exist as expected";
            return r;
        }
        // отрицательные сравнения: отсутствующий заголовок заведомо "не равен" запрещённому значению
        if (/^NOT_(EQL|REGEX|CONTAINS|ONEOF)$/.test(String(type).toUpperCase()))
        {
            r.Result = "Header [" + name + "] is absent (so not [" + show(exp) + "]) as expected";
            return r;
        }
        r.Result = "Header [" + name + "] is undefined";
        r.Assert = "Header is missing in response";
        r.Silent = false;
        return r;
    }
    r.Result = "Header [" + name + "] has value: ";
    compare(r, val, exp, type);
    return r;
}

// Статус-код: по умолчанию 200 (REST) или 0 (gRPC). Тихий, виден только при падении.
function statusCode(code = null)
{
    const r = newResult(true);
    const expected = (code !== null && code !== undefined) ? code : (getContentType() === "grpc" ? 0 : 200);
    r.Result = "Status code is [" + P().response.code + "]";
    if (P().response.code != expected) r.Assert = "Expected [" + expected + "]";
    return r;
}

// test("status", 204) | test("status", [401, 403]) - видимая проверка статуса
function statusIs(exp, silent = false)
{
    const r = newResult(silent);
    r.Result = "Status code is ";
    compare(r, P().response.code, exp, Array.isArray(exp) ? "oneof" : "eql");
    return r;
}

// Базовые тесты: статус-код + Content-Type. Возвращает МАССИВ результатов.
function basictests(code = null)
{
    const sc = statusCode(code);
    sc.Silent = false;
    const ct = newResult(false);
    ct.Result = "Content-Type is ";
    compare(ct, P().response.headers.get("Content-Type"), "/^application\\/(json|grpc)/", "regex");
    return [sc, ct];
}

// Форма ошибки по контракту: { statusCode, message: string | string[], error }.
// test("error", 400) | test("error", 400, "password") - message упоминает поле
function error(code, field)
{
    const res = [];
    const st = newResult(false);
    st.Result = "Status code is ";
    compare(st, P().response.code, code, "eql");
    res.push(st);

    const r = newResult(false);
    r.Result = "Error body follows contract {statusCode, message, error}";
    const b = readBody(r);
    if (!b.ok) { res.push(r); return res; }
    const data = b.data || {};
    const problems = [];
    if (data.statusCode != code) problems.push("statusCode=" + show(data.statusCode) + " (expected " + code + ")");
    if (FW_STATUS_TEXT[code] && data.error !== FW_STATUS_TEXT[code])
        problems.push("error=" + show(data.error) + " (expected '" + FW_STATUS_TEXT[code] + "')");
    const m = data.message;
    const msgOk = (typeof m === "string" && m.length > 0) ||
                  (Array.isArray(m) && m.length > 0 && m.every((s) => typeof s === "string" && s.length > 0));
    if (!msgOk) problems.push("message must be non-empty string or array of non-empty strings, got " + show(m));
    if (problems.length) r.Assert = problems.join("; ");
    res.push(r);

    // field - имя поля или список: test("error", 400, ["email", "password"])
    [].concat(field || []).forEach((name) => {
        const f = newResult(false);
        f.Result = "Error message mentions [" + name + "]";
        const text = [].concat(m || []).join(" ");
        if (text.toLowerCase().indexOf(String(name).toLowerCase()) < 0) f.Assert = "message: " + show(text, 200);
        res.push(f);
    });
    res.push(noLeak());
    return res;
}

// Тело ответа не содержит стек/внутренности и секретных ключей
function noLeak(extraKeys)
{
    const r = newResult(false);
    r.Result = "Response does not leak internals or secrets";
    let text = "";
    try { text = P().response.text() || ""; } catch (e) { text = ""; }
    const problems = [];
    const m = text.match(FW_LEAK_RE);
    if (m) problems.push("internal details: [" + show(m[0], 80) + "]");
    if (getContentType() === "json" && text)
    {
        try
        {
            const found = deepKeys(JSON.parse(text), FW_SECRET_KEYS.concat(extraKeys || []));
            if (found.length) problems.push("secret keys: " + found.join(", "));
        }
        catch (e) { /* не JSON - ключи не ищем */ }
    }
    if (problems.length) r.Assert = problems.join("; ");
    return r;
}

// Сырые данные тела: test("body", "", "EMPTY", "eql") | test("body", "", "/stack/i", "not_regex")
function body(exp, type, silent = false)
{
    const r = newResult(silent);
    exp = resolve(exp);
    let text = "";
    try { text = P().response.text() || ""; } catch (e) { text = ""; }
    r.Result = "Response body ";
    if (exp === "EMPTY")
        return text.length === 0 ? pass(r, "is empty as expected") : fail(r, "is not empty: [" + show(text) + "]", "Expected no body");
    compare(r, text, exp, type);
    return r;
}

// Set-Cookie ответа.
//   test("cookie", "__Host-sid", "ISSUED" | "NOT_ISSUED" | "CLEARED", "state")
//   test("cookie", "__Host-sid", ["HttpOnly", "Secure", "Path=/", "SameSite"], "attrs")
//   test("cookie", "__Host-sid", ["Domain"], "no_attrs")
//   test("cookie", "__Host-sid", "/^[A-Za-z0-9_-]{32,}$/", "regex")   - значение cookie
//   test("cookie", "__Host-sid", 86400, "max_age_below")
function cookie(name, exp, type, silent = false)
{
    const r = newResult(silent);
    exp = resolve(exp);
    const T = String(type || "state").toUpperCase();
    const all = parseSetCookies(responseSetCookies(), name);
    const live = all.filter((c) => !c.cleared && c.value !== "");
    const cleared = all.filter((c) => c.cleared);
    r.Result = "Set-Cookie [" + name + "] ";

    if (T === "STATE")
    {
        switch (String(exp).toUpperCase())
        {
            case "ISSUED":     return live.length ? pass(r, "is issued as expected") : fail(r, "is not issued", "Expected Set-Cookie " + name + " with a value");
            case "NOT_ISSUED": return !live.length ? pass(r, "is not issued as expected") : fail(r, "is issued", "Session cookie must not be issued: [" + show(live[0].raw, 120) + "]");
            case "CLEARED":    return cleared.length ? pass(r, "is cleared (Max-Age=0 / Expires in the past) as expected") : fail(r, "is not cleared", "Expected Set-Cookie " + name + " with Max-Age=0 or Expires in the past");
            default:           return fail(r, "", "Unknown cookie state [" + exp + "]. Use ISSUED | NOT_ISSUED | CLEARED");
        }
    }
    const c = live[0];
    if (!c) return fail(r, "is not issued", "Cannot check [" + T + "]: Set-Cookie " + name + " is absent");

    switch (T)
    {
        case "ATTRS":
        {
            const missing = [].concat(exp).filter((a) => !hasAttr(c, a));
            return missing.length ? fail(r, "attributes", "Missing [" + missing.join(", ") + "] in [" + show(c.raw, 160) + "]")
                                  : pass(r, "has [" + [].concat(exp).join(", ") + "] as expected");
        }
        case "NO_ATTRS":
        {
            const extra = [].concat(exp).filter((a) => hasAttr(c, a));
            return extra.length ? fail(r, "attributes", "Must not have [" + extra.join(", ") + "] in [" + show(c.raw, 160) + "]")
                                : pass(r, "has no [" + [].concat(exp).join(", ") + "] as expected");
        }
        case "MAX_AGE_BELOW":
        {
            const age = cookieMaxAge(c);
            if (age === null) return pass(r, "is a session cookie (no Max-Age/Expires) as expected");
            return age < Number(exp) ? pass(r, "lifetime [" + age + "s] below [" + exp + "s] as expected")
                                     : fail(r, "lifetime [" + age + "s]", "Expected lifetime below [" + exp + "s]");
        }
        default:
            r.Result += "value ";
            compare(r, c.value, exp, type);
            return r;
    }
}

// Валидация тела по JSON Schema: объект схемы или имя из FW_SCHEMAS
function schema(schemaObj, silent = false)
{
    const r = newResult(silent);
    const name = (typeof schemaObj === "string") ? schemaObj : null;
    r.Result = "Response body matches JSON schema" + (name ? " [" + name + "]" : "");
    if (name)
    {
        if (!FW_SCHEMAS[name]) { r.Assert = "Unknown schema [" + name + "]. Known: " + Object.keys(FW_SCHEMAS).join(", "); return r; }
        schemaObj = FW_SCHEMAS[name];
    }
    const b = readBody(r);
    if (!b.ok) return r;
    try
    {
        const Ajv = require("ajv");
        // форматы проверяются отдельно (guid/datetime); unknown formats не валят компиляцию ни в ajv 6, ни в ajv 8
        const ajv = new Ajv({ allErrors: true, nullable: true, unknownFormats: "ignore", validateFormats: false, strict: false, logger: false });
        const validate = ajv.compile(stripFormats(schemaObj));
        if (!validate(b.data))
        {
            r.Assert = validate.errors
                .slice(0, 10)
                .map((e) => (e.dataPath || e.instancePath || "(root)") + " " + e.message)
                .join("; ");
        }
    }
    catch (e)
    {
        r.Assert = "Schema validation error: " + e.message;
    }
    return r;
}

// Читает значение из ответа. path: путь в теле | "cookie:<name>" | "header:<name>"
function setvar(varName, path, space = "collection")
{
    const r = newResult(true);
    r.Result = "Variable [" + varName + "] is set from [" + path + "]";
    r.Var = { name: varName, space: space };
    const p = String(path);

    if (p.indexOf("cookie:") === 0 || p.indexOf("header:") === 0)
    {
        const n = p.substring(7);
        const v = (p[0] === "c")
            ? (parseSetCookies(responseSetCookies(), n).filter((c) => !c.cleared)[0] || {}).value
            : P().response.headers.get(n);
        if (v === undefined || v === null) { r.Assert = "Cannot set [" + varName + "]: " + p + " not found in response"; return r; }
        r.Value = v;
        return r;
    }

    const b = readBody(r);
    if (!b.ok) return r;
    const g = getByPath(b.data, path);
    if (!g.found)
    {
        r.Result = "Variable [" + path + "] is undefined";
        r.Assert = "Cannot set [" + varName + "]: path not found in response";
        return r;
    }
    r.Value = g.value;
    return r;
}

function getvar(varName, space = "collection")
{
    switch (String(space).toUpperCase())
    {
        case "ENV":   return P().environment.get(varName);
        case "LOCAL": return P().variables.get(varName);
        default:      return P().collectionVariables.get(varName);
    }
}

function varSet(varName, value, space)
{
    switch (String(space).toUpperCase())
    {
        case "ENV":   P().environment.set(varName, value); break;
        case "LOCAL": P().variables.set(varName, value); break;
        default:      P().collectionVariables.set(varName, value);
    }
}

function randomString(length = 1)
{
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s = "";
    for (let i = 0; i < length; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}


// ============== Async probes ===============
// Все дополнительные запросы идут через pm запроса (FW_PM); тесты пишутся в его callback.

function baseUrl() { return P().variables.replaceIn("{{baseUrl}}"); }

// opts: { method, path, url, cookie, headers, body, query }
function send(opts, cb)
{
    const headers = Object.assign({}, opts.headers || {});
    if (opts.cookie) headers.Cookie = FW_SESSION_COOKIE + "=" + resolve(opts.cookie);
    let url = opts.url || (baseUrl() + resolve(opts.path || ""));
    url = url.replace(/\{uuid\}/g, () => uuid4());
    if (opts.query) url += (url.indexOf("?") < 0 ? "?" : "&") + opts.query;
    const req = { url: url, method: opts.method || "GET", header: headers };
    if (opts.body !== undefined)
    {
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
        req.body = { mode: "raw", raw: (typeof opts.body === "string") ? opts.body : JSON.stringify(opts.body) };
    }
    // cookie jar мог получить Set-Cookie из ответа запроса: проба передаёт только явно указанную cookie
    clearJar(() => {
        const started = Date.now();
        P().sendRequest(req, (err, res) => {
            let json;
            try { json = res ? res.json() : undefined; } catch (e) { json = undefined; }
            cb(err, res, json, Date.now() - started);
        });
    });
}

function clearJar(next)
{
    try { P().cookies.jar().clear(baseUrl(), () => next()); }
    catch (e) { next(); }   // домен не в allowlist cookie jar
}

function probeResult(title, ok, assert)
{
    return { Result: title, Assert: ok ? null : assert, Silent: false, Msg: [] };
}

// test("session", "{{sid}}", "ALIVE" | "DEAD") - GET /api/auth/me с этой cookie
function asyncSession(sid, state, report)
{
    const value = resolve(sid);
    const want = String(state || "ALIVE").toUpperCase();
    const title = "Session [" + show(String(value), 12) + "] is " + want;
    if (!value) { report(probeResult(title, false, "Session value is empty: check pre-request setup")); return; }
    send({ method: "GET", path: "/api/auth/me", cookie: value }, (err, res) => {
        if (err || !res) return report(probeResult(title, false, "Request failed: " + (err && err.message)));
        const ok = (want === "ALIVE") ? res.code === 200 : res.code === 401;
        report(probeResult(title, ok, "GET /api/auth/me returned [" + res.code + "], expected [" + (want === "ALIVE" ? 200 : 401) + "]"));
    });
}

// test("call", { method, path, cookie, headers, body, query }, 401 | [401, 403], "eql" | "oneof" | "not_oneof")
// exp может быть объектом { status, path, value, type } для проверки поля ответа
function asyncCall(opts, exp, type, report)
{
    const o = resolveDeep(opts);
    const title = "[" + (o.method || "GET") + " " + (o.path || o.url) + "] ";
    send(o, (err, res, json) => {
        if (err || !res) return report(probeResult(title + "request", false, "Request failed: " + (err && err.message)));
        const r = newResult(false);
        r.Result = title + "status ";
        const want = (exp && typeof exp === "object" && !Array.isArray(exp)) ? exp : { status: exp };
        compare(r, res.code, want.status, type || (Array.isArray(want.status) ? "oneof" : "eql"));
        const out = [r];
        if (want.path !== undefined)
        {
            const f = newResult(false);
            f.Result = title + "[" + want.path + "] ";
            const g = getByPath(json, want.path);
            if (!g.found && want.value !== "KEY_NOT_EXIST") fail(f, "is undefined", "Path not found in response");
            else compare(f, g.value, resolve(want.value), want.type || "eql");
            out.push(f);
        }
        report(out);
    });
}

// test("login", ["{{current_login}}", "{{new_pass}}"], 200 | 401)
function asyncLogin(creds, expStatus, report)
{
    const c = resolveDeep(creds);
    const title = "Login as [" + c[0] + "] returns [" + expStatus + "]";
    send({ method: "POST", path: "/api/auth/login", body: { email: c[0], password: c[1] } }, (err, res) => {
        if (err || !res) return report(probeResult(title, false, "Request failed: " + (err && err.message)));
        report(probeResult(title, res.code == expStatus, "Got [" + res.code + "]"));
    });
}

// test("authMatrix", "no_cookie" | "garbage_cookie" | ..., 401)  - все защищённые операции
function asyncAuthMatrix(variant, expStatus, report)
{
    const make = FW_AUTH_VARIANTS[variant];
    if (!make) { report(probeResult("authMatrix [" + variant + "]", false, "Unknown variant. Known: " + Object.keys(FW_AUTH_VARIANTS).join(", "))); return; }
    const v = { valid: P().variables.get("sid"), revoked: P().variables.get("sid_revoked") };
    const needs = (variant === "revoked_cookie") ? "sid_revoked"
                : (["no_cookie", "empty_cookie", "garbage_cookie", "uuid_cookie"].indexOf(variant) >= 0 ? null : "sid");
    if (needs && !P().variables.get(needs))
    {
        report(probeResult("authMatrix [" + variant + "]", false, "Variant needs {{" + needs + "}} from pre-request"));
        return;
    }
    // последовательно: logout в конце матрицы не должен влиять на остальные строки
    const list = FW_ENDPOINTS.slice();
    const next = () => {
        const ep = list.shift();
        if (!ep) return;
        const extra = make(v);
        send({ method: ep.method, path: ep.path, body: ep.body, headers: extra.headers, query: extra.query }, (err, res) => {
            const title = "[" + variant + "] " + ep.method + " " + ep.path + " -> " + expStatus;
            if (err || !res) report(probeResult(title, false, "Request failed: " + (err && err.message)));
            else report(probeResult(title, res.code == expStatus, "Got [" + res.code + "]" + (res.code < 300 ? " - AUTH BYPASS" : "")));
            next();
        });
    };
    next();
}

// test("pathMatrix", "/api/auth/sessions") - варианты пути без сессии не дают 2xx
function asyncPathMatrix(basePath, report)
{
    const p = String(basePath);
    const parts = p.split("/").filter(Boolean);           // ["api","auth","sessions"]
    const last = parts[parts.length - 1];
    const variants = [
        p + "/", p.toUpperCase(), "/" + parts[0].toUpperCase() + "/" + parts.slice(1).join("/"),
        p.replace("/" + parts[1], "//" + parts[1]), p.replace("/" + last, "/./" + last),
        p.replace("/" + last, "/x/../" + last), p + "%2f", p.replace(last, "%" + last.charCodeAt(0).toString(16) + last.substring(1)),
        p + ";x=1", p + "%20", p + "%09", p + ".json", p + "?", p + "#", p + "/..;/" + last,
    ];
    variants.forEach((path) => {
        send({ method: "GET", path: path }, (err, res) => {
            const title = "[no session] GET " + path + " is not 2xx";
            if (err || !res) return report(probeResult(title, true, null));   // соединение отклонено - доступа нет
            report(probeResult(title, res.code < 200 || res.code >= 300, "Got [" + res.code + "] - AUTH BYPASS via path normalization"));
        });
    });
}

// test("roleMatrix") - env RoleMatrix {"<METHOD> <path>": ["root", ...]}, env AdminAccounts c полем role
function asyncRoleMatrix(report)
{
    let matrix, accounts;
    try { matrix = JSON.parse(P().environment.get("RoleMatrix") || "null"); accounts = JSON.parse(P().environment.get("AdminAccounts") || "[]"); }
    catch (e) { report(probeResult("roleMatrix config", false, "RoleMatrix/AdminAccounts is not valid JSON: " + e.message)); return; }
    if (!matrix) { report({ Result: "[TODO] roleMatrix: set env RoleMatrix {\"GET /api/users\": [\"root\"]} and roles in AdminAccounts", Skip: true, Msg: [] }); return; }
    const roles = Array.from(new Set(accounts.map((a) => a.role).filter(Boolean)));
    roles.forEach((role) => {
        const acc = accounts.find((a) => a.role === role);
        send({ method: "POST", path: "/api/auth/login", body: { email: acc.login, password: acc.password } }, (err, res) => {
            const sid = res && (parseSetCookies(headersOf(res), FW_SESSION_COOKIE).filter((c) => !c.cleared)[0] || {}).value;
            if (!sid) return report(probeResult("roleMatrix login as [" + role + "]", false, "Login failed: " + (res && res.code)));
            Object.keys(matrix).forEach((key) => {
                const sp = key.split(" ");
                const allowed = matrix[key].indexOf(role) >= 0;
                const ep = FW_ENDPOINTS.find((e) => e.method === sp[0] && e.path === sp[1]) || {};
                send({ method: sp[0], path: sp[1], cookie: sid, body: ep.body }, (e2, r2) => {
                    const title = "[" + role + "] " + key + (allowed ? " is allowed" : " -> 403");
                    if (e2 || !r2) return report(probeResult(title, false, "Request failed"));
                    report(probeResult(title, allowed ? (r2.code !== 401 && r2.code !== 403) : r2.code === 403, "Got [" + r2.code + "]"));
                });
            });
        });
    });
}

// test("restorePassword", "{{current_login}}", ["{{temp_pass}}", "{{current_pass}}"]) - вход с временным
// паролем и возврат исходного. Нужен после тестов смены пароля.
function asyncRestorePassword(login, pair, report)
{
    const email = resolve(login), p = resolveDeep(pair), temp = p[0], orig = p[1];
    const title = "Password of [" + email + "] restored";
    send({ method: "POST", path: "/api/auth/login", body: { email: email, password: orig } }, (e0, r0) => {
        if (r0 && r0.code === 200) return report(probeResult(title + " (original password still works)", true, null));
        send({ method: "POST", path: "/api/auth/login", body: { email: email, password: temp } }, (err, res) => {
            const sid = res && (parseSetCookies(headersOf(res), FW_SESSION_COOKIE).filter((c) => !c.cleared)[0] || {}).value;
            if (!sid)
            {
                C().error("RESTORE FAILED for " + email + ": neither original nor temporary password [" + temp + "] works");
                return report(probeResult(title, false, "Cannot login with temporary password, status " + (res && res.code) + ". TEMP PASSWORD: " + temp));
            }
            send({ method: "POST", path: "/api/auth/change-password", cookie: sid, body: { currentPassword: temp, newPassword: orig } }, (e2, r2) => {
                const ok = r2 && r2.code === 204;
                if (!ok) C().error("RESTORE FAILED for " + email + ": current password is [" + temp + "]");
                report(probeResult(title, ok, "change-password returned " + (r2 && r2.code) + ". CURRENT PASSWORD: " + temp));
            });
        });
    });
}

// test("password", "{{sid_login}}", ["{{sid_pass}}", "{{temp_pass}}"], "CHANGED" | "UNCHANGED")
// По шагам: вход со старым и с новым паролем, затем (если новый пароль сработал) возврат старого.
//   CHANGED   - старый пароль отклоняется (401), новый принимается (200)
//   UNCHANGED - старый принимается, новый отклоняется
function asyncPassword(login, pair, state, report)
{
    const email = resolve(login), p = resolveDeep(pair), oldPass = p[0], newPass = p[1];
    const want = String(state || "CHANGED").toUpperCase();
    send({ method: "POST", path: "/api/auth/login", body: { email: email, password: oldPass } }, (e1, r1) => {
        const oldCode = r1 ? r1.code : 0;
        sessionOf(r1, (sid1) => {
            send({ method: "POST", path: "/api/auth/login", body: { email: email, password: newPass } }, (e2, r2) => {
                const newCode = r2 ? r2.code : 0;
                const sid2 = r2 && (parseSetCookies(headersOf(r2), FW_SESSION_COOKIE).filter((c) => !c.cleared)[0] || {}).value;
                if (want === "CHANGED")
                {
                    report(probeResult("Old password is rejected after change", oldCode === 401, "Login with old password returned [" + oldCode + "]"));
                    report(probeResult("New password is accepted after change", newCode === 200, "Login with new password returned [" + newCode + "]"));
                }
                else
                {
                    report(probeResult("Old password still works (password unchanged)", oldCode === 200, "Login with old password returned [" + oldCode + "]"));
                    report(probeResult("New password is not accepted (password unchanged)", newCode === 401, "Login with new password returned [" + newCode + "]"));
                }
                if (newCode !== 200 || !sid2) return;
                // новый пароль работает - возвращаем исходный
                send({ method: "POST", path: "/api/auth/change-password", cookie: sid2, body: { currentPassword: newPass, newPassword: oldPass } }, (e3, r3) => {
                    const ok = r3 && r3.code === 204;
                    if (!ok) C().error("RESTORE FAILED for " + email + ": current password is [" + newPass + "]");
                    report(probeResult("Password of [" + email + "] restored", ok, "change-password returned " + (r3 && r3.code) + ". CURRENT PASSWORD: " + newPass));
                    // смена пароля закрывает все сессии учётки и выпускает новую - её и закрываем
                    const sid3 = r3 && (parseSetCookies(headersOf(r3), FW_SESSION_COOKIE).filter((c) => !c.cleared)[0] || {}).value;
                    send({ method: "POST", path: "/api/auth/logout", cookie: sid3 || sid2 }, () => {});
                });
            });
        });
    });
    // закрыть сессию, выпущенную проверкой старого пароля, и продолжить
    function sessionOf(res, next)
    {
        const sid = res && (parseSetCookies(headersOf(res), FW_SESSION_COOKIE).filter((c) => !c.cleared)[0] || {}).value;
        if (!sid) return next(null);
        send({ method: "POST", path: "/api/auth/logout", cookie: sid }, () => next(sid));
    }
}

// test("enumTiming",{ known: "{{current_login}}", rounds: 5 }, 150) - разница среднего времени
// ответа для существующего и несуществующего email меньше 150 мс
function asyncEnumTiming(opts, toleranceMs, report)
{
    const o = resolveDeep(opts), rounds = o.rounds || 5;
    const times = { known: [], unknown: [] };
    const queue = [];
    for (let i = 0; i < rounds; i++)
    {
        queue.push(["known", o.known]);
        queue.push(["unknown", "nouser_" + randomString(10) + "@example.com"]);
    }
    const next = () => {
        const item = queue.shift();
        if (!item)
        {
            const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
            const d = Math.abs(avg(times.known) - avg(times.unknown));
            return report(probeResult("Login timing does not reveal account existence: |" + Math.round(avg(times.known)) + " - " +
                Math.round(avg(times.unknown)) + "| ms < " + toleranceMs + " ms", d < toleranceMs, "Difference " + Math.round(d) + " ms"));
        }
        send({ method: "POST", path: "/api/auth/login", body: { email: item[1], password: "wrong_" + randomString(12) } }, (err, res, json, ms) => {
            times[item[0]].push(ms);
            next();
        });
    };
    next();
}

// test("loginLatency", 20, 2000) - p95 времени логина из N попыток меньше порога (NFR-1);
// выпущенные сессии закрываются
function asyncLoginLatency(count, limitMs, report)
{
    const n = Number(count) || 20, times = [];
    const email = P().variables.get("current_login"), password = P().variables.get("current_pass");
    const next = () => {
        if (times.length >= n)
        {
            const sorted = times.slice().sort((a, b) => a - b);
            const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
            return report(probeResult("Login p95 over " + n + " requests is " + p95 + " ms < " + limitMs + " ms (NFR-1)", p95 < limitMs,
                "p95 = " + p95 + " ms; all: " + sorted.join(", ")));
        }
        send({ method: "POST", path: "/api/auth/login", body: { email: email, password: password } }, (err, res, json, ms) => {
            times.push(ms);
            const sid = res && (parseSetCookies(headersOf(res), FW_SESSION_COOKIE).filter((c) => !c.cleared)[0] || {}).value;
            if (sid) send({ method: "POST", path: "/api/auth/logout", cookie: sid }, () => next());
            else next();
        });
    };
    next();
}


// ============== Comparison ===============

function compare(r, val, exp, type)
{
    const T = String(type).toUpperCase();

    // ---- scalar
    if (T === "EQL" && val == exp)
        return pass(r, "[" + show(val) + "] as expected");
    if (T === "BELOW" && val < exp)
        return pass(r, "[" + show(val) + "] below than [" + exp + "] as expected");
    if (T === "ABOVE" && val > exp)
        return pass(r, "[" + show(val) + "] above than [" + exp + "] as expected");

    switch (T)
    {
        case "NOT_EQL":
            return (val != exp) ? pass(r, "[" + show(val) + "] is not [" + show(exp) + "] as expected")
                                : fail(r, "[" + show(val) + "]", "Must not be [" + show(exp) + "]");
        case "ONEOF":
            return [].concat(exp).some((e) => e == val) ? pass(r, "[" + show(val) + "] is one of [" + show(exp) + "] as expected")
                                                        : fail(r, "[" + show(val) + "]", "Expected one of [" + show(exp) + "]");
        case "NOT_ONEOF":
            return ![].concat(exp).some((e) => e == val) ? pass(r, "[" + show(val) + "] is not one of [" + show(exp) + "] as expected")
                                                         : fail(r, "[" + show(val) + "]", "Must not be one of [" + show(exp) + "]");
        case "BETWEEN":
            return (val >= exp[0] && val <= exp[1]) ? pass(r, "[" + show(val) + "] in [" + exp[0] + ".." + exp[1] + "] as expected")
                                                    : fail(r, "[" + show(val) + "]", "Expected in [" + exp[0] + ".." + exp[1] + "]");
        case "TYPE":
        {
            const t = typeOf(val);
            return typeMatches(val, exp) ? pass(r, "of type [" + t + "] as expected")
                                         : fail(r, "of type [" + t + "]", "Expected type [" + show(exp) + "]");
        }
        case "JSON_EQL":
        {
            // глубокое равенство; ожидание - объект или JSON-строка (например, "{{ref_body}}")
            let want = exp;
            if (typeof exp === "string") { try { want = JSON.parse(exp); } catch (e) { return fail(r, "", "Expected value is not valid JSON: " + show(exp)); } }
            const norm = (x) => JSON.stringify(x, (k, v) => (v && typeof v === "object" && !Array.isArray(v)) ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v);
            return norm(val) === norm(want) ? pass(r, "[" + show(val) + "] equals expected JSON")
                                            : fail(r, "[" + show(val, 120) + "]", "Expected JSON " + show(want, 200));
        }
        case "CONTAINS":
        case "NOT_CONTAINS":
        {
            const has = String(val).indexOf(String(exp)) >= 0;
            if (T === "CONTAINS") return has ? pass(r, "contains [" + show(exp, 20) + "] as expected") : fail(r, "[" + show(val) + "]", "Expected to contain [" + show(exp, 20) + "]");
            return !has ? pass(r, "does not contain [" + show(exp, 12) + "] as expected") : fail(r, "contains [" + show(exp, 12) + "]", "Value must not contain [" + show(exp, 12) + "]");
        }
        case "NOT_REGEX":
        {
            let m;
            try { m = String(val).match(toRegExp(exp)); } catch (e) { return fail(r, "", "Invalid regex [" + exp + "]: " + e.message); }
            return !m ? pass(r, "does not match [" + exp + "] as expected")
                      : fail(r, "matches [" + show(m[0]) + "]", "Must not match [" + exp + "]");
        }
        case "LENGTH":
        case "MIN_LENGTH":
        case "MAX_LENGTH":
        {
            const len = (val === null || val === undefined) ? -1 : (val.length !== undefined ? val.length : String(val).length);
            const ok = T === "LENGTH" ? len === Number(exp) : (T === "MIN_LENGTH" ? len >= Number(exp) : len <= Number(exp));
            return ok ? pass(r, "length [" + len + "] " + T.toLowerCase().replace("_", " ") + " [" + exp + "] as expected")
                      : fail(r, "length [" + len + "]", "Expected " + T.toLowerCase().replace("_", " ") + " [" + exp + "]");
        }
        case "KEYS_EXACT":
        case "KEYS_INCLUDE":
        case "KEYS_EXCLUDE":
        {
            if (!val || typeof val !== "object" || Array.isArray(val)) return fail(r, "[" + show(val) + "]", "Expected object");
            const keys = Object.keys(val);
            const e = [].concat(exp);
            if (T === "KEYS_EXACT")
            {
                const extra = keys.filter((k) => e.indexOf(k) < 0), missing = e.filter((k) => keys.indexOf(k) < 0);
                return (!extra.length && !missing.length) ? pass(r, "keys are exactly [" + e.join(", ") + "] as expected")
                    : fail(r, "keys [" + keys.join(", ") + "]", (extra.length ? "Unexpected: " + extra.join(", ") + ". " : "") + (missing.length ? "Missing: " + missing.join(", ") : ""));
            }
            const bad = (T === "KEYS_INCLUDE") ? e.filter((k) => keys.indexOf(k) < 0) : e.filter((k) => keys.indexOf(k) >= 0);
            return !bad.length ? pass(r, (T === "KEYS_INCLUDE" ? "has" : "has no") + " keys [" + e.join(", ") + "] as expected")
                               : fail(r, "keys [" + keys.join(", ") + "]", (T === "KEYS_INCLUDE" ? "Missing: " : "Must not have: ") + bad.join(", "));
        }
        case "DEEP_KEYS_EXCLUDE":
        {
            const found = deepKeys(val, [].concat(exp));
            return !found.length ? pass(r, "has no keys [" + [].concat(exp).join(", ") + "] at any depth as expected")
                                 : fail(r, "contains [" + found.join(", ") + "]", "Sensitive keys found in response");
        }
        case "RECENT":
        {
            const t = Date.parse(val), d = Math.abs(Date.now() - t) / 1000;
            return (!isNaN(t) && d <= Number(exp)) ? pass(r, "[" + show(val) + "] is within " + exp + "s from now as expected")
                                                   : fail(r, "[" + show(val) + "]", "Expected a timestamp within " + exp + "s from now (diff " + Math.round(d) + "s)");
        }
        case "DATETIME_AFTER":
        case "DATETIME_NOT_BEFORE":
        {
            const a = Date.parse(val), b = Date.parse(exp);
            const ok = !isNaN(a) && !isNaN(b) && (T === "DATETIME_AFTER" ? a > b : a >= b);
            return ok ? pass(r, "[" + show(val) + "] is " + (T === "DATETIME_AFTER" ? "after" : "not before") + " [" + exp + "] as expected")
                      : fail(r, "[" + show(val) + "]", "Expected " + (T === "DATETIME_AFTER" ? "after" : "not before") + " [" + exp + "]");
        }
    }

    if (T === "REGEX")
    {
        try
        {
            if (toRegExp(exp).test(String(val)))
                return pass(r, "[" + show(val) + "] by regex [" + exp + "] as expected");
        }
        catch (e)
        {
            return fail(r, "[" + show(val) + "]", "Invalid regex [" + exp + "]: " + e.message);
        }
        return fail(r, "[" + show(val) + "]", "Does not match regex [" + exp + "]");
    }

    // ---- arrays
    if (T.substring(0, 5) === "ARRAY" || T.slice(-12) === "_COUNT_ARRAY")
    {
        if (!Array.isArray(val))
            return fail(r, " is not an array: [" + show(val) + "]", "Expected array");
        const len = val.length;
        const n = parseInt(exp, 10);

        switch (T)
        {
            case "ARRAY_COUNT":
                return (len === n)
                    ? pass(r, " count is [" + exp + "] as expected")
                    : fail(r, " count is [" + len + "]", "Array length is [" + len + "], expected [" + exp + "]");

            case "ARRAY_COUNT_ABOVE":
            case "ABOVE_COUNT_ARRAY":
                return (len > n)
                    ? pass(r, " above than [" + exp + "] as expected")
                    : fail(r, " count is [" + len + "]", "Array length [" + len + "] is not above [" + exp + "]");

            case "ARRAY_COUNT_BELOW":
            case "BELOW_COUNT_ARRAY":
                return (len < n)
                    ? pass(r, " below than [" + exp + "] as expected")
                    : fail(r, " count is [" + len + "]", "Array length [" + len + "] is not below [" + exp + "]");

            case "ARRAY":
            {
                // exp = ["path.in.element", expectedValue]
                const idx = val.findIndex((el) => { const g = getByPath(el, exp[0]); return g.found && g.value == resolve(exp[1]); });
                if (idx >= 0)
                    return pass(r, " has value: [" + show(resolve(exp[1])) + "] in property [" + exp[0] + "] as expected");
                const values = val.map((el) => getByPath(el, exp[0]).value);
                return fail(r, " has not value in elem [" + exp[0] + "]",
                    "Expected [" + resolve(exp[1]) + "], to be one of [" + show(values, 200) + "]");
            }

            case "ARRAY_NONE":
            {
                // exp = ["path.in.element", forbiddenValue] - ни один элемент не содержит значение
                const forbidden = resolve(exp[1]);
                const hit = val.find((el) => { const g = getByPath(el, exp[0]); return g.found && g.value == forbidden; });
                return !hit ? pass(r, " has no element with [" + exp[0] + "] = [" + show(forbidden, 12) + "] as expected")
                            : fail(r, " has element with [" + exp[0] + "] = [" + show(forbidden, 12) + "]", "Forbidden value found: " + show(hit, 200));
            }

            case "ARRAY_EACH":
            {
                // exp = ["path.in.element", expectedValue, compareType]; путь "" - сам элемент
                const subType = exp[2] || "eql";
                const bad = [];
                val.forEach((el, i) => {
                    const g = getByPath(el, exp[0]);
                    const sub = newResult(false);
                    if (!g.found) { if (String(exp[1]) !== "KEY_NOT_EXIST") bad.push("[" + i + "] no " + exp[0]); return; }
                    compare(sub, g.value, resolve(exp[1]), subType);
                    if (sub.Assert) bad.push("[" + i + "] " + sub.Assert);
                });
                return !bad.length ? pass(r, " every [" + (exp[0] || "item") + "] " + subType.toLowerCase() + " [" + show(resolve(exp[1])) + "] (" + len + " items) as expected")
                                   : fail(r, " items violate [" + (exp[0] || "item") + "]", bad.slice(0, 5).join("; ") + (bad.length > 5 ? " ... +" + (bad.length - 5) : ""));
            }

            case "ARRAY_WHERE":
            {
                // exp = [matchPath, matchValue, subPath, subExp, subType] - элементы, где matchPath == matchValue
                // (хотя бы один), все удовлетворяют subPath <subType> subExp
                const want = resolve(exp[1]);
                const sel = val.filter((el) => { const g = getByPath(el, exp[0]); return g.found && g.value == want; });
                if (!sel.length) return fail(r, " has no element with [" + exp[0] + "] = [" + show(want) + "]", "Expected at least one such element");
                const bad = [];
                sel.forEach((el, i) => {
                    const sub = newResult(false);
                    const g = getByPath(el, exp[2]);
                    if (!g.found) { bad.push("[" + i + "] no " + exp[2]); return; }
                    compare(sub, g.value, resolve(exp[3]), exp[4] || "eql");
                    if (sub.Assert) bad.push("[" + i + "] " + sub.Assert);
                });
                return !bad.length ? pass(r, " where [" + exp[0] + "=" + show(want) + "]: [" + exp[2] + "] " + String(exp[4] || "eql").toLowerCase() + " [" + show(resolve(exp[3])) + "] as expected")
                                   : fail(r, " where [" + exp[0] + "=" + show(want) + "]", bad.slice(0, 5).join("; "));
            }

            case "ARRAY_SORTED":
            {
                // exp = "key" | ["key1", "key2"] | {by: ["key"], desc: true}
                const spec = (exp && exp.by) ? exp : { by: [].concat(exp), desc: false };
                const cmp = (a, b) => {
                    for (const k of spec.by)
                    {
                        const x = getByPath(a, k).value, y = getByPath(b, k).value;
                        if (x === y) continue;
                        const c = (typeof x === "number" && typeof y === "number") ? x - y : (String(x) < String(y) ? -1 : 1);
                        return spec.desc ? -c : c;
                    }
                    return 0;
                };
                const i = val.findIndex((el, j) => j > 0 && cmp(val[j - 1], el) > 0);
                return i < 0 ? pass(r, " is sorted by [" + spec.by.join(", ") + "]" + (spec.desc ? " desc" : "") + " as expected")
                             : fail(r, " is not sorted by [" + spec.by.join(", ") + "]", "Order broken at index " + i + ": " + show(val[i - 1], 80) + " > " + show(val[i], 80));
            }

            case "ARRAY_UNIQUE":
            {
                const seen = {}, dup = [];
                val.forEach((el) => { const k = JSON.stringify([].concat(exp).map((p) => getByPath(el, p).value)); if (seen[k]) dup.push(k); seen[k] = true; });
                return !dup.length ? pass(r, " values of [" + [].concat(exp).join(", ") + "] are unique as expected")
                                   : fail(r, " has duplicates", "Duplicate [" + [].concat(exp).join(", ") + "]: " + show(dup, 200));
            }

            case "ARRAY_COMPARE_KEYSINEXP":
            case "ARRAY_COMPARE_EXPINKEYS":
            {
                if (!Array.isArray(exp)) return fail(r, "", "Expected value must be an array of keys");
                const respKeys = Array.from(new Set(val.flatMap((el) => (el && typeof el === "object") ? Object.keys(el) : [])));
                const keysInExp = (T === "ARRAY_COMPARE_KEYSINEXP");
                const from = keysInExp ? respKeys : exp;
                const into = keysInExp ? exp : respKeys;
                const where = keysInExp ? "exp list" : "response";
                const missing = from.filter((k) => !into.includes(k));
                return missing.length === 0
                    ? pass(r, " has keys [" + from.join(", ") + "] in " + where + " as expected")
                    : fail(r, " keys [" + from.join(", ") + "]", "Keys [" + missing.join(", ") + "] do not exist in " + where);
            }

            default:
                return fail(r, "", "Unknown array comparison type [" + type + "]");
        }
    }

    // ---- special expected tokens
    if (exp === "(RANDOM_GUID)")
        return FW_GUID_RE.test(String(val))
            ? pass(r, "(random guid) [" + show(val) + "] as expected")
            : fail(r, "[" + show(val) + "]", "Expected GUID format");

    if (exp === "(RANDOM_CERT)")
        return FW_CERT_RE.test(String(val))
            ? pass(r, "(random certificate) [" + show(val) + "] as expected")
            : fail(r, "[" + show(val) + "]", "Expected certificate thumbprint (40 hex chars)");

    if (exp === "(RANDOM_PROPERTY)")
        return pass(r, "[" + show(val) + "] as expected");

    if (exp === "(RANDOM_XML)")
    {
        let ok = false;
        try { require("xml2js").parseString(String(val), (err, res) => { ok = !err && !!res; }); } catch (e) { ok = false; }
        return ok
            ? pass(r, "(random XML) [" + show(val) + "] as expected")
            : fail(r, "(random XML)", "Value is not valid XML");
    }

    if (T === "DATETIME")
    {
        const re = FW_DATETIME_FORMATS[exp];
        if (!re) return fail(r, "[" + show(val) + "]", "Unsupported datetime format [" + exp + "]. Supported: " + Object.keys(FW_DATETIME_FORMATS).join(" | "));
        return re.test(String(val))
            ? pass(r, "[" + show(val) + "] and has format as expected [" + exp + "]")
            : fail(r, "[" + show(val) + "]", "Expected format [" + exp + "]");
    }

    if (exp === "NULL")
        return (val === null)
            ? pass(r, "[null] as expected")
            : fail(r, "[" + show(val) + "]", "Expected [null]");

    if (exp === "EMPTY")
    {
        const empty = (val === "") || (val !== null && typeof val === "object" && Object.keys(val).length === 0);
        return empty
            ? pass(r, "[EMPTY] as expected")
            : fail(r, "[" + show(val) + "]", "Expected empty value ('', {} or [])");
    }

    if (exp === "KEY_EXIST")
        return pass(r, "[" + show(val) + "] it is \"Not Empty or Does Exist\" as expected");

    if (exp === "KEY_NOT_EXIST")
        return fail(r, "[" + show(val) + "]", "Property must not exist, but it is in the response");

    // ---- mismatch
    switch (T)
    {
        case "ABOVE": return fail(r, "[" + show(val) + "]", "[" + show(val) + "] is not above expected [" + exp + "]");
        case "BELOW": return fail(r, "[" + show(val) + "]", "[" + show(val) + "] is not below expected [" + exp + "]");
        case "EQL":   return fail(r, "[" + show(val) + "]", "Expected [" + show(exp) + "]");
        default:      return fail(r, "[" + show(val) + "]", "Unknown comparison type [" + type + "] or mismatch with [" + show(exp) + "]");
    }
}


// ============== Internal helpers ===============

function newResult(silent = false)
{
    return { Msg: [], Result: "", Assert: null, Silent: Boolean(silent), Value: undefined, Var: null };
}

function pass(r, text) { r.Result += text; r.Assert = null; return r; }
function fail(r, text, assert) { r.Result += text; r.Assert = assert; return r; }

// Короткое представление значения для заголовка теста
function show(v, max = 50)
{
    let s;
    if (typeof v === "string") s = v;
    else { try { s = JSON.stringify(v); } catch (e) { s = String(v); } }
    s = String(s);
    return s.length > max ? s.substring(0, max) + "..." : s;
}

// typeof с различением null/array; целое число подходит и под "integer", и под "number"
function typeOf(v)
{
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
}
function typeMatches(v, expected)
{
    const t = typeOf(v);
    return [].concat(expected).some((e) => e === t || (e === "integer" && Number.isInteger(v)));
}

// "{{var}}" в ожидаемом значении подставляется из переменных Postman
function resolve(v)
{
    if (typeof v === "string" && v.indexOf("{{") >= 0) return P().variables.replaceIn(v);
    return v;
}
function resolveDeep(v)
{
    if (Array.isArray(v)) return v.map(resolveDeep);
    if (v && typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => { o[k] = resolveDeep(v[k]); }); return o; }
    return resolve(v);
}

// "/^abc$/i" | "abc" | RegExp -> RegExp
function toRegExp(exp)
{
    if (exp instanceof RegExp) return exp;
    const s = String(exp);
    const m = s.match(/^\/([\s\S]*)\/([a-z]*)$/);
    return m ? new RegExp(m[1], m[2]) : new RegExp(s);
}

// Безопасный (без eval) доступ по пути: a.b[0].c | [0].a | ["key.with.dot"] | ""
// found=false, если ключа нет (отличает "нет ключа" от "значение undefined/null")
function getByPath(obj, path)
{
    if (path === "" || path === null || path === undefined) return { found: true, value: obj };
    const tokens = [];
    String(path).replace(/\[(\d+)\]|\[["']([^"']+)["']\]|([^.\[\]]+)/g, (m, idx, quoted, name) => {
        tokens.push(idx !== undefined ? Number(idx) : (quoted !== undefined ? quoted : name));
        return m;
    });
    let cur = obj;
    for (const t of tokens)
    {
        if (cur === null || cur === undefined || typeof cur !== "object" || !(t in cur))
            return { found: false, value: undefined };
        cur = cur[t];
    }
    return { found: true, value: cur };
}

// Пути к ключам из списка на любой глубине (без учёта регистра)
function deepKeys(data, names)
{
    const want = names.map((n) => String(n).toLowerCase()), found = [];
    const walk = (v, path) => {
        if (!v || typeof v !== "object") return;
        Object.keys(v).forEach((k) => {
            const p = path ? path + "." + k : k;
            if (want.indexOf(k.toLowerCase()) >= 0) found.push(p);
            walk(v[k], p);
        });
    };
    walk(data, "");
    return found;
}

function stripFormats(s)
{
    if (Array.isArray(s)) return s.map(stripFormats);
    if (s && typeof s === "object")
    {
        const o = {};
        Object.keys(s).forEach((k) => { if (k !== "format") o[k] = stripFormats(s[k]); });
        return o;
    }
    return s;
}

function getContentType()
{
    const h = P().response.headers.get("Content-Type") || "";
    if (/^application\/([\w.+-]*\+)?json/i.test(h)) return "json";
    if (/^application\/grpc/i.test(h)) return "grpc";
    return h || "(none)";
}

// Читает тело ответа. При ошибке заполняет r и возвращает ok=false.
function readBody(r)
{
    const ct = getContentType();
    try
    {
        if (ct === "json") return { ok: true, data: P().response.json() };
        if (ct === "grpc") return { ok: true, data: P().response.messages.all()[0].data };
    }
    catch (e)
    {
        r.Result = "Cannot read response body";
        r.Assert = e.message;
        r.Silent = false;
        return { ok: false };
    }
    r.Result = "Unsupported Content-Type [" + ct + "]";
    r.Assert = "Expect JSON or gRPC";
    r.Silent = false;
    return { ok: false };
}

// ---- cookies
function headersOf(res)
{
    const h = res && res.headers;
    if (!h) return [];
    const list = typeof h.all === "function" ? h.all() : (h.members || []);
    return list.filter((x) => String(x.key).toLowerCase() === "set-cookie").map((x) => x.value);
}
function responseSetCookies() { return headersOf(P().response); }

function parseSetCookies(values, name)
{
    return values.map((raw) => {
        const parts = String(raw).split(";").map((s) => s.trim());
        const eq = parts[0].indexOf("=");
        const c = { raw: raw, name: parts[0].substring(0, eq), value: parts[0].substring(eq + 1), attrs: {} };
        parts.slice(1).forEach((a) => {
            const i = a.indexOf("=");
            c.attrs[(i < 0 ? a : a.substring(0, i)).toLowerCase()] = i < 0 ? true : a.substring(i + 1);
        });
        const maxAge = c.attrs["max-age"], expires = c.attrs["expires"];
        c.cleared = (maxAge !== undefined && Number(maxAge) <= 0) || (expires !== undefined && Date.parse(expires) < Date.now());
        return c;
    }).filter((c) => c.name === name);
}

// "HttpOnly" | "Secure" | "SameSite" | "SameSite=Lax" | "SameSite=Lax|Strict" | "Path=/" | "Domain"
function hasAttr(c, spec)
{
    const i = String(spec).indexOf("=");
    const key = (i < 0 ? spec : spec.substring(0, i)).toLowerCase();
    if (!(key in c.attrs)) return false;
    if (i < 0) return true;
    return spec.substring(i + 1).split("|").some((v) => String(c.attrs[key]).toLowerCase() === v.toLowerCase());
}

function cookieMaxAge(c)
{
    if (c.attrs["max-age"] !== undefined) return Number(c.attrs["max-age"]);
    if (c.attrs["expires"] !== undefined) return Math.round((Date.parse(c.attrs["expires"]) - Date.now()) / 1000);
    return null;
}

// ---- generators for matrix variants
function uuid4()
{
    const h = "0123456789abcdef";
    let s = "";
    for (let i = 0; i < 36; i++)
    {
        if (i === 8 || i === 13 || i === 18 || i === 23) { s += "-"; continue; }
        if (i === 14) { s += "4"; continue; }
        const n = Math.floor(Math.random() * 16);
        s += (i === 19) ? h[(n & 0x3) | 0x8] : h[n];
    }
    return s;
}
function tamper(v)
{
    const s = String(v || "");
    if (!s) return randomString(43);
    const i = Math.floor(s.length / 2), ch = s[i];
    return s.substring(0, i) + (ch === "A" ? "B" : "A") + s.substring(i + 1);
}
function swapCase(v)
{
    return String(v || "").split("").map((ch) => ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()).join("");
}


// ============== Obsolete (backward compatibility) ===============
function test_grpc(path, exp, type, silent)
{
    return test(path, exp, type, silent);
}
