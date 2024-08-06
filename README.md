# PostmanScripts
tiny framework for postman's tests

# Usage
## REST
### Preparation
Разместить содерджимое файлов After Responce (common).js и After Responce (script).js в скрипе After Responce коллекции, в вызовах которой он будет использоваться

### Usage
Примеры вызовов описаны в файле After Responce (usage).js
test("json Path", "expected value", "Способ проверки/сравнения")


## gRPC
Becouse grpc methods doesn't support common code - js code should be placed in each request : ( 
