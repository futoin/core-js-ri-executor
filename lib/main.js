"use strict";

/**
 * @file
 *
 * Copyright 2014-2017 FutoIn Project (https://futoin.org)
 * Copyright 2014-2017 Andrey Galkin <andrey@futoin.org>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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

if ( isNode ) {
    exports.NodeExecutor = module.require( '../NodeExecutor' );
} else {
    exports.BrowserExecutor = require( '../BrowserExecutor' );
}
