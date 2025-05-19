
(() => {
  const beforeKeys = Reflect.ownKeys(Object.prototype);
  const beforeValues = {};
  for (const key of beforeKeys) {
    try {
      beforeValues[String(key)] = Object.prototype[key];
    } catch {}
  }

  try {
    {{EXPLOIT_CODE}}
  } catch (e) {
    return { type: 'error', errorType: 'runtime', message: e.message };
  }

 //console.log("typeof Object.prototype.toString:", typeof Object.prototype.toString);

  const afterKeys = Reflect.ownKeys(Object.prototype);
  const polluted = [];
  const modified = [];

  for (const key of afterKeys) {
    const k = String(key);
    if (!(k in beforeValues)) {
      polluted.push(k);
    } else {
      const afterVal = Object.prototype[k];
      const beforeVal = beforeValues[k];
      if (
        typeof afterVal !== 'object' &&
        typeof afterVal !== 'function' &&
        afterVal !== beforeVal
      ) {
        modified.push(k);
      }
    }
  }

  if (polluted.length > 0 || modified.length > 0) {
    return {
      type: 'polluted',
      keys: polluted,
      modified: modified
    };
  }

  return { type: 'clean' };
})()

