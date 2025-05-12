/* node_modules/mysql2/lib/connection.js */
const Net = require('net');
const Tls = require('tls');
const Timers = require('timers');
const EventEmitter = require('events').EventEmitter;
const Readable = require('stream').Readable;
const Queue = require('denque');
const SqlString = require('sqlstring');
const LRU = require('lru-cache').default;

const INVALID_DATE = new Date(NaN);

// this is nearly duplicate of previous function so generated code is not slower
// due to "if (dateStrings)" branching
const pad = '000000000000';
function leftPad(num, value) {
  const s = value.toString();
  // if we don't need to pad
  if (s.length >= num) {
    return s;
  }
  return (pad + s).slice(-num);
}

// The whole reason parse* function below exist
// is because String creation is relatively expensive (at least with V8), and if we have
// a buffer with "12345" content ideally we would like to bypass intermediate
// "12345" string creation and directly build 12345 number out of
// <Buffer 31 32 33 34 35> data.
// In my benchmarks the difference is ~25M 8-digit numbers per second vs
// 4.5 M using Number(packet.readLengthCodedString())
// not used when size is close to max precision as series of *10 accumulate error
// and approximate result mihgt be diffreent from (approximate as well) Number(bigNumStringValue))
// In the futire node version if speed difference is smaller parse* functions might be removed
// don't consider them as Packet public API

const minus = '-'.charCodeAt(0);
const plus = '+'.charCodeAt(0);

// TODO: handle E notation
const dot = '.'.charCodeAt(0);
const exponent = 'e'.charCodeAt(0);
const exponentCapital = 'E'.charCodeAt(0);

class Packet {
  constructor(id, buffer, start, end) {
    // hot path, enable checks when testing only
    // if (!Buffer.isBuffer(buffer) || typeof start == 'undefined' || typeof end == 'undefined')
    //  throw new Error('invalid packet');
    this.sequenceId = id;
    this.numPackets = 1;
    this.buffer = buffer;
    this.start = start;
    this.offset = start + 4;
    this.end = end;
  }

  // ==============================
  // readers
  // ==============================
  reset() {
    this.offset = this.start + 4;
  }

  length() {
    return this.end - this.start;
  }

  slice() {
    return this.buffer.slice(this.start, this.end);
  }

  dump() {
    // eslint-disable-next-line no-console
    console.log(
      [this.buffer.asciiSlice(this.start, this.end)],
      this.buffer.slice(this.start, this.end),
      this.length(),
      this.sequenceId
    );
  }

  haveMoreData() {
    return this.end > this.offset;
  }

  skip(num) {
    this.offset += num;
  }

  readInt8() {
    return this.buffer[this.offset++];
  }

  readInt16() {
    this.offset += 2;
    return this.buffer.readUInt16LE(this.offset - 2);
  }

  readInt24() {
    return this.readInt16() + (this.readInt8() << 16);
  }

  readInt32() {
    this.offset += 4;
    return this.buffer.readUInt32LE(this.offset - 4);
  }

  readSInt8() {
    return this.buffer.readInt8(this.offset++);
  }

  readSInt16() {
    this.offset += 2;
    return this.buffer.readInt16LE(this.offset - 2);
  }

  readSInt32() {
    this.offset += 4;
    return this.buffer.readInt32LE(this.offset - 4);
  }

  readInt64JSNumber() {
    const word0 = this.readInt32();
    const word1 = this.readInt32();
    const l = new Long(word0, word1, true);
    return l.toNumber();
  }

  readSInt64JSNumber() {
    const word0 = this.readInt32();
    const word1 = this.readInt32();
    if (!(word1 & 0x80000000)) {
      return word0 + 0x100000000 * word1;
    }
    const l = new Long(word0, word1, false);
    return l.toNumber();
  }

  readInt64String() {
    const word0 = this.readInt32();
    const word1 = this.readInt32();
    const res = new Long(word0, word1, true);
    return res.toString();
  }

  readSInt64String() {
    const word0 = this.readInt32();
    const word1 = this.readInt32();
    const res = new Long(word0, word1, false);
    return res.toString();
  }

  readInt64() {
    const word0 = this.readInt32();
    const word1 = this.readInt32();
    let res = new Long(word0, word1, true);
    const resNumber = res.toNumber();
    const resString = res.toString();
    res = resNumber.toString() === resString ? resNumber : resString;
    return res;
  }

  readSInt64() {
    const word0 = this.readInt32();
    const word1 = this.readInt32();
    let res = new Long(word0, word1, false);
    const resNumber = res.toNumber();
    const resString = res.toString();
    res = resNumber.toString() === resString ? resNumber : resString;
    return res;
  }

  isEOF() {
    return this.buffer[this.offset] === 0xfe && this.length() < 13;
  }

  eofStatusFlags() {
    return this.buffer.readInt16LE(this.offset + 3);
  }

  eofWarningCount() {
    return this.buffer.readInt16LE(this.offset + 1);
  }

  readLengthCodedNumber(bigNumberStrings, signed) {
    const byte1 = this.buffer[this.offset++];
    if (byte1 < 251) {
      return byte1;
    }
    return this.readLengthCodedNumberExt(byte1, bigNumberStrings, signed);
  }

  readLengthCodedNumberSigned(bigNumberStrings) {
    return this.readLengthCodedNumber(bigNumberStrings, true);
  }

  readLengthCodedNumberExt(tag, bigNumberStrings, signed) {
    let word0, word1;
    let res;
    if (tag === 0xfb) {
      return null;
    }
    if (tag === 0xfc) {
      return this.readInt8() + (this.readInt8() << 8);
    }
    if (tag === 0xfd) {
      return this.readInt8() + (this.readInt8() << 8) + (this.readInt8() << 16);
    }
    if (tag === 0xfe) {
      // TODO: check version
      // Up to MySQL 3.22, 0xfe was followed by a 4-byte integer.
      word0 = this.readInt32();
      word1 = this.readInt32();
      if (word1 === 0) {
        return word0; // don't convert to float if possible
      }
      if (word1 < 2097152) {
        // max exact float point int, 2^52 / 2^32
        return word1 * 0x100000000 + word0;
      }
      res = new Long(word0, word1, !signed); // Long need unsigned
      const resNumber = res.toNumber();
      const resString = res.toString();
      res = resNumber.toString() === resString ? resNumber : resString;
      return bigNumberStrings ? resString : res;
    }
    // eslint-disable-next-line no-console
    console.trace();
    throw new Error(`Should not reach here: ${tag}`);
  }

  readFloat() {
    const res = this.buffer.readFloatLE(this.offset);
    this.offset += 4;
    return res;
  }

  readDouble() {
    const res = this.buffer.readDoubleLE(this.offset);
    this.offset += 8;
    return res;
  }

  readBuffer(len) {
    if (typeof len === 'undefined') {
      len = this.end - this.offset;
    }
    this.offset += len;
    return this.buffer.slice(this.offset - len, this.offset);
  }

  // DATE, DATETIME and TIMESTAMP
  readDateTime(timezone) {
    if (!timezone || timezone === 'Z' || timezone === 'local') {
      const length = this.readInt8();
      if (length === 0xfb) {
        return null;
      }
      let y = 0;
      let m = 0;
      let d = 0;
      let H = 0;
      let M = 0;
      let S = 0;
      let ms = 0;
      if (length > 3) {
        y = this.readInt16();
        m = this.readInt8();
        d = this.readInt8();
      }
      if (length > 6) {
        H = this.readInt8();
        M = this.readInt8();
        S = this.readInt8();
      }
      if (length > 10) {
        ms = this.readInt32() / 1000;
      }
      // NO_ZERO_DATE mode and NO_ZERO_IN_DATE mode are part of the strict
      // default SQL mode used by MySQL 8.0. This means that non-standard
      // dates like '0000-00-00' become NULL. For older versions and other
      // possible MySQL flavours we still need to account for the
      // non-standard behaviour.
      if (y + m + d + H + M + S + ms === 0) {
        return INVALID_DATE;
      }
      if (timezone === 'Z') {
        return new Date(Date.UTC(y, m - 1, d, H, M, S, ms));
      }
      return new Date(y, m - 1, d, H, M, S, ms);
    }
    let str = this.readDateTimeString(6, 'T');
    if (str.length === 10) {
      str += 'T00:00:00';
    }
    return new Date(str + timezone);
  }

  readDateTimeString(decimals, timeSep) {
    const length = this.readInt8();
    let y = 0;
    let m = 0;
    let d = 0;
    let H = 0;
    let M = 0;
    let S = 0;
    let ms = 0;
    let str;
    if (length > 3) {
      y = this.readInt16();
      m = this.readInt8();
      d = this.readInt8();
      str = [leftPad(4, y), leftPad(2, m), leftPad(2, d)].join('-');
    }
    if (length > 6) {
      H = this.readInt8();
      M = this.readInt8();
      S = this.readInt8();
      str += `${timeSep || ' '}${[
        leftPad(2, H),
        leftPad(2, M),
        leftPad(2, S)
      ].join(':')}`;
    }
    if (length > 10) {
      ms = this.readInt32();
      str += '.';
      if (decimals) {
        ms = leftPad(6, ms);
        if (ms.length > decimals) {
          ms = ms.substring(0, decimals); // rounding is done at the MySQL side, only 0 are here
        }
      }
      str += ms;
    }
    return str;
  }

  // TIME - value as a string, Can be negative
  readTimeString(convertTtoMs) {
    const length = this.readInt8();
    if (length === 0) {
      return '00:00:00';
    }
    const sign = this.readInt8() ? -1 : 1; // 'isNegative' flag byte
    let d = 0;
    let H = 0;
    let M = 0;
    let S = 0;
    let ms = 0;
    if (length > 6) {
      d = this.readInt32();
      H = this.readInt8();
      M = this.readInt8();
      S = this.readInt8();
    }
    if (length > 10) {
      ms = this.readInt32();
    }
    if (convertTtoMs) {
      H += d * 24;
      M += H * 60;
      S += M * 60;
      ms += S * 1000;
      ms *= sign;
      return ms;
    }
    // Format follows mySQL TIME format ([-][h]hh:mm:ss[.u[u[u[u[u[u]]]]]])
    // For positive times below 24 hours, this makes it equal to ISO 8601 times
    return (
      (sign === -1 ? '-' : '') +
      [leftPad(2, d * 24 + H), leftPad(2, M), leftPad(2, S)].join(':') +
      (ms ? `.${ms}`.replace(/0+$/, '') : '')
    );
  }

  readLengthCodedString(encoding) {
    const len = this.readLengthCodedNumber();
    // TODO: check manually first byte here to avoid polymorphic return type?
    if (len === null) {
      return null;
    }
    this.offset += len;
    // TODO: Use characterSetCode to get proper encoding
    // https://github.com/sidorares/node-mysql2/pull/374
    return StringParser.decode(
      this.buffer,
      encoding,
      this.offset - len,
      this.offset
    );
  }

  readLengthCodedBuffer() {
    const len = this.readLengthCodedNumber();
    if (len === null) {
      return null;
    }
    return this.readBuffer(len);
  }

  readNullTerminatedString(encoding) {
    const start = this.offset;
    let end = this.offset;
    while (this.buffer[end]) {
      end = end + 1; // TODO: handle OOB check
    }
    this.offset = end + 1;
    return StringParser.decode(this.buffer, encoding, start, end);
  }

  // TODO reuse?
  readString(len, encoding) {
    if (typeof len === 'string' && typeof encoding === 'undefined') {
      encoding = len;
      len = undefined;
    }
    if (typeof len === 'undefined') {
      len = this.end - this.offset;
    }
    this.offset += len;
    return StringParser.decode(
      this.buffer,
      encoding,
      this.offset - len,
      this.offset
    );
  }

  parseInt(len, supportBigNumbers) {
    if (len === null) {
      return null;
    }
    if (len >= 14 && !supportBigNumbers) {
      const s = this.buffer.toString('ascii', this.offset, this.offset + len);
      this.offset += len;
      return Number(s);
    }
    let result = 0;
    const start = this.offset;
    const end = this.offset + len;
    let sign = 1;
    if (len === 0) {
      return 0; // TODO: assert? exception?
    }
    if (this.buffer[this.offset] === minus) {
      this.offset++;
      sign = -1;
    }
    // max precise int is 9007199254740992
    let str;
    const numDigits = end - this.offset;
    if (supportBigNumbers) {
      if (numDigits >= 15) {
        str = this.readString(end - this.offset, 'binary');
        result = parseInt(str, 10);
        if (result.toString() === str) {
          return sign * result;
        }
        return sign === -1 ? `-${str}` : str;
      }
      if (numDigits > 16) {
        str = this.readString(end - this.offset);
        return sign === -1 ? `-${str}` : str;
      }
    }
    if (this.buffer[this.offset] === plus) {
      this.offset++; // just ignore
    }
    while (this.offset < end) {
      result *= 10;
      result += this.buffer[this.offset] - 48;
      this.offset++;
    }
    const num = result * sign;
    if (!supportBigNumbers) {
      return num;
    }
    str = this.buffer.toString('ascii', start, end);
    if (num.toString() === str) {
      return num;
    }
    return str;
  }

