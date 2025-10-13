window.encrypt = (key, data) => {
	var iv = forge.random.getBytesSync(16)
	var salt = forge.random.getBytesSync(128)
	var saltedKey = forge.pkcs5.pbkdf2(key, salt, 10, 16)
	let utf8Encode = new TextEncoder()
	let someBytes = utf8Encode.encode(data)
	var cipher = forge.cipher.createCipher("AES-CBC", saltedKey)
	cipher.start({ iv: iv })
	cipher.update(forge.util.createBuffer(someBytes))
	cipher.finish()
	let encryptedObj = {
		salt: btoa(salt),
		iv: btoa(iv),
		text: cipher.output.toHex(),
	}
	return btoa(JSON.stringify(encryptedObj))
}

window.decrypt = (key, data) => {
	data = JSON.parse(atob(data))
	var encryptedBytes = forge.util.hexToBytes(data.text)
	var saltedKey = forge.pkcs5.pbkdf2(key, atob(data.salt), 10, 16)
	var decipher = forge.cipher.createDecipher("AES-CBC", saltedKey)
	decipher.start({ iv: atob(data.iv) })
	var length = encryptedBytes.length
	var chunkSize = 1024 * 64
	var index = 0
	var decrypted = ""
	do {
		decrypted += decipher.output.getBytes()
		var buf = forge.util.createBuffer(encryptedBytes.substr(index, chunkSize))
		decipher.update(buf)
		index += chunkSize
	} while (index < length)
	var result = decipher.finish()
	decrypted += decipher.output.getBytes()
	return decrypted
}