
if ( typeof exports === 'undefined' )
{
    exports = {};
}

// ---
exports.test_int_anon = {
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
            'params' : {
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
exports.test_int_anon_secure = {
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

// --
exports.test_int_anon_bidirect = {
    iface : 'test.int.bidirect',
    version : '1.0',
    ftn3rev : '1.1',
    funcs : {
        'testBiDirect' : {
            'result' : {
                'a' : {
                    'type' : 'string'
                }
            }
        }
    },
    requires : [
        'AllowAnonymous',
        'BiDirectChannel'
    ]
};

// ---
exports.interface_impl = {
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
    },
    
    noResult : function( as, reqinfo )
    {
    },
    
    noParams : function( as, reqinfo )
    {
        return { a : 'test' };
    },
    
    rawUpload : function( as, reqinfo )
    {
        var raw_inp = reqinfo.rawInput();
        var data = [];

        raw_inp.on( 'data', function( chunk ){
            data.push( chunk );
        });
        raw_inp.on( 'end', function( chunk ){
            as.success( { a : data.join( '' ) } );
        });
        as.setCancel( function( as ){} );
    },
    
    rawResult : function( as, reqinfo )
    {
        var raw_out = reqinfo.rawOutput();
        raw_out.write( reqinfo.params().a, 'utf8' );
    },
    
    rawUploadResult : function( as, reqinfo )
    {
        var raw_inp = reqinfo.rawInput();
        var raw_out = reqinfo.rawOutput();
        var data = [];

        raw_inp.on( 'data', function( chunk ){
            data.push( chunk );
        });
        raw_inp.on( 'end', function( chunk ){
            raw_out.write( data.join( '' ), 'utf8' );
            as.success();
        });
        as.setCancel( function( as ){} );

    },
    
    rawUploadResultParams : function( as, reqinfo )
    {
        var raw_inp = reqinfo.rawInput();
        var raw_out = reqinfo.rawOutput();
        var data = [];

        raw_inp.on( 'data', function( chunk ){
            data.push( chunk );
        });
        raw_inp.on( 'end', function( chunk ){
            raw_out.write( reqinfo.params().a + data.join( '' ) + reqinfo.params().c, 'utf8' );
            as.success();
        });
        as.setCancel( function( as ){} );

    },
    
    clientTimeout : function( as, reqinfo )
    {
        as.setTimeout( 1e3 );
    },
    
    serverError : function( as, reqinfo )
    {
        as.error( reqinfo.params().a );
    },
    
    testBiDirect : function( as, reqinfo )
    {
        return { a : 'OK' };
    }
};