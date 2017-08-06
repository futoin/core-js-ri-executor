'use strict';

module.exports = {
    entry: {
        'futoin-executor': './lib/browser.js',
        unittest : './test/unittest.js',
        integration_test : './test/integration.js',
        iframe : './test/iframe.js',
    },
    output: {
        filename: "[name].js",
        path: __dirname + '/dist',
    },
    node : false,
};
