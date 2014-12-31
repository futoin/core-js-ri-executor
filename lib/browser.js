
(function( window ){
    'use strict';

    var futoin = window.FutoIn || {};

    if ( typeof futoin.Executor === 'undefined' )
    {
        var executor_module = require( './main.js' );

        /**
         * Browser-only reference to futoin-executor
         * @global
         * @alias window.FutoInExecutor
         */
        window.FutoInExecutor = executor_module;
        
        /**
         * Browser-only reference to futoin-executor
         * @global
         * @alias window.FutoIn.Executor
         */
        futoin.Executor = executor_module;
        window.FutoIn = futoin;
        
        if ( module )
        {
            module.exports = executor_module;
        }
    }
})( window ); // jshint ignore:line
