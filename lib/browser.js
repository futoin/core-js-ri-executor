
( function( window ) {
    'use strict';

    var futoin = window.FutoIn || {};

    if ( typeof futoin.Executor === 'undefined' )
    {
        var executor_module = require( './main.js' );

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

        /**
         * **window.BrowserExecutor** - Browser-only reference to
         * futoin-executor.BrowserExecutor
         * @global
         * @alias window.BrowserExecutor
         */
        window.BrowserExecutor = executor_module.BrowserExecutor;

        if ( typeof module !== 'undefined' )
        {
            module.exports = executor_module;
        }
    } else if ( typeof module !== 'undefined' ) {
        module.exports = futoin.Executor;
    }
} )( window );
