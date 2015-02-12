l'use strict';

var invoker_module = require( 'futoin-invoker' );
var executor_module = require( '../../lib/main' );

var opts = {
    prodMode : true,
    specDirs : __dirname + '../specs',
    httpAddr : '0.0.0.0',
    httpPort : 34567,
    httpPath : '/stress/',
    httpBacklog : 4096,
};

var ccm = new invoker_module.AdvancedCCM( opts );
var executor = new executor_module.NodeExecutor( ccm, opts );