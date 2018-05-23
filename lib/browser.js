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

( function( window ) {
    'use strict';

    var futoin = window.FutoIn || window.futoin || {};

    if ( typeof futoin.Executor === 'undefined' )
    {
        var executor_module = require( './main' );

        /**
         * **window.FutoInExecutor** - Browser-only reference to futoin-executor
         * @global
         * @alias window.FutoInExecutor
         */
        window.FutoInExecutor = executor_module;

        /**
         * **window.futoin.Executor** - Browser-only reference to futoin-executor
         * @global
         * @alias window.FutoIn.Executor
         */
        futoin.Executor = executor_module;
        window.FutoIn = futoin;
        window.futoin = futoin;

        /**
         * **window.BrowserExecutor** - Browser-only reference to
         * futoin-executor.BrowserExecutor
         * @global
         * @alias window.BrowserExecutor
         */
        window.BrowserExecutor = executor_module.BrowserExecutor;
    }

    if ( typeof module !== 'undefined' ) {
        module.exports = futoin.Executor;
    }
} )( window );