  // note that if value of inputNumberAsString is bigger than MAX_SAFE_INTEGER
  // ( or smaller than MIN_SAFE_INTEGER ) the parseIntNoBigCheck result might be
  // different from what you would get from Number(inputNumberAsString)
  // String(parseIntNoBigCheck) <> String(Number(inputNumberAsString)) <> inputNumberAsString
  parseIntNoBigCheck(len) {
    if (len === null) {
      return null;
    }
    let result = 0;
    const end = this.offset + len;
    let sign = 1;
    if (len === 0) {
      return 0; // TODO: assert? exception?
    }
    if (this.buffer[this.offset] === minus) {
      this.offset++;
      sign = -1;
    }
    if (this.buffer[this.offset] === plus) {
      this.offset++; // just ignore
    }
    while (this.offset < end) {
      result *= 10;
      result += this.buffer[this.offset] - 48;
      this.offset++;
    }
    return result * sign;
  }

  // copy-paste from https://github.com/mysqljs/mysql/blob/master/lib/protocol/Parser.js
  parseGeometryValue() {
    const buffer = this.readLengthCodedBuffer();
    let offset = 4;
    if (buffer === null || !buffer.length) {
      return null;
    }
    function parseGeometry() {
      let x, y, i, j, numPoints, line;
      let result = null;
      const byteOrder = buffer.readUInt8(offset);
      offset += 1;
      const wkbType = byteOrder
        ? buffer.readUInt32LE(offset)
        : buffer.readUInt32BE(offset);
      offset += 4;
      switch (wkbType) {
        case 1: // WKBPoint
          x = byteOrder
            ? buffer.readDoubleLE(offset)
            : buffer.readDoubleBE(offset);
          offset += 8;
          y = byteOrder
            ? buffer.readDoubleLE(offset)
            : buffer.readDoubleBE(offset);
          offset += 8;
          result = { x: x, y: y };
          break;
        case 2: // WKBLineString
          numPoints = byteOrder
            ? buffer.readUInt32LE(offset)
            : buffer.readUInt32BE(offset);
          offset += 4;
          result = [];
          for (i = numPoints; i > 0; i--) {
            x = byteOrder
              ? buffer.readDoubleLE(offset)
              : buffer.readDoubleBE(offset);
            offset += 8;
            y = byteOrder
              ? buffer.readDoubleLE(offset)
              : buffer.readDoubleBE(offset);
            offset += 8;
            result.push({ x: x, y: y });
          }
          break;
        case 3: // WKBPolygon
          // eslint-disable-next-line no-case-declarations
          const numRings = byteOrder
            ? buffer.readUInt32LE(offset)
            : buffer.readUInt32BE(offset);
          offset += 4;
          result = [];
          for (i = numRings; i > 0; i--) {
            numPoints = byteOrder
              ? buffer.readUInt32LE(offset)
              : buffer.readUInt32BE(offset);
            offset += 4;
            line = [];
            for (j = numPoints; j > 0; j--) {
              x = byteOrder
                ? buffer.readDoubleLE(offset)
                : buffer.readDoubleBE(offset);
              offset += 8;
              y = byteOrder
                ? buffer.readDoubleLE(offset)
                : buffer.readDoubleBE(offset);
              offset += 8;
              line.push({ x: x, y: y });
            }
            result.push(line);
          }
          break;
        case 4: // WKBMultiPoint
        case 5: // WKBMultiLineString
        case 6: // WKBMultiPolygon
        case 7: // WKBGeometryCollection
          // eslint-disable-next-line no-case-declarations
          const num = byteOrder
            ? buffer.readUInt32LE(offset)
            : buffer.readUInt32BE(offset);
          offset += 4;
          result = [];
          for (i = num; i > 0; i--) {
            result.push(parseGeometry());
          }
          break;
      }
      return result;
    }
    return parseGeometry();
  }

  parseDate(timezone) {
    const strLen = this.readLengthCodedNumber();
    if (strLen === null) {
      return null;
    }
    if (strLen !== 10) {
      // we expect only YYYY-MM-DD here.
      // if for some reason it's not the case return invalid date
      return new Date(NaN);
    }
    const y = this.parseInt(4);
    this.offset++; // -
    const m = this.parseInt(2);
    this.offset++; // -
    const d = this.parseInt(2);
    if (!timezone || timezone === 'local') {
      return new Date(y, m - 1, d);
    }
    if (timezone === 'Z') {
      return new Date(Date.UTC(y, m - 1, d));
    }
    return new Date(
      `${leftPad(4, y)}-${leftPad(2, m)}-${leftPad(2, d)}T00:00:00${timezone}`
    );
  }

  parseDateTime(timezone) {
    const str = this.readLengthCodedString('binary');
    if (str === null) {
      return null;
    }
    if (!timezone || timezone === 'local') {
      return new Date(str);
    }
    return new Date(`${str}${timezone}`);
  }

  parseFloat(len) {
    if (len === null) {
      return null;
    }
    let result = 0;
    const end = this.offset + len;
    let factor = 1;
    let pastDot = false;
    let charCode = 0;
    if (len === 0) {
      return 0; // TODO: assert? exception?
    }
    if (this.buffer[this.offset] === minus) {
      this.offset++;
      factor = -1;
    }
    if (this.buffer[this.offset] === plus) {
      this.offset++; // just ignore
    }
    while (this.offset < end) {
      charCode = this.buffer[this.offset];
      if (charCode === dot) {
        pastDot = true;
        this.offset++;
      } else if (charCode === exponent || charCode === exponentCapital) {
        this.offset++;
        const exponentValue = this.parseInt(end - this.offset);
        return (result / factor) * Math.pow(10, exponentValue);
      } else {
        result *= 10;
        result += this.buffer[this.offset] - 48;
        this.offset++;
        if (pastDot) {
          factor = factor * 10;
        }
      }
    }
    return result / factor;
  }

  parseLengthCodedIntNoBigCheck() {
    return this.parseIntNoBigCheck(this.readLengthCodedNumber());
  }

  parseLengthCodedInt(supportBigNumbers) {
    return this.parseInt(this.readLengthCodedNumber(), supportBigNumbers);
  }

  parseLengthCodedIntString() {
    return this.readLengthCodedString('binary');
  }

  parseLengthCodedFloat() {
    return this.parseFloat(this.readLengthCodedNumber());
  }

  peekByte() {
    return this.buffer[this.offset];
  }

  // OxFE is often used as "Alt" flag - not ok, not error.
  // For example, it's first byte of AuthSwitchRequest
  isAlt() {
    return this.peekByte() === 0xfe;
  }

  isError() {
    return this.peekByte() === 0xff;
  }

  asError(encoding) {
    this.reset();
    this.readInt8(); // fieldCount
    const errorCode = this.readInt16();
    let sqlState = '';
    if (this.buffer[this.offset] === 0x23) {
      this.skip(1);
      sqlState = this.readBuffer(5).toString();
    }
    const message = this.readString(undefined, encoding);
    const err = new Error(message);
    err.code = ErrorCodeToName[errorCode];
    err.errno = errorCode;
    err.sqlState = sqlState;
    err.sqlMessage = message;
    return err;
  }

  writeInt32(n) {
    this.buffer.writeUInt32LE(n, this.offset);
    this.offset += 4;
  }

  writeInt24(n) {
    this.writeInt8(n & 0xff);
    this.writeInt16(n >> 8);
  }

  writeInt16(n) {
    this.buffer.writeUInt16LE(n, this.offset);
    this.offset += 2;
  }

  writeInt8(n) {
    this.buffer.writeUInt8(n, this.offset);
    this.offset++;
  }

  writeDouble(n) {
    this.buffer.writeDoubleLE(n, this.offset);
    this.offset += 8;
  }

  writeBuffer(b) {
    b.copy(this.buffer, this.offset);
    this.offset += b.length;
  }

  writeNull() {
    this.buffer[this.offset] = 0xfb;
    this.offset++;
  }

  // TODO: refactor following three?
  writeNullTerminatedString(s, encoding) {
    const buf = StringParser.encode(s, encoding);
    this.buffer.length && buf.copy(this.buffer, this.offset);
    this.offset += buf.length;
    this.writeInt8(0);
  }

  writeString(s, encoding) {
    if (s === null) {
      this.writeInt8(0xfb);
      return;
    }
    if (s.length === 0) {
      return;
    }
    // const bytes = Buffer.byteLength(s, 'utf8');
    // this.buffer.write(s, this.offset, bytes, 'utf8');
    // this.offset += bytes;
    const buf = StringParser.encode(s, encoding);
    this.buffer.length && buf.copy(this.buffer, this.offset);
    this.offset += buf.length;
  }

  writeLengthCodedString(s, encoding) {
    const buf = StringParser.encode(s, encoding);
    this.writeLengthCodedNumber(buf.length);
    this.buffer.length && buf.copy(this.buffer, this.offset);
    this.offset += buf.length;
  }

  writeLengthCodedBuffer(b) {
    this.writeLengthCodedNumber(b.length);
    b.copy(this.buffer, this.offset);
    this.offset += b.length;
  }

  writeLengthCodedNumber(n) {
    if (n < 0xfb) {
      return this.writeInt8(n);
    }
    if (n < 0xffff) {
      this.writeInt8(0xfc);
      return this.writeInt16(n);
    }
    if (n < 0xffffff) {
      this.writeInt8(0xfd);
      return this.writeInt24(n);
    }
    if (n === null) {
      return this.writeInt8(0xfb);
    }
    // TODO: check that n is out of int precision
    this.writeInt8(0xfe);
    this.buffer.writeUInt32LE(n, this.offset);
    this.offset += 4;
    this.buffer.writeUInt32LE(n >> 32, this.offset);
    this.offset += 4;
    return this.offset;
  }

  writeDate(d, timezone) {
    this.buffer.writeUInt8(11, this.offset);
    if (!timezone || timezone === 'local') {
      this.buffer.writeUInt16LE(d.getFullYear(), this.offset + 1);
      this.buffer.writeUInt8(d.getMonth() + 1, this.offset + 3);
      this.buffer.writeUInt8(d.getDate(), this.offset + 4);
      this.buffer.writeUInt8(d.getHours(), this.offset + 5);
      this.buffer.writeUInt8(d.getMinutes(), this.offset + 6);
      this.buffer.writeUInt8(d.getSeconds(), this.offset + 7);
      this.buffer.writeUInt32LE(d.getMilliseconds() * 1000, this.offset + 8);
    } else {
      if (timezone !== 'Z') {
        const offset =
          (timezone[0] === '-' ? -1 : 1) *
          (parseInt(timezone.substring(1, 3), 10) * 60 +
            parseInt(timezone.substring(4), 10));
        if (offset !== 0) {
          d = new Date(d.getTime() + 60000 * offset);
        }
      }
      this.buffer.writeUInt16LE(d.getUTCFullYear(), this.offset + 1);
      this.buffer.writeUInt8(d.getUTCMonth() + 1, this.offset + 3);
      this.buffer.writeUInt8(d.getUTCDate(), this.offset + 4);
      this.buffer.writeUInt8(d.getUTCHours(), this.offset + 5);
      this.buffer.writeUInt8(d.getUTCMinutes(), this.offset + 6);
      this.buffer.writeUInt8(d.getUTCSeconds(), this.offset + 7);
      this.buffer.writeUInt32LE(d.getUTCMilliseconds() * 1000, this.offset + 8);
    }
    this.offset += 12;
  }

  writeHeader(sequenceId) {
    const offset = this.offset;
    this.offset = 0;
    this.writeInt24(this.buffer.length - 4);
    this.writeInt8(sequenceId);
    this.offset = offset;
  }

  clone() {
    return new Packet(this.sequenceId, this.buffer, this.start, this.end);
  }

  type() {
    if (this.isEOF()) {
      return 'EOF';
    }
    if (this.isError()) {
      return 'Error';
    }
    if (this.buffer[this.offset] === 0) {
      return 'maybeOK'; // could be other packet types as well
    }
    return '';
  }

  static lengthCodedNumberLength(n) {
    if (n < 0xfb) {
      return 1;
    }
    if (n < 0xffff) {
      return 3;
    }
    if (n < 0xffffff) {
      return 5;
    }
    return 9;
  }

  static lengthCodedStringLength(str, encoding) {
    const buf = StringParser.encode(str, encoding);
    const slen = buf.length;
    return Packet.lengthCodedNumberLength(slen) + slen;
  }

  static MockBuffer() {
    const noop = function () {};
    const res = Buffer.alloc(0);
    for (const op in NativeBuffer.prototype) {
      if (typeof res[op] === 'function') {
        res[op] = noop;
      }
    }
    return res;
  }
}



/* node_modules/mysql2/lib/constants/charset_encodings.js */
const CharsetToEncoding = [
  'utf8',
  'big5',
  'latin2',
  'dec8',
  'cp850',
  'latin1',
  'hp8',
  'koi8r',
  'latin1',
  'latin2',
  'swe7',
  'ascii',
  'eucjp',
  'sjis',
  'cp1251',
  'latin1',
  'hebrew',
  'utf8',
  'tis620',
  'euckr',
  'latin7',
  'latin2',
  'koi8u',
  'cp1251',
  'gb2312',
  'greek',
  'cp1250',
  'latin2',
  'gbk',
  'cp1257',
  'latin5',
  'latin1',
  'armscii8',
  'cesu8',
  'cp1250',
  'ucs2',
  'cp866',
  'keybcs2',
  'macintosh',
  'macroman',
  'cp852',
  'latin7',
  'latin7',
  'macintosh',
  'cp1250',
  'utf8',
  'utf8',
  'latin1',
  'latin1',
  'latin1',
  'cp1251',
  'cp1251',
  'cp1251',
  'macroman',
  'utf16',
  'utf16',
  'utf16-le',
  'cp1256',
  'cp1257',
  'cp1257',
  'utf32',
  'utf32',
  'utf16-le',
  'binary',
  'armscii8',
  'ascii',
  'cp1250',
  'cp1256',
  'cp866',
  'dec8',
  'greek',
  'hebrew',
  'hp8',
  'keybcs2',
  'koi8r',
  'koi8u',
  'cesu8',
  'latin2',
  'latin5',
  'latin7',
  'cp850',
  'cp852',
  'swe7',
  'cesu8',
  'big5',
  'euckr',
  'gb2312',
  'gbk',
  'sjis',
  'tis620',
  'ucs2',
  'eucjp',
  'geostd8',
  'geostd8',
  'latin1',
  'cp932',
  'cp932',
  'eucjpms',
  'eucjpms',
  'cp1250',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf16',
  'utf8',
  'utf8',
  'utf8',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'ucs2',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'ucs2',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf32',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'cesu8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'cesu8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'gb18030',
  'gb18030',
  'gb18030',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8',
  'utf8'
];

