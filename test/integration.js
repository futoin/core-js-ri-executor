"use strict";

var assert = require('assert');
var executor_module = require( '../lib/main' );
var invoker_module = require( 'futoin-invoker' );
var async_steps = require( 'futoin-asyncsteps' );
var NodeExecutor = executor_module.NodeExecutor;
var _ = require( 'lodash' );

// ---
var test_int_anon = {
    iface : 'test.int.anon',
    version : '1.0',
    funcs : {
        'regular' : {
            'params' : {
                'b' : {
                    'type' : 'boolean'
                },
                's' : {
                    'type' : 'string'
                },
                'n' : {
                    'type' : 'number'
                },
                'i' : {
                    'type' : 'integer'
                },
                'm' : {
                    'type' : 'map'
                },
                'a' : {
                    'type' : 'array'
                }
            },
            'result' : {
                'rb' : {
                    'type' : 'boolean'
                },
                'rs' : {
                    'type' : 'string'
                },
                'rn' : {
                    'type' : 'number'
                },
                'ri' : {
                    'type' : 'integer'
                },
                'rm' : {
                    'type' : 'map'
                },
                'ra' : {
                    'type' : 'array'
                }
            }
        },
        'noResult' : {
            'params' : {
                'a' : {
                    'type' : 'string'
                }
            }
        },
        'noParams' : {
            'result' : {
                'a' : {
                    'type' : 'string'
                }
            }
        },
        'rawUpload' : {
            'result' : {
                'a' : {
                    'type' : 'string'
                }
            },
            rawupload : true
        },
        'rawResult' : {
            'params' : {
                'a' : {
                    'type' : 'string'
                }
            },
            rawresult : true
        },
        'rawUploadResult' : {
            rawupload : true,
            rawresult : true
        },
        'rawUploadResultParams' : {
            'result' : {
                'a' : {
                    'type' : 'string'
                },
                'c' : {
                    'type' : 'string'
                }
            },
            rawupload : true,
            rawresult : true
        },
        'clientTimeout' : {
            'result' : {
                'err' : {
                    'type' : 'string'
                }
            }
        },
        'serverError' : {
            'params' : {
                'a' : {
                    'type' : 'string'
                }
            },
            'result' : {
                'r' : {
                    'type' : 'string'
                }
            },
            throws : [
                'ValidError',
                'SecondValid'
            ]
        }
    },
    requires : [
        'AllowAnonymous'
    ]
};

// ---
var test_int_anon_secure = {
    iface : 'test.int.anonsec',
    version : '1.0',
    funcs : {
        'testSecure' : {
            'result' : {
                'a' : {
                    'type' : 'string'
                }
            }
        }
    },
    requires : [
        'AllowAnonymous',
        'SecureChannel'
    ]
};


// ---
var interface_impl = {
    regular : function( as, reqinfo )
    {
        var params = reqinfo.params();
        var result = reqinfo.result();
        
        result.rs = params.s;
        result.rb = params.b;
        result.rn = params.n;
        
        as.success({
            ri : params.i,
            rm : params.m,
            ra : params.a
        });
    }
};


// ---
var model_as = async_steps();
model_as.add(
    function( as )
    {
        var opts = {};
        opts[invoker_module.OPT_CALL_TIMEOUT_MS] = 1e3;
        opts[NodeExecutor.OPT_SPEC_DIRS] = [
            __dirname + '/specs',
            test_int_anon,
            test_int_anon_secure
        ];
        opts[NodeExecutor.OPT_HTTP_ADDR] = 'localhost';
        opts[NodeExecutor.OPT_HTTP_PORT] = '1080';
        opts[NodeExecutor.OPT_HTTP_PATH] = '/ftn';
        
        var secopts = _.clone( opts );

        var end_point = as.state.proto +
            "://" + opts[NodeExecutor.OPT_HTTP_ADDR] +
            ":" + opts[NodeExecutor.OPT_HTTP_PORT] +
            opts[NodeExecutor.OPT_HTTP_PATH];
            
        secopts[NodeExecutor.OPT_HTTP_PORT] = '1081';
            
        var secend_point = "secure+" + as.state.proto +
            "://" + secopts[NodeExecutor.OPT_HTTP_ADDR] +
            ":" + secopts[NodeExecutor.OPT_HTTP_PORT] +
            secopts[NodeExecutor.OPT_HTTP_PATH];

        var ccm = new as.state.CCMImpl( opts );
        var anon_iface;
        var anonsec_iface;
        
        as.add( function( as ){
            var executor = new NodeExecutor( ccm, opts );
            
            as.setTimeout( opts[invoker_module.OPT_CALL_TIMEOUT_MS] );
            executor.on('ready', function(){
                as.success();
            });
            
            as.state.executor = executor;
        }).add( function( as ){
            var secexecutor = new NodeExecutor( ccm, secopts );
            
            as.setTimeout( opts[invoker_module.OPT_CALL_TIMEOUT_MS] );
            secexecutor.on('ready', function(){
                as.success();
            });
            
            as.state.secexecutor = secexecutor;
        }).add( function( as ){
            as.state.executor.register( as, 'test.int.anon:1.0', interface_impl );
            as.state.secexecutor.register( as, 'test.int.anonsec:1.0', interface_impl );
            ccm.register( as, 'test_int_anon', 'test.int.anon:1.0', end_point );
            ccm.register( as, 'test_int_anonsec', 'test.int.anonsec:1.0', secend_point );
        }).add( function( as ){
            anon_iface = ccm.iface( 'test_int_anon' );
            anonsec_iface = ccm.iface( 'test_int_anonsec' );
        }).add( function( as ){
            as.state.step = "regular";
            anon_iface.call( as, 'regular', {
                b : true,
                s : 'Value',
                n : 123.456,
                i : 123456,
                m : { field : 'value' },
                a : [ true, 'value', 123.456, 123456, { field : 'value' }, [ 1, 2, 3 ] ]
            } );
        }).add( function( as, res ){
            res.rb.should.be.true;
            res.rs.should.equal( 'Value' );
            res.rn.should.equal( 123.456 );
            res.ri.should.equal( 123456 );
            res.rm.should.eql( { field : 'value' } );
            res.ra.should.eql( [ true, 'value', 123.456, 123456, { field : 'value' }, [ 1, 2, 3 ] ] );
        }).add( function( as ){
        }).add( function( as ){
        }).add( function( as ){
        }).add( function( as ){
        });
    },
    function( as, err )
    {
        as.success( new Error( "" + err + ": " + as.state.error_info + " @ " + as.state.step ) );
    }
).add(
    function( as, err )
    {
        as.setTimeout( 1e3 );
        as.state.executor._http_server.close(function(){
            as.success( err );
        });
    }
).add(
    function( as, err )
    {
        as.setTimeout( 1e3 );
        as.state.secexecutor._http_server.close(function(){
            as.state.done( err );
            as.success();
        });
    }
);

// ---
describe( 'Integration', function()
{
    it('should pass HTTP suite SimpleCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.SimpleCCM;
        as.state.done = done;
        as.state.proto = 'http';
        as.execute();
    });
/*
    it('should pass WS suite SimpleCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.SimpleCCM;
        as.state.done = done;
        as.state.proto = 'ws';
        as.execute();
    });
*/    
    it('should pass HTTP suite AdvancedCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'http';
        as.execute();
    });
/*    
    it('should pass WS suite AdvancedCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'ws';
        as.execute();
    });
*/
}
);
