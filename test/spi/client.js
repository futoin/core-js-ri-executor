'use strict';

var async_steps = require( 'futoin-asyncsteps' );
var invoker_module = require( 'futoin-invoker' );
var child_process = require( 'child_process' );
var util = require( 'util' );

var opts = {
    prodMode : true,
    callTimeoutMS : 2e3,
    specDirs : __dirname + '/../specs',
    messageSniffer_disabled : function( info, rawmsg, isreq ) {
        console.dir( rawmsg );
    },
};


var argv = require( 'minimist' )(
    process.argv.slice( 2 ),
    {
        default : {
            time_limit : 60e3,
            concurrency : 500,
            proto : 'http',
            auth : null,
        },
    }
);
//---
var url = argv.proto + '://127.0.0.1:34567/stress/';

//---
var creds = null;

if ( argv.auth === 'basic' ) {
    creds = 'basicuser:basicpass';
    console.log( 'BASIC AUTH' );
} else if ( argv.auth === 'hmac' ) {
    creds = '-hmac:hmacuser';
    opts.hmacKey = new Buffer( 'hmacpass' ).toString( 'base64' );
    console.log( 'HMAC AUTH' );
} else {
    console.log( 'NO AUTH' );
}

//---
var made_calls = 0;
var success_calls = 0;
var failed_calls = 0;

function print_stats() {
    var mem = process.memoryUsage();

    console.log( "S:"+success_calls+" F:"+failed_calls+" T:"+made_calls+" MEMUSED:"+mem.heapUsed+"/"+mem.heapTotal+"@"+mem.rss );
}

//---

var model_as = async_steps();

model_as.add(
    function( as ) {
        var ccm = new invoker_module.AdvancedCCM( opts );

        as.add(
            function( as ) {
                ccm.register( as, 'test', 'spi.test:0.1', url, creds, { limitZone: 'unlimited' } );
            },
            function( as, err ) {
                console.log( err );
            }
        );

        as.loop( function( as ) {
            var iface = ccm.iface( 'test' );

            const p = as.parallel().add(
                function( as ) {
                    iface.call( as, 'normalCall', { a : 'a' } );
                    ++made_calls;

                    as.add( function( as, rsp ) {
                        if ( rsp.b != 'a' ) as.error( 'MyError' );

                        ++success_calls;
                    } );
                },
                function( as, err ) {
                    ++failed_calls;
                    //console.log( as.state.last_exception.stack );
                    as.success();
                }
            ).add(
                function( as ) {
                    iface.call( as, 'noResult', { a : 'a' } );
                    ++made_calls;

                    as.add( function( as ) {
                        ++success_calls;
                    } );
                },
                function( as, err ) {
                    ++failed_calls;
                    //console.log( as.state.last_exception.stack );
                    as.success();
                }
            ).add(
                function( as ) {
                    iface.call( as, 'errorCall' );
                    ++made_calls;

                    as.add( function( as ) {
                        ++failed_calls;
                    } );
                },
                function( as, err ) {
                    if ( err === 'MyError' ) {
                        ++success_calls;
                    } else {
                        console.log( err, as.state.error_info );
                        ++failed_calls;
                    }

                    as.success();
                }
            );
        } );
    },
    function( as, err ) {
        console.log( err, as.state.error_info );
        console.log( as.state.last_exception.stack );
    }
);

//---
var aslist = new Array( argv.concurrency );

for ( var as, c = aslist.length - 1; c >= 0; --c ) {
    as = async_steps();
    as.copyFrom( model_as );
    aslist[ c ] = as;
}


//---
console.log( 'FORKING' );
var child = child_process.fork( __dirname + '/server.js' );

child.send( { test: true } );

child.on( 'message', function() {
    var interval = setInterval( function() {
        print_stats();
    }, 1e3 );

    setTimeout( function() {
        for ( c = aslist.length - 1; c >= 0; --c ) {
            aslist[ c ].cancel();
        }

        console.log( '-------' );
        console.log( 'END' );
        console.log( '-------' );
        print_stats();
        clearInterval( interval );
        child.kill();
    }, argv.time_limit );

    print_stats();
    console.log( '-------' );
    console.log( 'START' );
    console.log( '-------' );

    for ( c = aslist.length - 1; c >= 0; --c ) {
        aslist[ c ].execute();
    }
} );

//---