const MAX_PACKET_LENGTH = 16777215;

function readPacketLength(b, off) {
  const b0 = b[off];
  const b1 = b[off + 1];
  const b2 = b[off + 2];
  if (b1 + b2 === 0) {
    return b0;
  }
  return b0 + (b1 << 8) + (b2 << 16);
}

class PacketParser {
  constructor(onPacket, packetHeaderLength) {
    // 4 for normal packets, 7 for comprssed protocol packets
    if (typeof packetHeaderLength === 'undefined') {
      packetHeaderLength = 4;
    }
    // array of last payload chunks
    // only used when current payload is not complete
    this.buffer = [];
    // total length of chunks on buffer
    this.bufferLength = 0;
    this.packetHeaderLength = packetHeaderLength;
    // incomplete header state: number of header bytes received
    this.headerLen = 0;
    // expected payload length
    this.length = 0;
    this.largePacketParts = [];
    this.firstPacketSequenceId = 0;
    this.onPacket = onPacket;
    this.execute = PacketParser.prototype.executeStart;
    this._flushLargePacket =
      packetHeaderLength === 7
        ? this._flushLargePacket7
        : this._flushLargePacket4;
  }

  _flushLargePacket4() {
    const numPackets = this.largePacketParts.length;
    this.largePacketParts.unshift(Buffer.from([0, 0, 0, 0])); // insert header
    const body = Buffer.concat(this.largePacketParts);
    const packet = new Packet(this.firstPacketSequenceId, body, 0, body.length);
    this.largePacketParts.length = 0;
    packet.numPackets = numPackets;
    this.onPacket(packet);
  }

  _flushLargePacket7() {
    const numPackets = this.largePacketParts.length;
    this.largePacketParts.unshift(Buffer.from([0, 0, 0, 0, 0, 0, 0])); // insert header
    const body = Buffer.concat(this.largePacketParts);
    this.largePacketParts.length = 0;
    const packet = new Packet(this.firstPacketSequenceId, body, 0, body.length);
    packet.numPackets = numPackets;
    this.onPacket(packet);
  }

  executeStart(chunk) {
    let start = 0;
    const end = chunk.length;
    while (end - start >= 3) {
      this.length = readPacketLength(chunk, start);
      if (end - start >= this.length + this.packetHeaderLength) {
        // at least one full packet
        const sequenceId = chunk[start + 3];
        if (
          this.length < MAX_PACKET_LENGTH &&
          this.largePacketParts.length === 0
        ) {
          this.onPacket(
            new Packet(
              sequenceId,
              chunk,
              start,
              start + this.packetHeaderLength + this.length
            )
          );
        } else {
          // first large packet - remember it's id
          if (this.largePacketParts.length === 0) {
            this.firstPacketSequenceId = sequenceId;
          }
          this.largePacketParts.push(
            chunk.slice(
              start + this.packetHeaderLength,
              start + this.packetHeaderLength + this.length
            )
          );
          if (this.length < MAX_PACKET_LENGTH) {
            this._flushLargePacket();
          }
        }
        start += this.packetHeaderLength + this.length;
      } else {
        // payload is incomplete
        this.buffer = [chunk.slice(start + 3, end)];
        this.bufferLength = end - start - 3;
        this.execute = PacketParser.prototype.executePayload;
        return;
      }
    }
    if (end - start > 0) {
      // there is start of length header, but it's not full 3 bytes
      this.headerLen = end - start; // 1 or 2 bytes
      this.length = chunk[start];
      if (this.headerLen === 2) {
        this.length = chunk[start] + (chunk[start + 1] << 8);
        this.execute = PacketParser.prototype.executeHeader3;
      } else {
        this.execute = PacketParser.prototype.executeHeader2;
      }
    }
  }

  executePayload(chunk) {
    let start = 0;
    const end = chunk.length;
    const remainingPayload =
      this.length - this.bufferLength + this.packetHeaderLength - 3;
    if (end - start >= remainingPayload) {
      // last chunk for payload
      const payload = Buffer.allocUnsafe(this.length + this.packetHeaderLength);
      let offset = 3;
      for (let i = 0; i < this.buffer.length; ++i) {
        this.buffer[i].copy(payload, offset);
        offset += this.buffer[i].length;
      }
      chunk.copy(payload, offset, start, start + remainingPayload);
      const sequenceId = payload[3];
      if (
        this.length < MAX_PACKET_LENGTH &&
        this.largePacketParts.length === 0
      ) {
        this.onPacket(
          new Packet(
            sequenceId,
            payload,
            0,
            this.length + this.packetHeaderLength
          )
        );
      } else {
        // first large packet - remember it's id
        if (this.largePacketParts.length === 0) {
          this.firstPacketSequenceId = sequenceId;
        }
        this.largePacketParts.push(
          payload.slice(
            this.packetHeaderLength,
            this.packetHeaderLength + this.length
          )
        );
        if (this.length < MAX_PACKET_LENGTH) {
          this._flushLargePacket();
        }
      }
      this.buffer = [];
      this.bufferLength = 0;
      this.execute = PacketParser.prototype.executeStart;
      start += remainingPayload;
      if (end - start > 0) {
        return this.execute(chunk.slice(start, end));
      }
    } else {
      this.buffer.push(chunk);
      this.bufferLength += chunk.length;
    }
    return null;
  }

  executeHeader2(chunk) {
    this.length += chunk[0] << 8;
    if (chunk.length > 1) {
      this.length += chunk[1] << 16;
      this.execute = PacketParser.prototype.executePayload;
      return this.executePayload(chunk.slice(2));
    }
    this.execute = PacketParser.prototype.executeHeader3;

    return null;
  }

  executeHeader3(chunk) {
    this.length += chunk[0] << 16;
    this.execute = PacketParser.prototype.executePayload;
    return this.executePayload(chunk.slice(1));
  }
}

class Command extends EventEmitter {
  constructor() {
    super();
    this.next = null;
  }

  // slow. debug only
  stateName() {
    const state = this.next;
    for (const i in this) {
      if (this[i] === state && i !== 'next') {
        return i;
      }
    }
    return 'unknown name';
  }

  execute(packet, connection) {
    if (!this.next) {
      this.next = this.start;
      connection._resetSequenceId();
    }
    if (packet && packet.isError()) {
      const err = packet.asError(connection.clientEncoding);
      err.sql = this.sql || this.query;
      if (this.queryTimeout) {
        Timers.clearTimeout(this.queryTimeout);
        this.queryTimeout = null;
      }
      if (this.onResult) {
        this.onResult(err);
        this.emit('end');
      } else {
        this.emit('error', err);
        this.emit('end');
      }
      return true;
    }
    // TODO: don't return anything from execute, it's ugly and error-prone. Listen for 'end' event in connection
    this.next = this.next(packet, connection);
    if (this.next) {
      return false;
    }
    this.emit('end');
    return true;

  }
}

function flagNames(flags) {
  const res = [];
  for (const c in ClientConstants) {
    if (flags & ClientConstants[c]) {
      res.push(c.replace(/_/g, ' ').toLowerCase());
    }
  }
  return res;
}

class ClientHandshake extends Command {
  constructor(clientFlags) {
    super();
    this.handshake = null;
    this.clientFlags = clientFlags;
    this.authenticationFactor = 0;
  }

  start() {
    return ClientHandshake.prototype.handshakeInit;
  }

  sendSSLRequest(connection) {
    const sslRequest = new Packets.SSLRequest(
      this.clientFlags,
      connection.config.charsetNumber
    );
    connection.writePacket(sslRequest.toPacket());
  }

  sendCredentials(connection) {
    if (connection.config.debug) {
      // eslint-disable-next-line
      console.log(
        'Sending handshake packet: flags:%d=(%s)',
        this.clientFlags,
        flagNames(this.clientFlags).join(', ')
      );
    }
    this.user = connection.config.user;
    this.password = connection.config.password;
    // "password1" is an alias to the original "password" value
    // to make it easier to integrate multi-factor authentication
    this.password1 = connection.config.password;
    // "password2" and "password3" are the 2nd and 3rd factor authentication
    // passwords, which can be undefined depending on the authentication
    // plugin being used
    this.password2 = connection.config.password2;
    this.password3 = connection.config.password3;
    this.passwordSha1 = connection.config.passwordSha1;
    this.database = connection.config.database;
    this.autPluginName = this.handshake.autPluginName;
    const handshakeResponse = new Packets.HandshakeResponse({
      flags: this.clientFlags,
      user: this.user,
      database: this.database,
      password: this.password,
      passwordSha1: this.passwordSha1,
      charsetNumber: connection.config.charsetNumber,
      authPluginData1: this.handshake.authPluginData1,
      authPluginData2: this.handshake.authPluginData2,
      compress: connection.config.compress,
      connectAttributes: connection.config.connectAttributes
    });
    connection.writePacket(handshakeResponse.toPacket());
  }

  calculateNativePasswordAuthToken(authPluginData) {
    // TODO: dont split into authPluginData1 and authPluginData2, instead join when 1 & 2 received
    const authPluginData1 = authPluginData.slice(0, 8);
    const authPluginData2 = authPluginData.slice(8, 20);
    let authToken;
    if (this.passwordSha1) {
      authToken = auth41.calculateTokenFromPasswordSha(
        this.passwordSha1,
        authPluginData1,
        authPluginData2
      );
    } else {
      authToken = auth41.calculateToken(
        this.password,
        authPluginData1,
        authPluginData2
      );
    }
    return authToken;
  }

  handshakeInit(helloPacket, connection) {
    this.on('error', e => {
      connection._fatalError = e;
      connection._protocolError = e;
    });
    this.handshake = Packets.Handshake.fromPacket(helloPacket);
    if (connection.config.debug) {
      // eslint-disable-next-line
      console.log(
        'Server hello packet: capability flags:%d=(%s)',
        this.handshake.capabilityFlags,
        flagNames(this.handshake.capabilityFlags).join(', ')
      );
    }
    connection.serverCapabilityFlags = this.handshake.capabilityFlags;
    connection.serverEncoding = CharsetToEncoding[this.handshake.characterSet];
    connection.connectionId = this.handshake.connectionId;
    const serverSSLSupport =
      this.handshake.capabilityFlags & ClientConstants.SSL;
    // multi factor authentication is enabled with the
    // "MULTI_FACTOR_AUTHENTICATION" capability and should only be used if it
    // is supported by the server
    const multiFactorAuthentication =
      this.handshake.capabilityFlags & ClientConstants.MULTI_FACTOR_AUTHENTICATION;
    this.clientFlags = this.clientFlags | multiFactorAuthentication;
    // use compression only if requested by client and supported by server
    connection.config.compress =
      connection.config.compress &&
      this.handshake.capabilityFlags & ClientConstants.COMPRESS;
    this.clientFlags = this.clientFlags | connection.config.compress;
    if (connection.config.ssl) {
      // client requires SSL but server does not support it
      if (!serverSSLSupport) {
        const err = new Error('Server does not support secure connection');
        err.code = 'HANDSHAKE_NO_SSL_SUPPORT';
        err.fatal = true;
        this.emit('error', err);
        return false;
      }
      // send ssl upgrade request and immediately upgrade connection to secure
      this.clientFlags |= ClientConstants.SSL;
      this.sendSSLRequest(connection);
      connection.startTLS(err => {
        // after connection is secure
        if (err) {
          // SSL negotiation error are fatal
          err.code = 'HANDSHAKE_SSL_ERROR';
          err.fatal = true;
          this.emit('error', err);
          return;
        }
        // rest of communication is encrypted
        this.sendCredentials(connection);
      });
    } else {
      this.sendCredentials(connection);
    }
    if (multiFactorAuthentication) {
      // if the server supports multi-factor authentication, we enable it in
      // the client
      this.authenticationFactor = 1;
    }
    return ClientHandshake.prototype.handshakeResult;
  }

