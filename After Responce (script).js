// ============== Functions ===============
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
 
function test_grpc(path, exp, type, silent)
{
    val = eval('pm.response.messages.all()[0].data.' + path)
     
    if(exist(path, val))
    {
        path = path.replace(".", ": ") + ":"
        if (type.toUpperCase() == "ARRAY")
        {
            msg = "Array [" + path + "]"
        }
        else 
        {
            msg = "Property [" + path + "] has value: "
        }
        compare (msg, val, exp, type, silent)
        
    }
}
  
function compare (msg, val, exp, type, silent)
{
    if (val == exp && type == "eql")
    {
        if (val.length > 50) // if val so long
        {
            val = val.substr(1,50) + "..."
        }
        show_pass(msg + '[' + val + '] as expected', silent)
    }
    else if (val < exp && type == "below")
    {
        show_pass(msg + '[' + val + '] below than [' + exp + '] as expected' , silent)
    }
    else if (val > exp && type == "above")
    {
        show_pass(msg + '[' + val + '] above than [' + exp + '] as expected', silent)
    }
    else if (type == "regex" && eval(exp + '.test(val)'))
    {
        show_pass(msg + '[' + val + '] by regex [' + exp + '] as expected', silent)
    }
    else if (type == "array")
    {  
        valueFound = false
        val.forEach(function(elem)
        {
            expResult = eval('elem["' + exp[0].replaceAll(".", '"]["') + '"]')
            if (expResult == exp[1])
            {
                show_pass(msg + ' has value: [' + expResult + '] in property [' + exp[0] + '] as expected', silent)
                valueFound = true
            }
        });
        if (!valueFound)
            {
                pm.test(msg + ' has not value in elem [' + exp[0] + ']', () => {
                pm.expect(exp[1]).to.be.oneOf(val);
                })
            }
    }
    else if (exp == "(RANDOM_GUID)" && (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val)))
    {
        show_pass(msg + '(random guid) [' + val + '] as expected', silent)
    }
    else if (exp == "(RANDOM_XML)" )
    {
        var parseString = require('xml2js').parseString;
        parseString(val, function (err, result) {
        if (result)
        {
            if (val.length > 50) // if val so long
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
    else if (exp == "(RANDOM_PROPERTY)")
    {
        if (val.length > 50) // if val so long
        {
            val = val.substr(1,50) + "..."
        }
        show_pass(msg + ' [' + val + '] as expected', silent)
    }
    else if (exp == "(RANDOM_CERT)" && (/^[0-9a-fA-F]{40}$/.test(val)))
    {
        show_pass(msg + '(random certificate) [' + val + '] as expected', silent)
    }
    else if (type == "datetime")
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
    else
    {
        //console.log("exp: [" + exp + "] val: [" + val + "]; type [" + type + "]")
        pm.test(msg, () => {
            switch (type)
            {
                case "above":
                    pm.expect(parseInt(val)).to.above(parseInt(exp))
                    break;
                case "below":
                    pm.expect(parseInt(val)).to.below(parseInt(exp))
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
            val = pm.response.statusCode
            msg = 'Status Code is '
            break;
        case "responseTime":
            val = pm.response.responseTime
            msg = 'Response Time is '
            break;
        default:
            val = "UNEXPECTED"
            msg = "UNEXPECTED"
    }
    compare (msg, val, exp, type, silent)
}
  
function show_pass(msg, silent)
{
    if (silent == null || silent == "")
    {
        pm.test(msg);
    }
}
  
function basictests()
{
    // content-type
    pm.test('"content-type" = "application/grpc"', function (done) {
        pm.response.to.have.metadata('content-type', 'application/grpc');
    });
  
    pm.test('Status code is 0', function (done) {
        pm.response.to.have.statusCode(0);
    });
  
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
  
function randomString(length=1) {
    // length = str length
    let randomString = "";
    for (let i = 0; i < length; i++){
        randomString += pm.variables.replaceIn("{{$randomAlphaNumeric}}");
    }
    return randomString;
}