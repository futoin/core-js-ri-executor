"use strict";

var isNode = ( typeof window === 'undefined' ) && require( 'detect-node' );

/**
 * @module futoin-executor
 */

exports.ChannelContext = require( '../ChannelContext' );
exports.DerivedKey = require( '../DerivedKey' );
exports.RequestInfo = require( '../RequestInfo' );
exports.SourceAddress = require( '../SourceAddress' );
exports.UserInfo = require( '../UserInfo' );

var Executor = require( '../Executor' );

exports.Executor = Executor;
exports.ClientExecutor = Executor;

if ( isNode )
{
    exports.NodeExecutor = module.require( '../NodeExecutor' );
}
else
{
    exports.BrowserExecutor = require( '../BrowserExecutor' );
}
