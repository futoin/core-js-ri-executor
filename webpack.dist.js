'use strict';

const UglifyJsPlugin = require( 'uglifyjs-webpack-plugin' );
const package_json = require( './package' );

module.exports = {
    entry: {
        'futoin-executor': `./${package_json.browser}`,
    },
    output: {
        library: {
            root: "FutoInExecutor",
            amd: "futoin-executor",
            commonjs: "futoin-executor",
        },
        libraryTarget: "umd",
        filename: "[name].js",
        path: __dirname + '/dist',
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
    },
    node : false,
    plugins: [
        new UglifyJsPlugin( {
            sourceMap: true,
        } ),
    ],
};
