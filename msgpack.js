const NUMBER_MAX = 20_000;
class Decoder {
	constructor(buffer) {
		this._buffer = buffer;
		this._dv = new DataView(buffer);
		this._offset = 0;
	}
	_str(len) {
		let str = '',
			chr = 0;
		for (let i = this._offset, end = this._offset + len; i < end; i++) {
			const byte = this._dv.getUint8(i);
			if ((byte & 0x80) === 0x00) {
				str += String.fromCharCode(byte);
				continue;
			}
			if ((byte & 0xe0) === 0xc0) {
				str += String.fromCharCode(
					((byte & 0x1f) << 6) |
					(this._dv.getUint8(++i) & 0x3f)
				);
				continue;
			}
			if ((byte & 0xf0) === 0xe0) {
				str += String.fromCharCode(
					((byte & 0x0f) << 12) |
					((this._dv.getUint8(++i) & 0x3f) << 6) |
					((this._dv.getUint8(++i) & 0x3f) << 0)
				);
				continue;
			}
			if ((byte & 0xf8) === 0xf0) {
				chr = ((byte & 0x07) << 18) |
					((this._dv.getUint8(++i) & 0x3f) << 12) |
					((this._dv.getUint8(++i) & 0x3f) << 6) |
					((this._dv.getUint8(++i) & 0x3f) << 0);
				if (chr >= 0x010000) { // surrogate pair
					chr -= 0x010000;
					str += String.fromCharCode((chr >>> 10) + 0xD800, (chr & 0x3FF) + 0xDC00);
				} else {
					str += String.fromCharCode(chr);
				}
				continue;
			}
			throw new Error('Invalid byte ' + byte.toString(16));
		}
		this._offset += len;
		return str;
	}
	_bin(len) {
		const value = this._buffer.slice(this._offset, this._offset + len);
		this._offset += len;
		return value;
	}
	_extend(og, newObj) {
		if (typeof og !== 'object') 
			return og;
	
		if (!og) 
			return og;
 
		if (og instanceof Array) {
			if (!newObj || !newObj.push)
				newObj = [];

			for (let i = 0; i < og.length; i++) 
				newObj[i] = this._extend(og[i], newObj[i]);
	  
			return newObj;
		}

		if (!newObj)
			newObj = {};
		for (let i in og) {
			if (og.hasOwnProperty(i) && i !== '__proto__')
				newObj[i] = this._extend(og[i], newObj[i]);
		}
		return newObj;
	}
	_map(len) {
		if(len > 100) {
			throw new Error('Invalid object length');
		}
		let value = {};
		for (let i = 0; i < len; i++) {
			const key = this._parse();
			let parsed = this._parse();
			if(Object.hasOwnProperty.call(value, key) && typeof key === 'string' && key !== '__proto__') {
				try {
					this._extend(parsed, value[key])
				} catch(e) {
					value[key] = parsed;
				}
			} else {
				value[key] = parsed;
			}
		}
		return value;
	}
	_parse() {
		const prefix = this._dv.getUint8(this._offset++);
		let value,
			length = 0,
			type = 0,
			hi = 0,
			lo = 0;
	
		if (prefix < 0xc0) {
			// positive fixint
			if (prefix < 0x80) {
				return prefix;
			}
			// fixmap
			if (prefix < 0x90) {
				return this._map(prefix & 0x0f);
			}
			// fixarray
			if (prefix < 0xa0) {
				return this._array(prefix & 0x0f);
			}
			// fixstr
			return this._str(prefix & 0x1f)
		}
	
		// negative fixint
		if (prefix > 0xdf) {
			return (0xff - prefix + 1) * -1;
		}
	
		switch (prefix) {
			// nil
			case 0xc0:
				return null;
				// false
			case 0xc2:
				return false;
				// true
			case 0xc3:
				return true;
	
				// bin
			case 0xc4:
				length = this._dv.getUint8(this._offset);
				this._offset += 1;
				return this._bin(length);
			case 0xc5:
				length = this._dv.getUint16(this._offset);
				this._offset += 2;
				return this._bin(length);
			case 0xc6:
				length = this._dv.getUint32(this._offset);
				this._offset += 4;
				return this._bin(length);
	
				// ext
			case 0xc7:
				length = this._dv.getUint8(this._offset);
				type = this._dv.getInt8(this._offset + 1);
				this._offset += 2;
				return [type, this._bin(length)];
			case 0xc8:
				length = this._dv.getUint16(this._offset);
				type = this._dv.getInt8(this._offset + 2);
				this._offset += 3;
				return [type, this._bin(length)];
			case 0xc9:
				length = this._dv.getUint32(this._offset);
				type = this._dv.getInt8(this._offset + 4);
				this._offset += 5;
				return [type, this._bin(length)];
	
				// float
			case 0xca:
				value = this._dv.getFloat32(this._offset);
				this._offset += 4;
				if(Math.abs(value) > NUMBER_MAX) {
					value = value % NUMBER_MAX
				}
				return value;
			case 0xcb:
				value = this._dv.getFloat64(this._offset);
				this._offset += 8;
				if(Math.abs(value) > NUMBER_MAX) {
					value = value % NUMBER_MAX
				}
				return value;
	
				// uint
			case 0xcc:
				value = this._dv.getUint8(this._offset);
				this._offset += 1;
				return value;
			case 0xcd:
				value = this._dv.getUint16(this._offset);
				this._offset += 2;
				return value;
			case 0xce:
				value = this._dv.getUint32(this._offset);
				this._offset += 4;
				if(value > NUMBER_MAX) {
					value = value % NUMBER_MAX
				}
				return value;
			case 0xcf:
				hi = this._dv.getUint32(this._offset) * Math.pow(2, 32);
				lo = this._dv.getUint32(this._offset + 4);
				this._offset += 8;
				value = hi + lo;
				if(value > NUMBER_MAX) {
					value = value % NUMBER_MAX
				}
				return value;
	
				// int
			case 0xd0:
				value = this._dv.getInt8(this._offset);
				this._offset += 1;
				return value;
			case 0xd1:
				value = this._dv.getInt16(this._offset);
				this._offset += 2;
				return value;
			case 0xd2:
				value = this._dv.getInt32(this._offset);
				this._offset += 4;
				return value;
			case 0xd3:
				hi = this._dv.getInt32(this._offset) * Math.pow(2, 32);
				lo = this._dv.getUint32(this._offset + 4);
				this._offset += 8;
				value = hi + lo;
				if(Math.abs(value) > NUMBER_MAX) {
					value = value % NUMBER_MAX
				}
				return value;
	
				// fixext
			case 0xd4:
				type = this._dv.getInt8(this._offset);
				this._offset += 1;
				if (type === 0x00) {
					this._offset += 1;
					return void 0;
				}
				return [type, this._bin(1)];
			case 0xd5:
				type = this._dv.getInt8(this._offset);
				this._offset += 1;
				return [type, this._bin(2)];
			case 0xd6:
				type = this._dv.getInt8(this._offset);
				this._offset += 1;
				return [type, this._bin(4)];
			case 0xd7:
				type = this._dv.getInt8(this._offset);
				this._offset += 1;
				if (type === 0x00) {
					hi = this._dv.getInt32(this._offset) * Math.pow(2, 32);
					lo = this._dv.getUint32(this._offset + 4);
					this._offset += 8;
					return new Date(hi + lo);
				}
				return [type, this._bin(8)];
			case 0xd8:
				type = this._dv.getInt8(this._offset);
				this._offset += 1;
				return [type, this._bin(16)];
	
				// str
			case 0xd9:
				length = this._dv.getUint8(this._offset);
				this._offset += 1;
				return this._str(length);
			case 0xda:
				length = this._dv.getUint16(this._offset);
				this._offset += 2;
				return this._str(length);
			case 0xdb:
				length = this._dv.getUint32(this._offset);
				this._offset += 4;
				return this._str(length);
	
				// array
			case 0xdc:
				length = this._dv.getUint16(this._offset);
				this._offset += 2;
				return this._array(length);
			case 0xdd:
				length = this._dv.getUint32(this._offset);
				this._offset += 4;
				return this._array(length);
	
				// map
			case 0xde:
				length = this._dv.getUint16(this._offset);
				this._offset += 2;
				return this._map(length);
			case 0xdf:
				length = this._dv.getUint32(this._offset);
				this._offset += 4;
				return this._map(length);
		}
	
		throw new Error('Could not parse');
	}
	_array(length) {
		if(typeof length !== 'number' || length > 100)
			throw new Error('Invalid array length');
		let value = new Array(length);
		for (let i = 0; i < length; i++) {
			value[i] = this._parse();
		}
		return value;
	}
}

