// ============== Functions ===============
// Public
function test(path, exp, type, silent)
{
    var pathF = path.replace(".", ": ") + ":"
    if (type.toUpperCase().substring(0,5) == "ARRAY")
    {
        msg = "Array [" + pathF + "]"
    }
    else 
    {
        msg = "Property [" + pathF + "] has value: "
    }
    var contentType = getContentType();
    if ( contentType == "json" )
    {
        // If first node is array - must select path "pm.response.json()" without dot at end
        startPath = ( path.substring(0, 1) == "[" || path == "" ) ? 'pm.response.json()' : 'pm.response.json().';
        // Try to read key if it exist
        var keyExist = true;
        try
        {
            val = eval(startPath + path);
    	}
    	catch(e)
    	{
            //console.error(e);
            //console.error(e.message);
            pm.test("Variable [" + path + "] is undefined", () => {
                pm.expect(eval(startPath + path)).to.be.exist;
	        })
            keyExist = false;
        }
        if ( keyExist )
        {
     	    val = eval(startPath + path);
            compare (msg, val, exp, type, silent)
        }
    }
    else if ( contentType == "grpc" )
    {
        val = eval('pm.response.messages.all()[0].data.' + path);
        if(exist(path, val))
        {
            compare (msg, val, exp, type, silent)
        }
    }
    else
    {
        console.log("Unsupported Content-Type [" + contentType + "]")
    }
}

