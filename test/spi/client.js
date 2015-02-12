'use strict';

var invoker_module = require( 'futoin-invoker' );

var opts = {
    prodMode : true,
    callTimeoutMS : 2e3,
    specDirs : __dirname + '../specs'
};

var ccm = new invoker_module.AdvancedCCM( opts );