function utf8Write(view, offset, str) {
	let c = 0;
	for (let i = 0, l = str.length; i < l; i++) {
		c = str.charCodeAt(i);
		if (c < 0x80) {
			view.setUint8(offset++, c);
		} else if (c < 0x800) {
			view.setUint8(offset++, 0xc0 | (c >> 6));
			view.setUint8(offset++, 0x80 | (c & 0x3f));
		} else if (c < 0xd800 || c >= 0xe000) {
			view.setUint8(offset++, 0xe0 | (c >> 12));
			view.setUint8(offset++, 0x80 | (c >> 6) & 0x3f);
			view.setUint8(offset++, 0x80 | (c & 0x3f));
		} else {
			i++;
			c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
			view.setUint8(offset++, 0xf0 | (c >> 18));
			view.setUint8(offset++, 0x80 | (c >> 12) & 0x3f);
			view.setUint8(offset++, 0x80 | (c >> 6) & 0x3f);
			view.setUint8(offset++, 0x80 | (c & 0x3f));
		}
	}
}

function utf8Length(str) {
	let c = 0,
		length = 0;
	for (let i = 0, l = str.length; i < l; i++) {
		c = str.charCodeAt(i);
		if (c < 0x80) {
			length += 1;
		} else if (c < 0x800) {
			length += 2;
		} else if (c < 0xd800 || c >= 0xe000) {
			length += 3;
		} else {
			i++;
			length += 4;
		}
	}
	return length;
}

