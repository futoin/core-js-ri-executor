var async_steps = require( 'futoin-asyncsteps' );
var AdvancedCCM = require( 'futoin-invoker/AdvancedCCM' );
var Executor = require( 'futoin-executor/Executor' );

var opts = { specDirs : __dirname };
var ccm = new AdvancedCCM( opts );
var client_executor = new Executor( ccm, opts );

async_steps()
// Do it once for program's entire life time
.add(
    function( as )
    {
        // Register interface and endpoint
        ccm.register(
                as,
                'myservice',
                'org.example.service:1.0',
                'ws://localhost:3000/api/',
                null,
                {
                    executor : client_executor
                }
        );

        // Register client-side Executor Service
        client_executor.register(
                as,
                'org.example.receiver:1.0',
                {
                    progressEvent: function( as, reqinfo )
                    {
                        var progress = reqinfo.params().progress;
                        console.log( 'Progress: ' + progress );

                        if ( progress >= 100 )
                        {
                            ccm.close();
                        }
                    }
                }
        );
        
        // Subscribe for events
        as.add( function( as )
        {
            // Note: it is a sub-step as we need to wait for 
            // registration to complete
            var myservice = ccm.iface( 'myservice' );
            
            // equal to myservice.call( as, 'subscribeProgress',
            // { progress: 'MyResource' } );
            myservice.subscribeProgress( as, 'MyResource' );
        } );
    },
    function( as, err )
    {
        console.log( err + ': ' + as.state.error_info );
        console.log( as.state.last_exception.stack );
    }
)
.execute();
