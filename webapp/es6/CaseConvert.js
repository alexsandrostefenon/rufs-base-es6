class CaseConvert {

    static camelToUnderscore(str) {
		var ret = "";
		var lastIsUpper = true;

		for (var i = 0; i < str.length; i++) {
			var ch = str[i];

			if (ch >= 'A' && ch <= 'Z') {
				ch = ch.toLowerCase();

				if (lastIsUpper == false) {
					ret = ret + '_' + ch;
				} else {
					ret = ret + ch;
				}

				lastIsUpper = true;
			} else {
				ret = ret + ch;
				lastIsUpper = false;
			}
		}

		if (ret.length > 0 && ret[0] == '_') {
			ret = ret.substring(1);
		}

		return ret;
    }

    static underscoreToCamel(str, isFirstUpper) {
		var ret = "";
		var nextIsUpper = false;

		if (isFirstUpper == true) {
			nextIsUpper = true;
		}

		for (var i = 0; i < str.length; i++) {
			var ch = str[i];

			if (nextIsUpper == true) {
				ch = ch.toUpperCase();
				nextIsUpper = false;
			}

			if (ch == '_') {
				nextIsUpper = true;
			} else {
				ret = ret + ch;
			}
		}

		return ret;
    }

    static camelUpToCamelLower(str) {
		var ret = str;

		if (str != undefined && str != null && str.length > 0) {
			ret = str.charAt(0).toLocaleLowerCase() + str.substring(1);
		}

		return ret;
    }

}

export {CaseConvert}
