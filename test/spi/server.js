'use strict';

var async_steps = require( 'futoin-asyncsteps' );
var invoker_module = require( 'futoin-invoker' );
var executor_module = require( '../../lib/main' );
var BasicAuthFace = require( '../../BasicAuthFace' );
var BasicAuthService = require( '../../BasicAuthService' );
var util = require( 'util' );

var opts = {
    prodMode : true,
    specDirs : __dirname + '/../specs',
    httpAddr : '127.0.0.1',
    httpPort : 34567,
    httpPath : '/stress/',
    httpBacklog : 4096,
    messageSniffer_disabled : function( info, rawmsg, isreq )
    {
        console.dir( rawmsg );
    },
};

function print_stats()
{
    var mem = process.memoryUsage();

    console.log( "SERVER MEMUSED:"+mem.heapUsed+"/"+mem.heapTotal+"@"+mem.rss );
}

var ccm = new invoker_module.AdvancedCCM( opts );
var executor = new executor_module.NodeExecutor( ccm, opts );
var impl = {};

var internal_executor = new executor_module.Executor( ccm, opts );

executor.on( 'ready', function()
{
    async_steps().add(
        function( as )
        {
            executor.register( as, 'spi.test:0.1', impl );
            var authsrv = BasicAuthService.register( as, internal_executor );

            authsrv.addUser( 'basicuser', 'basicpass' );
            authsrv.addUser( 'hmacuser', 'hmacpass' );
            BasicAuthFace.register( as, ccm, internal_executor );
        },
        function( as, err )
        {
            //console.log( err + " " + as.state.error_info );
            console.log( as.state.last_exception.stack );
        }
    )
        .add( function( as )
        {
            process.send( { ready : 'ok' } );
        } )
        .execute();

    print_stats();

    setInterval( print_stats, 1e3 );
} );


impl.normalCall = function( as, reqinfo )
{
    reqinfo.result().b = reqinfo.params().a;
};

impl.noResult = function( as, reqinfo )
{};

impl.errorCall = function( as, reqinfo )
{
    as.error( 'MyError' );
};

impl.rawUpload = function( as, reqinfo )
{
    reqinfo.result().b = reqinfo.params().a;
};