function _encode(bytes, defers, value) {
	let hi = 0,
		lo = 0,
		length = 0,
		size = 0;
	switch (typeof value) {
		case 'string':
			length = utf8Length(value);

			// fixstr
			if (length < 0x20) {
				bytes.push(length | 0xa0);
				size = 1;
			}
			// str 8
			else if (length < 0x100) {
				bytes.push(0xd9, length);
				size = 2;
			}
			// str 16
			else if (length < 0x10000) {
				bytes.push(0xda, length >> 8, length);
				size = 3;
			}
			// str 32
			else if (length < 0x100000000) {
				bytes.push(0xdb, length >> 24, length >> 16, length >> 8, length);
				size = 5;
			} else {
				throw new Error('String too long');
			}
			defers.push({
				_str: value,
				_length: length,
				_offset: bytes.length
			});
			return size + length;
		case 'number':
			if (Math.floor(value) !== value || !isFinite(value)) {
				bytes.push(0xcb);
				defers.push({
					_float: value,
					_length: 8,
					_offset: bytes.length
				});
				return 9;
			}
	
			if (value >= 0) {
				// positive fixnum
				if (value < 0x80) {
					bytes.push(value);
					return 1;
				}
				// uint 8
				if (value < 0x100) {
					bytes.push(0xcc, value);
					return 2;
				}
				// uint 16
				if (value < 0x10000) {
					bytes.push(0xcd, value >> 8, value);
					return 3;
				}
				// uint 32
				if (value < 0x100000000) {
					bytes.push(0xce, value >> 24, value >> 16, value >> 8, value);
					return 5;
				}
				// uint 64
				hi = (value / Math.pow(2, 32)) >> 0;
				lo = value >>> 0;
				bytes.push(0xcf, hi >> 24, hi >> 16, hi >> 8, hi, lo >> 24, lo >> 16, lo >> 8, lo);
				return 9;
			} else {
				// negative fixnum
				if (value >= -0x20) {
					bytes.push(value);
					return 1;
				}
				// int 8
				if (value >= -0x80) {
					bytes.push(0xd0, value);
					return 2;
				}
				// int 16
				if (value >= -0x8000) {
					bytes.push(0xd1, value >> 8, value);
					return 3;
				}
				// int 32
				if (value >= -0x80000000) {
					bytes.push(0xd2, value >> 24, value >> 16, value >> 8, value);
					return 5;
				}
				// int 64
				hi = Math.floor(value / Math.pow(2, 32));
				lo = value >>> 0;
				bytes.push(0xd3, hi >> 24, hi >> 16, hi >> 8, hi, lo >> 24, lo >> 16, lo >> 8, lo);
				return 9;
			}
		case 'object': {
			if (value === null) {
				bytes.push(0xc0);
				return 1;
			}
	
			if (Array.isArray(value)) {
				length = value.length;
	
				// fixarray
				if (length < 0x10) {
					bytes.push(length | 0x90);
					size = 1;
				}
				// array 16
				else if (length < 0x10000) {
					bytes.push(0xdc, length >> 8, length);
					size = 3;
				}
				// array 32
				else if (length < 0x100000000) {
					bytes.push(0xdd, length >> 24, length >> 16, length >> 8, length);
					size = 5;
				} else {
					throw new Error('Array too large');
				}
				for (let i = 0; i < length; i++) {
					size += _encode(bytes, defers, value[i]);
				}
				return size;
			}
	
			// fixext 8 / Date
			if (value instanceof Date) {
				let time = value.getTime();
				hi = Math.floor(time / Math.pow(2, 32));
				lo = time >>> 0;
				bytes.push(0xd7, 0, hi >> 24, hi >> 16, hi >> 8, hi, lo >> 24, lo >> 16, lo >> 8, lo);
				return 10;
			}
	
			if (value instanceof ArrayBuffer) {
				length = value.byteLength;
	
				// bin 8
				if (length < 0x100) {
					bytes.push(0xc4, length);
					size = 2;
				} else
					// bin 16
					if (length < 0x10000) {
						bytes.push(0xc5, length >> 8, length);
						size = 3;
					} else
						// bin 32
						if (length < 0x100000000) {
							bytes.push(0xc6, length >> 24, length >> 16, length >> 8, length);
							size = 5;
						} else {
							throw new Error('Buffer too large');
						}
				defers.push({
					_bin: value,
					_length: length,
					_offset: bytes.length
				});
				return size + length;
			}
	
			if (typeof value.toJSON === 'function') {
				return _encode(bytes, defers, value.toJSON());
			}
	
			let keys = Object.keys(value)
				.filter(key => {
					return typeof value[key] !== 'function'
				});

			length = keys.length;
	
			// fixmap
			if (length < 0x10) {
				bytes.push(length | 0x80);
				size = 1;
			}
			// map 16
			else if (length < 0x10000) {
				bytes.push(0xde, length >> 8, length);
				size = 3;
			}
			// map 32
			else if (length < 0x100000000) {
				bytes.push(0xdf, length >> 24, length >> 16, length >> 8, length);
				size = 5;
			} else {
				throw new Error('Object too large');
			}
	
			for (let i = 0; i < length; i++) {
				let key = keys[i];
				size += _encode(bytes, defers, key);
				size += _encode(bytes, defers, value[key]);
			}
			return size;
		}
		case 'boolean':
			bytes.push(value ? 0xc3 : 0xc2);
			return 1;
		case 'undefined':
			bytes.push(0xd4, 0, 0);
			return 3;
		default:
			throw new Error('Could not encode');
	}
}

