'use strict';

module.exports = {
    entry: {
        unittest : './test/unittest.js',
        integration_test : './test/integration.js',
        integration_iface : './test/integration_iface.js',
        iframe : './test/iframe.js',
    },
    output: {
        filename: "[name].js",
        path: __dirname + '/dist',
        libraryTarget: "umd",
    },
    externals : {
        'futoin-asyncsteps' : {
            root: "$as",
            amd: "futoin-asyncsteps",
            commonjs: "futoin-asyncsteps",
            commonjs2: "futoin-asyncsteps",
        },
        'futoin-invoker' : {
            root: "FutoInInvoker",
            amd: "futoin-invoker",
            commonjs: "futoin-invoker",
            commonjs2: "futoin-invoker",
        },
        'futoin-executor' : {
            root: "FutoInExecutor",
            amd: "futoin-executor",
            commonjs: "futoin-executor",
            commonjs2: "futoin-executor",
        },
        chai : {
            root: "chai",
            amd: "chai",
            commonjs: "chai",
            commonjs2: "chai",
        },
        mocha : {
            root: "mocha",
            amd: "mocha",
            commonjs: "mocha",
            commonjs2: "mocha",
        },
    },
    node : false,
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /(node_modules|bower_components)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [ 'babel-preset-env' ],
                        plugins: [ "transform-object-assign" ],
                    },
                },
            },
        ],
    },
};