  handshakeResult(packet, connection) {
    const marker = packet.peekByte();
    // packet can be OK_Packet, ERR_Packet, AuthSwitchRequest, AuthNextFactor
    // or AuthMoreData
    if (marker === 0xfe || marker === 1 || marker === 0x02) {
      const authSwitch = require('./auth_switch');
      try {
        if (marker === 1) {
          authSwitch.authSwitchRequestMoreData(packet, connection, this);
        } else {
          // if authenticationFactor === 0, it means the server does not support
          // the multi-factor authentication capability
          if (this.authenticationFactor !== 0) {
            // if we are past the first authentication factor, we should use the
            // corresponding password (if there is one)
            connection.config.password = this[`password${this.authenticationFactor}`];
            // update the current authentication factor
            this.authenticationFactor += 1;
          }
          // if marker === 0x02, it means it is an AuthNextFactor packet,
          // which is similar in structure to an AuthSwitchRequest packet,
          // so, we can use it directly
          authSwitch.authSwitchRequest(packet, connection, this);
        }
        return ClientHandshake.prototype.handshakeResult;
      } catch (err) {
        // Authentication errors are fatal
        err.code = 'AUTH_SWITCH_PLUGIN_ERROR';
        err.fatal = true;

        if (this.onResult) {
          this.onResult(err);
        } else {
          this.emit('error', err);
        }
        return null;
      }
    }
    if (marker !== 0) {
      const err = new Error('Unexpected packet during handshake phase');
      // Unknown handshake errors are fatal
      err.code = 'HANDSHAKE_UNKNOWN_ERROR';
      err.fatal = true;

      if (this.onResult) {
        this.onResult(err);
      } else {
        this.emit('error', err);
      }
      return null;
    }
    // this should be called from ClientHandshake command only
    // and skipped when called from ChangeUser command
    if (!connection.authorized) {
      connection.authorized = true;
      if (connection.config.compress) {
        const enableCompression = require('../compressed_protocol.js')
          .enableCompression;
        enableCompression(connection);
      }
    }
    if (this.onResult) {
      this.onResult(null);
    }
    return null;
  }
}

class Query extends Command {
  constructor(options, callback) {
    super();
    this.sql = options.sql;
    this.values = options.values;
    this._queryOptions = options;
    this.namedPlaceholders = options.namedPlaceholders || false;
    this.onResult = callback;
    this.timeout = options.timeout;
    this.queryTimeout = null;
    this._fieldCount = 0;
    this._rowParser = null;
    this._fields = [];
    this._rows = [];
    this._receivedFieldsCount = 0;
    this._resultIndex = 0;
    this._localStream = null;
    this._unpipeStream = function () { };
    this._streamFactory = options.infileStreamFactory;
    this._connection = null;
  }

  then() {
    const err =
      "You have tried to call .then(), .catch(), or invoked await on the result of query that is not a promise, which is a programming error. Try calling con.promise().query(), or require('mysql2/promise') instead of 'mysql2' for a promise-compatible version of the query interface. To learn how to use async/await or Promises check out documentation at https://sidorares.github.io/node-mysql2/docs#using-promise-wrapper, or the mysql2 documentation at https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper";
    // eslint-disable-next-line
    console.log(err);
    throw new Error(err);
  }

