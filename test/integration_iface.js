'use strict';

require( './prepare' );

const chai = require( 'chai' );
const { expect } = chai;

if ( typeof window !== 'undefined' ) {
    module.exports = exports = window.integrationFace = {
        in_browser : true,
    };
}

// ---
exports.test_if_anon = {
    iface : 'test.int.anon',
    version : '1.0',
    ftn3rev : '1.7',
    funcs : {
        regular : {
            params : {
                b : {
                    type : 'boolean',
                },
                s : {
                    type : 'string',
                },
                n : {
                    type : 'number',
                },
                i : {
                    type : 'integer',
                },
                m : {
                    type : 'map',
                },
                a : {
                    type : 'array',
                },
            },
            result : {
                rb : {
                    type : 'boolean',
                },
                rs : {
                    type : 'string',
                },
                rn : {
                    type : 'number',
                },
                ri : {
                    type : 'integer',
                },
                rm : {
                    type : 'map',
                },
                ra : {
                    type : 'array',
                },
            },
        },
        noResult : {
            params : {
                a : {
                    type : 'string',
                },
            },
        },
        customResult : {
            result : 'boolean',
        },
        noParams : {
            result : {
                a : {
                    type : 'string',
                },
            },
        },
        testAuth : {
            result : {
                a : {
                    type : 'string',
                },
            },
        },
        rawUpload : {
            result : {
                a : {
                    type : 'string',
                },
            },
            rawupload : true,
        },
        rawResult : {
            params : {
                a : {
                    type : 'string',
                },
            },
            rawresult : true,
        },
        rawUploadResult : {
            rawupload : true,
            rawresult : true,
        },
        rawUploadResultParams : {
            params : {
                a : {
                    type : 'string',
                },
                e : {
                    type : 'string',
                },
                c : {
                    type : 'integer',
                },
                o : {
                    type : 'map',
                },
            },
            rawupload : true,
            rawresult : true,
        },
        clientTimeout : {
            result : {
                err : {
                    type : 'string',
                },
            },
        },
        serverError : {
            params : {
                a : {
                    type : 'string',
                },
            },
            result : {
                r : {
                    type : 'string',
                },
            },
            heavy : true,
            throws : [
                'ValidError',
                'SecondValid',
            ],
        },
        cancelAfterTimeout : {
            result : {
                r : {
                    type : 'string',
                },
            },
        },

        testHTTPheader : {
            result : {
                r : {
                    type : 'string',
                },
            },
        },

        testOnBehalfOf : {
            result : {
                r : {
                    type : 'string',
                },
            },
        },

        testOnBehalfOfSub : {
            result : {
                r : {
                    type : 'string',
                },
            },
            seclvl : 'Info',
        },

        testSecLevel : {
            result : {
                r : {
                    type : 'string',
                },
            },
            seclvl : 'ExceptionalOps',
        },

    },
    requires : [
        'AllowAnonymous',
    ],
};

// ---
exports.test_if_anon_secure = {
    iface : 'test.int.anonsec',
    version : '1.0',
    funcs : {
        testSecure : {
            result : {
                a : {
                    type : 'string',
                },
            },
        },
    },
    requires : [
        'AllowAnonymous',
        'SecureChannel',
    ],
};

// --
exports.test_if_anon_bidirect = {
    iface : 'test.int.bidirect',
    version : '1.0',
    ftn3rev : '1.1',
    funcs : {
        testBiDirect : {
            result : {
                a : {
                    type : 'string',
                },
            },
        },
        clientCallback : {
            result : {
                a : {
                    type : 'string',
                },
            },
        },
    },
    requires : [
        'AllowAnonymous',
        'BiDirectChannel',
    ],
};

