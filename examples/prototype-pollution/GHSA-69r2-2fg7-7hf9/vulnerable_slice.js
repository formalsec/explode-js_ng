/* badger-utils/assert.ts */
function isBoolean(value) {
  return typeof value === 'boolean'
}

function isArray(value) {
  return Array.isArray(value)
}

function isNull(value) {
  return value === null
}

function isObject(value) {
  return typeof value === 'object'
    && !isArray(value)
    && !isNull(value)
}


/* badger-database-js/Debug.ts */
const invalidDebugItem = item => {
  throw Error(`Invalid debug item "${item}" specified`)
}

let debug = {
  database: {
    debug: false,
    prefix: 'Database',
    color: 'bright magenta',
  },
  engine: {
    debug: false,
    prefix: 'Engine',
    color: 'red',
  },
  query: {
    debug: false,
    prefix: 'Query',
    color: 'cyan',
  },
  tables: {
    debug: false,
    prefix: 'Tables',
    color: 'blue',
  },
  table: {
    debug: false,
    prefix: 'Table',
    color: 'bright cyan',
  },
  record: {
    debug: false,
    prefix: 'Record',
    color: 'green',
  },
  builder: {
    debug: false,
    prefix: 'Builder',
    color: 'yellow',
  },
  transaction: {
    debug: false,
    prefix: 'Transaction',
    color: 'bright red'
  },
  test: {
    debug: false,
    prefix: 'Test',
    color: 'green'
  },
};

const setDebug = (options) => {
  Object.entries(options).map(
    ([key, value]) => {
      const set = debug[key] || invalidDebugItem(key);
      if (isBoolean(value)) {
        set.debug = value;
      }
      else if (isObject(value)) {
        Object.assign(set, value);
      }
    }
  )
};

module.exports.debug = debug;

module.exports.setDebug = setDebug;