  /* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
  start(_packet, connection) {
    if (connection.config.debug) {
      // eslint-disable-next-line
      console.log('        Sending query command: %s', this.sql);
    }
    this._connection = connection;
    this.options = Object.assign({}, connection.config, this._queryOptions);
    this._setTimeout();

    const cmdPacket = new Packets.Query(
      this.sql,
      connection.config.charsetNumber
    );
    connection.writePacket(cmdPacket.toPacket(1));
    return Query.prototype.resultsetHeader;
  }

  done() {
    this._unpipeStream();
    // if all ready timeout, return null directly
    if (this.timeout && !this.queryTimeout) {
      return null;
    }
    // else clear timer
    if (this.queryTimeout) {
      Timers.clearTimeout(this.queryTimeout);
      this.queryTimeout = null;
    }
    if (this.onResult) {
      let rows, fields;
      if (this._resultIndex === 0) {
        rows = this._rows[0];
        fields = this._fields[0];
      } else {
        rows = this._rows;
        fields = this._fields;
      }
      if (fields) {
        process.nextTick(() => {
          this.onResult(null, rows, fields);
        });
      } else {
        process.nextTick(() => {
          this.onResult(null, rows);
        });
      }
    }
    return null;
  }

  doneInsert(rs) {
    if (this._localStreamError) {
      if (this.onResult) {
        this.onResult(this._localStreamError, rs);
      } else {
        this.emit('error', this._localStreamError);
      }
      return null;
    }
    this._rows.push(rs);
    this._fields.push(void 0);
    this.emit('fields', void 0);
    this.emit('result', rs);
    if (rs.serverStatus & ServerStatus.SERVER_MORE_RESULTS_EXISTS) {
      this._resultIndex++;
      return this.resultsetHeader;
    }
    return this.done();
  }

  resultsetHeader(packet, connection) {
    const rs = new Packets.ResultSetHeader(packet, connection);
    this._fieldCount = rs.fieldCount;
    if (connection.config.debug) {
      // eslint-disable-next-line
      console.log(
        `        Resultset header received, expecting ${rs.fieldCount} column definition packets`
      );
    }
    if (this._fieldCount === 0) {
      return this.doneInsert(rs);
    }
    if (this._fieldCount === null) {
      return this._streamLocalInfile(connection, rs.infileName);
    }
    this._receivedFieldsCount = 0;
    this._rows.push([]);
    this._fields.push([]);
    return this.readField;
  }

  _streamLocalInfile(connection, path) {
    if (this._streamFactory) {
      this._localStream = this._streamFactory(path);
    } else {
      this._localStreamError = new Error(
        `As a result of LOCAL INFILE command server wants to read ${path} file, but as of v2.0 you must provide streamFactory option returning ReadStream.`
      );
      connection.writePacket(EmptyPacket);
      return this.infileOk;
    }

    const onConnectionError = () => {
      this._unpipeStream();
    };
    const onDrain = () => {
      this._localStream.resume();
    };
    const onPause = () => {
      this._localStream.pause();
    };
    const onData = function (data) {
      const dataWithHeader = Buffer.allocUnsafe(data.length + 4);
      data.copy(dataWithHeader, 4);
      connection.writePacket(
        new Packets.Packet(0, dataWithHeader, 0, dataWithHeader.length)
      );
    };
    const onEnd = () => {
      connection.removeListener('error', onConnectionError);
      connection.writePacket(EmptyPacket);
    };
    const onError = err => {
      this._localStreamError = err;
      connection.removeListener('error', onConnectionError);
      connection.writePacket(EmptyPacket);
    };
    this._unpipeStream = () => {
      connection.stream.removeListener('pause', onPause);
      connection.stream.removeListener('drain', onDrain);
      this._localStream.removeListener('data', onData);
      this._localStream.removeListener('end', onEnd);
      this._localStream.removeListener('error', onError);
    };
    connection.stream.on('pause', onPause);
    connection.stream.on('drain', onDrain);
    this._localStream.on('data', onData);
    this._localStream.on('end', onEnd);
    this._localStream.on('error', onError);
    connection.once('error', onConnectionError);
    return this.infileOk;
  }

  readField(packet, connection) {
    this._receivedFieldsCount++;
    // Often there is much more data in the column definition than in the row itself
    // If you set manually _fields[0] to array of ColumnDefinition's (from previous call)
    // you can 'cache' result of parsing. Field packets still received, but ignored in that case
    // this is the reason _receivedFieldsCount exist (otherwise we could just use current length of fields array)
    if (this._fields[this._resultIndex].length !== this._fieldCount) {
      const field = new Packets.ColumnDefinition(
        packet,
        connection.clientEncoding
      );
      this._fields[this._resultIndex].push(field);
      if (connection.config.debug) {
        /* eslint-disable no-console */
        console.log('        Column definition:');
        console.log(`          name: ${field.name}`);
        console.log(`          type: ${field.columnType}`);
        console.log(`         flags: ${field.flags}`);
        /* eslint-enable no-console */
      }
    }
    // last field received
    if (this._receivedFieldsCount === this._fieldCount) {
      const fields = this._fields[this._resultIndex];
      this.emit('fields', fields);
      this._rowParser = new (getTextParser(fields, this.options, connection.config))(fields);
      return Query.prototype.fieldsEOF;
    }
    return Query.prototype.readField;
  }

  fieldsEOF(packet, connection) {
    // check EOF
    if (!packet.isEOF()) {
      return connection.protocolError('Expected EOF packet');
    }
    return this.row;
  }

  /* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
  row(packet, _connection) {
    if (packet.isEOF()) {
      const status = packet.eofStatusFlags();
      const moreResults = status & ServerStatus.SERVER_MORE_RESULTS_EXISTS;
      if (moreResults) {
        this._resultIndex++;
        return Query.prototype.resultsetHeader;
      }
      return this.done();
    }
    let row;
    try {
      row = this._rowParser.next(
        packet,
        this._fields[this._resultIndex],
        this.options
      );
    } catch (err) {
      this._localStreamError = err;
      return this.doneInsert(null);
    }
    if (this.onResult) {
      this._rows[this._resultIndex].push(row);
    } else {
      this.emit('result', row);
    }
    return Query.prototype.row;
  }

  infileOk(packet, connection) {
    const rs = new Packets.ResultSetHeader(packet, connection);
    return this.doneInsert(rs);
  }

  stream(options) {
    options = options || {};
    options.objectMode = true;
    const stream = new Readable(options);
    stream._read = () => {
      this._connection && this._connection.resume();
    };
    this.on('result', row => {
      if (!stream.push(row)) {
        this._connection.pause();
      }
      stream.emit('result', row); // replicate old emitter
    });
    this.on('error', err => {
      stream.emit('error', err); // Pass on any errors
    });
    this.on('end', () => {
      stream.push(null); // pushing null, indicating EOF
    });
    this.on('fields', fields => {
      stream.emit('fields', fields); // replicate old emitter
    });
    stream.on('end', () => {
      stream.emit('close');
    });
    return stream;
  }

  _setTimeout() {
    if (this.timeout) {
      const timeoutHandler = this._handleTimeoutError.bind(this);
      this.queryTimeout = Timers.setTimeout(
        timeoutHandler,
        this.timeout
      );
    }
  }

  _handleTimeoutError() {
    if (this.queryTimeout) {
      Timers.clearTimeout(this.queryTimeout);
      this.queryTimeout = null;
    }

    const err = new Error('Query inactivity timeout');
    err.errorno = 'PROTOCOL_SEQUENCE_TIMEOUT';
    err.code = 'PROTOCOL_SEQUENCE_TIMEOUT';
    err.syscall = 'query';

    if (this.onResult) {
      this.onResult(err);
    } else {
      this.emit('error', err);
    }
  }
}

Query.prototype.catch = Query.prototype.then;

class Quit extends Command {
  constructor(callback) {
    super();
    this.onResult = callback;
  }

  start(packet, connection) {
    connection._closing = true;
    const quit = new Packet(
      0,
      Buffer.from([1, 0, 0, 0, CommandCode.QUIT]),
      0,
      5
    );
    if (this.onResult) {
      this.onResult();
    }
    connection.writePacket(quit);
    return null;
  }
}



let Commands = {
  ClientHandshake : ClientHandshake,
  Query : Query,
  Quit : Quit
}

let _connectionId = 0;

let convertNamedPlaceholders = null;

class Connection extends EventEmitter {
  constructor(opts) {
    super();
    this.config = opts.config;
    // TODO: fill defaults
    // if no params, connect to /var/lib/mysql/mysql.sock ( /tmp/mysql.sock on OSX )
    // if host is given, connect to host:3306
    // TODO: use `/usr/local/mysql/bin/mysql_config --socket` output? as default socketPath
    // if there is no host/port and no socketPath parameters?
    if (!opts.config.stream) {
      if (opts.config.socketPath) {
        this.stream = Net.connect(opts.config.socketPath);
      } else {
        this.stream = Net.connect(
          opts.config.port,
          opts.config.host
        );

        // Optionally enable keep-alive on the socket.
        if (this.config.enableKeepAlive) {
          this.stream.on('connect', () => {
            this.stream.setKeepAlive(true, this.config.keepAliveInitialDelay);
          });
        }

        // Enable TCP_NODELAY flag. This is needed so that the network packets
        // are sent immediately to the server
        this.stream.setNoDelay(true);
      }
      // if stream is a function, treat it as "stream agent / factory"
    } else if (typeof opts.config.stream === 'function')  {
      this.stream = opts.config.stream(opts);
    } else {
      this.stream = opts.config.stream;
    }

    this._internalId = _connectionId++;
    this._commands = new Queue();
    this._command = null;
    this._paused = false;
    this._paused_packets = new Queue();
    this._statements = new LRU({
      max: this.config.maxPreparedStatements,
      dispose: function(statement) {
        statement.close();
      }
    });
    this.serverCapabilityFlags = 0;
    this.authorized = false;
    this.sequenceId = 0;
    this.compressedSequenceId = 0;
    this.threadId = null;
    this._handshakePacket = null;
    this._fatalError = null;
    this._protocolError = null;
    this._outOfOrderPackets = [];
    this.clientEncoding = CharsetToEncoding[this.config.charsetNumber];
    this.stream.on('error', this._handleNetworkError.bind(this));
    // see https://gist.github.com/khoomeister/4985691#use-that-instead-of-bind
    this.packetParser = new PacketParser(p => {
      this.handlePacket(p);
    });
    this.stream.on('data', data => {
      if (this.connectTimeout) {
        Timers.clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
      }
      this.packetParser.execute(data);
    });
    this.stream.on('end', () => {
      // emit the end event so that the pooled connection can close the connection
      this.emit('end');
    });
    this.stream.on('close', () => {
      // we need to set this flag everywhere where we want connection to close
      if (this._closing) {
        return;
      }
      if (!this._protocolError) {
        // no particular error message before disconnect
        this._protocolError = new Error(
          'Connection lost: The server closed the connection.'
        );
        this._protocolError.fatal = true;
        this._protocolError.code = 'PROTOCOL_CONNECTION_LOST';
      }
      this._notifyError(this._protocolError);
    });
    let handshakeCommand;
    if (!this.config.isServer) {
      handshakeCommand = new Commands.ClientHandshake(this.config.clientFlags);
      handshakeCommand.on('end', () => {
        // this happens when handshake finishes early either because there was
        // some fatal error or the server sent an error packet instead of
        // an hello packet (for example, 'Too many connections' error)
        if (!handshakeCommand.handshake || this._fatalError || this._protocolError) {
          return;
        }
        this._handshakePacket = handshakeCommand.handshake;
        this.threadId = handshakeCommand.handshake.connectionId;
        this.emit('connect', handshakeCommand.handshake);
      });
      handshakeCommand.on('error', err => {
        this._closing = true;
        this._notifyError(err);
      });
      this.addCommand(handshakeCommand);
    }
    // in case there was no initial handshake but we need to read sting, assume it utf-8
    // most common example: "Too many connections" error ( packet is sent immediately on connection attempt, we don't know server encoding yet)
    // will be overwritten with actual encoding value as soon as server handshake packet is received
    this.serverEncoding = 'utf8';
    if (this.config.connectTimeout) {
      const timeoutHandler = this._handleTimeoutError.bind(this);
      this.connectTimeout = Timers.setTimeout(
        timeoutHandler,
        this.config.connectTimeout
      );
    }
  }

  promise(promiseImpl) {
    const PromiseConnection = require('../promise').PromiseConnection;
    return new PromiseConnection(this, promiseImpl);
  }

  _addCommandClosedState(cmd) {
    const err = new Error(
      "Can't add new command when connection is in closed state"
    );
    err.fatal = true;
    if (cmd.onResult) {
      cmd.onResult(err);
    } else {
      this.emit('error', err);
    }
  }

  _handleFatalError(err) {
    err.fatal = true;
    // stop receiving packets
    this.stream.removeAllListeners('data');
    this.addCommand = this._addCommandClosedState;
    this.write = () => {
      this.emit('error', new Error("Can't write in closed state"));
    };
    this._notifyError(err);
    this._fatalError = err;
  }

  _handleNetworkError(err) {
    if (this.connectTimeout) {
      Timers.clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    // Do not throw an error when a connection ends with a RST,ACK packet
    if (err.code === 'ECONNRESET' && this._closing) {
      return;
    }
    this._handleFatalError(err);
  }

  _handleTimeoutError() {
    if (this.connectTimeout) {
      Timers.clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    this.stream.destroy && this.stream.destroy();
    const err = new Error('connect ETIMEDOUT');
    err.errorno = 'ETIMEDOUT';
    err.code = 'ETIMEDOUT';
    err.syscall = 'connect';
    this._handleNetworkError(err);
  }

  // notify all commands in the queue and bubble error as connection "error"
  // called on stream error or unexpected termination
  _notifyError(err) {
    if (this.connectTimeout) {
      Timers.clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    // prevent from emitting 'PROTOCOL_CONNECTION_LOST' after EPIPE or ECONNRESET
    if (this._fatalError) {
      return;
    }
    let command;
    // if there is no active command, notify connection
    // if there are commands and all of them have callbacks, pass error via callback
    let bubbleErrorToConnection = !this._command;
    if (this._command && this._command.onResult) {
      this._command.onResult(err);
      this._command = null;
      // connection handshake is special because we allow it to be implicit
      // if error happened during handshake, but there are others commands in queue
      // then bubble error to other commands and not to connection
    } else if (
      !(
        this._command &&
        this._command.constructor === Commands.ClientHandshake &&
        this._commands.length > 0
      )
    ) {
      bubbleErrorToConnection = true;
    }
    while ((command = this._commands.shift())) {
      if (command.onResult) {
        command.onResult(err);
      } else {
        bubbleErrorToConnection = true;
      }
    }
    // notify connection if some comands in the queue did not have callbacks
    // or if this is pool connection ( so it can be removed from pool )
    if (bubbleErrorToConnection || this._pool) {
      this.emit('error', err);
    }
    // close connection after emitting the event in case of a fatal error
    if (err.fatal) {
      this.close();
    }
  }

  write(buffer) {
    const result = this.stream.write(buffer, err => {
      if (err) {
        this._handleNetworkError(err);
      }
    });

    if (!result) {
      this.stream.emit('pause');
    }
  }

  // http://dev.mysql.com/doc/internals/en/sequence-id.html
  //
  // The sequence-id is incremented with each packet and may wrap around.
  // It starts at 0 and is reset to 0 when a new command
  // begins in the Command Phase.
  // http://dev.mysql.com/doc/internals/en/example-several-mysql-packets.html
  _resetSequenceId() {
    this.sequenceId = 0;
    this.compressedSequenceId = 0;
  }

  _bumpCompressedSequenceId(numPackets) {
    this.compressedSequenceId += numPackets;
    this.compressedSequenceId %= 256;
  }

  _bumpSequenceId(numPackets) {
    this.sequenceId += numPackets;
    this.sequenceId %= 256;
  }

  writePacket(packet) {
    const MAX_PACKET_LENGTH = 16777215;
    const length = packet.length();
    let chunk, offset, header;
    if (length < MAX_PACKET_LENGTH) {
      packet.writeHeader(this.sequenceId);
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.log(
          `${this._internalId} ${this.connectionId} <== ${this._command._commandName}#${this._command.stateName()}(${[this.sequenceId, packet._name, packet.length()].join(',')})`
        );
        // eslint-disable-next-line no-console
        console.log(
          `${this._internalId} ${this.connectionId} <== ${packet.buffer.toString('hex')}`
        );
      }
      this._bumpSequenceId(1);
      this.write(packet.buffer);
    } else {
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.log(
          `${this._internalId} ${this.connectionId} <== Writing large packet, raw content not written:`
        );
        // eslint-disable-next-line no-console
        console.log(
          `${this._internalId} ${this.connectionId} <== ${this._command._commandName}#${this._command.stateName()}(${[this.sequenceId, packet._name, packet.length()].join(',')})`
        );
      }
      for (offset = 4; offset < 4 + length; offset += MAX_PACKET_LENGTH) {
        chunk = packet.buffer.slice(offset, offset + MAX_PACKET_LENGTH);
        if (chunk.length === MAX_PACKET_LENGTH) {
          header = Buffer.from([0xff, 0xff, 0xff, this.sequenceId]);
        } else {
          header = Buffer.from([
            chunk.length & 0xff,
            (chunk.length >> 8) & 0xff,
            (chunk.length >> 16) & 0xff,
            this.sequenceId
          ]);
        }
        this._bumpSequenceId(1);
        this.write(header);
        this.write(chunk);
      }
    }
  }

  // 0.11+ environment
  startTLS(onSecure) {
    if (this.config.debug) {
      // eslint-disable-next-line no-console
      console.log('Upgrading connection to TLS');
    }
    const secureContext = Tls.createSecureContext({
      ca: this.config.ssl.ca,
      cert: this.config.ssl.cert,
      ciphers: this.config.ssl.ciphers,
      key: this.config.ssl.key,
      passphrase: this.config.ssl.passphrase,
      minVersion: this.config.ssl.minVersion,
      maxVersion: this.config.ssl.maxVersion
    });
    const rejectUnauthorized = this.config.ssl.rejectUnauthorized;
    const verifyIdentity = this.config.ssl.verifyIdentity;
    const servername = this.config.host;

    let secureEstablished = false;
    this.stream.removeAllListeners('data');
    const secureSocket = Tls.connect({
      rejectUnauthorized,
      requestCert: rejectUnauthorized,
      checkServerIdentity: verifyIdentity
        ? Tls.checkServerIdentity
        : function() { return undefined; },
      secureContext,
      isServer: false,
      socket: this.stream,
      servername
    }, () => {
      secureEstablished = true;
      if (rejectUnauthorized) {
        if (typeof servername === 'string' && verifyIdentity) {
          const cert = secureSocket.getPeerCertificate(true);
          const serverIdentityCheckError = Tls.checkServerIdentity(servername, cert);
          if (serverIdentityCheckError) {
            onSecure(serverIdentityCheckError);
            return;
          }
        }
      }
      onSecure();
    });
    // error handler for secure socket
    secureSocket.on('error', err => {
      if (secureEstablished) {
        this._handleNetworkError(err);
      } else {
        onSecure(err);
      }
    });
    secureSocket.on('data', data => {
      this.packetParser.execute(data);
    });
    this.write = buffer => secureSocket.write(buffer);
  }

  protocolError(message, code) {
    // Starting with MySQL 8.0.24, if the client closes the connection
    // unexpectedly, the server will send a last ERR Packet, which we can
    // safely ignore.
    // https://dev.mysql.com/worklog/task/?id=12999
    if (this._closing) {
      return;
    }

    const err = new Error(message);
    err.fatal = true;
    err.code = code || 'PROTOCOL_ERROR';
    this.emit('error', err);
  }

  get fatalError() {
    return this._fatalError;
  }

  handlePacket(packet) {
    if (this._paused) {
      this._paused_packets.push(packet);
      return;
    }
    if (this.config.debug) {
      if (packet) {
        // eslint-disable-next-line no-console
        console.log(
          ` raw: ${packet.buffer
            .slice(packet.offset, packet.offset + packet.length())
            .toString('hex')}`
        );
        // eslint-disable-next-line no-console
        console.trace();
        const commandName = this._command
          ? this._command._commandName
          : '(no command)';
        const stateName = this._command
          ? this._command.stateName()
          : '(no command)';
        // eslint-disable-next-line no-console
        console.log(
          `${this._internalId} ${this.connectionId} ==> ${commandName}#${stateName}(${[packet.sequenceId, packet.type(), packet.length()].join(',')})`
        );
      }
    }
    if (!this._command) {
      const marker = packet.peekByte();
      // If it's an Err Packet, we should use it.
      if (marker === 0xff) {
        const error = Packets.Error.fromPacket(packet);
        this.protocolError(error.message, error.code);
      } else {
        // Otherwise, it means it's some other unexpected packet.
        this.protocolError(
          'Unexpected packet while no commands in the queue',
          'PROTOCOL_UNEXPECTED_PACKET'
        );
      }
      this.close();
      return;
    }
    if (packet) {
      // Note: when server closes connection due to inactivity, Err packet ER_CLIENT_INTERACTION_TIMEOUT from MySQL 8.0.24, sequenceId will be 0
      if (this.sequenceId !== packet.sequenceId) {
        const err = new Error(
          `Warning: got packets out of order. Expected ${this.sequenceId} but received ${packet.sequenceId}`
        );
        err.expected = this.sequenceId;
        err.received = packet.sequenceId;
        this.emit('warn', err); // REVIEW
        // eslint-disable-next-line no-console
        console.error(err.message);
      }
      this._bumpSequenceId(packet.numPackets);
    }
    try {
      if (this._fatalError) {
        // skip remaining packets after client is in the error state
        return;
      }
      const done = this._command.execute(packet, this);
      if (done) {
        this._command = this._commands.shift();
        if (this._command) {
          this.sequenceId = 0;
          this.compressedSequenceId = 0;
          this.handlePacket();
        }
      }
    } catch (err) {
      this._handleFatalError(err);
      this.stream.destroy();
    }
  }

  addCommand(cmd) {
    // this.compressedSequenceId = 0;
    // this.sequenceId = 0;
    if (this.config.debug) {
      const commandName = cmd.constructor.name;
      // eslint-disable-next-line no-console
      console.log(`Add command: ${commandName}`);
      cmd._commandName = commandName;
    }
    if (!this._command) {
      this._command = cmd;
      this.handlePacket();
    } else {
      this._commands.push(cmd);
    }
    return cmd;
  }

  format(sql, values) {
    if (typeof this.config.queryFormat === 'function') {
      return this.config.queryFormat.call(
        this,
        sql,
        values,
        this.config.timezone
      );
    }
    const opts = {
      sql: sql,
      values: values
    };
    this._resolveNamedPlaceholders(opts);
    return SqlString.format(
      opts.sql,
      opts.values,
      this.config.stringifyObjects,
      this.config.timezone
    );
  }

  escape(value) {
    return SqlString.escape(value, false, this.config.timezone);
  }

  escapeId(value) {
    return SqlString.escapeId(value, false);
  }

  raw(sql) {
    return SqlString.raw(sql);
  }

  _resolveNamedPlaceholders(options) {
    let unnamed;
    if (this.config.namedPlaceholders || options.namedPlaceholders) {
      if (Array.isArray(options.values)) {
        // if an array is provided as the values, assume the conversion is not necessary.
        // this allows the usage of unnamed placeholders even if the namedPlaceholders flag is enabled.
        return
      }
      if (convertNamedPlaceholders === null) {
        convertNamedPlaceholders = require('named-placeholders')();
      }
      unnamed = convertNamedPlaceholders(options.sql, options.values);
      options.sql = unnamed[0];
      options.values = unnamed[1];
    }
  }

  query(sql, values, cb) {
    let cmdQuery;
    if (sql.constructor === Commands.Query) {
      cmdQuery = sql;
    } else {
      cmdQuery = Connection.createQuery(sql, values, cb, this.config);
    }
    this._resolveNamedPlaceholders(cmdQuery);
    const rawSql = this.format(cmdQuery.sql, cmdQuery.values !== undefined ? cmdQuery.values : []);
    cmdQuery.sql = rawSql;
    return this.addCommand(cmdQuery);
  }

  pause() {
    this._paused = true;
    this.stream.pause();
  }

  resume() {
    let packet;
    this._paused = false;
    while ((packet = this._paused_packets.shift())) {
      this.handlePacket(packet);
      // don't resume if packet handler paused connection
      if (this._paused) {
        return;
      }
    }
    this.stream.resume();
  }

  // TODO: named placeholders support
  prepare(options, cb) {
    if (typeof options === 'string') {
      options = { sql: options };
    }
    return this.addCommand(new Commands.Prepare(options, cb));
  }

  unprepare(sql) {
    let options = {};
    if (typeof sql === 'object') {
      options = sql;
    } else {
      options.sql = sql;
    }
    const key = Connection.statementKey(options);
    const stmt = this._statements.get(key);
    if (stmt) {
      this._statements.delete(key);
      stmt.close();
    }
    return stmt;
  }

  execute(sql, values, cb) {
    let options = {
      infileStreamFactory: this.config.infileStreamFactory
    };
    if (typeof sql === 'object') {
      // execute(options, cb)
      options = {
        ...options,
        ...sql,
        sql: sql.sql,
        values: sql.values
      };
      if (typeof values === 'function') {
        cb = values;
      } else {
        options.values = options.values || values;
      }
    } else if (typeof values === 'function') {
      // execute(sql, cb)
      cb = values;
      options.sql = sql;
      options.values = undefined;
    } else {
      // execute(sql, values, cb)
      options.sql = sql;
      options.values = values;
    }
    this._resolveNamedPlaceholders(options);
    // check for values containing undefined
    if (options.values) {
      //If namedPlaceholder is not enabled and object is passed as bind parameters
      if (!Array.isArray(options.values)) {
        throw new TypeError(
          'Bind parameters must be array if namedPlaceholders parameter is not enabled'
        );
      }
      options.values.forEach(val => {
        //If namedPlaceholder is not enabled and object is passed as bind parameters
        if (!Array.isArray(options.values)) {
          throw new TypeError(
            'Bind parameters must be array if namedPlaceholders parameter is not enabled'
          );
        }
        if (val === undefined) {
          throw new TypeError(
            'Bind parameters must not contain undefined. To pass SQL NULL specify JS null'
          );
        }
        if (typeof val === 'function') {
          throw new TypeError(
            'Bind parameters must not contain function(s). To pass the body of a function as a string call .toString() first'
          );
        }
      });
    }
    const executeCommand = new Commands.Execute(options, cb);
    const prepareCommand = new Commands.Prepare(options, (err, stmt) => {
      if (err) {
        // skip execute command if prepare failed, we have main
        // combined callback here
        executeCommand.start = function() {
          return null;
        };
        if (cb) {
          cb(err);
        } else {
          executeCommand.emit('error', err);
        }
        executeCommand.emit('end');
        return;
      }
      executeCommand.statement = stmt;
    });
    this.addCommand(prepareCommand);
    this.addCommand(executeCommand);
    return executeCommand;
  }

  changeUser(options, callback) {
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }
    const charsetNumber = options.charset
      ? ConnectionConfig.getCharsetNumber(options.charset)
      : this.config.charsetNumber;
    return this.addCommand(
      new Commands.ChangeUser(
        {
          user: options.user || this.config.user,
          // for the purpose of multi-factor authentication, or not, the main
          // password (used for the 1st authentication factor) can also be
          // provided via the "password1" option
          password: options.password || options.password1 || this.config.password || this.config.password1,
          password2: options.password2 || this.config.password2,
          password3: options.password3 || this.config.password3,
          passwordSha1: options.passwordSha1 || this.config.passwordSha1,
          database: options.database || this.config.database,
          timeout: options.timeout,
          charsetNumber: charsetNumber,
          currentConfig: this.config
        },
        err => {
          if (err) {
            err.fatal = true;
          }
          if (callback) {
            callback(err);
          }
        }
      )
    );
  }

  // transaction helpers
  beginTransaction(cb) {
    return this.query('START TRANSACTION', cb);
  }

  commit(cb) {
    return this.query('COMMIT', cb);
  }

  rollback(cb) {
    return this.query('ROLLBACK', cb);
  }

  ping(cb) {
    return this.addCommand(new Commands.Ping(cb));
  }

  _registerSlave(opts, cb) {
    return this.addCommand(new Commands.RegisterSlave(opts, cb));
  }

  _binlogDump(opts, cb) {
    return this.addCommand(new Commands.BinlogDump(opts, cb));
  }

  // currently just alias to close
  destroy() {
    this.close();
  }

  close() {
    if (this.connectTimeout) {
      Timers.clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    this._closing = true;
    this.stream.end();
    this.addCommand = this._addCommandClosedState;
  }

  createBinlogStream(opts) {
    // TODO: create proper stream class
    // TODO: use through2
    let test = 1;
    const stream = new Readable({ objectMode: true });
    stream._read = function() {
      return {
        data: test++
      };
    };
    this._registerSlave(opts, () => {
      const dumpCmd = this._binlogDump(opts);
      dumpCmd.on('event', ev => {
        stream.push(ev);
      });
      dumpCmd.on('eof', () => {
        stream.push(null);
        // if non-blocking, then close stream to prevent errors
        if (opts.flags && opts.flags & 0x01) {
          this.close();
        }
      });
      // TODO: pipe errors as well
    });
    return stream;
  }

  connect(cb) {
    if (!cb) {
      return;
    }
    if (this._fatalError || this._protocolError) {
      return cb(this._fatalError || this._protocolError);
    }
    if (this._handshakePacket) {
      return cb(null, this);
    }
    let connectCalled = 0;
    function callbackOnce(isErrorHandler) {
      return function(param) {
        if (!connectCalled) {
          if (isErrorHandler) {
            cb(param);
          } else {
            cb(null, param);
          }
        }
        connectCalled = 1;
      };
    }
    this.once('error', callbackOnce(true));
    this.once('connect', callbackOnce(false));
  }

  // ===================================
  // outgoing server connection methods
  // ===================================
  writeColumns(columns) {
    this.writePacket(Packets.ResultSetHeader.toPacket(columns.length));
    columns.forEach(column => {
      this.writePacket(
        Packets.ColumnDefinition.toPacket(column, this.serverConfig.encoding)
      );
    });
    this.writeEof();
  }

  // row is array of columns, not hash
  writeTextRow(column) {
    this.writePacket(
      Packets.TextRow.toPacket(column, this.serverConfig.encoding)
    );
  }

  writeBinaryRow(column) {
    this.writePacket(
      Packets.BinaryRow.toPacket(column, this.serverConfig.encoding)
    );
  }

  writeTextResult(rows, columns, binary=false) {
    this.writeColumns(columns);
    rows.forEach(row => {
      const arrayRow = new Array(columns.length);
      columns.forEach(column => {
        arrayRow.push(row[column.name]);
      });
      if(binary) {
        this.writeBinaryRow(arrayRow);
      }
      else this.writeTextRow(arrayRow);
    });
    this.writeEof();
  }

  writeEof(warnings, statusFlags) {
    this.writePacket(Packets.EOF.toPacket(warnings, statusFlags));
  }

  writeOk(args) {
    if (!args) {
      args = { affectedRows: 0 };
    }
    this.writePacket(Packets.OK.toPacket(args, this.serverConfig.encoding));
  }

  writeError(args) {
    // if we want to send error before initial hello was sent, use default encoding
    const encoding = this.serverConfig ? this.serverConfig.encoding : 'cesu8';
    this.writePacket(Packets.Error.toPacket(args, encoding));
  }

  serverHandshake(args) {
    this.serverConfig = args;
    this.serverConfig.encoding =
      CharsetToEncoding[this.serverConfig.characterSet];
    return this.addCommand(new Commands.ServerHandshake(args));
  }

  // ===============================================================
  end(callback) {
    if (this.config.isServer) {
      this._closing = true;
      const quitCmd = new EventEmitter();
      setImmediate(() => {
        this.stream.end();
        quitCmd.emit('end');
      });
      return quitCmd;
    }
    // trigger error if more commands enqueued after end command
    const quitCmd = this.addCommand(new Commands.Quit(callback));
    this.addCommand = this._addCommandClosedState;
    return quitCmd;
  }

  static createQuery(sql, values, cb, config) {
    let options = {
      rowsAsArray: config.rowsAsArray,
      infileStreamFactory: config.infileStreamFactory
    };
    if (typeof sql === 'object') {
      // query(options, cb)
      options = {
        ...options,
        ...sql,
        sql: sql.sql,
        values: sql.values
      };
      if (typeof values === 'function') {
        cb = values;
      } else if (values !== undefined) {
        options.values = values;
      }
    } else if (typeof values === 'function') {
      // query(sql, cb)
      cb = values;
      options.sql = sql;
      options.values = undefined;
    } else {
      // query(sql, values, cb)
      options.sql = sql;
      options.values = values;
    }
    return new Commands.Query(options, cb);
  }

  static statementKey(options) {
    return (
      `${typeof options.nestTables}/${options.nestTables}/${options.rowsAsArray}${options.sql}`
    );
  }
}

/* node_modules/mysql2/lib/constants/charsets.js */
const Charsets = {};
Charsets.BIG5_CHINESE_CI = 1;
Charsets.LATIN2_CZECH_CS = 2;
Charsets.DEC8_SWEDISH_CI = 3;
Charsets.CP850_GENERAL_CI = 4;
Charsets.LATIN1_GERMAN1_CI = 5;
Charsets.HP8_ENGLISH_CI = 6;
Charsets.KOI8R_GENERAL_CI = 7;
Charsets.LATIN1_SWEDISH_CI = 8;
Charsets.LATIN2_GENERAL_CI = 9;
Charsets.SWE7_SWEDISH_CI = 10;
Charsets.ASCII_GENERAL_CI = 11;
Charsets.UJIS_JAPANESE_CI = 12;
Charsets.SJIS_JAPANESE_CI = 13;
Charsets.CP1251_BULGARIAN_CI = 14;
Charsets.LATIN1_DANISH_CI = 15;
Charsets.HEBREW_GENERAL_CI = 16;
Charsets.TIS620_THAI_CI = 18;
Charsets.EUCKR_KOREAN_CI = 19;
Charsets.LATIN7_ESTONIAN_CS = 20;
Charsets.LATIN2_HUNGARIAN_CI = 21;
Charsets.KOI8U_GENERAL_CI = 22;
Charsets.CP1251_UKRAINIAN_CI = 23;
Charsets.GB2312_CHINESE_CI = 24;
Charsets.GREEK_GENERAL_CI = 25;
Charsets.CP1250_GENERAL_CI = 26;
Charsets.LATIN2_CROATIAN_CI = 27;
Charsets.GBK_CHINESE_CI = 28;
Charsets.CP1257_LITHUANIAN_CI = 29;
Charsets.LATIN5_TURKISH_CI = 30;
Charsets.LATIN1_GERMAN2_CI = 31;
Charsets.ARMSCII8_GENERAL_CI = 32;
Charsets.UTF8_GENERAL_CI = 33;
Charsets.CP1250_CZECH_CS = 34;
Charsets.UCS2_GENERAL_CI = 35;
Charsets.CP866_GENERAL_CI = 36;
Charsets.KEYBCS2_GENERAL_CI = 37;
Charsets.MACCE_GENERAL_CI = 38;
Charsets.MACROMAN_GENERAL_CI = 39;
Charsets.CP852_GENERAL_CI = 40;
Charsets.LATIN7_GENERAL_CI = 41;
Charsets.LATIN7_GENERAL_CS = 42;
Charsets.MACCE_BIN = 43;
Charsets.CP1250_CROATIAN_CI = 44;
Charsets.UTF8MB4_GENERAL_CI = 45;
Charsets.UTF8MB4_BIN = 46;
Charsets.LATIN1_BIN = 47;
Charsets.LATIN1_GENERAL_CI = 48;
Charsets.LATIN1_GENERAL_CS = 49;
Charsets.CP1251_BIN = 50;
Charsets.CP1251_GENERAL_CI = 51;
Charsets.CP1251_GENERAL_CS = 52;
Charsets.MACROMAN_BIN = 53;
Charsets.UTF16_GENERAL_CI = 54;
Charsets.UTF16_BIN = 55;
Charsets.UTF16LE_GENERAL_CI = 56;
Charsets.CP1256_GENERAL_CI = 57;
Charsets.CP1257_BIN = 58;
Charsets.CP1257_GENERAL_CI = 59;
Charsets.UTF32_GENERAL_CI = 60;
Charsets.UTF32_BIN = 61;
Charsets.UTF16LE_BIN = 62;
Charsets.BINARY = 63;
Charsets.ARMSCII8_BIN = 64;
Charsets.ASCII_BIN = 65;
Charsets.CP1250_BIN = 66;
Charsets.CP1256_BIN = 67;
Charsets.CP866_BIN = 68;
Charsets.DEC8_BIN = 69;
Charsets.GREEK_BIN = 70;
Charsets.HEBREW_BIN = 71;
Charsets.HP8_BIN = 72;
Charsets.KEYBCS2_BIN = 73;
Charsets.KOI8R_BIN = 74;
Charsets.KOI8U_BIN = 75;
Charsets.UTF8_TOLOWER_CI = 76;
Charsets.LATIN2_BIN = 77;
Charsets.LATIN5_BIN = 78;
Charsets.LATIN7_BIN = 79;
Charsets.CP850_BIN = 80;
Charsets.CP852_BIN = 81;
Charsets.SWE7_BIN = 82;
Charsets.UTF8_BIN = 83;
Charsets.BIG5_BIN = 84;
Charsets.EUCKR_BIN = 85;
Charsets.GB2312_BIN = 86;
Charsets.GBK_BIN = 87;
Charsets.SJIS_BIN = 88;
Charsets.TIS620_BIN = 89;
Charsets.UCS2_BIN = 90;
Charsets.UJIS_BIN = 91;
Charsets.GEOSTD8_GENERAL_CI = 92;
Charsets.GEOSTD8_BIN = 93;
Charsets.LATIN1_SPANISH_CI = 94;
Charsets.CP932_JAPANESE_CI = 95;
Charsets.CP932_BIN = 96;
Charsets.EUCJPMS_JAPANESE_CI = 97;
Charsets.EUCJPMS_BIN = 98;
Charsets.CP1250_POLISH_CI = 99;
Charsets.UTF16_UNICODE_CI = 101;
Charsets.UTF16_ICELANDIC_CI = 102;
Charsets.UTF16_LATVIAN_CI = 103;
Charsets.UTF16_ROMANIAN_CI = 104;
Charsets.UTF16_SLOVENIAN_CI = 105;
Charsets.UTF16_POLISH_CI = 106;
Charsets.UTF16_ESTONIAN_CI = 107;
Charsets.UTF16_SPANISH_CI = 108;
Charsets.UTF16_SWEDISH_CI = 109;
Charsets.UTF16_TURKISH_CI = 110;
Charsets.UTF16_CZECH_CI = 111;
Charsets.UTF16_DANISH_CI = 112;
Charsets.UTF16_LITHUANIAN_CI = 113;
Charsets.UTF16_SLOVAK_CI = 114;
Charsets.UTF16_SPANISH2_CI = 115;
Charsets.UTF16_ROMAN_CI = 116;
Charsets.UTF16_PERSIAN_CI = 117;
Charsets.UTF16_ESPERANTO_CI = 118;
Charsets.UTF16_HUNGARIAN_CI = 119;
Charsets.UTF16_SINHALA_CI = 120;
Charsets.UTF16_GERMAN2_CI = 121;
Charsets.UTF16_CROATIAN_CI = 122;
Charsets.UTF16_UNICODE_520_CI = 123;
Charsets.UTF16_VIETNAMESE_CI = 124;
Charsets.UCS2_UNICODE_CI = 128;
Charsets.UCS2_ICELANDIC_CI = 129;
Charsets.UCS2_LATVIAN_CI = 130;
Charsets.UCS2_ROMANIAN_CI = 131;
Charsets.UCS2_SLOVENIAN_CI = 132;
Charsets.UCS2_POLISH_CI = 133;
Charsets.UCS2_ESTONIAN_CI = 134;
Charsets.UCS2_SPANISH_CI = 135;
Charsets.UCS2_SWEDISH_CI = 136;
Charsets.UCS2_TURKISH_CI = 137;
Charsets.UCS2_CZECH_CI = 138;
Charsets.UCS2_DANISH_CI = 139;
Charsets.UCS2_LITHUANIAN_CI = 140;
Charsets.UCS2_SLOVAK_CI = 141;
Charsets.UCS2_SPANISH2_CI = 142;
Charsets.UCS2_ROMAN_CI = 143;
Charsets.UCS2_PERSIAN_CI = 144;
Charsets.UCS2_ESPERANTO_CI = 145;
Charsets.UCS2_HUNGARIAN_CI = 146;
Charsets.UCS2_SINHALA_CI = 147;
Charsets.UCS2_GERMAN2_CI = 148;
Charsets.UCS2_CROATIAN_CI = 149;
Charsets.UCS2_UNICODE_520_CI = 150;
Charsets.UCS2_VIETNAMESE_CI = 151;
Charsets.UCS2_GENERAL_MYSQL500_CI = 159;
Charsets.UTF32_UNICODE_CI = 160;
Charsets.UTF32_ICELANDIC_CI = 161;
Charsets.UTF32_LATVIAN_CI = 162;
Charsets.UTF32_ROMANIAN_CI = 163;
Charsets.UTF32_SLOVENIAN_CI = 164;
Charsets.UTF32_POLISH_CI = 165;
Charsets.UTF32_ESTONIAN_CI = 166;
Charsets.UTF32_SPANISH_CI = 167;
Charsets.UTF32_SWEDISH_CI = 168;
Charsets.UTF32_TURKISH_CI = 169;
Charsets.UTF32_CZECH_CI = 170;
Charsets.UTF32_DANISH_CI = 171;
Charsets.UTF32_LITHUANIAN_CI = 172;
Charsets.UTF32_SLOVAK_CI = 173;
Charsets.UTF32_SPANISH2_CI = 174;
Charsets.UTF32_ROMAN_CI = 175;
Charsets.UTF32_PERSIAN_CI = 176;
Charsets.UTF32_ESPERANTO_CI = 177;
Charsets.UTF32_HUNGARIAN_CI = 178;
Charsets.UTF32_SINHALA_CI = 179;
Charsets.UTF32_GERMAN2_CI = 180;
Charsets.UTF32_CROATIAN_CI = 181;
Charsets.UTF32_UNICODE_520_CI = 182;
Charsets.UTF32_VIETNAMESE_CI = 183;
Charsets.UTF8_UNICODE_CI = 192;
Charsets.UTF8_ICELANDIC_CI = 193;
Charsets.UTF8_LATVIAN_CI = 194;
Charsets.UTF8_ROMANIAN_CI = 195;
Charsets.UTF8_SLOVENIAN_CI = 196;
Charsets.UTF8_POLISH_CI = 197;
Charsets.UTF8_ESTONIAN_CI = 198;
Charsets.UTF8_SPANISH_CI = 199;
Charsets.UTF8_SWEDISH_CI = 200;
Charsets.UTF8_TURKISH_CI = 201;
Charsets.UTF8_CZECH_CI = 202;
Charsets.UTF8_DANISH_CI = 203;
Charsets.UTF8_LITHUANIAN_CI = 204;
Charsets.UTF8_SLOVAK_CI = 205;
Charsets.UTF8_SPANISH2_CI = 206;
Charsets.UTF8_ROMAN_CI = 207;
Charsets.UTF8_PERSIAN_CI = 208;
Charsets.UTF8_ESPERANTO_CI = 209;
Charsets.UTF8_HUNGARIAN_CI = 210;
Charsets.UTF8_SINHALA_CI = 211;
Charsets.UTF8_GERMAN2_CI = 212;
Charsets.UTF8_CROATIAN_CI = 213;
Charsets.UTF8_UNICODE_520_CI = 214;
Charsets.UTF8_VIETNAMESE_CI = 215;
Charsets.UTF8_GENERAL_MYSQL500_CI = 223;
Charsets.UTF8MB4_UNICODE_CI = 224;
Charsets.UTF8MB4_ICELANDIC_CI = 225;
Charsets.UTF8MB4_LATVIAN_CI = 226;
Charsets.UTF8MB4_ROMANIAN_CI = 227;
Charsets.UTF8MB4_SLOVENIAN_CI = 228;
Charsets.UTF8MB4_POLISH_CI = 229;
Charsets.UTF8MB4_ESTONIAN_CI = 230;
Charsets.UTF8MB4_SPANISH_CI = 231;
Charsets.UTF8MB4_SWEDISH_CI = 232;
Charsets.UTF8MB4_TURKISH_CI = 233;
Charsets.UTF8MB4_CZECH_CI = 234;
Charsets.UTF8MB4_DANISH_CI = 235;
Charsets.UTF8MB4_LITHUANIAN_CI = 236;
Charsets.UTF8MB4_SLOVAK_CI = 237;
Charsets.UTF8MB4_SPANISH2_CI = 238;
Charsets.UTF8MB4_ROMAN_CI = 239;
Charsets.UTF8MB4_PERSIAN_CI = 240;
Charsets.UTF8MB4_ESPERANTO_CI = 241;
Charsets.UTF8MB4_HUNGARIAN_CI = 242;
Charsets.UTF8MB4_SINHALA_CI = 243;
Charsets.UTF8MB4_GERMAN2_CI = 244;
Charsets.UTF8MB4_CROATIAN_CI = 245;
Charsets.UTF8MB4_UNICODE_520_CI = 246;
Charsets.UTF8MB4_VIETNAMESE_CI = 247;
Charsets.GB18030_CHINESE_CI = 248;
Charsets.GB18030_BIN = 249;
Charsets.GB18030_UNICODE_520_CI = 250;
Charsets.UTF8_GENERAL50_CI = 253; // deprecated
Charsets.UTF8MB4_0900_AI_CI = 255;
Charsets.UTF8MB4_DE_PB_0900_AI_CI = 256;
Charsets.UTF8MB4_IS_0900_AI_CI = 257;
Charsets.UTF8MB4_LV_0900_AI_CI = 258;
Charsets.UTF8MB4_RO_0900_AI_CI = 259;
Charsets.UTF8MB4_SL_0900_AI_CI = 260;
Charsets.UTF8MB4_PL_0900_AI_CI = 261;
Charsets.UTF8MB4_ET_0900_AI_CI = 262;
Charsets.UTF8MB4_ES_0900_AI_CI = 263;
Charsets.UTF8MB4_SV_0900_AI_CI = 264;
Charsets.UTF8MB4_TR_0900_AI_CI = 265;
Charsets.UTF8MB4_CS_0900_AI_CI = 266;
Charsets.UTF8MB4_DA_0900_AI_CI = 267;
Charsets.UTF8MB4_LT_0900_AI_CI = 268;
Charsets.UTF8MB4_SK_0900_AI_CI = 269;
Charsets.UTF8MB4_ES_TRAD_0900_AI_CI = 270;
Charsets.UTF8MB4_LA_0900_AI_CI = 271;
Charsets.UTF8MB4_EO_0900_AI_CI = 273;
Charsets.UTF8MB4_HU_0900_AI_CI = 274;
Charsets.UTF8MB4_HR_0900_AI_CI = 275;
Charsets.UTF8MB4_VI_0900_AI_CI = 277;
Charsets.UTF8MB4_0900_AS_CS = 278;
Charsets.UTF8MB4_DE_PB_0900_AS_CS = 279;
Charsets.UTF8MB4_IS_0900_AS_CS = 280;
Charsets.UTF8MB4_LV_0900_AS_CS = 281;
Charsets.UTF8MB4_RO_0900_AS_CS = 282;
Charsets.UTF8MB4_SL_0900_AS_CS = 283;
Charsets.UTF8MB4_PL_0900_AS_CS = 284;
Charsets.UTF8MB4_ET_0900_AS_CS = 285;
Charsets.UTF8MB4_ES_0900_AS_CS = 286;
Charsets.UTF8MB4_SV_0900_AS_CS = 287;
Charsets.UTF8MB4_TR_0900_AS_CS = 288;
Charsets.UTF8MB4_CS_0900_AS_CS = 289;
Charsets.UTF8MB4_DA_0900_AS_CS = 290;
Charsets.UTF8MB4_LT_0900_AS_CS = 291;
Charsets.UTF8MB4_SK_0900_AS_CS = 292;
Charsets.UTF8MB4_ES_TRAD_0900_AS_CS = 293;
Charsets.UTF8MB4_LA_0900_AS_CS = 294;
Charsets.UTF8MB4_EO_0900_AS_CS = 296;
Charsets.UTF8MB4_HU_0900_AS_CS = 297;
Charsets.UTF8MB4_HR_0900_AS_CS = 298;
Charsets.UTF8MB4_VI_0900_AS_CS = 300;
Charsets.UTF8MB4_JA_0900_AS_CS = 303;
Charsets.UTF8MB4_JA_0900_AS_CS_KS = 304;
Charsets.UTF8MB4_0900_AS_CI = 305;
Charsets.UTF8MB4_RU_0900_AI_CI = 306;
Charsets.UTF8MB4_RU_0900_AS_CS = 307;
Charsets.UTF8MB4_ZH_0900_AS_CS = 308;
Charsets.UTF8MB4_0900_BIN = 309;

