var extend = require('util')._extend;
var path = require('path');
var semver = require('semver');
var webpack = require('webpack');

var pkg = require('./package.json');
var defaults = require('./defaults');

var semVer = semver.parse(pkg.version);

// Get the minimum minor version to put into the CDN URL
semVer.patch = 0;
semVer.prerelease = [];
pkg.pinnedVersion = semVer.major + '.' + semVer.minor;

var outputPath = './dist/';

var jsonDefines = {
  __USE_JSON__: true
};

var noJsonDefines = {
  __USE_JSON__: false
};

var defaultsPlugin = new webpack.DefinePlugin(defaults);
var uglifyPlugin = new webpack.optimize.UglifyJsPlugin({
  // We've had some reports of the sourceMappingURL comment causing problems in Firefox.
  // The uglifyjs plugin doesn't provide a way to generate the source map without generating
  // that comment, so until we can resolve that, let's just not generate the source map.
  sourceMap: false,
  minimize: true
});
var useJsonPlugin = new webpack.DefinePlugin(jsonDefines);
var notUseJsonPlugin = new webpack.DefinePlugin(noJsonDefines);

var snippetConfig = {
  name: 'snippet',
  entry: {
    'rollbar.snippet': './src/bundles/rollbar.snippet.js'
  },
  output: {
    path: outputPath,
    filename: '[name].js'
  },
  plugins: [defaultsPlugin, uglifyPlugin],
  failOnError: true,
  module: {
    preLoaders: [
      {
        test: /\.js$/,
        loader: "strict!eslint",
        exclude: [/node_modules/, /vendor/]
      }
    ],
  }
};

var pluginConfig = {
  name: 'plugins',
  entry: {
    'jquery': './src/plugins/jquery.js'
  },
  output: {
    path: outputPath + '/plugins/',
    filename: '[name].min.js'
  },
  plugins: [defaultsPlugin, uglifyPlugin],
  failOnError: true,
  module: {
    preLoaders: [
      {
        test: /\.js$/,
        loader: "strict!eslint",
        exclude: [/node_modules/, /vendor/]
      }
    ],
  }
};

var testsConfig = {
  name: 'tests',
  entry: {
    browserify: './test/browserify.test.js',
    error_parser: './test/error_parser.test.js',
    json: './test/json.test.js',
    mootools: './test/mootools.test.js',
    notifier: './test/notifier.test.js',
    'notifier-ratelimit': './test/notifier.ratelimit.test.js',
    rollbar: './test/rollbar.test.js',
    shim: './test/shim.test.js',
    shimalias: './test/shimalias.test.js',
    util: './test/util.test.js',
    xhr: './test/xhr.test.js',
  },
  plugins: [defaultsPlugin],
  output: {
    path: 'test/',
    filename: '[name].bundle.js',
  },
  module: {
    preLoaders: [
      {
        test: /\.js$/,
        loader: "strict!eslint",
        exclude: [/node_modules/, /vendor/, /lib/, /dist/]
      }
    ],
  }
};

var vanillaConfigBase = {
  eslint: {
    configFile: path.resolve(__dirname, ".eslintrc")
  },
  entry: {
    'rollbar': './src/bundles/rollbar.js'
  },
  output: {
    path: outputPath
  },
  plugins: [defaultsPlugin, uglifyPlugin],
  failOnError: true,
  devtool: 'hidden-source-map',
  module: {
    preLoaders: [
      {
        test: /\.js$/,
        loader: "strict!eslint",
        exclude: [/node_modules/, /vendor/]
      }
    ],
  }
};

var UMDConfigBase = {
  eslint: {
    configFile: path.resolve(__dirname, ".eslintrc")
  },
  entry: {
    'rollbar.umd': ['./src/bundles/rollbar.js']
  },
  output: {
    path: outputPath,
    libraryTarget: 'umd'
  },
  failOnError: true,
  devtool: 'hidden-source-map',
  module: {
    preLoaders: [
      {
        test: /\.js$/,
        loader: "strict!eslint",
        exclude: [/node_modules/, /vendor/]
      }
    ],
  }
};

var config = [snippetConfig, pluginConfig];

function addVanillaToConfig(webpackConfig, filename, extraPlugins) {
  var basePlugins = [defaultsPlugin];
  var vanillaConfig = extend({}, vanillaConfigBase);
  vanillaConfig.name = filename;

  plugins = basePlugins.concat(extraPlugins);
  vanillaConfig.plugins = plugins;

  vanillaConfig.output = extend({filename: filename}, vanillaConfig.output);

  webpackConfig.push(vanillaConfig);
}

function addUMDToConfig(webpackConfig, filename, extraPlugins) {
  var basePlugins = [defaultsPlugin];
  var UMDConfig = extend({}, UMDConfigBase);

  plugins = basePlugins.concat(extraPlugins);
  UMDConfig.plugins = plugins;

  UMDConfig.output = extend({filename: filename}, UMDConfig.output);

  webpackConfig.push(UMDConfig);
}

function generateBuildConfig(name, plugins) {
  addVanillaToConfig(config, name, plugins);
  addUMDToConfig(config, name, plugins);
}

generateBuildConfig('[name].js', [useJsonPlugin]);
generateBuildConfig('[name].min.js', [useJsonPlugin, uglifyPlugin]);
generateBuildConfig('[name].nojson.js', [notUseJsonPlugin]);
generateBuildConfig('[name].nojson.min.js', [notUseJsonPlugin, uglifyPlugin]);

module.exports = config;

