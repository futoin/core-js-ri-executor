
  [![NPM Version](https://img.shields.io/npm/v/futoin-executor.svg?style=flat)](https://www.npmjs.com/package/futoin-executor)
  [![NPM Downloads](https://img.shields.io/npm/dm/futoin-executor.svg?style=flat)](https://www.npmjs.com/package/futoin-executor)
  [![Build Status](https://travis-ci.org/futoin/core-js-ri-executor.svg?branch=master)](https://travis-ci.org/futoin/core-js-ri-executor)
  [![stable](https://img.shields.io/badge/stability-stable-green.svg?style=flat)](https://www.npmjs.com/package/futoin-asyncsteps)

  [![NPM](https://nodei.co/npm/futoin-executor.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/futoin-executor/)

**[Stability: 3 - Stable](http://nodejs.org/api/documentation.html)**


# FutoIn reference implementation

Reference implementation of:
 
    FTN6: FutoIn Executor Concept
    Version: 1.5

    FTN3: FutoIn Interface Definition
    Version: 1.3

    FTN5: FutoIn HTTP integration
    Version: 1.2
    
* Spec: [FTN6: Interface Executor Concept v1.x](http://specs.futoin.org/final/preview/ftn6_iface_executor_concept-1.html)
* Spec: [FTN3: FutoIn Interface Definition v1.x](http://specs.futoin.org/final/preview/ftn3_iface_definition.html)
* Spec: [FTN5: FutoIn HTTP integration v1.x](http://specs.futoin.org/final/preview/ftn5_iface_http_integration.html)

[Web Site](http://futoin.org/)

# About

FutoIn Executor is a peer which processes a request - handles a FutoIn interface method
as described in [FTN3: FutoIn Interface Definition](http://specs.futoin.org/final/preview/ftn3_iface_definition.html).
It is not necessary a server - e.g. client may handle event request from server.

Strict FutoIn interface (iface) definition and transport protocol is defined in FTN3 spec mentioned above.
**As it is based on JSON, both client and server can be implemented in a few minutes almost in
any technology.** *However, Invoker and Executor concept provide significant benefits for 
efficiency, reliability and error control.*

**Executor class is the core which encapsulate pure FutoIn Executor logic**. It can be extended to 
platform-specific implementation (e.g. Browser or Node)

The primary communication channel is WebSockets and HTTP as secondary.
Large raw data upload and download is also supported through HTTP(S) only.

Executor - neutral Executor concept logic
NodeExecutor - available only if used in Node.js

*Note: Invoker and Executor are platform/technology-neutral concepts. The implementation
is already available in JS and PHP. Hopefully, others are upcoming*


# Installation for Node.js

Command line:
```sh
$ npm install futoin-executor --save
```

All public classes can be accessed through module:
```javascript
var Executor = require('futoin-executor').Executor;
```

or included modular way, e.g.:
```javascript
var Executor = require('futoin-executor/Executor');
```
# Installation for Browser

```sh
$ bower install futoin-executor --save
```

Please note that browser build is available under in dist/ folder in sources generated
with [pure-sjc](https://github.com/RReverser/pure-cjs). It includes modular parts of
[lodash](https://www.npmjs.com/package/lodash).

*Note: there are the following globals available*:

* SimpleCCM - global reference to futoin-invoker.SimpleCCM class
* AdvancedCCM - global reference to futoin-invoker.AdvancedCCM class
* futoin.Invoker - global reference to futoin-invoker module

# Examples

Please note that the examples expect interface definition files
listed below. All sources are available under examples/ folder.

## Server implementation example

```javascript

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
```

## Polling client implementation example

```javascript
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
```

## Event receiving client implementation example

```javascript
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
```

## Example output of execution

    Starting Example Server
    Starting Example Client
    Progress: 75
    Starting Example Client with Callback
    Progress: 0
    Progress: 10
    Progress: 20
    Progress: 30
    Progress: 40
    Progress: 50
    Progress: 60
    Progress: 70
    Progress: 80
    Progress: 90
    Progress: 100


## FutoIn iface definitions

Please see [FTN3: FutoIn Interface Definition v1.x](http://specs.futoin.org/final/preview/ftn3_iface_definition.html)
for all advanced features.

### org.example.types-1.0-iface.json

This one is only used to share Type definitions. It does not
participate in inheritance

```javascript
{
    "iface" : "org.example.types",
    "version" : "1.0",
    "ftn3rev" : "1.1",
    "types" : {
        "Percent" : {
            "type" : "integer",
            "min" : 0,
            "max" : 100
        }
    },
    "desc" : "Shared interface to define common types"
}
```

### org.example.service-1.0-iface.json

Actual Server-side Service definition

```javascript
{
    "iface" : "org.example.service",
    "version" : "1.0",
    "ftn3rev" : "1.1",
    "imports" : [
        "org.example.types:1.0"
    ],
    "funcs" : {
        "getProgress" : {
            "params" : {
                "resource" : {
                    "type" : "string"
                }
            },
            "result" : {
                "progress" : {
                    "type" : "Percent"
                }
            },
            "throws" : [
                "InvalidResource"
            ]
        },
        "subscribeProgress" : {
            "params" : {
                "resource" : {
                    "type" : "string"
                }
            },
            "result" : {
                "ok" : {
                    "type" : "boolean"
                }
            },
            "throws" : [
                "InvalidResource"
            ]
        }
    },
    "requires" : [
        "AllowAnonymous"
    ],
    "desc" : "Service-side Service"
}
```

### org.example.receiver-1.0-iface.json

Client-side Service for bi-directional transport channels, like WebSockets.

```javascript
{
    "iface" : "org.example.receiver",
    "version" : "1.0",
    "ftn3rev" : "1.1",
    "imports" : [
        "org.example.types:1.0"
    ],
    "funcs" : {
        "progressEvent" : {
            "params" : {
                "resource" : {
                    "type" : "string"
                },
                "progress" : {
                    "type" : "Percent"
                }
            },
            "desc" : "Progress receiving event callback"
        }
    },
    "requires" : [
        "AllowAnonymous"
    ],
    "desc" : "Client-side Service"
}

```

    
# API documentation

The concept is described in FutoIn specification: [FTN6: Interface Executor Concept v1.x](http://specs.futoin.org/final/preview/ftn6_iface_executor_concept-1.html)

#Index

**Modules**

* [futoin-executor](#module_futoin-executor)

**Classes**

* [class: BrowserExecutorOptions](#BrowserExecutorOptions)
  * [new BrowserExecutorOptions()](#new_BrowserExecutorOptions)
  * [BrowserExecutorOptions.clientTimeoutMS](#BrowserExecutorOptions.clientTimeoutMS)
  * [BrowserExecutorOptions.allowedOrigins](#BrowserExecutorOptions.allowedOrigins)
* [class: BrowserExecutor](#BrowserExecutor)
  * [new BrowserExecutor(ccm, opts)](#new_BrowserExecutor)
  * [BrowserExecutor.allowed_origins](#BrowserExecutor.allowed_origins)
* [class: ChannelContext](#ChannelContext)
  * [new ChannelContext(executor)](#new_ChannelContext)
  * [ChannelContext.state](#ChannelContext.state)
* [class: DerivedKey](#DerivedKey)
  * [new DerivedKey(ccm, base_id, sequence_id)](#new_DerivedKey)
* [class: ExecutorOptions](#ExecutorOptions)
  * [new ExecutorOptions()](#new_ExecutorOptions)
  * [ExecutorOptions.specDirs](#ExecutorOptions.specDirs)
  * [ExecutorOptions.prodMode](#ExecutorOptions.prodMode)
  * [ExecutorOptions.reqTimeout](#ExecutorOptions.reqTimeout)
  * [ExecutorOptions.heavyReqTimeout](#ExecutorOptions.heavyReqTimeout)
  * [ExecutorOptions.messageSniffer()](#ExecutorOptions.messageSniffer)
* [class: Executor](#Executor)
  * [new Executor(ccm, opts)](#new_Executor)
  * [executor.ccm()](#Executor#ccm)
  * [executor.register(as, ifacever, impl, specdirs)](#Executor#register)
  * [event: "request"](#Executor#event_request)
  * [event: "response"](#Executor#event_response)
  * [event: "notExpected"](#Executor#event_notExpected)
* [class: NodeExecutorOptions](#NodeExecutorOptions)
  * [new NodeExecutorOptions()](#new_NodeExecutorOptions)
  * [NodeExecutorOptions.httpServer](#NodeExecutorOptions.httpServer)
  * [NodeExecutorOptions.httpAddr](#NodeExecutorOptions.httpAddr)
  * [NodeExecutorOptions.httpPort](#NodeExecutorOptions.httpPort)
  * [NodeExecutorOptions.httpPath](#NodeExecutorOptions.httpPath)
  * [NodeExecutorOptions.httpBacklog](#NodeExecutorOptions.httpBacklog)
  * [NodeExecutorOptions.secureChannel](#NodeExecutorOptions.secureChannel)
  * [NodeExecutorOptions.trustProxy](#NodeExecutorOptions.trustProxy)
* [class: NodeExecutor](#NodeExecutor)
  * [new NodeExecutor()](#new_NodeExecutor)
* [class: RequestInfoConst](#RequestInfoConst)
  * [new RequestInfoConst()](#new_RequestInfoConst)
  * [RequestInfoConst.INFO_X509_CN](#RequestInfoConst.INFO_X509_CN)
  * [RequestInfoConst.INFO_PUBKEY](#RequestInfoConst.INFO_PUBKEY)
  * [RequestInfoConst.INFO_CLIENT_ADDR](#RequestInfoConst.INFO_CLIENT_ADDR)
  * [RequestInfoConst.INFO_SECURE_CHANNEL](#RequestInfoConst.INFO_SECURE_CHANNEL)
  * [RequestInfoConst.INFO_REQUEST_TIME_FLOAT](#RequestInfoConst.INFO_REQUEST_TIME_FLOAT)
  * [RequestInfoConst.INFO_SECURITY_LEVEL](#RequestInfoConst.INFO_SECURITY_LEVEL)
  * [RequestInfoConst.INFO_USER_INFO](#RequestInfoConst.INFO_USER_INFO)
  * [RequestInfoConst.INFO_RAW_REQUEST](#RequestInfoConst.INFO_RAW_REQUEST)
  * [RequestInfoConst.INFO_RAW_RESPONSE](#RequestInfoConst.INFO_RAW_RESPONSE)
  * [RequestInfoConst.INFO_DERIVED_KEY](#RequestInfoConst.INFO_DERIVED_KEY)
  * [RequestInfoConst.INFO_HAVE_RAW_UPLOAD](#RequestInfoConst.INFO_HAVE_RAW_UPLOAD)
  * [RequestInfoConst.INFO_HAVE_RAW_RESULT](#RequestInfoConst.INFO_HAVE_RAW_RESULT)
  * [RequestInfoConst.INFO_CHANNEL_CONTEXT](#RequestInfoConst.INFO_CHANNEL_CONTEXT)
  * [const: RequestInfoConst.SL_ANONYMOUS](#RequestInfoConst.SL_ANONYMOUS)
  * [const: RequestInfoConst.SL_INFO](#RequestInfoConst.SL_INFO)
  * [const: RequestInfoConst.SL_SAFE_OPS](#RequestInfoConst.SL_SAFE_OPS)
  * [const: RequestInfoConst.SL_PRIVILEGED_OPS](#RequestInfoConst.SL_PRIVILEGED_OPS)
  * [const: RequestInfoConst.SL_EXCEPTIONAL_OPS](#RequestInfoConst.SL_EXCEPTIONAL_OPS)
  * [const: RequestInfoConst.SL_SYSTEM](#RequestInfoConst.SL_SYSTEM)
* [class: RequestInfo](#RequestInfo)
  * [new RequestInfo()](#new_RequestInfo)
  * [requestInfo.info](#RequestInfo#info)
  * [requestInfo.params()](#RequestInfo#params)
  * [requestInfo.result()](#RequestInfo#result)
  * [requestInfo.rawInput()](#RequestInfo#rawInput)
  * [requestInfo.rawOutput()](#RequestInfo#rawOutput)
  * [requestInfo.executor()](#RequestInfo#executor)
  * [requestInfo.channel()](#RequestInfo#channel)
  * [requestInfo.cancelAfter(time_ms)](#RequestInfo#cancelAfter)
* [class: SourceAddress](#SourceAddress)
  * [new SourceAddress(type, [host], port)](#new_SourceAddress)
  * [sourceAddress.host](#SourceAddress#host)
  * [sourceAddress.port](#SourceAddress#port)
  * [sourceAddress.type](#SourceAddress#type)
  * [sourceAddress.asString()](#SourceAddress#asString)
* [class: UserInfo](#UserInfo)
  * [new UserInfo(ccm, local_id, global_id, details)](#new_UserInfo)
  * [userInfo.localID()](#UserInfo#localID)
  * [userInfo.globalID()](#UserInfo#globalID)
  * [userInfo.details(as, [user_field_identifiers])](#UserInfo#details)

**Functions**

* [BasicAuthFace()](#BasicAuthFace)
  * [BasicAuthFace.ifacespec](#BasicAuthFace.ifacespec)
  * [BasicAuthFace.register()](#BasicAuthFace.register)
* [BasicAuthService()](#BasicAuthService)
  * [BasicAuthService.register(as, executor)](#BasicAuthService.register)
  * [basicAuthService.addUser(user, secret, details, [system_user])](#BasicAuthService#addUser)
  * [basicAuthService._getUser(as, user)](#BasicAuthService#_getUser)
  * [basicAuthService._getUserByID(as, local_id)](#BasicAuthService#_getUserByID)

**Members**

* [UserInfoConst](#UserInfoConst)
  * [const: UserInfoConst.INFO_Login](#UserInfoConst.INFO_Login)
  * [const: UserInfoConst.INFO_Nick](#UserInfoConst.INFO_Nick)
  * [const: UserInfoConst.INFO_FirstName](#UserInfoConst.INFO_FirstName)
  * [const: UserInfoConst.INFO_FullName](#UserInfoConst.INFO_FullName)
  * [const: UserInfoConst.INFO_DateOfBirth](#UserInfoConst.INFO_DateOfBirth)
  * [const: UserInfoConst.INFO_TimeOfBirth](#UserInfoConst.INFO_TimeOfBirth)
  * [const: UserInfoConst.INFO_ContactEmail](#UserInfoConst.INFO_ContactEmail)
  * [const: UserInfoConst.INFO_ContactPhone](#UserInfoConst.INFO_ContactPhone)
  * [const: UserInfoConst.INFO_HomeAddress](#UserInfoConst.INFO_HomeAddress)
  * [const: UserInfoConst.INFO_WorkAddress](#UserInfoConst.INFO_WorkAddress)
  * [const: UserInfoConst.INFO_Citizenship](#UserInfoConst.INFO_Citizenship)
  * [const: UserInfoConst.INFO_GovernmentRegID](#UserInfoConst.INFO_GovernmentRegID)
  * [const: UserInfoConst.INFO_AvatarURL](#UserInfoConst.INFO_AvatarURL)
* [FutoInExecutor](#FutoInExecutor)
* [Executor](#Executor)
  * [executor.ccm()](#Executor#ccm)
  * [executor.register(as, ifacever, impl, specdirs)](#Executor#register)
  * [event: "request"](#Executor#event_request)
  * [event: "response"](#Executor#event_response)
  * [event: "notExpected"](#Executor#event_notExpected)
* [BrowserExecutor](#BrowserExecutor)
  * [BrowserExecutor.allowed_origins](#BrowserExecutor.allowed_origins)
 
<a name="module_futoin-executor"></a>
#futoin-executor
<a name="BrowserExecutorOptions"></a>
#class: BrowserExecutorOptions
**Extends**: `ExecutorOptions`  
**Members**

* [class: BrowserExecutorOptions](#BrowserExecutorOptions)
  * [new BrowserExecutorOptions()](#new_BrowserExecutorOptions)
  * [BrowserExecutorOptions.clientTimeoutMS](#BrowserExecutorOptions.clientTimeoutMS)
  * [BrowserExecutorOptions.allowedOrigins](#BrowserExecutorOptions.allowedOrigins)

<a name="new_BrowserExecutorOptions"></a>
##new BrowserExecutorOptions()
Pseudo-class for BrowserExecutor options documentation

**Extends**: `ExecutorOptions`  
<a name="BrowserExecutorOptions.clientTimeoutMS"></a>
##BrowserExecutorOptions.clientTimeoutMS
Client timeout MS

**Default**: `600`  
<a name="BrowserExecutorOptions.allowedOrigins"></a>
##BrowserExecutorOptions.allowedOrigins
List of allowed page origins for incoming connections.
It is MANDATORY for security reasons.

Example:
* 'http://localhost:8000'
* 'http://example.com'

**Default**: `[]`  
<a name="BrowserExecutor"></a>
#class: BrowserExecutor
**Members**

* [class: BrowserExecutor](#BrowserExecutor)
  * [new BrowserExecutor(ccm, opts)](#new_BrowserExecutor)
  * [BrowserExecutor.allowed_origins](#BrowserExecutor.allowed_origins)

<a name="new_BrowserExecutor"></a>
##new BrowserExecutor(ccm, opts)
Browser Executor with HTML5 Web Messaging as incoming transport.

It allows communication across open pages (frames/tabs/windows) inside client browser.

**Params**

- ccm `AdvancedCCM`  
- opts `object` - see BrowserExecutorOptions  

<a name="BrowserExecutor.allowed_origins"></a>
##BrowserExecutor.allowed_origins
Current list of allowed origins for modifications. Please note that
it is an object, where field is actual origin and value must evaluate
to true.

<a name="ChannelContext"></a>
#class: ChannelContext
**Members**

* [class: ChannelContext](#ChannelContext)
  * [new ChannelContext(executor)](#new_ChannelContext)
  * [ChannelContext.state](#ChannelContext.state)

<a name="new_ChannelContext"></a>
##new ChannelContext(executor)
Channel Context normally accessible through RequestInfo object.

**Params**

- executor <code>[Executor](#Executor)</code> - reference to associated executor  

<a name="ChannelContext.state"></a>
##ChannelContext.state
Persistent storage for arbitrary user variables.
Please make sure variable names a prefixed.

NOTE: context.state === context.state()

**Returns**: `object` - this.state  
<a name="DerivedKey"></a>
#class: DerivedKey
**Members**

* [class: DerivedKey](#DerivedKey)
  * [new DerivedKey(ccm, base_id, sequence_id)](#new_DerivedKey)

<a name="new_DerivedKey"></a>
##new DerivedKey(ccm, base_id, sequence_id)
Derived Key interface for planned FTN8 Master key management.

A dummy so far.

**Params**

- ccm `AdvancedCCM` - reference to CCM  
- base_id `integer` - master key ID  
- sequence_id `integer` - sequence number of the derived key  

<a name="ExecutorOptions"></a>
#class: ExecutorOptions
**Members**

* [class: ExecutorOptions](#ExecutorOptions)
  * [new ExecutorOptions()](#new_ExecutorOptions)
  * [ExecutorOptions.specDirs](#ExecutorOptions.specDirs)
  * [ExecutorOptions.prodMode](#ExecutorOptions.prodMode)
  * [ExecutorOptions.reqTimeout](#ExecutorOptions.reqTimeout)
  * [ExecutorOptions.heavyReqTimeout](#ExecutorOptions.heavyReqTimeout)
  * [ExecutorOptions.messageSniffer()](#ExecutorOptions.messageSniffer)

<a name="new_ExecutorOptions"></a>
##new ExecutorOptions()
Pseudo-class for Executor options documentation

<a name="ExecutorOptions.specDirs"></a>
##ExecutorOptions.specDirs
Search dirs for spec definition or spec instance directly. It can
be single value or array of values. Each value is either path/URL (string) or
iface spec instance (object).

**Default**: `[]`  
<a name="ExecutorOptions.prodMode"></a>
##ExecutorOptions.prodMode
Production mode - disables some checks without compomising security

**Default**: `false`  
<a name="ExecutorOptions.reqTimeout"></a>
##ExecutorOptions.reqTimeout
Default request processing timeout

**Default**: `5000`  
<a name="ExecutorOptions.heavyReqTimeout"></a>
##ExecutorOptions.heavyReqTimeout
Default request processing timeout for functions
marked "heavy". See FTN3

**Default**: `60000`  
<a name="ExecutorOptions.messageSniffer"></a>
##ExecutorOptions.messageSniffer()
Message sniffer callback( iface_info, msg, is_incomming ).
Useful for audit logging.

**Default**: `dummy`  
<a name="Executor"></a>
#class: Executor
**Members**

* [class: Executor](#Executor)
  * [new Executor(ccm, opts)](#new_Executor)
  * [executor.ccm()](#Executor#ccm)
  * [executor.register(as, ifacever, impl, specdirs)](#Executor#register)
  * [event: "request"](#Executor#event_request)
  * [event: "response"](#Executor#event_response)
  * [event: "notExpected"](#Executor#event_notExpected)

<a name="new_Executor"></a>
##new Executor(ccm, opts)
An abstract core implementing pure FTN6 Executor logic.

**Params**

- ccm `AdvancedCCM` - instance of AdvancedCCM  
- opts `objects` - see ExecutorOptions  

<a name="Executor#ccm"></a>
##executor.ccm()
Get reference to associated AdvancedCCM instance

**Returns**: `AdvancedCCM`  
<a name="Executor#register"></a>
##executor.register(as, ifacever, impl, specdirs)
Register implementation of specific interface

**Params**

- as `AsyncSteps`  
- ifacever `string` - standard iface:version notation of interface
       to be implemented.  
- impl `object` | `function` - either iface implementation or func( impl, executor )  
- specdirs `object` | `array` - NOT STANDARD. Useful for direct passing
of hardcoded spec definition.  

<a name="Executor#event_request"></a>
##event: "request"
Fired when request processing is started.
( reqinfo, rawreq )

<a name="Executor#event_response"></a>
##event: "response"
Fired when request processing is started.
( reqinfo, rawreq )

<a name="Executor#event_notExpected"></a>
##event: "notExpected"
Fired when not expected error occurs
( errmsg, error_info )

<a name="NodeExecutorOptions"></a>
#class: NodeExecutorOptions
**Extends**: `ExecutorOptions`  
**Members**

* [class: NodeExecutorOptions](#NodeExecutorOptions)
  * [new NodeExecutorOptions()](#new_NodeExecutorOptions)
  * [NodeExecutorOptions.httpServer](#NodeExecutorOptions.httpServer)
  * [NodeExecutorOptions.httpAddr](#NodeExecutorOptions.httpAddr)
  * [NodeExecutorOptions.httpPort](#NodeExecutorOptions.httpPort)
  * [NodeExecutorOptions.httpPath](#NodeExecutorOptions.httpPath)
  * [NodeExecutorOptions.httpBacklog](#NodeExecutorOptions.httpBacklog)
  * [NodeExecutorOptions.secureChannel](#NodeExecutorOptions.secureChannel)
  * [NodeExecutorOptions.trustProxy](#NodeExecutorOptions.trustProxy)

<a name="new_NodeExecutorOptions"></a>
##new NodeExecutorOptions()
Pseudo-class for NodeExecutor options documentation

**Extends**: `ExecutorOptions`  
<a name="NodeExecutorOptions.httpServer"></a>
##NodeExecutorOptions.httpServer
Provide a pre-configured HTTP server instance or
use httpAddr & httpPort options

**Default**: `null`  
<a name="NodeExecutorOptions.httpAddr"></a>
##NodeExecutorOptions.httpAddr
Bind address for internally created HTTP server

**Default**: `null`  
<a name="NodeExecutorOptions.httpPort"></a>
##NodeExecutorOptions.httpPort
Bind port for internally created HTTP server

**Default**: `null`  
<a name="NodeExecutorOptions.httpPath"></a>
##NodeExecutorOptions.httpPath
Path to server FutoIn request on.

NOTE: if httpServer is provided than all not related
requests are silently ignored. Otherwise, immediate
error is raised if request path does not match httpPath.

**Default**: `/`  
<a name="NodeExecutorOptions.httpBacklog"></a>
##NodeExecutorOptions.httpBacklog
Option to configure internally created server backlog

**Default**: `null`  
<a name="NodeExecutorOptions.secureChannel"></a>
##NodeExecutorOptions.secureChannel
If true, if incoming transport as seen is 'SecureChannel', see FTN3.
Useful with reverse proxy and local connections.

**Default**: `false`  
<a name="NodeExecutorOptions.trustProxy"></a>
##NodeExecutorOptions.trustProxy
If true, X-Forwarded-For will be used as Source Address, if present

**Default**: `false`  
<a name="NodeExecutor"></a>
#class: NodeExecutor
**Members**

* [class: NodeExecutor](#NodeExecutor)
  * [new NodeExecutor()](#new_NodeExecutor)

<a name="new_NodeExecutor"></a>
##new NodeExecutor()
Executor implementation for Node.js/io.js with HTTP and WebSockets transport

<a name="RequestInfoConst"></a>
#class: RequestInfoConst
**Members**

* [class: RequestInfoConst](#RequestInfoConst)
  * [new RequestInfoConst()](#new_RequestInfoConst)
  * [RequestInfoConst.INFO_X509_CN](#RequestInfoConst.INFO_X509_CN)
  * [RequestInfoConst.INFO_PUBKEY](#RequestInfoConst.INFO_PUBKEY)
  * [RequestInfoConst.INFO_CLIENT_ADDR](#RequestInfoConst.INFO_CLIENT_ADDR)
  * [RequestInfoConst.INFO_SECURE_CHANNEL](#RequestInfoConst.INFO_SECURE_CHANNEL)
  * [RequestInfoConst.INFO_REQUEST_TIME_FLOAT](#RequestInfoConst.INFO_REQUEST_TIME_FLOAT)
  * [RequestInfoConst.INFO_SECURITY_LEVEL](#RequestInfoConst.INFO_SECURITY_LEVEL)
  * [RequestInfoConst.INFO_USER_INFO](#RequestInfoConst.INFO_USER_INFO)
  * [RequestInfoConst.INFO_RAW_REQUEST](#RequestInfoConst.INFO_RAW_REQUEST)
  * [RequestInfoConst.INFO_RAW_RESPONSE](#RequestInfoConst.INFO_RAW_RESPONSE)
  * [RequestInfoConst.INFO_DERIVED_KEY](#RequestInfoConst.INFO_DERIVED_KEY)
  * [RequestInfoConst.INFO_HAVE_RAW_UPLOAD](#RequestInfoConst.INFO_HAVE_RAW_UPLOAD)
  * [RequestInfoConst.INFO_HAVE_RAW_RESULT](#RequestInfoConst.INFO_HAVE_RAW_RESULT)
  * [RequestInfoConst.INFO_CHANNEL_CONTEXT](#RequestInfoConst.INFO_CHANNEL_CONTEXT)
  * [const: RequestInfoConst.SL_ANONYMOUS](#RequestInfoConst.SL_ANONYMOUS)
  * [const: RequestInfoConst.SL_INFO](#RequestInfoConst.SL_INFO)
  * [const: RequestInfoConst.SL_SAFE_OPS](#RequestInfoConst.SL_SAFE_OPS)
  * [const: RequestInfoConst.SL_PRIVILEGED_OPS](#RequestInfoConst.SL_PRIVILEGED_OPS)
  * [const: RequestInfoConst.SL_EXCEPTIONAL_OPS](#RequestInfoConst.SL_EXCEPTIONAL_OPS)
  * [const: RequestInfoConst.SL_SYSTEM](#RequestInfoConst.SL_SYSTEM)

<a name="new_RequestInfoConst"></a>
##new RequestInfoConst()
Pseudo-class for RequestInfo.info field enumeration

<a name="RequestInfoConst.INFO_X509_CN"></a>
##RequestInfoConst.INFO_X509_CN
CN field coming from validated client's x509 certificate, if any

**Default**: `X509_CN`  
<a name="RequestInfoConst.INFO_PUBKEY"></a>
##RequestInfoConst.INFO_PUBKEY
Client provided public key, if any

**Default**: `PUBKEY`  
<a name="RequestInfoConst.INFO_CLIENT_ADDR"></a>
##RequestInfoConst.INFO_CLIENT_ADDR
Client address

**Default**: `CLIENT_ADDR`  
<a name="RequestInfoConst.INFO_SECURE_CHANNEL"></a>
##RequestInfoConst.INFO_SECURE_CHANNEL
Boolean, indicates if transport channel is secure

**Default**: `SECURE_CHANNEL`  
<a name="RequestInfoConst.INFO_REQUEST_TIME_FLOAT"></a>
##RequestInfoConst.INFO_REQUEST_TIME_FLOAT
Implementation define timestamp of request start.

NOTE:it may not be related to absolute time. Please
see performance-now NPM module.

**Default**: `REQUEST_TIME_FLOAT`  
<a name="RequestInfoConst.INFO_SECURITY_LEVEL"></a>
##RequestInfoConst.INFO_SECURITY_LEVEL
Authentication, but not authorization, security level.

<a name="RequestInfoConst.INFO_USER_INFO"></a>
##RequestInfoConst.INFO_USER_INFO
User Info object

<a name="RequestInfoConst.INFO_RAW_REQUEST"></a>
##RequestInfoConst.INFO_RAW_REQUEST
Raw FutoIn request object

<a name="RequestInfoConst.INFO_RAW_RESPONSE"></a>
##RequestInfoConst.INFO_RAW_RESPONSE
Raw FutoIn response object

<a name="RequestInfoConst.INFO_DERIVED_KEY"></a>
##RequestInfoConst.INFO_DERIVED_KEY
Associated Derived Key

<a name="RequestInfoConst.INFO_HAVE_RAW_UPLOAD"></a>
##RequestInfoConst.INFO_HAVE_RAW_UPLOAD
Indicates that input transport provided raw upload stream.

NOTE: service implementation should simply try to open
RequestInfo.rawInput()

<a name="RequestInfoConst.INFO_HAVE_RAW_RESULT"></a>
##RequestInfoConst.INFO_HAVE_RAW_RESULT
Indicates that Executor must provide raw response

NOTE: service implementation should simply try to open
RequestInfo.rawOutput()

<a name="RequestInfoConst.INFO_CHANNEL_CONTEXT"></a>
##RequestInfoConst.INFO_CHANNEL_CONTEXT
Associated transport channel context

<a name="RequestInfoConst.SL_ANONYMOUS"></a>
##const: RequestInfoConst.SL_ANONYMOUS
Security Level - Anonymous

**Default**: `Anonymous`  
<a name="RequestInfoConst.SL_INFO"></a>
##const: RequestInfoConst.SL_INFO
Security Level - Info

NOTE: it is level of user authentication, but
not authorization. This one is equal to
HTTP cookie-based authentication.

**Default**: `Info`  
<a name="RequestInfoConst.SL_SAFE_OPS"></a>
##const: RequestInfoConst.SL_SAFE_OPS
Security Level - SafeOps

NOTE: it is level of user authentication, but
not authorization. This one is equal to
HTTP Basic Auth.

**Default**: `SafeOps`  
<a name="RequestInfoConst.SL_PRIVILEGED_OPS"></a>
##const: RequestInfoConst.SL_PRIVILEGED_OPS
Security Level - PrivilegedOps

NOTE: it is level of user authentication, but
not authorization. This one equals to
multi-factor authentication and signed requests.

**Default**: `PrivilegedOps`  
<a name="RequestInfoConst.SL_EXCEPTIONAL_OPS"></a>
##const: RequestInfoConst.SL_EXCEPTIONAL_OPS
Security Level - ExceptionalOps

NOTE: it is level of user authentication, but
not authorization. This one equals to
multi-factor authentication for each action and
signed requests.

**Default**: `ExceptionalOps`  
<a name="RequestInfoConst.SL_SYSTEM"></a>
##const: RequestInfoConst.SL_SYSTEM
Security Level - System

NOTE: it is level of user authentication, but
not authorization. This one equals to
internal system authorization. User never gets
such security level.

**Default**: `System`  
<a name="RequestInfo"></a>
#class: RequestInfo
**Members**

* [class: RequestInfo](#RequestInfo)
  * [new RequestInfo()](#new_RequestInfo)
  * [requestInfo.info](#RequestInfo#info)
  * [requestInfo.params()](#RequestInfo#params)
  * [requestInfo.result()](#RequestInfo#result)
  * [requestInfo.rawInput()](#RequestInfo#rawInput)
  * [requestInfo.rawOutput()](#RequestInfo#rawOutput)
  * [requestInfo.executor()](#RequestInfo#executor)
  * [requestInfo.channel()](#RequestInfo#channel)
  * [requestInfo.cancelAfter(time_ms)](#RequestInfo#cancelAfter)

<a name="new_RequestInfo"></a>
##new RequestInfo()
RequestInfo object as defined in FTN6

<a name="RequestInfo#info"></a>
##requestInfo.info
Get reference to info map object

NOTE: reqInfo.info() === reqInfo.info

**Returns**: `object`  
<a name="RequestInfo#params"></a>
##requestInfo.params()
Get reference to input params

**Returns**: `object`  
<a name="RequestInfo#result"></a>
##requestInfo.result()
Get reference to output

**Returns**: `object`  
<a name="RequestInfo#rawInput"></a>
##requestInfo.rawInput()
Get reference to input stream

<a name="RequestInfo#rawOutput"></a>
##requestInfo.rawOutput()
Get reference to output stream

<a name="RequestInfo#executor"></a>
##requestInfo.executor()
Get reference to associated Executor instance

<a name="RequestInfo#channel"></a>
##requestInfo.channel()
Get reference to channel context

<a name="RequestInfo#cancelAfter"></a>
##requestInfo.cancelAfter(time_ms)
Set overall request processing timeout in microseconds.

NOTE: repeat calls override previous value

**Params**

- time_ms `float` - set automatic request timeout after specified
       value of microseconds. 0 - disables timeout  

<a name="SourceAddress"></a>
#class: SourceAddress
**Members**

* [class: SourceAddress](#SourceAddress)
  * [new SourceAddress(type, [host], port)](#new_SourceAddress)
  * [sourceAddress.host](#SourceAddress#host)
  * [sourceAddress.port](#SourceAddress#port)
  * [sourceAddress.type](#SourceAddress#type)
  * [sourceAddress.asString()](#SourceAddress#asString)

<a name="new_SourceAddress"></a>
##new SourceAddress(type, [host], port)
Source Address representation

**Params**

- type `string` - Type of address  
- \[host\] `string` - machine address, if applicable  
- port `integer` | `string` - port or path, if applicable  

<a name="SourceAddress#host"></a>
##sourceAddress.host
Host field

<a name="SourceAddress#port"></a>
##sourceAddress.port
Port field

<a name="SourceAddress#type"></a>
##sourceAddress.type
Type field

<a name="SourceAddress#asString"></a>
##sourceAddress.asString()
Get a stable string representation

<a name="UserInfo"></a>
#class: UserInfo
**Members**

* [class: UserInfo](#UserInfo)
  * [new UserInfo(ccm, local_id, global_id, details)](#new_UserInfo)
  * [userInfo.localID()](#UserInfo#localID)
  * [userInfo.globalID()](#UserInfo#globalID)
  * [userInfo.details(as, [user_field_identifiers])](#UserInfo#details)

<a name="new_UserInfo"></a>
##new UserInfo(ccm, local_id, global_id, details)
Class representing user information

**Params**

- ccm `AdvancedCCM` - reference to CCM  
- local_id `integer` - local unique ID  
- global_id `string` - global unique ID  
- details `object` - user info fields, see UserInfoConst  

<a name="UserInfo#localID"></a>
##userInfo.localID()
Get local unique ID

**Returns**: `integer`  
<a name="UserInfo#globalID"></a>
##userInfo.globalID()
Get local global ID

**Returns**: `string`  
<a name="UserInfo#details"></a>
##userInfo.details(as, [user_field_identifiers])
Get user info details

**Params**

- as `AsyncSteps`  
- \[user_field_identifiers\] `object` - field list to get  

**Returns**: `AsyncSteps` - for easy chaining. {object} with details through as.success()  
<a name="BasicAuthFace"></a>
#BasicAuthFace()
BasicAuth is not official spec - it is a temporary solution
until FTN8 Security Concept is finalized

<a name="BasicAuthService"></a>
#BasicAuthService()
BasicService is not official spec - it is a temporary solution
until FTN8 Security Concept is finalized

<a name="UserInfoConst"></a>
#UserInfoConst
Pseudo-class for documenting UserInfo detail fields as
defined in FTN8 spec

<a name="FutoInExecutor"></a>
#FutoInExecutor
**window.FutoInExecutor** - Browser-only reference to futoin-executor

<a name="Executor"></a>
#Executor
**window.futoin.Executor** - Browser-only reference to futoin-executor

<a name="BrowserExecutor"></a>
#BrowserExecutor
**window.BrowserExecutor** - Browser-only reference to
futoin-executor.BrowserExecutor




*documented by [jsdoc-to-markdown](https://github.com/75lb/jsdoc-to-markdown)*.