function compare (msg, val, exp, type, silent)
{
    //console.log("Finction Compare start")
    //console.log("msg[" + msg + "]; val[" + val + "]; exp[" + exp + "]; type[" + type + "]; silent[" + silent + "]")
    type = type.toUpperCase();

    if ( val == exp && type == "eql".toUpperCase() )
    {
        if (val.length > 50) // if val so long
        {
            val = val.substr(1,50) + "..."
        }
        show_pass(msg + '[' + val + '] as expected', silent)
    }
    else if (val < exp && type == "below".toUpperCase() )
    {
        show_pass(msg + '[' + val + '] below than [' + exp + '] as expected' , silent)
    }
    else if ( val > exp && type == "above".toUpperCase() )
    {
        show_pass(msg + '[' + val + '] above than [' + exp + '] as expected', silent)
    }
    else if ( type == "regex".toUpperCase() && eval(exp + '.test(val)') )
    {
        show_pass(msg + '[' + val + '] by regex [' + exp + '] as expected', silent)
    }
    /*
    else if ( type == "ARRAY_SIZE_EQL" && val.length == exp )
    {
        show_pass("Size of array " + '[' + val + '] is [' + exp.length + '] as expected', silent)
    }
    */
    else if ( (type == "below_count_array".toUpperCase() || type == "array_count_below".toUpperCase()) && val.length < parseInt(exp)) 
    {
        show_pass(msg + ' below than [' + exp + '] as expected', silent)
    }
    else if ( (type == "above_count_array".toUpperCase() || type == "array_count_above".toUpperCase()) && val.length > parseInt(exp) )
    {
        show_pass(msg + ' above than [' + exp + '] as expected', silent)
    }															 
    else if ( (type == "array_count".toUpperCase()) && val.length == parseInt(exp) )
    {
        show_pass(msg + ' count is [' + exp + '] as expected', silent)
    }															 
    else if ( type == "array".toUpperCase() )
    {  
        valueFound = false
        val.forEach(function(elem)
        {
            expResult = eval('elem["' + exp[0].replaceAll(".", '"]["') + '"]')
            if ( expResult == exp[1] )
            {
                show_pass(msg + ' has value: [' + expResult + '] in property [' + exp[0] + '] as expected', silent)
                valueFound = true
            }
        });
        if ( !valueFound )
            {
                pm.test(msg + ' has not value in elem [' + exp[0] + ']', () => {
                pm.expect(exp[1]).to.be.oneOf(val);
                })
            }
    }
    else if ( type == "array_compare_keysInExp".toUpperCase() || type == "array_compare_expInKeys".toUpperCase() )
    {
        // Compare arrays: responce keys in array and Expect list
        if ( type == "array_compare_keysInExp".toUpperCase() )
        {
            // Keys in responce array is exist in exp's array
            var arrayVal = getKeysfromJSONarray(val);
            var arrayExp = exp;
            var msgAdd = "exp list"

        }
        else if (type == "array_compare_expInKeys".toUpperCase())
        {
            // Items (keys list) in exp's array is exist in responce array
            var arrayVal = exp;
            var arrayExp = getKeysfromJSONarray(val);
            var msgAdd = "responce"
        }

        arrayVal.forEach((element) => {
            if ( arrayExp.includes(element) )
            {
                show_pass(msg +  " has key [" + element + "] as expected", silent);
            }
            else
            {
                pm.test(msg + " key [" + element + "] does not exist in " + msgAdd, () => {
                    pm.expect(element).to.include(arrayExp)
                });

            }
        })
    }
    else if ( exp == "(RANDOM_GUID)" && (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val)) )
    {
        show_pass(msg + '(random guid) [' + val + '] as expected', silent)
    }
    else if ( exp == "(RANDOM_XML)" )
    {
        var parseString = require('xml2js').parseString;
        parseString(val, function (err, result) {
        if (result)
        {
            if ( val.length > 50 ) // if val so long
            {
                val = val.substr(1,50) + "..."
            }
            show_pass(msg + '(random XML) [' + val + '] as expected', silent)
        }
        else
        {
            pm.test(msg + '(random XML)', () => {
                pm.expect(val).to.eql("(random XML)")
            })
        }
        });
    }
    else if ( exp == "(RANDOM_PROPERTY)" )
    {
        if (val.length > 50) // if val so long
        {
            val = val.substr(1,50) + "..."
        }
        show_pass(msg + ' [' + val + '] as expected', silent)
    }
    else if ( exp == "(RANDOM_CERT)" && (/^[0-9a-fA-F]{40}$/.test(val)) )
    {
        show_pass(msg + '(random certificate) [' + val + '] as expected', silent)
    }
    else if ( type == "datetime".toUpperCase() )
    {
        if (( exp == "YYYY-MM-DDThh:mm:ss.tttZ" && (/^[1-2]{1}[9,0]{1}[0-9]{2}-[0-1]{1}[0-9]{1}-[0-3]{1}[0-9]{1}T[0-2]{1}[0-9]{1}:[0-5]{1}[0-9]{1}:[0-5]{1}[0-9]{1}\.[0-9]{1,3}Z$/.test(val))) || ( exp == "YYYY-MM-DDThh:mm:ssZ" && (/^[1-2]{1}[9,0]{1}[0-9]{2}-[0-1]{1}[0-9]{1}-[0-3]{1}[0-9]{1}T[0-2]{1}[0-9]{1}:[0-5]{1}[0-9]{1}Z$/.test(val))))
        {
            show_pass(msg + '[' + val + '] and has format as expected [' + exp + ']', silent)
        }
        else
        {
            pm.test(msg + "(DATETIME FORMAT) ", () => {
                pm.expect(exp).to.eql(val)
            })
        }
    }
    else if ( exp == "NULL" && val == null)
    {
        show_pass(msg + ' [' + val + '] as expected', silent)
    }
    else if ( exp == "EMPTY" && Object.keys(val).length == 0)
    {
        show_pass(msg + ' [' + 'HAS NO KEYS' + '] as expected', silent)
    }
    else if ( exp == "KEY_EXIST" && ( val != undefined || val == null ) )
    {
        show_pass(msg + ' [' + val + '] it is "Not Empty or Does Exist" as expected', silent)
    }
    else
    {
        //console.log("exp: [" + exp + "] val: [" + val + "]; type [" + type + "]")
        pm.test(msg, () => {
            switch (type)
            {
                case "above".toUpperCase():
                    pm.expect(parseInt(val)).to.above(parseInt(exp))
                    break;
                case "below".toUpperCase():
                    pm.expect(parseInt(val)).to.below(parseInt(exp))
                    break;
                case "above_count_array".toUpperCase():
                    pm.expect(parseInt(val.length)).to.above(parseInt(exp))
                    break;
                case "below_count_array".toUpperCase():
                    pm.expect(parseInt(val.length)).to.below(parseInt(exp))
                    break;										 
                case "array_count".toUpperCase():
                    console.log(val.length)
                    pm.expect(parseInt(val.length)).to.equal(parseInt(exp))
                    break;
                case "array_count_above".toUpperCase():
                    pm.expect(parseInt(val.length)).to.above(parseInt(exp))
                    break;
                case "array_count_below".toUpperCase():
                    pm.expect(parseInt(val.length)).to.below(parseInt(exp))
                    break;										 
                default:
                    pm.expect(exp).to.eql(val)
            }
        });
    }  
}
  
