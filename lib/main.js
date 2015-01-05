"use strict";

var isNode = require( 'detect-node' );
var _ = require( 'lodash' );

/**
 * @module futoin-executor
 */

exports.Executor = require( './executor' ).Executor;

var request = require( './request' );
_.extend( exports, request );

if ( isNode )
{
    var hidreq = require;
    exports.NodeExecutor = hidreq( './node_executor' );
}
else
{
    exports.BrowserExecutor = require( './browser_executor' );
}
