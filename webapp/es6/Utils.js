export class Utils {

	// retorna um array de boolean, um elemento para cada bit, ou seja, cada caracter ascii hex gera quatro elementos.
	static strAsciiHexToFlags(strAsciiHex, numBits) {
		if (strAsciiHex == null || strAsciiHex.length == 0) {
			return null;
		}

		if (numBits == undefined) {
			numBits = 32;
		}

		const flags = new Array(numBits);

		for (let i = strAsciiHex.length-1, j = 0; i >= 0; i--) {
			let ch = strAsciiHex.charAt(i);
			let byte = parseInt(ch, 16);

			for (let k = 0; k < 4; k++, j++) {
				let bit = 1 << k;
				let value = byte & bit;
				let flag = value != 0 ? true : false;
	    		flags[j] = flag;
			}
		}

		return flags;
	}

	// faz o inverso da funcao strAsciiHexToFlags
	static flagsToStrAsciiHex(flags) {
		let value = 0;

		for (let i = 0; i < flags.length; i++) {
			let flag = flags[i];
			let bit = 1 << i;

			if (flag == true) {
				value |= bit;
			}
		}

		let strAsciiHex = value.toString(16);
		return strAsciiHex;
	}

	static clone(objRef, fields) {
		var obj = {};
		if (fields == undefined) fields = Object.keys(objRef);

		for (var fieldName of fields) {
			obj[fieldName] = objRef[fieldName];
		}

		return obj;
	}

}
