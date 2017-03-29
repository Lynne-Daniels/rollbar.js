var _ = require('../utility');
var errorParser = require('./errorParser');

function handleItemWithError(item, options, callback) {
  item.data = item.data || {};
  if (item.err) {
    try {
      item.data.stackInfo = item.err._savedStackTrace || errorParser.parse(item.err);
    } catch (e)
    /* istanbul ignore next */
    {
      _.consoleError('[Rollbar]: Error while parsing the error object.', e);
      item.message = item.err.message || item.err.description || item.message || String(item.err);
      delete item.err;
    }
  }
  callback(null, item);
}

function ensureItemHasSomethingToSay(item, options, callback) {
  if (!item.message && !(item.data && item.data.stackInfo) && !item.custom) {
    callback(new Error('No message, stack info, or custom data'), null);
  }
  callback(null, item);
}

function addBaseInfo(item, options, callback) {
  var environment = options.environment || (options.payload && options.payload.environment);
  item.data = _.extend(true, {}, item.data, {
    environment: environment,
    endpoint: options.endpoint,
    platform: 'browser',
    framework: 'browser-js',
    language: 'javascript',
    server: {},
    notifier: {
      name: 'rollbar-browser-js',
      version: options.version
    }
  });
  callback(null, item);
}

function addRequestInfo(window) {
  return function(item, options, callback) {
    if (!window || !window.location) {
      return callback(null, item);
    }
    item.data = item.data || {};
    item.data.request = {
      url: window.location.href,
      query_string: window.location.search,
      user_ip: '$remote_ip'
    };
    callback(null, item);
  };
}

function addClientInfo(window) {
  return function(item, options, callback) {
    if (!window) {
      return callback(null, item);
    }
    item.data = item.data || {};
    item.data.client = {
      runtime_ms: item.timestamp - window._rollbarStartTime, // TODO
      timestamp: Math.round(item.timestamp / 1000),
      javascript: {
        browser: window.navigator.userAgent,
        language: window.navigator.language,
        cookie_enabled: window.navigator.cookieEnabled,
        screen: {
          width: window.screen.width,
          height: window.screen.height
        },
      }
    }
    callback(null, item);
  };
}

function addPluginInfo(window) {
  return function(item, options, callback) {
    if (!window || !window.navigator) {
      return callback(null, item);
    }
    var plugins = [];
    var navPlugins = window.navigator.plugins || [];
    var cur;
    for (var i=0, l=navPlugins.length; i < l; ++i) {
      cur = navPlugins[i];
      plugins.push({name: cur.name, description: cur.description});
    }
    item.data = item.data || {};
    item.data.client = item.data.client || {};
    item.data.client.javascript = item.data.client.javascript || {};
    item.data.client.javascript.plugins = plugins;
    callback(null, item);
  };
}

function addBody(item, options, callback) {
  if (item.data && item.data.stackInfo) {
    addBodyTrace(item, options, callback);
  } else {
    addBodyMessage(item, options, callback);
  }
}

function addBodyMessage(item, options, callback) {
  var message = item.message;
  var custom = item.custom;

  if (!message) {
    if (custom) {
      message = _.stringify(custom);
    } else {
      message = '';
    }
  }
  var result = {
    body: message
  };

  if (custom) {
    result.extra = _.extend(true, {}, custom);
  }

  item.data = item.data || {};
  item.data.body = {message: result};
  callback(null, item);
}


