'use strict';

const $as = require( 'futoin-asyncsteps' );
const invoker_module = require( 'futoin-invoker' );
const executor_module = require( '../../lib/main' );
const LegacySecurityProvider = require( '../../LegacySecurityProvider' );
const util = require( 'util' );

const opts = {
    prodMode : true,
    specDirs : __dirname + '/../specs',
    httpAddr : '127.0.0.1',
    httpPort : 34567,
    httpPath : '/stress/',
    httpBacklog : 4096,
    messageSniffer_disabled : function( info, rawmsg, isreq ) {
        console.dir( rawmsg );
    },
};

function print_stats() {
    const mem = process.memoryUsage();

    console.log( "SERVER MEMUSED:"+mem.heapUsed+"/"+mem.heapTotal+"@"+mem.rss );
}

const impl = new class {
    normalCall( as, reqinfo ) {
        reqinfo.result().b = reqinfo.params().a;
    }

    noResult( as, reqinfo ) {}

    errorCall( as, reqinfo ) {
        as.error( 'MyError' );
    }

    rawUpload( as, reqinfo ) {
        reqinfo.result().b = reqinfo.params().a;
    }
};

$as().add(
    ( as ) => {
        const ccm = new invoker_module.AdvancedCCM( opts );
        const legacy_secprov = new LegacySecurityProvider( as, ccm );
        legacy_secprov.addUser( 'basicuser', 'basicpass' );
        legacy_secprov.addUser( 'hmacuser', 'hmacpass' );

        opts.securityProvider = legacy_secprov;
        const executor = new executor_module.NodeExecutor( ccm, opts );

        executor.register( as, 'spi.test:0.1', impl );

        executor.on( 'ready', function() {
            print_stats();

            setInterval( print_stats, 1e3 );
        } );
        as.add( ( as ) => process.send( { ready : 'ok' } ) );
    },
    ( as, err ) => {
        console.log( err + " " + as.state.error_info );
        console.log( as.state.last_exception.stack );
    }
).execute();
