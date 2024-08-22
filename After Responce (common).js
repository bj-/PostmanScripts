utils = {
  basictests: function() {
    basictests();
  },
  test: function(path, exp, type, silent) {
    test(path, exp, type, silent);
  },
  check: function(parameter, exp, type, silent) {
    check(parameter, exp, type, silent);
  },
  setvar: function(varName, path, space) {
    setvar(varName, path, space);
  },
  getvar: function(varName, space="collection") {
    getvar(varName, space);
  },
  randomString: function(length=1) {
    randomString(length)
  }
};