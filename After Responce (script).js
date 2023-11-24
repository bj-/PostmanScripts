// ============== Functions ===============
function test_grpc(path, exp, type)
{
    val = eval('pm.response.messages.all()[0].data.' + path)
    path = path.replace(".", ": ") + ":"
    msg = "Property [" + path + "] has value: "

    compare (msg, val, exp, type)
}

function compare (msg, val, exp, type)
{
    if (val == exp && type == "eql")
    {
        if (val.length > 50) // if val so long
        {
            val = val.substr(1,50) + "..."
        }
        pm.test(msg + '[' + val + '] as expected' );
    }
    else if (val < exp && type == "below")
    {
        pm.test(msg + '[' + val + '] below than [' + exp + '] as expected' );
    }
    else if (val > exp && type == "above")
    {
        pm.test(msg + '[' + val + '] above than [' + exp + '] as expected' );
    }
    else if (exp == "(RANDOM_GUID)" && (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val)))
    {
        pm.test(msg + '(random guid) [' + val + '] as expected' );
    }
    else if (exp == "(RANDOM_XML)" )
    {
        pm.test(msg + '(RANDOM_XML) [' + val + '] as expected' );
        
        var parseString = require('xml2js').parseString;
        parseString(val, function (err, result) {
        if (result)
        {
            if (val.length > 50) // if val so long
            {
                val = val.substr(1,50) + "..."
            }
            pm.test(msg + '(random XML) [' + val + '] as expected' );
        }
        else
        {
            pm.test(msg + '(random XML)', () => {
                pm.expect(val).to.eql("(random XML)")
            })
        }
        });
    }
    else if ( exp == "NULL" && val == null)
    {
        pm.test(msg + ' [' + val + '] as expected' );
    }
    else
    {
        console.log("exp: [" + exp + "] val: [" + val + "]; type [" + type + "]")
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

function check(parameter, exp, type)
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
    compare (msg, val, exp, type)
        
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