// short aliases
Charsets.BIG5 = Charsets.BIG5_CHINESE_CI;
Charsets.DEC8 = Charsets.DEC8_SWEDISH_CI;
Charsets.CP850 = Charsets.CP850_GENERAL_CI;
Charsets.HP8 = Charsets.HP8_ENGLISH_CI;
Charsets.KOI8R = Charsets.KOI8R_GENERAL_CI;
Charsets.LATIN1 = Charsets.LATIN1_SWEDISH_CI;
Charsets.LATIN2 = Charsets.LATIN2_GENERAL_CI;
Charsets.SWE7 = Charsets.SWE7_SWEDISH_CI;
Charsets.ASCII = Charsets.ASCII_GENERAL_CI;
Charsets.UJIS = Charsets.UJIS_JAPANESE_CI;
Charsets.SJIS = Charsets.SJIS_JAPANESE_CI;
Charsets.HEBREW = Charsets.HEBREW_GENERAL_CI;
Charsets.TIS620 = Charsets.TIS620_THAI_CI;
Charsets.EUCKR = Charsets.EUCKR_KOREAN_CI;
Charsets.KOI8U = Charsets.KOI8U_GENERAL_CI;
Charsets.GB2312 = Charsets.GB2312_CHINESE_CI;
Charsets.GREEK = Charsets.GREEK_GENERAL_CI;
Charsets.CP1250 = Charsets.CP1250_GENERAL_CI;
Charsets.GBK = Charsets.GBK_CHINESE_CI;
Charsets.LATIN5 = Charsets.LATIN5_TURKISH_CI;
Charsets.ARMSCII8 = Charsets.ARMSCII8_GENERAL_CI;
Charsets.UTF8 = Charsets.UTF8_GENERAL_CI;
Charsets.UCS2 = Charsets.UCS2_GENERAL_CI;
Charsets.CP866 = Charsets.CP866_GENERAL_CI;
Charsets.KEYBCS2 = Charsets.KEYBCS2_GENERAL_CI;
Charsets.MACCE = Charsets.MACCE_GENERAL_CI;
Charsets.MACROMAN = Charsets.MACROMAN_GENERAL_CI;
Charsets.CP852 = Charsets.CP852_GENERAL_CI;
Charsets.LATIN7 = Charsets.LATIN7_GENERAL_CI;
Charsets.UTF8MB4 = Charsets.UTF8MB4_GENERAL_CI;
Charsets.CP1251 = Charsets.CP1251_GENERAL_CI;
Charsets.UTF16 = Charsets.UTF16_GENERAL_CI;
Charsets.UTF16LE = Charsets.UTF16LE_GENERAL_CI;
Charsets.CP1256 = Charsets.CP1256_GENERAL_CI;
Charsets.CP1257 = Charsets.CP1257_GENERAL_CI;
Charsets.UTF32 = Charsets.UTF32_GENERAL_CI;
Charsets.CP932 = Charsets.CP932_JAPANESE_CI;
Charsets.EUCJPMS = Charsets.EUCJPMS_JAPANESE_CI;
Charsets.GB18030 = Charsets.GB18030_CHINESE_CI;
Charsets.GEOSTD8 = Charsets.GEOSTD8_GENERAL_CI;

