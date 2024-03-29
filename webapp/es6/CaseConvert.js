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
    	const regExp = /[a-zA-Z]/;
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
			} else {
//				ch = ch.toLowerCase();
			}

			if (ch == '_' && str.length > i && regExp.test(str[i+1]) == true) {
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

	static caseAnyToLabel(str) {
		if (str == undefined) {
			return "";
		}

		var ret = "";
		var nextIsUpper = true;

		for (var i = 0; i < str.length; i++) {
			var ch = str[i];

			if (nextIsUpper == true) {
				ret = ret + ch.toUpperCase();
				nextIsUpper = false;
			} else if (ch >= 'A' && ch <= 'Z') {
				ret = ret + ' ' + ch;
			} else if (ch == '-' || ch == '_') {
				ret = ret + ' ';
				nextIsUpper = true;
			} else {
				ret = ret + ch;
			}
		}

		return ret;
	}

}

export {CaseConvert}
