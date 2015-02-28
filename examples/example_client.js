var async_steps = require( 'futoin-asyncsteps' );
var AdvancedCCM = require( 'futoin-invoker/AdvancedCCM' );

var ccm = new AdvancedCCM( { specDirs : [ __dirname ] } );

async_steps()
// Do it once for program's entire life time
.add(
    function( as )
    {
        // Register interface and endpoint
        ccm.register( as, 'myservice',
                      'org.example.service:1.0',
                      'http://localhost:3000/api/' );
    },
    function( as, err )
    {
        console.log( err + ': ' + as.state.error_info );
        console.log( as.state.last_exception.stack );
    }
)
// Regular service call
.add(
    function( as )
    {
        var myservice = ccm.iface( 'myservice' );
        
        // equal to myservice.call( as, 'getProgress', { progress: 'MyResource' } );
        myservice.getProgress( as, 'MyResource' );
        
        as.add( function( as, res ){
            // Use result
            console.log( 'Progress: ' + res.progress );
        } );
    },
    function( as, err )
    {
        // Handle error
        console.log( err + ': ' + as.state.error_info );
    }
)
.execute();
