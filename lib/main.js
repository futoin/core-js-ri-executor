"use strict";

var isNode = require( 'detect-node' );
var _extend = require( 'lodash/object/extend' );

/**
 * @module futoin-executor
 */

var request = require( './request' );
_extend( exports, request );

var Executor = require( './executor' ).Executor;
exports.Executor = Executor;
exports.ClientExecutor = Executor;

if ( isNode )
{
    var hidreq = require;
    exports.NodeExecutor = hidreq( './node_executor' );
}
else
{
    exports.BrowserExecutor = require( './browser_executor' );
}