/* node_modules/mysql2/lib/constants/client.js */
const ClientConstants = {};
ClientConstants.LONG_PASSWORD = 0x00000001; /* new more secure passwords */
ClientConstants.FOUND_ROWS = 0x00000002; /* found instead of affected rows */
ClientConstants.LONG_FLAG = 0x00000004; /* get all column flags */
ClientConstants.CONNECT_WITH_DB = 0x00000008; /* one can specify db on connect */
ClientConstants.NO_SCHEMA = 0x00000010; /* don't allow database.table.column */
ClientConstants.COMPRESS = 0x00000020; /* can use compression protocol */
ClientConstants.ODBC = 0x00000040; /* odbc client */
ClientConstants.LOCAL_FILES = 0x00000080; /* can use LOAD DATA LOCAL */
ClientConstants.IGNORE_SPACE = 0x00000100; /* ignore spaces before '' */
ClientConstants.PROTOCOL_41 = 0x00000200; /* new 4.1 protocol */
ClientConstants.INTERACTIVE = 0x00000400; /* this is an interactive client */
ClientConstants.SSL = 0x00000800; /* switch to ssl after handshake */
ClientConstants.IGNORE_SIGPIPE = 0x00001000; /* IGNORE sigpipes */
ClientConstants.TRANSACTIONS = 0x00002000; /* client knows about transactions */
ClientConstants.RESERVED = 0x00004000; /* old flag for 4.1 protocol  */
ClientConstants.SECURE_CONNECTION = 0x00008000; /* new 4.1 authentication */
ClientConstants.MULTI_STATEMENTS = 0x00010000; /* enable/disable multi-stmt support */
ClientConstants.MULTI_RESULTS = 0x00020000; /* enable/disable multi-results */
ClientConstants.PS_MULTI_RESULTS = 0x00040000; /* multi-results in ps-protocol */
ClientConstants.PLUGIN_AUTH = 0x00080000; /* client supports plugin authentication */
ClientConstants.CONNECT_ATTRS = 0x00100000; /* permits connection attributes */
ClientConstants.PLUGIN_AUTH_LENENC_CLIENT_DATA = 0x00200000; /* Understands length-encoded integer for auth response data in Protocol::HandshakeResponse41. */
ClientConstants.CAN_HANDLE_EXPIRED_PASSWORDS = 0x00400000; /* Announces support for expired password extension. */
ClientConstants.SESSION_TRACK = 0x00800000; /* Can set SERVER_SESSION_STATE_CHANGED in the Status Flags and send session-state change data after a OK packet. */
ClientConstants.DEPRECATE_EOF = 0x01000000; /* Can send OK after a Text Resultset. */
ClientConstants
ClientConstants.SSL_VERIFY_SERVER_CERT = 0x40000000;
ClientConstants.REMEMBER_OPTIONS = 0x80000000;
ClientConstants
ClientConstants.MULTI_FACTOR_AUTHENTICATION = 0x10000000; /* multi-factor authentication */

