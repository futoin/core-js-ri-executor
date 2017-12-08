'use strict';

const UglifyJsPlugin = require( 'uglifyjs-webpack-plugin' );

module.exports = {
    entry: {
        'futoin-executor': './lib/browser.js',
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
            {
                test: /node_modules\/futoin-.*\.js$/,
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
    plugins: [
        new UglifyJsPlugin( {
            sourceMap: true,
        } ),
    ],
};
