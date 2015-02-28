
var AdvancedCCM = require( 'futoin-invoker/AdvancedCCM' );
var NodeExecutor = require( 'futoin-executor/NodeExecutor' );
var async_steps = require( 'futoin-asyncsteps' );

// Initialize CCM
var ccm = new AdvancedCCM( { specDirs : __dirname } );

// Initialize Node.js Executor implementation
var executor = new NodeExecutor(
    ccm,
    {
        specDirs : __dirname,
        httpAddr : 'localhost',
        httpPort : 3000,
        httpPath : '/api/'
    }
);
executor.on( 'notExpected', function( err, error_info ){
    console.log( 'Server: ' + err + ': ' + error_info );
} );

// Normally, you would want to define one in separate module
var service_impl = {
    getProgress : function( as, reqinfo )
    {
        var p = reqinfo.params();
        
        if ( reqinfo.params().resource === 'MyResource' )
        {
            as.success( { progress : 75 } )
        }
        else
        {
            as.error( 'InvalidResource' );
        }
    },

    subscribeProgress : function( as, reqinfo )
    {
        var p = reqinfo.params();
        
        if ( reqinfo.params().resource !== 'MyResource' )
        {
            as.error( 'InvalidResource' );
        }

        var channel = reqinfo.channel();
        channel.register( as, 'org.example.receiver:1.0' );
        
        as.add( function( as )
        {
            var iface = channel.iface( 'org.example.receiver:1.0' );
            reqinfo.result().ok = true;

            // Stupid simple scheduling of events to be sent
            //---
            var add_progress = function( progress, delay )
            {
                setTimeout( function(){
                    async_steps().add( function( as ){
                        iface.progressEvent( as, 'MyResource', progress );
                    } )
                    .execute();
                }, delay );
            };
            
            for ( var i = 0; i <= 10; ++i )
            {
                add_progress( i * 10, i * 100 );
            }
            //---
        } );
    }
};

// Register Service implementation
async_steps()
.add(
    function( as )
    {
        executor.register( as, 'org.example.service:1.0', service_impl );
    },
    function( as, err )
    {
        console.log( err + ': ' + as.state.error_info );
        console.log( as.state.last_exception.stack );
    }
)
.execute();