function check(parameter, exp, type, silent)
{
    switch (parameter)
    {
        case "statusCode":
            val = (pm.response.statusCode === undefined ) ? pm.response.code : pm.response.statusCode;
            msg = 'Status Code is '
            break;
        case "responseTime":
            val = pm.response.responseTime
            msg = 'Response Time is '
            break;
        case "contentLength":
            val = pm.response.headers.get("Content-Length")
            msg = 'Content Length is '
            break;
        default:
            val = "UNEXPECTED"
            msg = "UNEXPECTED"
    }
    compare (msg, val, exp, type, silent)
}
  
function basictests()
{
    var contentType = getContentType();
    if ( contentType == "json" )
    {
        // Status Code
        pm.test('Status code is 200', function (done) {
            pm.response.to.have.statusCode(200);
        });
    }
    else if ( contentType == "grpc" )
    {
        // Status Code
        pm.test('Status code is 0', function (done) {
            pm.response.to.have.statusCode(0);
        });
    }
    else
    {
        console.log("Unsupported Content-Type [" + contentType + "] for BasicTest()")
        pm.test('Unsupported Content-Type [' + contentType + '] for BasicTest() ', function (done) {
            pm.expect('JSON or gRPC').to.eql(contentType, "sds");
        });
    }
}
  
function setvar(varName, path, space)
{
    val = eval('pm.response.messages.all()[0].data.' + path)
    switch (space)
    {
        case 'collection':
            pm.collectionVariables.set(varName, val);
            break;
        case 'env':
            pm.environment.set(varName, val);
            break;
    }
}

function getvar(varName, space="collection")
{
    space = space.toUpperCase();
    ret = "";
    if ( space == "COLLECTION" )
    {
        ret = pm.collectionVariables.get(varName);
    }
    /*
    else if ( space == "ENVIRONMENT" )
    {

    }
    */
    return ret;
}

function randomString(length=1) {
    // length = str length
    let randomString = "";
    for (let i = 0; i < length; i++){
        randomString += pm.variables.replaceIn("{{$randomAlphaNumeric}}");
    }
    return randomString;
}

// Internal functions
function getContentType()
{
    var contentType = (pm.response.headers.has("Content-Type")) ? pm.response.headers.get("Content-Type") : false;
    //console.log("Responce's Content-Type is [" + contentType + "]");
    if ( (/^application\/json.*$/.test(contentType)) )
    {
        contentType = "json";
    }
    else if ( (/^application\/grpc.*$/.test(contentType)) )
    {
        contentType = "grpc";
    }
    else
    {
        console.log("Unsupported Content-Type [" + contentType + "]")
    }
    return contentType;
}

function exist(path, check_var)
{
    if (check_var === undefined)
    {
        pm.test("Variable [" + path + "] is undefined", () => {
        response = pm.response.messages.all()[0].data;
        pm.expect(response).to.have.property(path)
        })
        return false
    }
    return true
}

function show_pass(msg, silent)
{
    if ( silent == null || silent == "" )
    {
        pm.test(msg);
    }
}

function getKeysfromJSONarray(arr)
{
    // Transform JSON array from ["key1": "val1, "key2": "val2"] â ["key1", "key2"] 
    var ret = [];
    val.forEach((element) => {
        var keys = Object.keys(element);
        var key = keys[0];
        //console.log(key);
        ret.push(key)
    })
    return ret;
}

// Absolette functions. For backward compatibility.
function test_grpc(path, exp, type, silent)
{
    test(path, exp, type, silent);
}

function header(name, exp, type, silent)
{
    val = pm.response.headers.get(name)
    msg = "Header property [" + name + "] has value: "
    //console.log("msg[" + msg + "]; val[" + val + "]; exp[" + exp + "]; type[" + type + "]; silent[" + silent + "]")
    compare (msg, val, exp, type, silent)
}
