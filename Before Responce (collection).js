// =====================================================================
// Before Request - единый файл для скрипта уровня КОЛЛЕКЦИИ (Pre-request)
// v4: подготовка теста одной строкой на шаг (utils.bind)
//
// Функции коллекции ничего не пишут в консоль собственным console - вывод
// не виден. Ошибки настройки - через throw (видно в интерфейсе Postman) или
// через переменную fw_setup_error: After Response покажет её первым тестом.
//
// В запросе:
//   const { login, account, need } = utils.bind(pm, console);
//   login("sid");                 // вход учёткой #0, cookie -> {{sid}}
// Шаги выполняются строго по очереди (асинхронные запросы ждут друг друга).
// В начале и в конце подготовки cookie jar очищается: запрос получает только
// те cookie, что явно указаны в его заголовке Cookie.
// Использование - см. "Before Responce (usage).js".
// =====================================================================

// Фасад: именно его вызывают скрипты запросов
utils = {
  bind:                 function (reqPm, reqConsole) { return fwSetupBind(reqPm, reqConsole); },
  convert:              function (dest, var_space, src_var, target_var) { return convert(dest, var_space, src_var, target_var); },
  randomVal:            function (type, min = null, max = null, length = 1) { return randomVal(type, min, max, length); },
  randomString:         function (length = 1) { return randomString(length); },
  getAdminAccountCreds: function () { return getAdminAccountCreds(); },
  getAccounts:          function () { return getAccounts(); },
};

var FW_SESSION_COOKIE = "__Host-sid";