/**
 * Decode ArrayBuffer to data
 * @param {ArrayBuffer} data 
 * @returns {any}
 */
module.exports.decode = (data) => {
	const dec = new Decoder(data);
	return dec._parse();
}


/**
 * Encodes array to ArrayBuffer
 * @param {Array} value 
 * @returns {ArrayBuffer}
 */
module.exports.encode = function encode(value) {
	const bytes = [];
	const defers = [];
	const size = _encode(bytes, defers, value);
	const buf = new ArrayBuffer(size);
	const view = new DataView(buf);

	let deferIndex = 0;
	let deferWritten = 0;
	let nextOffset = -1;
	if (defers.length > 0) {
		nextOffset = defers[0]._offset;
	}

	let defer, deferLength = 0,
		offset = 0;
	for (let i = 0, l = bytes.length; i < l; i++) {
		view.setUint8(deferWritten + i, bytes[i]);
		if (i + 1 !== nextOffset) {
			continue;
		}
		defer = defers[deferIndex];
		deferLength = defer._length;
		offset = deferWritten + nextOffset;
		if (defer._bin) {
			let bin = new Uint8Array(defer._bin);
			for (let j = 0; j < deferLength; j++) {
				view.setUint8(offset + j, bin[j]);
			}
		} else if (defer._str) {
			utf8Write(view, offset, defer._str);
		} else if (defer._float !== undefined) {
			view.setFloat64(offset, defer._float);
		}
		deferIndex++;
		deferWritten += deferLength;
		if (defers[deferIndex]) {
			nextOffset = defers[deferIndex]._offset;
		}
	}
	return buf
}
