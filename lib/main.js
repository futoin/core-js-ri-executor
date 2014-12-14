"use strict";

var isNode = require( 'detect-node' );
var _ = require( 'lodash' );

/**
 * @module futoin-executor
 */

exports.Executor = require( './executor' );

var requestinfo = require( './request' );
_.extend( exports, requestinfo );

if ( isNode )
{
    exports.NodeExecutor = require( './node_executor' );
}