// ============== Setup DSL ===============
function fwSetupBind(reqPm, reqConsole)
{
    const out = reqConsole || console;
    const queue = [];
    let busy = false, failed = false;

    // флаги для After Response помечены id запроса: в раннере локальные переменные живут дольше запроса
    const tag = (text) => (reqPm.info && reqPm.info.requestId ? reqPm.info.requestId : "") + "|" + text;
    reqPm.variables.set("fw_setup_error", "");
    reqPm.variables.set("fw_skip_reason", "");

    const base = () => reqPm.variables.replaceIn("{{baseUrl}}");
    const R = (v) => (typeof v === "string" && v.indexOf("{{") >= 0) ? reqPm.variables.replaceIn(v) : v;

    function failSetup(step, message)
    {
        failed = true;
        queue.length = 0;
        const text = step + ": " + message;
        reqPm.variables.set("fw_setup_error", tag(text));
        out.error("SETUP FAILED - " + text);
    }

    function pump()
    {
        if (busy || failed || !queue.length) return;
        busy = true;
        const step = queue.shift();
        let finished = false;
        const done = (err) => {
            if (finished) return;
            finished = true;
            busy = false;
            if (err) failSetup(step.name, err.message || String(err));
            pump();
        };
        try { step.fn(done); }
        catch (e) { done(e); }
    }

    function enqueue(name, fn) { queue.push({ name: name, fn: fn }); pump(); }

    function skip(reason)
    {
        failed = true;          // остальные шаги подготовки не выполняются
        queue.length = 0;
        out.warn("SKIPPED: " + reason);
        // если Postman не умеет skipRequest (или вызов из callback не сработал),
        // After Response увидит причину и не будет выполнять проверки
        reqPm.variables.set("fw_skip_reason", tag(reason));
        if (reqPm.execution && typeof reqPm.execution.skipRequest === "function") reqPm.execution.skipRequest();
        else throw new Error("SKIPPED: " + reason);
    }

    // opts: { method, path, cookie, headers, body, query }
    function send(o, cb)
    {
        const headers = {};
        Object.keys(o.headers || {}).forEach((k) => { headers[k] = R(o.headers[k]); });
        const sid = o.as ? reqPm.variables.get(o.as) : R(o.cookie);
        if (sid) headers.Cookie = FW_SESSION_COOKIE + "=" + sid;
        let url = base() + R(o.path);
        if (o.query) url += (url.indexOf("?") < 0 ? "?" : "&") + R(o.query);
        const req = { url: url, method: o.method || "GET", header: headers };
        if (o.body !== undefined)
        {
            if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
            req.body = { mode: "raw", raw: (typeof o.body === "string") ? R(o.body) : JSON.stringify(resolveDeep(o.body, R)) };
        }
        reqPm.sendRequest(req, (err, res) => {
            let json;
            try { json = res ? res.json() : undefined; } catch (e) { json = undefined; }
            cb(err, res, json);
        });
    }

    function clearJar(done)
    {
        try { reqPm.cookies.jar().clear(base(), () => done()); }
        catch (e) { done(); }   // домен не в allowlist - тест всё равно передаёт cookie явно
    }

    function creds(who, prefix)
    {
        if (failed) return { login: "", password: "" };
        const acc = pickAccount(who, reqPm.variables.get("current_login"));
        reqPm.variables.set(prefix + "_login", acc.login);
        reqPm.variables.set(prefix + "_pass", acc.password);
        if (acc.role) reqPm.variables.set(prefix + "_role", acc.role);
        return acc;
    }

    const api = {
        // ---- проверки окружения (синхронно; при невыполнении запрос пропускается)
        need: function (condition, reason) { if (!condition && !failed) skip(reason); },
        needAccounts: function (n) {
            if (failed) return;
            const list = getAccounts();
            const distinct = new Set(list.map((a) => a.login)).size;
            if (distinct < n) skip("needs " + n + " different accounts in env AdminAccounts, configured: " + distinct);
        },
        needFlag: function (flag) {
            if (!failed && String(reqPm.environment.get(flag)) !== "true") skip("env [" + flag + "] is not 'true'");
        },
        needEnv: function (name) {
            if (!failed && !reqPm.environment.get(name)) skip("env [" + name + "] is not set");
        },

        // ---- переменные (синхронно)
        set: function (name, value) { reqPm.variables.set(name, R(value)); },
        account: function (who = "random", prefix = "current") { creds(who, prefix); },
        longString: function (name, length, ch = "a") { reqPm.variables.set(name, new Array(Number(length) + 1).join(ch)); },
        email: function (name, length) {
            // ровно length символов: <local>@example.com
            const domain = "@example.com", n = Number(length) - domain.length;
            reqPm.variables.set(name, new Array(n + 1).join("a") + domain);
        },
        uuid: function (name) { reqPm.variables.set(name, uuid4()); },
        now: function (name) { reqPm.variables.set(name, new Date().toISOString()); },
        random: function (name, length = 12, prefix = "") { reqPm.variables.set(name, prefix + randomString(length)); },

        // ---- шаги с запросами (асинхронно, по очереди)
        clearCookies: function () { enqueue("clearCookies", clearJar); },
        wait: function (ms) { enqueue("wait " + ms, (done) => setTimeout(() => done(), Number(ms))); },

        // login("sid", who, {headers}) - вход учёткой who (номер | "random" | "other" | роль),
        // cookie -> {{sid}}, а также {{sid_userId}}, {{sid_login}}, {{sid_pass}}, {{sid_role}}
        login: function (varName = "sid", who = 0, opts = {}) {
            reqPm.variables.set(varName, "");                 // не тащить значение из прошлого запроса
            const acc = creds(who, varName);
            enqueue("login " + varName, (done) => {
                send({ method: "POST", path: "/api/auth/login", headers: opts.headers,
                       body: { email: acc.login, password: acc.password } }, (err, res, json) => {
                    if (err) return done(err);
                    if (res.code !== 200) return done(new Error("POST /api/auth/login as " + acc.login + " returned " + res.code));
                    const sid = sessionCookieOf(res);
                    if (!sid) return done(new Error("login returned 200 without Set-Cookie " + FW_SESSION_COOKIE));
                    reqPm.variables.set(varName, sid);
                    if (json && json.id) reqPm.variables.set(varName + "_userId", json.id);
                    if (json && json.role) reqPm.variables.set(varName + "_role", json.role);
                    done();
                });
            });
        },

        // logout("sid") - закрыть сессию из {{sid}} (значение остаётся в переменной: "отозванная сессия")
        logout: function (varName = "sid") {
            enqueue("logout " + varName, (done) => {
                send({ method: "POST", path: "/api/auth/logout", as: varName }, (err, res) => {
                    if (err) return done(err);
                    if (res.code !== 204) return done(new Error("POST /api/auth/logout returned " + res.code));
                    done();
                });
            });
        },

        // revokedSession("sid_revoked") - вход + выход: значение закрытой сессии
        revokedSession: function (varName = "sid_revoked", who = 0) {
            api.login(varName, who);
            api.logout(varName);
        },

        // derive("sid_bad", "sid", "tamper" | "truncate" | "suffix" | "swapcase") - испорченное значение сессии {{sid}}
        derive: function (varName, fromVar, how) {
            reqPm.variables.set(varName, "");
            enqueue("derive " + varName, (done) => {
                const v = String(reqPm.variables.get(fromVar) || "");
                if (!v) return done(new Error("{{" + fromVar + "}} is empty"));
                let out;
                switch (String(how))
                {
                    case "tamper":   { const i = Math.floor(v.length / 2); out = v.substring(0, i) + (v[i] === "A" ? "B" : "A") + v.substring(i + 1); break; }
                    case "truncate": out = v.slice(0, -1); break;
                    case "suffix":   out = v + "x"; break;
                    case "swapcase": out = v.split("").map((c) => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join(""); break;
                    default: return done(new Error("derive: unknown mode [" + how + "]"));
                }
                reqPm.variables.set(varName, out);
                done();
            });
        },

        // failLogins(5,"{{lock_login}}", { xff: true }) - N неудачных входов подряд
        failLogins: function (count, email, opts = {}) {
            for (let i = 0; i < Number(count); i++)
            {
                enqueue("failed login #" + (i + 1), (done) => {
                    const headers = opts.xff ? { "X-Forwarded-For": "10." + rnd(0, 255) + "." + rnd(0, 255) + "." + rnd(1, 254) } : {};
                    send({ method: "POST", path: "/api/auth/login", headers: headers,
                           body: { email: R(email), password: "wrong_" + randomString(12) } }, (err) => done(err));
                });
            }
        },

        // call("POST", "/api/auth/logout", { as: "sid", body, headers, expect: 204 }, { var: "x", path: "sessions[0].sessionId" })
        call: function (method, path, opts = {}, save) {
            enqueue(method + " " + path, (done) => {
                send(Object.assign({ method: method, path: path }, opts), (err, res, json) => {
                    if (err) return done(err);
                    if (opts.expect !== undefined && [].concat(opts.expect).indexOf(res.code) < 0)
                        return done(new Error(method + " " + R(path) + " returned " + res.code + ", expected " + opts.expect));
                    if (save)
                    {
                        const g = getByPath(json, save.path || "");
                        if (!g.found) return done(new Error(method + " " + R(path) + ": no [" + save.path + "] in response"));
                        reqPm.variables.set(save.var, typeof g.value === "object" ? JSON.stringify(g.value) : g.value);
                    }
                    done();
                });
            });
        },

        // pick("my_sessionId", "/api/auth/sessions?size=200", "sessionId", { current: true }, { as: "sid" })
        // Берёт поле первого элемента массива (или первого поля-массива ответа: sessions[], items[]), подходящего под match.
        // Значение match "!x" - "не равно x"; "{{var}}" подставляется в момент шага.
        // Нет подходящего элемента: opts.orSkip !== false -> запрос пропускается.
        pick: function (varName, path, field, match = {}, opts = {}) {
            reqPm.variables.set(varName, "");
            enqueue("pick " + varName, (done) => {
                send({ method: "GET", path: path, as: opts.as || "sid" }, (err, res, json) => {
                    if (err) return done(err);
                    if (res.code !== 200) return done(new Error("GET " + R(path) + " returned " + res.code));
                    const list = Array.isArray(json) ? json
                               : (json && typeof json === "object" ? (Object.values(json).find((v) => Array.isArray(v)) || []) : []);
                    const hit = list.find((el) => Object.keys(match).every((k) => {
                        const want = String(R(match[k])), v = getByPath(el, k).value;
                        return want[0] === "!" ? String(v) !== want.substring(1) : String(v) === want;
                    }));
                    if (!hit)
                    {
                        const why = "no element in GET " + R(path) + " matches " + JSON.stringify(match);
                        if (opts.orSkip === false) return done(new Error(why));
                        try { skip(why); } catch (e) { return done(e); }
                        return done();
                    }
                    const g = getByPath(hit, field);
                    reqPm.variables.set(varName, typeof g.value === "object" ? JSON.stringify(g.value) : g.value);
                    done();
                });
            });
        },
    };

    // cookie jar: очистить до шагов и после них (ответы pm.sendRequest могут его наполнить)
    api.clearCookies();
    setTimeout(() => { if (!failed) api.clearCookies(); }, 0);
    return api;
}


// ============== Functions ===============

// Кодирует переменную и кладёт результат в целевую; возвращает закодированное значение
function convert(dest, var_space, src_var, target_var)
{
    let src_val;
    switch (var_space)
    {
        case "collection": src_val = pm.collectionVariables.get(src_var); break;
        case "env":        src_val = pm.environment.get(src_var); break;
        default: throw new Error("convert: unsupported variable space [" + var_space + "]");
    }
    if (src_val === undefined || src_val === null)
        throw new Error("convert: variable [" + src_var + "] is not set in [" + var_space + "]");

    let encoded;
    if (String(dest).toLowerCase() === "base64")
    {
        const CryptoJS = require("crypto-js");
        encoded = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(String(src_val)));
    }
    else
    {
        throw new Error("convert: unsupported destination [" + dest + "]");
    }

    if (var_space === "env") pm.environment.set(target_var, encoded);
    else pm.collectionVariables.set(target_var, encoded);
    return encoded;
}