version = "3.9.6";

/* node_modules/mysql2/lib/connection_config.js */
const validOptions = {
  authPlugins: 1,
  authSwitchHandler: 1,
  bigNumberStrings: 1,
  charset: 1,
  charsetNumber: 1,
  compress: 1,
  connectAttributes: 1,
  connectTimeout: 1,
  database: 1,
  dateStrings: 1,
  debug: 1,
  decimalNumbers: 1,
  enableKeepAlive: 1,
  flags: 1,
  host: 1,
  insecureAuth: 1,
  infileStreamFactory: 1,
  isServer: 1,
  keepAliveInitialDelay: 1,
  localAddress: 1,
  maxPreparedStatements: 1,
  multipleStatements: 1,
  namedPlaceholders: 1,
  nestTables: 1,
  password: 1,
  // with multi-factor authentication, the main password (used for the first
  // authentication factor) can be provided via password1
  password1: 1,
  password2: 1,
  password3: 1,
  passwordSha1: 1,
  pool: 1,
  port: 1,
  queryFormat: 1,
  rowsAsArray: 1,
  socketPath: 1,
  ssl: 1,
  stream: 1,
  stringifyObjects: 1,
  supportBigNumbers: 1,
  timezone: 1,
  trace: 1,
  typeCast: 1,
  uri: 1,
  user: 1,
  // These options are used for Pool
  connectionLimit: 1,
  maxIdle: 1,
  idleTimeout: 1,
  Promise: 1,
  queueLimit: 1,
  waitForConnections: 1
};

class ConnectionConfig {
  constructor(options) {
    if (typeof options === 'string') {
      options = ConnectionConfig.parseUrl(options);
    } else if (options && options.uri) {
      const uriOptions = ConnectionConfig.parseUrl(options.uri);
      for (const key in uriOptions) {
        if (!Object.prototype.hasOwnProperty.call(uriOptions, key)) continue;
        if (options[key]) continue;
        options[key] = uriOptions[key];
      }
    }
    for (const key in options) {
      if (!Object.prototype.hasOwnProperty.call(options, key)) continue;
      if (validOptions[key] !== 1) {
        // REVIEW: Should this be emitted somehow?
        // eslint-disable-next-line no-console
        console.error(
          `Ignoring invalid configuration option passed to Connection: ${key}. This is currently a warning, but in future versions of MySQL2, an error will be thrown if you pass an invalid configuration option to a Connection`
        );
      }
    }
    this.isServer = options.isServer;
    this.stream = options.stream;
    this.host = options.host || 'localhost';
    this.port = (typeof options.port === 'string' ? parseInt(options.port, 10) : options.port)|| 3306;
    this.localAddress = options.localAddress;
    this.socketPath = options.socketPath;
    this.user = options.user || undefined;
    // for the purpose of multi-factor authentication, or not, the main
    // password (used for the 1st authentication factor) can also be
    // provided via the "password1" option
    this.password = options.password || options.password1 || undefined;
    this.password2 = options.password2 || undefined;
    this.password3 = options.password3 || undefined;
    this.passwordSha1 = options.passwordSha1 || undefined;
    this.database = options.database;
    this.connectTimeout = isNaN(options.connectTimeout)
      ? 10 * 1000
      : options.connectTimeout;
    this.insecureAuth = options.insecureAuth || false;
    this.infileStreamFactory = options.infileStreamFactory || undefined;
    this.supportBigNumbers = options.supportBigNumbers || false;
    this.bigNumberStrings = options.bigNumberStrings || false;
    this.decimalNumbers = options.decimalNumbers || false;
    this.dateStrings = options.dateStrings || false;
    this.debug = options.debug;
    this.trace = options.trace !== false;
    this.stringifyObjects = options.stringifyObjects || false;
    this.enableKeepAlive = options.enableKeepAlive !== false;
    this.keepAliveInitialDelay = options.keepAliveInitialDelay || 0;
    if (
      options.timezone &&
      !/^(?:local|Z|[ +-]\d\d:\d\d)$/.test(options.timezone)
    ) {
      // strictly supports timezones specified by mysqljs/mysql:
      // https://github.com/mysqljs/mysql#user-content-connection-options
      // eslint-disable-next-line no-console
      console.error(
        `Ignoring invalid timezone passed to Connection: ${options.timezone}. This is currently a warning, but in future versions of MySQL2, an error will be thrown if you pass an invalid configuration option to a Connection`
      );
      // SqlStrings falls back to UTC on invalid timezone
      this.timezone = 'Z';
    } else {
      this.timezone = options.timezone || 'local';
    }
    this.queryFormat = options.queryFormat;
    this.pool = options.pool || undefined;
    this.ssl =
      typeof options.ssl === 'string'
        ? ConnectionConfig.getSSLProfile(options.ssl)
        : options.ssl || false;
    this.multipleStatements = options.multipleStatements || false;
    this.rowsAsArray = options.rowsAsArray || false;
    this.namedPlaceholders = options.namedPlaceholders || false;
    this.nestTables =
      options.nestTables === undefined ? undefined : options.nestTables;
    this.typeCast = options.typeCast === undefined ? true : options.typeCast;
    if (this.timezone[0] === ' ') {
      // "+" is a url encoded char for space so it
      // gets translated to space when giving a
      // connection string..
      this.timezone = `+${this.timezone.slice(1)}`;
    }
    if (this.ssl) {
      if (typeof this.ssl !== 'object') {
        throw new TypeError(
          `SSL profile must be an object, instead it's a ${typeof this.ssl}`
        );
      }
      // Default rejectUnauthorized to true
      this.ssl.rejectUnauthorized = this.ssl.rejectUnauthorized !== false;
    }
    this.maxPacketSize = 0;
    this.charsetNumber = options.charset
      ? ConnectionConfig.getCharsetNumber(options.charset)
      : options.charsetNumber || Charsets.UTF8MB4_UNICODE_CI;
    this.compress = options.compress || false;
    this.authPlugins = options.authPlugins;
    this.authSwitchHandler = options.authSwitchHandler;
    this.clientFlags = ConnectionConfig.mergeFlags(
      ConnectionConfig.getDefaultFlags(options),
      options.flags || ''
    );
    // Default connection attributes
    // https://dev.mysql.com/doc/refman/8.0/en/performance-schema-connection-attribute-tables.html
    const defaultConnectAttributes =  {
      _client_name: 'Node-MySQL-2',
      _client_version: version
    };
    this.connectAttributes = { ...defaultConnectAttributes, ...(options.connectAttributes || {})};
    this.maxPreparedStatements = options.maxPreparedStatements || 16000;
  }

  static mergeFlags(default_flags, user_flags) {
    let flags = 0x0,
      i;
    if (!Array.isArray(user_flags)) {
      user_flags = String(user_flags || '')
        .toUpperCase()
        .split(/\s*,+\s*/);
    }
    // add default flags unless "blacklisted"
    for (i in default_flags) {
      if (user_flags.indexOf(`-${default_flags[i]}`) >= 0) {
        continue;
      }
      flags |= ClientConstants[default_flags[i]] || 0x0;
    }
    // add user flags unless already already added
    for (i in user_flags) {
      if (user_flags[i][0] === '-') {
        continue;
      }
      if (default_flags.indexOf(user_flags[i]) >= 0) {
        continue;
      }
      flags |= ClientConstants[user_flags[i]] || 0x0;
    }
    return flags;
  }

  static getDefaultFlags(options) {
    const defaultFlags = [
      'LONG_PASSWORD',
      'FOUND_ROWS',
      'LONG_FLAG',
      'CONNECT_WITH_DB',
      'ODBC',
      'LOCAL_FILES',
      'IGNORE_SPACE',
      'PROTOCOL_41',
      'IGNORE_SIGPIPE',
      'TRANSACTIONS',
      'RESERVED',
      'SECURE_CONNECTION',
      'MULTI_RESULTS',
      'TRANSACTIONS',
      'SESSION_TRACK',
      'CONNECT_ATTRS'
    ];
    if (options && options.multipleStatements) {
      defaultFlags.push('MULTI_STATEMENTS');
    }
    defaultFlags.push('PLUGIN_AUTH');
    defaultFlags.push('PLUGIN_AUTH_LENENC_CLIENT_DATA');

    return defaultFlags;
  }

  static getCharsetNumber(charset) {
    const num = Charsets[charset.toUpperCase()];
    if (num === undefined) {
      throw new TypeError(`Unknown charset '${charset}'`);
    }
    return num;
  }

  static getSSLProfile(name) {
    if (!SSLProfiles) {
      SSLProfiles = require('./constants/ssl_profiles.js');
    }
    const ssl = SSLProfiles[name];
    if (ssl === undefined) {
      throw new TypeError(`Unknown SSL profile '${name}'`);
    }
    return ssl;
  }

  static parseUrl(url) {
    const parsedUrl = new URL(url);
    const options = {
      host: decodeURIComponent(parsedUrl.hostname),
      port: parseInt(parsedUrl.port, 10),
      database: decodeURIComponent(parsedUrl.pathname.slice(1)),
      user: decodeURIComponent(parsedUrl.username),
      password: decodeURIComponent(parsedUrl.password),
    };
    parsedUrl.searchParams.forEach((value, key) => {
      try {
        // Try to parse this as a JSON expression first
        options[key] = JSON.parse(value);
      } catch (err) {
        // Otherwise assume it is a plain string
        options[key] = value;
      }
    });
    return options;
  }
}

/* node_modules/mysql2/index.js */
exports.createConnection = function(opts) {
  return new Connection({ config: new ConnectionConfig(opts) });
};