// ---
exports.interface_impl = {
    regular : function( as, reqinfo ) {
        var rawmsg = reqinfo.info()[ reqinfo.INFO_RAW_REQUEST ];

        const { sec } = rawmsg;

        if ( sec &&
             sec !== '-internal' &&
             sec !== 'user:pass' &&
             sec.substr( 0, 15 ) !== '-hmac:hmacuser:' &&
             sec !== '01234567890123456789ab:pass' &&
             !sec.match( /^-mmac:0123456789abcdefghijklm:HS256:HKDF256:20180101:/ ) &&
             !sec.match( /^-smac:0123456789ABCDEFGHIJKLM:HS256:/ )
        ) {
            as.error( 'SecurityError', 'Integration Test' );
        }

        var params = reqinfo.params();
        var result = reqinfo.result();

        result.rs = params.s;
        result.rb = params.b;
        result.rn = params.n;

        as.success( {
            ri : params.i,
            rm : params.m,
            ra : params.a,
        } );
    },

    noResult : function( as, reqinfo ) {
    },

    customResult : function( as, reqinfo ) {
        return true;
    },

    noParams : function( as, reqinfo ) {
        return { a : 'test' };
    },

    testAuth : function( as, reqinfo ) {
        try {
            const req = reqinfo.info.RAW_REQUEST;
            const { sec, obf } = req;

            if ( sec === '-internal' ) {
                expect( reqinfo.info[ reqinfo.INFO_SECURITY_LEVEL ] ).equal(
                    obf ? obf.slvl : reqinfo.SL_SYSTEM );
            } else {
                expect( reqinfo.info[ reqinfo.INFO_SECURITY_LEVEL ] ).equal(
                    sec && sec.match( /^-[hms]mac/ ) ?
                        reqinfo.SL_PRIVILEGED_OPS :
                        reqinfo.SL_SAFE_OPS );
            }

            expect( reqinfo.info[ reqinfo.INFO_USER_INFO ] ).not.be.null;
        } catch ( e ) {
            as.error( 'InternalError', e.message );
        }

        return { a : 'test' };
    },

    rawUpload : function( as, reqinfo ) {
        var raw_inp = reqinfo.rawInput();
        var data = [];

        raw_inp.on( 'data', function( chunk ) {
            data.push( chunk );
        } );
        raw_inp.on( 'end', function( chunk ) {
            as.success( { a : data.join( '' ) } );
        } );
        as.waitExternal();
    },

    rawResult : function( as, reqinfo ) {
        var raw_out = reqinfo.rawOutput();

        raw_out.write( reqinfo.params().a, 'utf8' );
    },

    rawUploadResult : function( as, reqinfo ) {
        var raw_inp = reqinfo.rawInput();
        var raw_out = reqinfo.rawOutput();
        var data = [];

        raw_inp.on( 'data', function( chunk ) {
            data.push( chunk );
        } );
        raw_inp.on( 'end', function( chunk ) {
            raw_out.write( data.join( '' ), 'utf8' );
            as.success();
        } );
        as.waitExternal();
    },

    rawUploadResultParams : function( as, reqinfo ) {
        var raw_inp = reqinfo.rawInput();
        var raw_out = reqinfo.rawOutput();
        var data = [];

        raw_inp.on( 'data', function( chunk ) {
            data.push( chunk );
        } );
        raw_inp.on( 'end', function( chunk ) {
            raw_out.write( reqinfo.params().a + data.join( '' ) + reqinfo.params().e, 'utf8' );
            as.success();
        } );
        as.waitExternal();
    },

    clientTimeout : function( as, reqinfo ) {
        as.setTimeout( 1e3 );
    },

    serverError : function( as, reqinfo ) {
        as.error( reqinfo.params().a );
    },

    testBiDirect : function( as, reqinfo ) {
        return { a : 'OK' };
    },

    cancelAfterTimeout : function( as, reqinfo ) {
        reqinfo.cancelAfter( 1 );
        as.setTimeout( 1e4 );

        var fail = setTimeout( function() {
            assert( false );
        }, 100 );

        as.setCancel( function() {
            clearTimeout( fail );
        } );
    },

    clientCallback : function( as, reqinfo ) {
        var ifacever = 'test.int.bidirect:1.0';
        var channel = reqinfo.channel();

        as.add(
            function( as ) {
                channel.register( as, ifacever );

                as.add( function( as ) {
                    var iface = channel.iface( ifacever );

                    iface.call( as, 'clientCallback' );
                } );
            },
            function( as, err ) {
                console.log( "Error: ", err, as.state.error_info );
                console.log( as.state.last_exception.stack );
            }
        );
    },

    testHTTPheader : function( as, reqinfo ) {
        try {
            var channel = reqinfo.channel();

            if ( channel.type() === "HTTP" ) {
                expect( channel.getRequestHeaders()['content-type'] ).equal( 'application/futoin+json' );
                channel.setResponseHeader( 'MyHeader', 'value' );
                channel.setStatusCode( 201 );
                channel.setCookie( 'MyCookie', 'MyValue' );

                return { r: 'OK' };
            } else {
                return { r: 'IGNORE' };
            }
        } catch ( e ) {
            as.error( 'InternalError', e.message );
        }
    },

    testOnBehalfOf : function( as, reqinfo ) {
        if ( reqinfo.channel().type() === 'BROWSER' ) {
            return { r: 'OK' };
        }

        try {
            reqinfo.executor().ccm()
                .iface( 'subcall' )
                .call( as, 'testOnBehalfOfSub' );
        } catch ( e ) {
            console.log( e.stack );
            as.error( 'InternalError', e.message );
        }
    },

    testOnBehalfOfSub : function( as, reqinfo ) {
        try {
            expect( reqinfo.info.RAW_REQUEST.sec ).equal( 'system:pass' );

            const local_id = reqinfo.info.USER_INFO.localID();

            if ( [
                '01234567890123456789ab',
            ].indexOf( local_id ) >= 0
            ) {
                as.success( { r: 'OK' } );
                return;
            }

            reqinfo.info.USER_INFO
                .details( as )
                .add(
                    function( as, user_details ) {
                        try {
                            var login = user_details.Login;

                            expect( [
                                'user',
                                'hmacuser',
                                'system',
                            ] ).include( login );
                        } catch ( e ) {
                            console.log( e.stack );
                            as.error( 'InternalError', e.message );
                        }

                        as.success( { r: 'OK' } );
                    },
                    function( as, err ) {
                        as.error( 'InternalError', as.state.error_info );
                    }
                );
        } catch ( e ) {
            console.log( e.stack );
            as.error( 'InternalError', e.message );
        }
    },
};