function randomString(length = 1)
{
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s = "";
    for (let i = 0; i < length; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}

// Usage: см. "Before Responce (usage).js"
var FW_RANDOM_TEXT = "Flat Earth is an archaic and scientifically disproven conception of the Earth's shape as a plane or disk. Many ancient cultures subscribed to a flat-Earth cosmography, notably including ancient near eastern cosmology. The model has undergone a recent resurgence as a conspiracy theory. The idea of a spherical Earth appeared in ancient Greek philosophy with Pythagoras (6th century BC). However, most pre-Socratics (6th-5th century BC) retained the flat-Earth model. In the early 4th century BC, Plato wrote about a spherical Earth. By about 330 BC, his former student Aristotle had provided strong empirical evidence for a spherical Earth. Knowledge of the Earth's global shape gradually began to spread beyond the Hellenistic world. By the early period of the Christian Church, the spherical view was widely held, with some notable exceptions. In contrast, ancient Chinese scholars consistently describe the Earth as flat, and this perception remained unchanged until their encounters with Jesuit missionaries in the 17th century.[6] Traditionalist Muslim scholars have maintained that the earth is flat, though, since the 9th century, Muslim scholars tended to believe in a spherical Earth. It is a historical myth that medieval Europeans generally thought the Earth was flat.[9] This myth was created in the 17th century by Protestants to argue against Catholic teachings.[10] More recently, flat earth theory has seen an increase in popularity with modern flat Earth societies, and unaffiliated individuals using social media. Despite the scientific facts and obvious effects of Earth's sphericity, pseudoscientific[13] flat-Earth conspiracy theories persist. In a 2018 study reported on by Scientific American, only 82% of 18 to 24 year old respondents agreed with the statement I have always believed the world is round. However, a firm belief in a flat Earth is rare, with less than 2% acceptance in all age groups.";

function randomVal(type, min = null, max = null, length = 1)
{
    switch (String(type).toUpperCase())
    {
        case "INT":
            return rnd(min === null ? 0 : min, max === null ? 100 : max);
        case "INN":
            return rnd(100000000000, 999999999999);
        case "SNILS_F":
            return rnd(100, 999) + "-" + rnd(100, 999) + "-" + rnd(100, 999) + " " + rnd(10, 99);
        case "SNILS":
            return rnd(10000000000, 99999999999);
        case "STRING":
            return randomString(length);
        case "DATE":
            return getRandomDateTime(new Date(min), new Date(max)).toISOString().substring(0, 10);
        case "DATETIME":
            return getRandomDateTime(new Date(min), new Date(max)).toISOString();
        case "TEXT":
        {
            const start = rnd(0, Math.max(0, FW_RANDOM_TEXT.length - length));
            return FW_RANDOM_TEXT.substring(start, start + length);
        }
        case "BOOLEAN":
            return Math.random() >= 0.5;
        default:
            return "NoRandom";
    }
}

// internal functions
function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function getRandomDateTime(from, to)
{
    from = from.getTime();
    to = to.getTime();
    return new Date(from + Math.random() * (to - from));
}

// Список учёток из env AdminAccounts: JSON-массив [{login, password, role?}]
function getAccounts()
{
    const raw = pm.environment.get("AdminAccounts");
    if (!raw) throw new Error("Environment variable [AdminAccounts] is not set");

    let accounts;
    try { accounts = JSON.parse(raw); }
    catch (e) { throw new Error("[AdminAccounts] is not valid JSON: " + e.message); }
    if (!Array.isArray(accounts) || accounts.length === 0)
        throw new Error("[AdminAccounts] must be a non-empty array of {login, password}");
    accounts.forEach((acc) => {
        if (!acc.login || !acc.password) throw new Error("[AdminAccounts] item must have [login] and [password]");
    });
    return accounts;
}

// Учётка администратора из env AdminAccounts - случайная
function getAdminAccountCreds()
{
    const accounts = getAccounts();
    const acc = accounts[Math.floor(Math.random() * accounts.length)];
    return { login: acc.login, password: acc.password };
}

// who: номер в списке | "random" | "other" (логин не равен current) | роль ("root", "admin")
function pickAccount(who, currentLogin)
{
    const accounts = getAccounts();
    if (typeof who === "number")
    {
        if (!accounts[who]) throw new Error("[AdminAccounts] has no item #" + who);
        return accounts[who];
    }
    switch (String(who))
    {
        case "random": return accounts[Math.floor(Math.random() * accounts.length)];
        case "other":
        {
            const acc = accounts.find((a) => a.login !== currentLogin && a.login !== accounts[0].login) ||
                        accounts.find((a) => a.login !== currentLogin);
            if (!acc) throw new Error("[AdminAccounts] has no account different from [" + currentLogin + "]");
            return acc;
        }
        default:
        {
            const acc = accounts.find((a) => a.role === who);
            if (!acc) throw new Error("[AdminAccounts] has no account with role [" + who + "]");
            return acc;
        }
    }
}

function sessionCookieOf(res)
{
    const h = res && res.headers;
    const list = h ? (typeof h.all === "function" ? h.all() : (h.members || [])) : [];
    for (const x of list)
    {
        if (String(x.key).toLowerCase() !== "set-cookie") continue;
        const m = String(x.value).match(new RegExp("^\\s*" + FW_SESSION_COOKIE.replace(/[-]/g, "\\-") + "=([^;]*)"));
        if (m && m[1] && !/max-age=0/i.test(x.value)) return m[1];
    }
    try { return res.cookies.get(FW_SESSION_COOKIE) || null; } catch (e) { return null; }
}

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

function resolveDeep(v, R)
{
    if (Array.isArray(v)) return v.map((x) => resolveDeep(x, R));
    if (v && typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => { o[k] = resolveDeep(v[k], R); }); return o; }
    return R(v);
}

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