function addBodyTrace(item, options, callback) {
  var description = item.data.description;
  var stackInfo = item.data.stackInfo;
  var custom = item.custom;

  var guess = errorParser.guessErrorClass(stackInfo.message);
  var className = stackInfo.name || guess[0];
  var message = guess[1];
  var trace = {
    exception: {
      'class': className,
      message: message
    }
  };

  if (description) {
    trace.exception.description = description || 'uncaught exception';
  }

  // Transform a TraceKit stackInfo object into a Rollbar trace
  if (stackInfo.stack) {
    var stackFrame;
    var frame;
    var code;
    var pre;
    var post;
    var contextLength;
    var i, mid;

    trace.frames = [];
    for (i = 0; i < stackInfo.stack.length; ++i) {
      stackFrame = stackInfo.stack[i];
      frame = {
        filename: stackFrame.url ? _.sanitizeUrl(stackFrame.url) : '(unknown)',
        lineno: stackFrame.line || null,
        method: (!stackFrame.func || stackFrame.func === '?') ? '[anonymous]' : stackFrame.func,
        colno: stackFrame.column
      };

      code = pre = post = null;
      contextLength = stackFrame.context ? stackFrame.context.length : 0;
      if (contextLength) {
        mid = Math.floor(contextLength / 2);
        pre = stackFrame.context.slice(0, mid);
        code = stackFrame.context[mid];
        post = stackFrame.context.slice(mid);
      }

      if (code) {
        frame.code = code;
      }

      if (pre || post) {
        frame.context = {};
        if (pre && pre.length) {
          frame.context.pre = pre;
        }
        if (post && post.length) {
          frame.context.post = post;
        }
      }

      if (stackFrame.args) {
        frame.args = stackFrame.args;
      }

      trace.frames.push(frame);
    }

    // NOTE(cory): reverse the frames since rollbar.com expects the most recent call last
    trace.frames.reverse();

    if (custom) {
      trace.extra = _.extend(true, {}, custom);
    }
    item.data.body = {trace: trace};
    callback(null, item);
  } else {
    item.message = className + ': ' + message;
    addBodyMessage(item, options, callback);
  }
}

function scrubPayload(item, options, callback) {
  scrub(item.data, options);
  callback(null, item);
}

function userTransform(item, options, callback) {
  var newItem = _.extend(true, {}, item);
  try {
    if (_.isFunction(options.transform)) {
      options.transform(newItem.data);
    }
  } catch (e) {
    options.transform = null; // TODO
    _.consoleError('[Rollbar]: Error while calling custom transform() function. Removing custom transform().', e);
    callback(null, item);
    return;
  }
  callback(null, newItem);
}

function itemToPayload(item, options, callback) {
  var payloadOptions = options.payload || {};
  if (payloadOptions.body) {
    delete payloadOptions.body;
  }

  var data = _.extend(true, {}, item.data, payloadOptions);
  callback(null, data);
}

/** Helpers **/

function scrub(data, options) {
  var scrubFields = options.scrubFields;
  var paramRes = getScrubFieldRegexs(scrubFields);
  var queryRes = getScrubQueryParamRegexs(scrubFields);

  function redactQueryParam(dummy0, paramPart, dummy1, dummy2, dummy3, valPart) {
    return paramPart + _.redact(valPart);
  }

  function paramScrubber(v) {
    var i;
    if (_.isType(v, 'string')) {
      for (i = 0; i < queryRes.length; ++i) {
        v = v.replace(queryRes[i], redactQueryParam);
      }
    }
    return v;
  }

  function valScrubber(k, v) {
    var i;
    for (i = 0; i < paramRes.length; ++i) {
      if (paramRes[i].test(k)) {
        v = _.redact(v);
        break;
      }
    }
    return v;
  }

  function scrubber(k, v) {
    var tmpV = valScrubber(k, v);
    if (tmpV === v) {
      if (_.isType(v, 'object') || _.isType(v, 'array')) {
        return _.traverse(v, scrubber);
      }
      return paramScrubber(tmpV);
    } else {
      return tmpV;
    }
  }

  _.traverse(data, scrubber);
  return data;
}

function getScrubFieldRegexs(scrubFields) {
  var ret = [];
  var pat;
  for (var i = 0; i < scrubFields.length; ++i) {
    pat = '\\[?(%5[bB])?' + scrubFields[i] + '\\[?(%5[bB])?\\]?(%5[dD])?';
    ret.push(new RegExp(pat, 'i'));
  }
  return ret;
}


function getScrubQueryParamRegexs(scrubFields) {
  var ret = [];
  var pat;
  for (var i = 0; i < scrubFields.length; ++i) {
    pat = '\\[?(%5[bB])?' + scrubFields[i] + '\\[?(%5[bB])?\\]?(%5[dD])?';
    ret.push(new RegExp('(' + pat + '=)([^&\\n]+)', 'igm'));
  }
  return ret;
}

module.exports = {
  handleItemWithError: handleItemWithError,
  ensureItemHasSomethingToSay: ensureItemHasSomethingToSay,
  addBaseInfo: addBaseInfo,
  addRequestInfo: addRequestInfo,
  addClientInfo: addClientInfo,
  addPluginInfo: addPluginInfo,
  addBody: addBody,
  scrubPayload: scrubPayload,
  userTransform: userTransform,
  itemToPayload: itemToPayload
};