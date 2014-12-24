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
    exports.NodeExecutor = require( './node_executor' );
}
