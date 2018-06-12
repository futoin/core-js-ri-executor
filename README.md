
  [![NPM Version](https://img.shields.io/npm/v/futoin-executor.svg?style=flat)](https://www.npmjs.com/package/futoin-executor)
  [![NPM Downloads](https://img.shields.io/npm/dm/futoin-executor.svg?style=flat)](https://www.npmjs.com/package/futoin-executor)
  [![Build Status](https://travis-ci.org/futoin/core-js-ri-executor.svg?branch=master)](https://travis-ci.org/futoin/core-js-ri-executor)
  [![stable](https://img.shields.io/badge/stability-stable-green.svg?style=flat)](https://www.npmjs.com/package/futoin-executor)

  [![NPM](https://nodei.co/npm/futoin-executor.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/futoin-executor/)

**[Stability: 3 - Stable](http://nodejs.org/api/documentation.html)**


# About


**Documentation** --> [FutoIn Guide](https://futoin.org/docs/microservices/)

FutoIn Executor is a peer which processes a request - handles a FutoIn interface method
as described in [FTN3: FutoIn Interface Definition](http://specs.futoin.org/final/preview/ftn3_iface_definition.html).
It is not necessary a server - e.g. client may handle callback request from server.

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

# Features

* Microservice implementation with zero boilerplates
* Easy scaling from single monolithic process to cluster per microservice
* Universal in-process, WebSockets and HTTP request handling
* REST-like HTTP integration (mapping of path components and parameters to message structure)
* Raw data for request and response (with HTTP fallback)
* Callback requests for bi-directional channels like (WebSockets, in-process)
* Advanced fair resource usage / DoS protection limits based on client source address
    * message limit control
    * max concurrent requests with queuing limits
    * max requests per period with queuing limits
    * optional limit aggregation per network address prefix
    * advanced efficient limit config selection using [futoin-ipset](https://github.com/futoin/util-js-ipset)
* API specification enforcement (defined in human-friendly FTN3 format)
    * works even for in-process calls and covers JS type safety issues
    * checks parameters with optional default value substitution
    * checks result
    * checks advanced message lengths as per FTN3 v1.8
    * checks exception types to avoid exposure of internal information
    * strict semver-like interface versioning - implicit backward compatibility support
    * transport security, authentication and authorization are integrated as well
    * optional HMAC signing
* High performance and low memory usage

# FutoIn reference implementation

Reference implementation of:
 
    FTN6: FutoIn Executor Concept
    Version: 1.7

    FTN3: FutoIn Interface Definition
    Version: 1.9

    FTN5: FutoIn HTTP integration
    Version: 1.3

    FTN4: FutoIn Interface - Ping-Pong
    Version: 1.0 (service)

    
* Spec: [FTN6: Interface Executor Concept v1.x](http://specs.futoin.org/final/preview/ftn6_iface_executor_concept-1.html)
* Spec: [FTN3: FutoIn Interface Definition v1.x](http://specs.futoin.org/final/preview/ftn3_iface_definition.html)
* Spec: [FTN5: FutoIn HTTP integration v1.x](http://specs.futoin.org/final/preview/ftn5_iface_http_integration.html)
* Spec: [FTN4: FutoIn Interface - Ping-Pong v1.x](http://specs.futoin.org/final/preview/ftn4_if_ping.html)

Author: [Andrey Galkin](mailto:andrey@futoin.org)


# Installation for Node.js

Command line:
```sh
$ npm install futoin-executor --save
```
or
```sh
$ yarn add futoin-executor
```

*Hint: checkout [FutoIn CID](https://github.com/futoin/cid-tool) for all tools setup.*

All public classes can be accessed through module:
```javascript
var Executor = require('futoin-executor').Executor;
```

or included modular way, e.g.:
```javascript
var Executor = require('futoin-executor/Executor');
```


# Browser installation

Pre-built ES5 CJS modules are available under `es5/`. These modules
can be used with `webpack` without transpiler - default "browser" entry point
points to ES5 version.

Webpack dists are also available under `dist/` folder, but their usage should be limited
to sites without build process.

*Warning: check AsyncSteps and AsyncEvent polyfill for older browsers.*

*The following globals are available*:

* SimpleCCM - global reference to futoin-invoker.SimpleCCM class
* AdvancedCCM - global reference to futoin-invoker.AdvancedCCM class
* futoin.Invoker - global reference to futoin-invoker module


# Examples

The best examples are live projects:

* [futoin-database](https://github.com/futoin/core-js-ri-database) - neutral database query & transaction concept
* [futoin-eventstream](https://github.com/futoin/core-js-ri-eventstream) - DB transaction focused event system
* [futoin-xferengine](https://github.com/futoin/core-js-ri-xferengine) - very complex bank-grade financial transaction engine

Please note that the examples here expect interface definition files
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

## Modules

<dl>
<dt><a href="#module_futoin-executor">futoin-executor</a></dt>
<dd></dd>
</dl>

## Classes

<dl>
<dt><a href="#BasicAuthFace">BasicAuthFace</a></dt>
<dd><p>BasicAuth is not official spec - it is a temporary solution
until FTN8 Security Concept is finalized</p>
</dd>
<dt><a href="#BasicAuthService">BasicAuthService</a></dt>
<dd><p>BasicService is not official spec - it is a temporary solution
until FTN8 Security Concept is finalized</p>
</dd>
<dt><a href="#BrowserExecutorOptions">BrowserExecutorOptions</a> ⇐ <code><a href="#ExecutorOptions">ExecutorOptions</a></code></dt>
<dd></dd>
<dt><a href="#BrowserExecutor">BrowserExecutor</a></dt>
<dd><p>Browser Executor with HTML5 Web Messaging as incoming transport.</p>
<p>It allows communication across open pages (frames/tabs/windows) inside client browser.</p>
</dd>
<dt><a href="#ChannelContext">ChannelContext</a></dt>
<dd><p>Channel Context normally accessible through RequestInfo object.</p>
</dd>
<dt><a href="#DerivedKey">DerivedKey</a></dt>
<dd><p>Derived Key interface for planned FTN8 Master key management.</p>
<p>A dummy so far.</p>
</dd>
<dt><a href="#ExecutorOptions">ExecutorOptions</a></dt>
<dd></dd>
<dt><a href="#Executor">Executor</a></dt>
<dd><p>An abstract core implementing pure FTN6 Executor logic.</p>
</dd>
<dt><a href="#LegacySecurityProvider">LegacySecurityProvider</a></dt>
<dd><p>This functionality is provided to provide historical not standard BasicAuth
interface. Use of this approach is discouraged.</p>
</dd>
<dt><a href="#NodeExecutorOptions">NodeExecutorOptions</a> ⇐ <code><a href="#ExecutorOptions">ExecutorOptions</a></code></dt>
<dd></dd>
<dt><a href="#NodeExecutor">NodeExecutor</a></dt>
<dd><p>Executor implementation for Node.js/io.js with HTTP and WebSockets transport</p>
</dd>
<dt><a href="#PingService">PingService</a></dt>
<dd><p>Implementation of futoin.ping &amp; futoin.anonping interface</p>
<p>Designed to be used as imported part of larger interfaces.</p>
</dd>
<dt><a href="#RequestInfoConst">RequestInfoConst</a></dt>
<dd></dd>
<dt><a href="#RequestInfo">RequestInfo</a></dt>
<dd><p>RequestInfo object as defined in FTN6</p>
</dd>
<dt><a href="#SecurityProvider">SecurityProvider</a></dt>
<dd><p>Generic security provider interface</p>
</dd>
<dt><a href="#SourceAddress">SourceAddress</a></dt>
<dd><p>Source Address representation</p>
</dd>
<dt><a href="#UserInfo">UserInfo</a></dt>
<dd><p>Class representing user information</p>
</dd>
</dl>

## Members

<dl>
<dt><a href="#FutoInExecutor">FutoInExecutor</a></dt>
<dd><p><strong>window.FutoInExecutor</strong> - Browser-only reference to futoin-executor</p>
</dd>
<dt><a href="#Executor">Executor</a></dt>
<dd><p><strong>window.futoin.Executor</strong> - Browser-only reference to futoin-executor</p>
</dd>
<dt><a href="#BrowserExecutor">BrowserExecutor</a></dt>
<dd><p><strong>window.BrowserExecutor</strong> - Browser-only reference to
futoin-executor.BrowserExecutor</p>
</dd>
</dl>

## Constants

<dl>
<dt><a href="#UserInfoConst">UserInfoConst</a></dt>
<dd><p>Pseudo-class for documenting UserInfo detail fields as
defined in FTN8 spec</p>
</dd>
</dl>

<a name="module_futoin-executor"></a>

## futoin-executor
<a name="BasicAuthFace"></a>

## BasicAuthFace
BasicAuth is not official spec - it is a temporary solution
until FTN8 Security Concept is finalized

**Kind**: global class  
<a name="BasicAuthFace.register"></a>

### BasicAuthFace.register(as, ccm, endpoint, [credentials], [options])
BasicAuth interface registration helper

**Kind**: static method of [<code>BasicAuthFace</code>](#BasicAuthFace)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| as | <code>AsyncSteps</code> |  | step interface |
| ccm | <code>AdvancedCCM</code> |  | CCM instance |
| endpoint | <code>string</code> |  | endpoint URL |
| [credentials] | <code>\*</code> | <code></code> | see CCM register() |
| [options] | <code>object</code> | <code>{}</code> | registration options |
| [options.version] | <code>string</code> | <code>&quot;1.0&quot;</code> | iface version |

<a name="BasicAuthService"></a>

## BasicAuthService
BasicService is not official spec - it is a temporary solution
until FTN8 Security Concept is finalized

**Kind**: global class  

* [BasicAuthService](#BasicAuthService)
    * _instance_
        * [.addUser(user, secret, details, [system_user])](#BasicAuthService+addUser)
        * [._getUser(as, user)](#BasicAuthService+_getUser)
        * [._getUserByID(as, local_id)](#BasicAuthService+_getUserByID)
        * [.addUser(user, secret, details, [system_user])](#BasicAuthService+addUser)
    * _static_
        * [.register(as, executor)](#BasicAuthService.register) ⇒ [<code>BasicAuthService</code>](#BasicAuthService)

<a name="BasicAuthService+addUser"></a>

### basicAuthService.addUser(user, secret, details, [system_user])
Register users statically right after registration

**Kind**: instance method of [<code>BasicAuthService</code>](#BasicAuthService)  

| Param | Type | Description |
| --- | --- | --- |
| user | <code>string</code> | user name |
| secret | <code>string</code> | user secret (either password or raw key for HMAC) |
| details | <code>object</code> | user details the way as defined in FTN8 |
| [system_user] | <code>boolean</code> | is system user |

<a name="BasicAuthService+_getUser"></a>

### basicAuthService._getUser(as, user)
Get by name. Override, if needed.

**Kind**: instance method of [<code>BasicAuthService</code>](#BasicAuthService)  
**Note**: as result: {object} user object or null (through as)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| user | <code>string</code> | user name |

<a name="BasicAuthService+_getUserByID"></a>

### basicAuthService._getUserByID(as, local_id)
Get by ID. Override, if needed.

**Kind**: instance method of [<code>BasicAuthService</code>](#BasicAuthService)  
**Note**: as result: {object} user object or null (through as)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interfaces |
| local_id | <code>number</code> | local ID |

<a name="BasicAuthService+addUser"></a>

### basicAuthService.addUser(user, secret, details, [system_user])
Register users statically right after registration

**Kind**: instance method of [<code>BasicAuthService</code>](#BasicAuthService)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| user | <code>string</code> |  | user name |
| secret | <code>string</code> |  | user secret (either password or raw key for HMAC) |
| details | <code>object</code> |  | user details the way as defined in FTN8 |
| [system_user] | <code>boolean</code> | <code>false</code> | is system user |

<a name="BasicAuthService.register"></a>

### BasicAuthService.register(as, executor) ⇒ [<code>BasicAuthService</code>](#BasicAuthService)
BasicAuthService registration helper

**Kind**: static method of [<code>BasicAuthService</code>](#BasicAuthService)  
**Returns**: [<code>BasicAuthService</code>](#BasicAuthService) - reference to implementation instance (to register users)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| executor | [<code>Executor</code>](#Executor) | executor instance |

<a name="BrowserExecutorOptions"></a>

## BrowserExecutorOptions ⇐ [<code>ExecutorOptions</code>](#ExecutorOptions)
**Kind**: global class  
**Extends**: [<code>ExecutorOptions</code>](#ExecutorOptions)  

* [BrowserExecutorOptions](#BrowserExecutorOptions) ⇐ [<code>ExecutorOptions</code>](#ExecutorOptions)
    * [new BrowserExecutorOptions()](#new_BrowserExecutorOptions_new)
    * [.clientTimeoutMS](#BrowserExecutorOptions.clientTimeoutMS)
    * [.allowedOrigins](#BrowserExecutorOptions.allowedOrigins)

<a name="new_BrowserExecutorOptions_new"></a>

### new BrowserExecutorOptions()
Pseudo-class for BrowserExecutor options documentation

<a name="BrowserExecutorOptions.clientTimeoutMS"></a>

### BrowserExecutorOptions.clientTimeoutMS
Client timeout MS

**Kind**: static property of [<code>BrowserExecutorOptions</code>](#BrowserExecutorOptions)  
**Default**: <code>600</code>  
<a name="BrowserExecutorOptions.allowedOrigins"></a>

### BrowserExecutorOptions.allowedOrigins
List of allowed page origins for incoming connections.
It is MANDATORY for security reasons.

Example:
* 'http://localhost:8000'
* 'http://example.com'

**Kind**: static property of [<code>BrowserExecutorOptions</code>](#BrowserExecutorOptions)  
**Default**: <code>[]</code>  
<a name="BrowserExecutor"></a>

## BrowserExecutor
Browser Executor with HTML5 Web Messaging as incoming transport.

It allows communication across open pages (frames/tabs/windows) inside client browser.

**Kind**: global class  
<a name="new_BrowserExecutor_new"></a>

### new BrowserExecutor(ccm, opts)

| Param | Type | Description |
| --- | --- | --- |
| ccm | <code>AdvancedCCM</code> | CCM ref |
| opts | [<code>BrowserExecutorOptions</code>](#BrowserExecutorOptions) | executor options |

<a name="ChannelContext"></a>

## ChannelContext
Channel Context normally accessible through RequestInfo object.

**Kind**: global class  

* [ChannelContext](#ChannelContext)
    * [new ChannelContext(executor)](#new_ChannelContext_new)
    * *[.type()](#ChannelContext+type) ⇒ <code>string</code>*
    * [.isStateful()](#ChannelContext+isStateful) ⇒ <code>Boolean</code>
    * [.onInvokerAbort(callable, [user_data])](#ChannelContext+onInvokerAbort)
    * [.register(as, ifacever, options)](#ChannelContext+register)
    * [.iface(ifacever)](#ChannelContext+iface) ⇒ <code>NativeIface</code>

<a name="new_ChannelContext_new"></a>

### new ChannelContext(executor)

| Param | Type | Description |
| --- | --- | --- |
| executor | [<code>Executor</code>](#Executor) | reference to associated executor |

<a name="ChannelContext+type"></a>

### *channelContext.type() ⇒ <code>string</code>*
Get type of channel

Standard values: HTTP, WS, BROWSER, TCP, UDP, UNIX

**Kind**: instance abstract method of [<code>ChannelContext</code>](#ChannelContext)  
**Returns**: <code>string</code> - arbitrary string, see FTN6  
<a name="ChannelContext+isStateful"></a>

### channelContext.isStateful() ⇒ <code>Boolean</code>
Check if transport is stateful (e.g. WebSockets)

**Kind**: instance method of [<code>ChannelContext</code>](#ChannelContext)  
**Returns**: <code>Boolean</code> - true, if context object is persistent across
requests in the same session  
<a name="ChannelContext+onInvokerAbort"></a>

### channelContext.onInvokerAbort(callable, [user_data])
Set invoker abort handler.

NOTE: It should be possible to call multiple times setting
multiple callbacks

**Kind**: instance method of [<code>ChannelContext</code>](#ChannelContext)  

| Param | Type | Description |
| --- | --- | --- |
| callable | <code>function</code> | callback |
| [user_data] | <code>any</code> | optional parameter to pass to callable |

<a name="ChannelContext+register"></a>

### channelContext.register(as, ifacever, options)
Register Invoker interface on bi-directional channels to make
calls from Server to Client.

**Kind**: instance method of [<code>ChannelContext</code>](#ChannelContext)  
**See**: AdvancedCCM.register  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| ifacever | <code>string</code> | standard iface:version notation |
| options | <code>object</code> | standard Invoker options |

<a name="ChannelContext+iface"></a>

### channelContext.iface(ifacever) ⇒ <code>NativeIface</code>
Get previously registered interface on bi-directional channel.

NOTE: unlike CCM, there is no point for local alias name as Invoker
can have only a single ClientExecutor which can have only a single
instance implementing specified iface:version.

**Kind**: instance method of [<code>ChannelContext</code>](#ChannelContext)  
**Returns**: <code>NativeIface</code> - - native interface  
**See**: AdvancedCCM.iface  

| Param | Type | Description |
| --- | --- | --- |
| ifacever | <code>string</code> | standard iface:version notation |

<a name="DerivedKey"></a>

## DerivedKey
Derived Key interface for planned FTN8 Master key management.

A dummy so far.

**Kind**: global class  

* [DerivedKey](#DerivedKey)
    * [new DerivedKey(ccm, base_id, sequence_id)](#new_DerivedKey_new)
    * [.baseID()](#DerivedKey+baseID) ⇒ <code>integer</code>
    * [.sequenceID()](#DerivedKey+sequenceID) ⇒ <code>integer</code>
    * [.encrypt(as, data)](#DerivedKey+encrypt) ⇒ <code>Buffer</code>
    * [.decrypt(as, data)](#DerivedKey+decrypt) ⇒ <code>Buffer</code>

<a name="new_DerivedKey_new"></a>

### new DerivedKey(ccm, base_id, sequence_id)

| Param | Type | Description |
| --- | --- | --- |
| ccm | <code>AdvancedCCM</code> | reference to CCM |
| base_id | <code>integer</code> | master key ID |
| sequence_id | <code>integer</code> | sequence number of the derived key |

<a name="DerivedKey+baseID"></a>

### derivedKey.baseID() ⇒ <code>integer</code>
Get master key ID

**Kind**: instance method of [<code>DerivedKey</code>](#DerivedKey)  
**Returns**: <code>integer</code> - Base ID  
<a name="DerivedKey+sequenceID"></a>

### derivedKey.sequenceID() ⇒ <code>integer</code>
Get derived key sequence ID

**Kind**: instance method of [<code>DerivedKey</code>](#DerivedKey)  
**Returns**: <code>integer</code> - Sequence ID  
<a name="DerivedKey+encrypt"></a>

### derivedKey.encrypt(as, data) ⇒ <code>Buffer</code>
Encrypt data with current derived key. Useful
for very senstive information.

**Kind**: instance method of [<code>DerivedKey</code>](#DerivedKey)  
**Returns**: <code>Buffer</code> - encrypted data  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| data | <code>string</code> \| <code>Buffer</code> | to encrypt |

<a name="DerivedKey+decrypt"></a>

### derivedKey.decrypt(as, data) ⇒ <code>Buffer</code>
Decrypt data using current derived key

**Kind**: instance method of [<code>DerivedKey</code>](#DerivedKey)  
**Returns**: <code>Buffer</code> - decrypted data  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| data | <code>Buffer</code> | to decrypt |

<a name="ExecutorOptions"></a>

## ExecutorOptions
**Kind**: global class  

* [ExecutorOptions](#ExecutorOptions)
    * [new ExecutorOptions()](#new_ExecutorOptions_new)
    * [.specDirs](#ExecutorOptions.specDirs)
    * [.prodMode](#ExecutorOptions.prodMode)
    * [.reqTimeout](#ExecutorOptions.reqTimeout)
    * [.heavyReqTimeout](#ExecutorOptions.heavyReqTimeout)
    * [.securityProvider](#ExecutorOptions.securityProvider)
    * [.messageSniffer()](#ExecutorOptions.messageSniffer)

<a name="new_ExecutorOptions_new"></a>

### new ExecutorOptions()
Pseudo-class for Executor options documentation

<a name="ExecutorOptions.specDirs"></a>

### ExecutorOptions.specDirs
Search dirs for spec definition or spec instance directly. It can
be single value or array of values. Each value is either path/URL (string) or
iface spec instance (object).

**Kind**: static property of [<code>ExecutorOptions</code>](#ExecutorOptions)  
**Default**: <code>[]</code>  
<a name="ExecutorOptions.prodMode"></a>

### ExecutorOptions.prodMode
Production mode - disables some checks without compomising security

**Kind**: static property of [<code>ExecutorOptions</code>](#ExecutorOptions)  
**Default**: <code>false</code>  
<a name="ExecutorOptions.reqTimeout"></a>

### ExecutorOptions.reqTimeout
Default request processing timeout

**Kind**: static property of [<code>ExecutorOptions</code>](#ExecutorOptions)  
**Default**: <code>5000</code>  
<a name="ExecutorOptions.heavyReqTimeout"></a>

### ExecutorOptions.heavyReqTimeout
Default request processing timeout for functions
marked "heavy". See FTN3

**Kind**: static property of [<code>ExecutorOptions</code>](#ExecutorOptions)  
**Default**: <code>60000</code>  
<a name="ExecutorOptions.securityProvider"></a>

### ExecutorOptions.securityProvider
FTN8 security interface

**Kind**: static property of [<code>ExecutorOptions</code>](#ExecutorOptions)  
<a name="ExecutorOptions.messageSniffer"></a>

### ExecutorOptions.messageSniffer()
Message sniffer callback( iface_info, msg, is_incomming ).
Useful for audit logging.

**Kind**: static method of [<code>ExecutorOptions</code>](#ExecutorOptions)  
**Default**: <code>dummy</code>  
<a name="Executor"></a>

## Executor
An abstract core implementing pure FTN6 Executor logic.

**Kind**: global class  

* [Executor](#Executor)
    * [new Executor(ccm, opts)](#new_Executor_new)
    * [.ccm()](#Executor+ccm) ⇒ <code>AdvancedCCM</code>
    * [.register(as, ifacever, impl, specdirs)](#Executor+register)
    * [.onEndpointRequest(info, ftnreq, send_executor_rsp)](#Executor+onEndpointRequest)
    * [.onInternalRequest(as, info, ftnreq, [upload_data], [download_stream])](#Executor+onInternalRequest)
    * [.process(as)](#Executor+process)
    * [.checkAccess(as, acd)](#Executor+checkAccess)
    * [.initFromCache(as)](#Executor+initFromCache)
    * [.cacheInit(as)](#Executor+cacheInit)
    * [.close([close_cb])](#Executor+close)
    * [.packPayload(coder, msg)](#Executor+packPayload) ⇒ <code>string</code>
    * ["ready"](#Executor+event_ready)
    * ["request"](#Executor+event_request)
    * ["response"](#Executor+event_response)
    * ["notExpected"](#Executor+event_notExpected)
    * ["close"](#Executor+event_close)

<a name="new_Executor_new"></a>

### new Executor(ccm, opts)

| Param | Type | Description |
| --- | --- | --- |
| ccm | <code>AdvancedCCM</code> | instance of AdvancedCCM |
| opts | <code>objects</code> | see ExecutorOptions |

<a name="Executor+ccm"></a>

### executor.ccm() ⇒ <code>AdvancedCCM</code>
Get reference to associated AdvancedCCM instance

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Returns**: <code>AdvancedCCM</code> - CCM ref  
<a name="Executor+register"></a>

### executor.register(as, ifacever, impl, specdirs)
Register implementation of specific interface

**Kind**: instance method of [<code>Executor</code>](#Executor)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| ifacever | <code>string</code> | standard iface:version notation of interface        to be implemented. |
| impl | <code>object</code> \| <code>function</code> | either iface implementation or func( impl, executor ) |
| specdirs | <code>object</code> \| <code>array</code> | NOT STANDARD. Useful for direct passing of hardcoded spec definition. |

<a name="Executor+onEndpointRequest"></a>

### executor.onEndpointRequest(info, ftnreq, send_executor_rsp)
Entry point for Server-originated requests when acting as ClientExecutor

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Emits**: [<code>notExpected</code>](#Executor+event_notExpected), [<code>request</code>](#Executor+event_request), [<code>response</code>](#Executor+event_response)  

| Param | Type | Description |
| --- | --- | --- |
| info | <code>object</code> | raw Invoker interface info |
| ftnreq | <code>object</code> | FutoIn request object |
| send_executor_rsp | <code>function</code> | callback( ftnrsp ) |

<a name="Executor+onInternalRequest"></a>

### executor.onInternalRequest(as, info, ftnreq, [upload_data], [download_stream])
Entry point for in-program originated requests. Process with maximum efficiency (not yet ;)

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Emits**: [<code>notExpected</code>](#Executor+event_notExpected), [<code>request</code>](#Executor+event_request), [<code>response</code>](#Executor+event_response)  
**Note**: AS result: ftnrsp, content-type  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| info | <code>object</code> | raw Invoker interface info |
| ftnreq | <code>object</code> | FutoIn request object |
| [upload_data] | <code>object</code> | upload stream, if any |
| [download_stream] | <code>object</code> | download stream, if any |

<a name="Executor+process"></a>

### executor.process(as)
Standard entry point used by subclasses.
Do full cycle of request processing, including all security checks

NOTE: as.state.reqinfo must point to valid instance of RequestInfo

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Emits**: [<code>notExpected</code>](#Executor+event_notExpected), [<code>request</code>](#Executor+event_request), [<code>response</code>](#Executor+event_response)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |

<a name="Executor+checkAccess"></a>

### executor.checkAccess(as, acd)
Shortcut to check access through #acl interface.

NOTE: as.state.reqinfo must point to valid instance of RequestInfo

**Kind**: instance method of [<code>Executor</code>](#Executor)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| acd | <code>string</code> | access control descriptor |

<a name="Executor+initFromCache"></a>

### executor.initFromCache(as)
NOT IMPLEMENTED, DO NOT USE. Just a compliance with the Executor interface
from spec.

**Kind**: instance method of [<code>Executor</code>](#Executor)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |

<a name="Executor+cacheInit"></a>

### executor.cacheInit(as)
NOT IMPLEMENTED, DO NOT USE. Just a compliance with the Executor interface
from spec.

**Kind**: instance method of [<code>Executor</code>](#Executor)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |

<a name="Executor+close"></a>

### executor.close([close_cb])
Shutdown Executor and stop whole processing

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Emits**: [<code>close</code>](#Executor+event_close)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [close_cb] | <code>callable</code> | <code></code> | callback to execute after Executor shutdown |

<a name="Executor+packPayload"></a>

### executor.packPayload(coder, msg) ⇒ <code>string</code>
Not standard. Pack message object into JSON representation.
If safe limit of 64K is exceeded  then error is raised.

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Returns**: <code>string</code> - string representation of the message  
**Emits**: [<code>notExpected</code>](#Executor+event_notExpected)  

| Param | Type | Description |
| --- | --- | --- |
| coder | <code>MessageCoder</code> | message coder instance |
| msg | <code>object</code> | message to encode into JSON |

<a name="Executor+event_ready"></a>

### "ready"
May be fired in derived Executors to signal readiness
()

**Kind**: event emitted by [<code>Executor</code>](#Executor)  
<a name="Executor+event_request"></a>

### "request"
Fired when request processing is started.
( reqinfo, rawreq )

**Kind**: event emitted by [<code>Executor</code>](#Executor)  
<a name="Executor+event_response"></a>

### "response"
Fired when request processing is started.
( reqinfo, rawreq )

**Kind**: event emitted by [<code>Executor</code>](#Executor)  
<a name="Executor+event_notExpected"></a>

### "notExpected"
Fired when not expected error occurs
( errmsg, error_info, last_exception, async_stack )

**Kind**: event emitted by [<code>Executor</code>](#Executor)  
<a name="Executor+event_close"></a>

### "close"
Fired when Executor is shutting down.
()

**Kind**: event emitted by [<code>Executor</code>](#Executor)  
<a name="LegacySecurityProvider"></a>

## LegacySecurityProvider
This functionality is provided to provide historical not standard BasicAuth
interface. Use of this approach is discouraged.

**Kind**: global class  
<a name="new_LegacySecurityProvider_new"></a>

### new LegacySecurityProvider(as, ccm, secprov)
C-tor


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| as | <code>AsyncSteps</code> |  | AsyncSteps interface |
| ccm | <code>AdvancedCCM</code> |  | CCM instance |
| secprov | [<code>SecurityProvider</code>](#SecurityProvider) | <code></code> | optional secprov for chaining |

<a name="NodeExecutorOptions"></a>

## NodeExecutorOptions ⇐ [<code>ExecutorOptions</code>](#ExecutorOptions)
**Kind**: global class  
**Extends**: [<code>ExecutorOptions</code>](#ExecutorOptions)  

* [NodeExecutorOptions](#NodeExecutorOptions) ⇐ [<code>ExecutorOptions</code>](#ExecutorOptions)
    * [new NodeExecutorOptions()](#new_NodeExecutorOptions_new)
    * [.httpServer](#NodeExecutorOptions.httpServer)
    * [.httpAddr](#NodeExecutorOptions.httpAddr)
    * [.httpPort](#NodeExecutorOptions.httpPort)
    * [.httpPath](#NodeExecutorOptions.httpPath)
    * [.httpBacklog](#NodeExecutorOptions.httpBacklog)
    * [.secureChannel](#NodeExecutorOptions.secureChannel)
    * [.trustProxy](#NodeExecutorOptions.trustProxy)
    * [.enableLimiter](#NodeExecutorOptions.enableLimiter)
    * [.cleanupLimitsMS](#NodeExecutorOptions.cleanupLimitsMS)
    * [.limitCacheSize](#NodeExecutorOptions.limitCacheSize)
    * [.limitConf](#NodeExecutorOptions.limitConf)
    * [.addressLimitMap](#NodeExecutorOptions.addressLimitMap)
    * [.secureObjectPrototype](#NodeExecutorOptions.secureObjectPrototype)

<a name="new_NodeExecutorOptions_new"></a>

### new NodeExecutorOptions()
Pseudo-class for NodeExecutor options documentation

<a name="NodeExecutorOptions.httpServer"></a>

### NodeExecutorOptions.httpServer
Provide a pre-configured HTTP server instance or
use httpPort [& httpAddr] options

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code></code>  
<a name="NodeExecutorOptions.httpAddr"></a>

### NodeExecutorOptions.httpAddr
Bind address for internally created HTTP server

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code></code>  
<a name="NodeExecutorOptions.httpPort"></a>

### NodeExecutorOptions.httpPort
Bind port for internally created HTTP server

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code></code>  
<a name="NodeExecutorOptions.httpPath"></a>

### NodeExecutorOptions.httpPath
Path to server FutoIn request on.

NOTE: if httpServer is provided than all not related
requests are silently ignored. Otherwise, immediate
error is raised if request path does not match httpPath.

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code>/</code>  
<a name="NodeExecutorOptions.httpBacklog"></a>

### NodeExecutorOptions.httpBacklog
Option to configure internally created server backlog

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code></code>  
<a name="NodeExecutorOptions.secureChannel"></a>

### NodeExecutorOptions.secureChannel
If true, if incoming transport as seen is 'SecureChannel', see FTN3.
Useful with reverse proxy and local connections.

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code>false</code>  
<a name="NodeExecutorOptions.trustProxy"></a>

### NodeExecutorOptions.trustProxy
If true, X-Real-IP and X-Forwarded-For will be used as Source Address, if present

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code>false</code>  
<a name="NodeExecutorOptions.enableLimiter"></a>

### NodeExecutorOptions.enableLimiter
If true, then request limiter is enabled by default

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code>false</code>  
<a name="NodeExecutorOptions.cleanupLimitsMS"></a>

### NodeExecutorOptions.cleanupLimitsMS
Interval to run limiter cleanup task for better cache performance and
correct reflection of active memory usage.

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code>60000</code>  
<a name="NodeExecutorOptions.limitCacheSize"></a>

### NodeExecutorOptions.limitCacheSize
Auto-detected based posix.getrlimit('nofiles')

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code></code>  
<a name="NodeExecutorOptions.limitConf"></a>

### NodeExecutorOptions.limitConf
Startup configuration for NodeExecutor#limitConf().
Please mind it's per v4/v6 scope (prefix length).

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code>{&quot;default&quot;:&quot;&quot;}</code>  
<a name="NodeExecutorOptions.addressLimitMap"></a>

### NodeExecutorOptions.addressLimitMap
Startup configuration for NodeExecutor#addressLimitMap()

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code>{}</code>  
<a name="NodeExecutorOptions.secureObjectPrototype"></a>

### NodeExecutorOptions.secureObjectPrototype
Controls if SpecTools.secureObjectPrototype() is called upon startup.

**Kind**: static property of [<code>NodeExecutorOptions</code>](#NodeExecutorOptions)  
**Default**: <code>true</code>  
<a name="NodeExecutor"></a>

## NodeExecutor
Executor implementation for Node.js/io.js with HTTP and WebSockets transport

**Kind**: global class  

* [NodeExecutor](#NodeExecutor)
    * [new NodeExecutor(ccm, opts)](#new_NodeExecutor_new)
    * [.limitsIPSet](#NodeExecutor+limitsIPSet) ⇒ <code>IPSet</code>
    * [.handleHTTPRequest(req, rsp)](#NodeExecutor+handleHTTPRequest) ⇒ <code>Boolean</code>
    * [.handleWSConnection(upgrade_req, ws)](#NodeExecutor+handleWSConnection)
    * [.limitConf(name, options)](#NodeExecutor+limitConf)
    * [.addressLimitMap(map)](#NodeExecutor+addressLimitMap)

<a name="new_NodeExecutor_new"></a>

### new NodeExecutor(ccm, opts)

| Param | Type | Description |
| --- | --- | --- |
| ccm | <code>AdvancedCCM</code> | CCM for internal requests |
| opts | [<code>NodeExecutorOptions</code>](#NodeExecutorOptions) | executor options |

<a name="NodeExecutor+limitsIPSet"></a>

### nodeExecutor.limitsIPSet ⇒ <code>IPSet</code>
Access address-limit name ipset for efficient dynamic manipulation

**Kind**: instance property of [<code>NodeExecutor</code>](#NodeExecutor)  
**Returns**: <code>IPSet</code> - - ref to static address to limit mapping  
<a name="NodeExecutor+handleHTTPRequest"></a>

### nodeExecutor.handleHTTPRequest(req, rsp) ⇒ <code>Boolean</code>
Entry point to process HTTP request

**Kind**: instance method of [<code>NodeExecutor</code>](#NodeExecutor)  
**Returns**: <code>Boolean</code> - true on success  

| Param | Type | Description |
| --- | --- | --- |
| req | <code>http.IncomingMessage</code> | incoming HTTP request |
| rsp | <code>http.ServerResponse</code> | response object |

<a name="NodeExecutor+handleWSConnection"></a>

### nodeExecutor.handleWSConnection(upgrade_req, ws)
Entry point to process HTTP upgrade request with WebSocket

**Kind**: instance method of [<code>NodeExecutor</code>](#NodeExecutor)  

| Param | Type | Description |
| --- | --- | --- |
| upgrade_req | <code>http.IncomingMessage</code> | original HTTP upgrade request |
| ws | <code>WebSocket</code> | WebSockets connection object |

<a name="NodeExecutor+limitConf"></a>

### nodeExecutor.limitConf(name, options)
Configure named limits to be used for client's request limiting.

**Kind**: instance method of [<code>NodeExecutor</code>](#NodeExecutor)  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | name of limit configuration |
| options | <code>object</code> | see AsyncSteps Limiter class |

<a name="NodeExecutor+addressLimitMap"></a>

### nodeExecutor.addressLimitMap(map)
Configure static address to limit name map

**Kind**: instance method of [<code>NodeExecutor</code>](#NodeExecutor)  

| Param | Type | Description |
| --- | --- | --- |
| map | <code>object</code> | limit-name => list of CIDR addresses pairs |

<a name="PingService"></a>

## PingService
Implementation of futoin.ping & futoin.anonping interface

Designed to be used as imported part of larger interfaces.

**Kind**: global class  
<a name="PingService.register"></a>

### PingService.register(as, executor) ⇒ [<code>PingService</code>](#PingService)
Register futoin.ping interface with Executor

**Kind**: static method of [<code>PingService</code>](#PingService)  
**Returns**: [<code>PingService</code>](#PingService) - instance by convention  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| executor | [<code>Executor</code>](#Executor) | executor instance |

<a name="RequestInfoConst"></a>

## RequestInfoConst
**Kind**: global class  
**See**: FTN6 spec  

* [RequestInfoConst](#RequestInfoConst)
    * [new RequestInfoConst()](#new_RequestInfoConst_new)
    * [.INFO_X509_CN](#RequestInfoConst.INFO_X509_CN)
    * [.INFO_PUBKEY](#RequestInfoConst.INFO_PUBKEY)
    * [.INFO_CLIENT_ADDR](#RequestInfoConst.INFO_CLIENT_ADDR)
    * [.INFO_SECURE_CHANNEL](#RequestInfoConst.INFO_SECURE_CHANNEL)
    * [.INFO_REQUEST_TIME_FLOAT](#RequestInfoConst.INFO_REQUEST_TIME_FLOAT)
    * [.INFO_SECURITY_LEVEL](#RequestInfoConst.INFO_SECURITY_LEVEL)
    * [.INFO_USER_INFO](#RequestInfoConst.INFO_USER_INFO)
    * [.INFO_RAW_REQUEST](#RequestInfoConst.INFO_RAW_REQUEST)
    * [.INFO_RAW_RESPONSE](#RequestInfoConst.INFO_RAW_RESPONSE)
    * [.INFO_DERIVED_KEY](#RequestInfoConst.INFO_DERIVED_KEY)
    * [.INFO_HAVE_RAW_UPLOAD](#RequestInfoConst.INFO_HAVE_RAW_UPLOAD)
    * [.INFO_HAVE_RAW_RESULT](#RequestInfoConst.INFO_HAVE_RAW_RESULT)
    * [.INFO_CHANNEL_CONTEXT](#RequestInfoConst.INFO_CHANNEL_CONTEXT)
    * [.SL_ANONYMOUS](#RequestInfoConst.SL_ANONYMOUS)
    * [.SL_INFO](#RequestInfoConst.SL_INFO)
    * [.SL_SAFE_OPS](#RequestInfoConst.SL_SAFE_OPS)
    * [.SL_PRIVILEGED_OPS](#RequestInfoConst.SL_PRIVILEGED_OPS)
    * [.SL_EXCEPTIONAL_OPS](#RequestInfoConst.SL_EXCEPTIONAL_OPS)
    * [.SL_SYSTEM](#RequestInfoConst.SL_SYSTEM)

<a name="new_RequestInfoConst_new"></a>

### new RequestInfoConst()
Pseudo-class for RequestInfo.info field enumeration

<a name="RequestInfoConst.INFO_X509_CN"></a>

### RequestInfoConst.INFO_X509_CN
CN field coming from validated client's x509 certificate, if any

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>X509_CN</code>  
<a name="RequestInfoConst.INFO_PUBKEY"></a>

### RequestInfoConst.INFO_PUBKEY
Client provided public key, if any

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>PUBKEY</code>  
<a name="RequestInfoConst.INFO_CLIENT_ADDR"></a>

### RequestInfoConst.INFO_CLIENT_ADDR
Client address

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>CLIENT_ADDR</code>  
**See**: SourceAddress  
<a name="RequestInfoConst.INFO_SECURE_CHANNEL"></a>

### RequestInfoConst.INFO_SECURE_CHANNEL
Boolean, indicates if transport channel is secure

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>SECURE_CHANNEL</code>  
<a name="RequestInfoConst.INFO_REQUEST_TIME_FLOAT"></a>

### RequestInfoConst.INFO_REQUEST_TIME_FLOAT
Implementation define timestamp of request start.

NOTE:it may not be related to absolute time. Please
see performance-now NPM module.

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>REQUEST_TIME_FLOAT</code>  
<a name="RequestInfoConst.INFO_SECURITY_LEVEL"></a>

### RequestInfoConst.INFO_SECURITY_LEVEL
Authentication, but not authorization, security level.

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**See**: RequestInfoConst.SL_*  
<a name="RequestInfoConst.INFO_USER_INFO"></a>

### RequestInfoConst.INFO_USER_INFO
User Info object

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**See**: UserInfo  
<a name="RequestInfoConst.INFO_RAW_REQUEST"></a>

### RequestInfoConst.INFO_RAW_REQUEST
Raw FutoIn request object

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
<a name="RequestInfoConst.INFO_RAW_RESPONSE"></a>

### RequestInfoConst.INFO_RAW_RESPONSE
Raw FutoIn response object

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
<a name="RequestInfoConst.INFO_DERIVED_KEY"></a>

### RequestInfoConst.INFO_DERIVED_KEY
Associated Derived Key

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**See**: DerivedKey  
<a name="RequestInfoConst.INFO_HAVE_RAW_UPLOAD"></a>

### RequestInfoConst.INFO_HAVE_RAW_UPLOAD
Indicates that input transport provided raw upload stream.

NOTE: service implementation should simply try to open
RequestInfo.rawInput()

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
<a name="RequestInfoConst.INFO_HAVE_RAW_RESULT"></a>

### RequestInfoConst.INFO_HAVE_RAW_RESULT
Indicates that Executor must provide raw response

NOTE: service implementation should simply try to open
RequestInfo.rawOutput()

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
<a name="RequestInfoConst.INFO_CHANNEL_CONTEXT"></a>

### RequestInfoConst.INFO_CHANNEL_CONTEXT
Associated transport channel context

**Kind**: static property of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**See**: ChannelContext  
<a name="RequestInfoConst.SL_ANONYMOUS"></a>

### RequestInfoConst.SL_ANONYMOUS
Security Level - Anonymous

**Kind**: static constant of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>Anonymous</code>  
**See**: RequestInfoConst.INFO_SECURITY_LEVEL  
<a name="RequestInfoConst.SL_INFO"></a>

### RequestInfoConst.SL_INFO
Security Level - Info

NOTE: it is level of user authentication, but
not authorization. This one is equal to
HTTP cookie-based authentication.

**Kind**: static constant of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>Info</code>  
**See**: RequestInfoConst.INFO_SECURITY_LEVEL  
<a name="RequestInfoConst.SL_SAFE_OPS"></a>

### RequestInfoConst.SL_SAFE_OPS
Security Level - SafeOps

NOTE: it is level of user authentication, but
not authorization. This one is equal to
HTTP Basic Auth.

**Kind**: static constant of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>SafeOps</code>  
**See**: RequestInfoConst.INFO_SECURITY_LEVEL  
<a name="RequestInfoConst.SL_PRIVILEGED_OPS"></a>

### RequestInfoConst.SL_PRIVILEGED_OPS
Security Level - PrivilegedOps

NOTE: it is level of user authentication, but
not authorization. This one equals to
multi-factor authentication and signed requests.

**Kind**: static constant of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>PrivilegedOps</code>  
**See**: RequestInfoConst.INFO_SECURITY_LEVEL  
<a name="RequestInfoConst.SL_EXCEPTIONAL_OPS"></a>

### RequestInfoConst.SL_EXCEPTIONAL_OPS
Security Level - ExceptionalOps

NOTE: it is level of user authentication, but
not authorization. This one equals to
multi-factor authentication for each action and
signed requests.

**Kind**: static constant of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>ExceptionalOps</code>  
**See**: RequestInfoConst.INFO_SECURITY_LEVEL  
<a name="RequestInfoConst.SL_SYSTEM"></a>

### RequestInfoConst.SL_SYSTEM
Security Level - System

NOTE: it is level of user authentication, but
not authorization. This one equals to
internal system authorization. User never gets
such security level.

**Kind**: static constant of [<code>RequestInfoConst</code>](#RequestInfoConst)  
**Default**: <code>System</code>  
**See**: RequestInfoConst.INFO_SECURITY_LEVEL  
<a name="RequestInfo"></a>

## RequestInfo
RequestInfo object as defined in FTN6

**Kind**: global class  

* [RequestInfo](#RequestInfo)
    * [new RequestInfo(executor, rawreq)](#new_RequestInfo_new)
    * [.params()](#RequestInfo+params) ⇒ <code>object</code>
    * [.result(replace)](#RequestInfo+result) ⇒ <code>object</code>
    * [.rawInput()](#RequestInfo+rawInput) ⇒ <code>object</code>
    * [.rawOutput()](#RequestInfo+rawOutput) ⇒ <code>object</code>
    * [.executor()](#RequestInfo+executor) ⇒ [<code>Executor</code>](#Executor)
    * [.ccm()](#RequestInfo+ccm) ⇒ <code>AdvancedCCM</code>
    * [.channel()](#RequestInfo+channel) ⇒ [<code>ChannelContext</code>](#ChannelContext)
    * [.cancelAfter(time_ms)](#RequestInfo+cancelAfter)

<a name="new_RequestInfo_new"></a>

### new RequestInfo(executor, rawreq)

| Param | Type | Description |
| --- | --- | --- |
| executor | [<code>Executor</code>](#Executor) | _ |
| rawreq | <code>object</code> \| <code>string</code> | raw request |

<a name="RequestInfo+params"></a>

### requestInfo.params() ⇒ <code>object</code>
Get reference to input params

**Kind**: instance method of [<code>RequestInfo</code>](#RequestInfo)  
**Returns**: <code>object</code> - parameter holder  
<a name="RequestInfo+result"></a>

### requestInfo.result(replace) ⇒ <code>object</code>
Get reference to output

**Kind**: instance method of [<code>RequestInfo</code>](#RequestInfo)  
**Returns**: <code>object</code> - result variable holder  

| Param | Type | Description |
| --- | --- | --- |
| replace | <code>\*</code> | replace result object |

<a name="RequestInfo+rawInput"></a>

### requestInfo.rawInput() ⇒ <code>object</code>
Get reference to input stream

**Kind**: instance method of [<code>RequestInfo</code>](#RequestInfo)  
**Returns**: <code>object</code> - raw input stream  
**Throws**:

- RawInputError

<a name="RequestInfo+rawOutput"></a>

### requestInfo.rawOutput() ⇒ <code>object</code>
Get reference to output stream

**Kind**: instance method of [<code>RequestInfo</code>](#RequestInfo)  
**Returns**: <code>object</code> - raw output stream  
**Throws**:

- RawOutputError

<a name="RequestInfo+executor"></a>

### requestInfo.executor() ⇒ [<code>Executor</code>](#Executor)
Get reference to associated Executor instance

**Kind**: instance method of [<code>RequestInfo</code>](#RequestInfo)  
**Returns**: [<code>Executor</code>](#Executor) - _  
<a name="RequestInfo+ccm"></a>

### requestInfo.ccm() ⇒ <code>AdvancedCCM</code>
Get reference to associated Executor's CCM instance

**Kind**: instance method of [<code>RequestInfo</code>](#RequestInfo)  
**Returns**: <code>AdvancedCCM</code> - _  
<a name="RequestInfo+channel"></a>

### requestInfo.channel() ⇒ [<code>ChannelContext</code>](#ChannelContext)
Get reference to channel context

**Kind**: instance method of [<code>RequestInfo</code>](#RequestInfo)  
**Returns**: [<code>ChannelContext</code>](#ChannelContext) - _  
<a name="RequestInfo+cancelAfter"></a>

### requestInfo.cancelAfter(time_ms)
Set overall request processing timeout in microseconds.

NOTE: repeat calls override previous value

**Kind**: instance method of [<code>RequestInfo</code>](#RequestInfo)  

| Param | Type | Description |
| --- | --- | --- |
| time_ms | <code>float</code> | set automatic request timeout after specified        value of microseconds. 0 - disables timeout |

<a name="SecurityProvider"></a>

## SecurityProvider
Generic security provider interface

**Kind**: global class  

* [SecurityProvider](#SecurityProvider)
    * [.checkAuth(as, reqinfo, reqmsg, sec)](#SecurityProvider+checkAuth)
    * [.signAuto(as, reqinfo, rspmsg)](#SecurityProvider+signAuto) ⇒ <code>boolean</code>
    * [.isSigned(reqinfo)](#SecurityProvider+isSigned) ⇒ <code>boolean</code>
    * [.checkAccess(as, reqinfo, acd)](#SecurityProvider+checkAccess)
    * [._setUser(as, reqinfo, seclvl, auth_info)](#SecurityProvider+_setUser)
    * [._normalizeQueryParams(as, reqinfo)](#SecurityProvider+_normalizeQueryParams)

<a name="SecurityProvider+checkAuth"></a>

### securityProvider.checkAuth(as, reqinfo, reqmsg, sec)
Check request authentication.

**Kind**: instance method of [<code>SecurityProvider</code>](#SecurityProvider)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | AsyncSteps interface |
| reqinfo | [<code>RequestInfo</code>](#RequestInfo) | extended request info |
| reqmsg | <code>object</code> | request message as is |
| sec | <code>array</code> | reqmsg.sec field split by ':' |

<a name="SecurityProvider+signAuto"></a>

### securityProvider.signAuto(as, reqinfo, rspmsg) ⇒ <code>boolean</code>
Check if response signature is required and perform signing.

**Kind**: instance method of [<code>SecurityProvider</code>](#SecurityProvider)  
**Returns**: <code>boolean</code> - true, if signature is set  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | AsyncSteps interface |
| reqinfo | [<code>RequestInfo</code>](#RequestInfo) | extended request info |
| rspmsg | <code>object</code> | response message as is |

<a name="SecurityProvider+isSigned"></a>

### securityProvider.isSigned(reqinfo) ⇒ <code>boolean</code>
Check if request is signed as in MessageSignature constraint.

**Kind**: instance method of [<code>SecurityProvider</code>](#SecurityProvider)  
**Returns**: <code>boolean</code> - true, if signed  

| Param | Type | Description |
| --- | --- | --- |
| reqinfo | [<code>RequestInfo</code>](#RequestInfo) | extended request info |

<a name="SecurityProvider+checkAccess"></a>

### securityProvider.checkAccess(as, reqinfo, acd)
Check access through Access Control concept

**Kind**: instance method of [<code>SecurityProvider</code>](#SecurityProvider)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | AsyncSteps interface |
| reqinfo | [<code>RequestInfo</code>](#RequestInfo) | extended request info |
| acd | <code>string</code> \| <code>array</code> | access control descriptor |

<a name="SecurityProvider+_setUser"></a>

### securityProvider._setUser(as, reqinfo, seclvl, auth_info)
A special helper to set authenticated user info

**Kind**: instance method of [<code>SecurityProvider</code>](#SecurityProvider)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| as | <code>AsyncSteps</code> |  | AsyncSteps interface |
| reqinfo | [<code>RequestInfo</code>](#RequestInfo) |  | extended request info |
| seclvl | <code>string</code> |  | security level |
| auth_info | <code>object</code> |  | authentication info |
| auth_info.local_id | <code>integer</code> \| <code>string</code> |  | Local User ID |
| auth_info.global_id | <code>string</code> |  | Global User ID |
| [auth_info.details] | <code>object</code> | <code></code> | user details |

<a name="SecurityProvider+_normalizeQueryParams"></a>

### securityProvider._normalizeQueryParams(as, reqinfo)
Normalize parameters passed through HTTP query.
It's important to call this before MAC checking.

**Kind**: instance method of [<code>SecurityProvider</code>](#SecurityProvider)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | AsyncSteps interface |
| reqinfo | [<code>RequestInfo</code>](#RequestInfo) | extended request info |

<a name="SourceAddress"></a>

## SourceAddress
Source Address representation

**Kind**: global class  

* [SourceAddress](#SourceAddress)
    * [new SourceAddress(type, [host], port)](#new_SourceAddress_new)
    * [.asString()](#SourceAddress+asString) ⇒ <code>string</code>

<a name="new_SourceAddress_new"></a>

### new SourceAddress(type, [host], port)

| Param | Type | Description |
| --- | --- | --- |
| type | <code>string</code> | Type of address |
| [host] | <code>string</code> | machine address, if applicable |
| port | <code>integer</code> \| <code>string</code> | port or path, if applicable |

<a name="SourceAddress+asString"></a>

### sourceAddress.asString() ⇒ <code>string</code>
Get a stable string representation

**Kind**: instance method of [<code>SourceAddress</code>](#SourceAddress)  
**Returns**: <code>string</code> - string representation  
<a name="UserInfo"></a>

## UserInfo
Class representing user information

**Kind**: global class  

* [UserInfo](#UserInfo)
    * [new UserInfo(ccm, local_id, global_id, details)](#new_UserInfo_new)
    * [.localID()](#UserInfo+localID) ⇒ <code>integer</code>
    * [.globalID()](#UserInfo+globalID) ⇒ <code>string</code>
    * [.details(as, [user_field_identifiers])](#UserInfo+details) ⇒ <code>AsyncSteps</code>

<a name="new_UserInfo_new"></a>

### new UserInfo(ccm, local_id, global_id, details)

| Param | Type | Description |
| --- | --- | --- |
| ccm | <code>AdvancedCCM</code> | reference to CCM |
| local_id | <code>integer</code> | local unique ID |
| global_id | <code>string</code> | global unique ID |
| details | <code>object</code> | user info fields, see UserInfoConst |

<a name="UserInfo+localID"></a>

### userInfo.localID() ⇒ <code>integer</code>
Get local unique ID

**Kind**: instance method of [<code>UserInfo</code>](#UserInfo)  
**Returns**: <code>integer</code> - Local ID  
<a name="UserInfo+globalID"></a>

### userInfo.globalID() ⇒ <code>string</code>
Get local global ID

**Kind**: instance method of [<code>UserInfo</code>](#UserInfo)  
**Returns**: <code>string</code> - Global ID  
<a name="UserInfo+details"></a>

### userInfo.details(as, [user_field_identifiers]) ⇒ <code>AsyncSteps</code>
Get user info details

**Kind**: instance method of [<code>UserInfo</code>](#UserInfo)  
**Returns**: <code>AsyncSteps</code> - for easy chaining. {object} with details through as.success()  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| [user_field_identifiers] | <code>object</code> | field list to get |

<a name="FutoInExecutor"></a>

## FutoInExecutor
**window.FutoInExecutor** - Browser-only reference to futoin-executor

**Kind**: global variable  
<a name="Executor"></a>

## Executor
**window.futoin.Executor** - Browser-only reference to futoin-executor

**Kind**: global variable  

* [Executor](#Executor)
    * [new Executor(ccm, opts)](#new_Executor_new)
    * [.ccm()](#Executor+ccm) ⇒ <code>AdvancedCCM</code>
    * [.register(as, ifacever, impl, specdirs)](#Executor+register)
    * [.onEndpointRequest(info, ftnreq, send_executor_rsp)](#Executor+onEndpointRequest)
    * [.onInternalRequest(as, info, ftnreq, [upload_data], [download_stream])](#Executor+onInternalRequest)
    * [.process(as)](#Executor+process)
    * [.checkAccess(as, acd)](#Executor+checkAccess)
    * [.initFromCache(as)](#Executor+initFromCache)
    * [.cacheInit(as)](#Executor+cacheInit)
    * [.close([close_cb])](#Executor+close)
    * [.packPayload(coder, msg)](#Executor+packPayload) ⇒ <code>string</code>
    * ["ready"](#Executor+event_ready)
    * ["request"](#Executor+event_request)
    * ["response"](#Executor+event_response)
    * ["notExpected"](#Executor+event_notExpected)
    * ["close"](#Executor+event_close)

<a name="new_Executor_new"></a>

### new Executor(ccm, opts)

| Param | Type | Description |
| --- | --- | --- |
| ccm | <code>AdvancedCCM</code> | instance of AdvancedCCM |
| opts | <code>objects</code> | see ExecutorOptions |

<a name="Executor+ccm"></a>

### executor.ccm() ⇒ <code>AdvancedCCM</code>
Get reference to associated AdvancedCCM instance

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Returns**: <code>AdvancedCCM</code> - CCM ref  
<a name="Executor+register"></a>

### executor.register(as, ifacever, impl, specdirs)
Register implementation of specific interface

**Kind**: instance method of [<code>Executor</code>](#Executor)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| ifacever | <code>string</code> | standard iface:version notation of interface        to be implemented. |
| impl | <code>object</code> \| <code>function</code> | either iface implementation or func( impl, executor ) |
| specdirs | <code>object</code> \| <code>array</code> | NOT STANDARD. Useful for direct passing of hardcoded spec definition. |

<a name="Executor+onEndpointRequest"></a>

### executor.onEndpointRequest(info, ftnreq, send_executor_rsp)
Entry point for Server-originated requests when acting as ClientExecutor

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Emits**: [<code>notExpected</code>](#Executor+event_notExpected), [<code>request</code>](#Executor+event_request), [<code>response</code>](#Executor+event_response)  

| Param | Type | Description |
| --- | --- | --- |
| info | <code>object</code> | raw Invoker interface info |
| ftnreq | <code>object</code> | FutoIn request object |
| send_executor_rsp | <code>function</code> | callback( ftnrsp ) |

<a name="Executor+onInternalRequest"></a>

### executor.onInternalRequest(as, info, ftnreq, [upload_data], [download_stream])
Entry point for in-program originated requests. Process with maximum efficiency (not yet ;)

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Emits**: [<code>notExpected</code>](#Executor+event_notExpected), [<code>request</code>](#Executor+event_request), [<code>response</code>](#Executor+event_response)  
**Note**: AS result: ftnrsp, content-type  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| info | <code>object</code> | raw Invoker interface info |
| ftnreq | <code>object</code> | FutoIn request object |
| [upload_data] | <code>object</code> | upload stream, if any |
| [download_stream] | <code>object</code> | download stream, if any |

<a name="Executor+process"></a>

### executor.process(as)
Standard entry point used by subclasses.
Do full cycle of request processing, including all security checks

NOTE: as.state.reqinfo must point to valid instance of RequestInfo

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Emits**: [<code>notExpected</code>](#Executor+event_notExpected), [<code>request</code>](#Executor+event_request), [<code>response</code>](#Executor+event_response)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |

<a name="Executor+checkAccess"></a>

### executor.checkAccess(as, acd)
Shortcut to check access through #acl interface.

NOTE: as.state.reqinfo must point to valid instance of RequestInfo

**Kind**: instance method of [<code>Executor</code>](#Executor)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |
| acd | <code>string</code> | access control descriptor |

<a name="Executor+initFromCache"></a>

### executor.initFromCache(as)
NOT IMPLEMENTED, DO NOT USE. Just a compliance with the Executor interface
from spec.

**Kind**: instance method of [<code>Executor</code>](#Executor)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |

<a name="Executor+cacheInit"></a>

### executor.cacheInit(as)
NOT IMPLEMENTED, DO NOT USE. Just a compliance with the Executor interface
from spec.

**Kind**: instance method of [<code>Executor</code>](#Executor)  

| Param | Type | Description |
| --- | --- | --- |
| as | <code>AsyncSteps</code> | steps interface |

<a name="Executor+close"></a>

### executor.close([close_cb])
Shutdown Executor and stop whole processing

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Emits**: [<code>close</code>](#Executor+event_close)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [close_cb] | <code>callable</code> | <code></code> | callback to execute after Executor shutdown |

<a name="Executor+packPayload"></a>

### executor.packPayload(coder, msg) ⇒ <code>string</code>
Not standard. Pack message object into JSON representation.
If safe limit of 64K is exceeded  then error is raised.

**Kind**: instance method of [<code>Executor</code>](#Executor)  
**Returns**: <code>string</code> - string representation of the message  
**Emits**: [<code>notExpected</code>](#Executor+event_notExpected)  

| Param | Type | Description |
| --- | --- | --- |
| coder | <code>MessageCoder</code> | message coder instance |
| msg | <code>object</code> | message to encode into JSON |

<a name="Executor+event_ready"></a>

### "ready"
May be fired in derived Executors to signal readiness
()

**Kind**: event emitted by [<code>Executor</code>](#Executor)  
<a name="Executor+event_request"></a>

### "request"
Fired when request processing is started.
( reqinfo, rawreq )

**Kind**: event emitted by [<code>Executor</code>](#Executor)  
<a name="Executor+event_response"></a>

### "response"
Fired when request processing is started.
( reqinfo, rawreq )

**Kind**: event emitted by [<code>Executor</code>](#Executor)  
<a name="Executor+event_notExpected"></a>

### "notExpected"
Fired when not expected error occurs
( errmsg, error_info, last_exception, async_stack )

**Kind**: event emitted by [<code>Executor</code>](#Executor)  
<a name="Executor+event_close"></a>

### "close"
Fired when Executor is shutting down.
()

**Kind**: event emitted by [<code>Executor</code>](#Executor)  
<a name="BrowserExecutor"></a>

## BrowserExecutor
**window.BrowserExecutor** - Browser-only reference to
futoin-executor.BrowserExecutor

**Kind**: global variable  
<a name="new_BrowserExecutor_new"></a>

### new BrowserExecutor(ccm, opts)

| Param | Type | Description |
| --- | --- | --- |
| ccm | <code>AdvancedCCM</code> | CCM ref |
| opts | [<code>BrowserExecutorOptions</code>](#BrowserExecutorOptions) | executor options |

<a name="UserInfoConst"></a>

## UserInfoConst
Pseudo-class for documenting UserInfo detail fields as
defined in FTN8 spec

**Kind**: global constant  

* [UserInfoConst](#UserInfoConst)
    * [.INFO_Login](#UserInfoConst.INFO_Login)
    * [.INFO_Nick](#UserInfoConst.INFO_Nick)
    * [.INFO_FirstName](#UserInfoConst.INFO_FirstName)
    * [.INFO_FullName](#UserInfoConst.INFO_FullName)
    * [.INFO_DateOfBirth](#UserInfoConst.INFO_DateOfBirth)
    * [.INFO_TimeOfBirth](#UserInfoConst.INFO_TimeOfBirth)
    * [.INFO_ContactEmail](#UserInfoConst.INFO_ContactEmail)
    * [.INFO_ContactPhone](#UserInfoConst.INFO_ContactPhone)
    * [.INFO_HomeAddress](#UserInfoConst.INFO_HomeAddress)
    * [.INFO_WorkAddress](#UserInfoConst.INFO_WorkAddress)
    * [.INFO_Citizenship](#UserInfoConst.INFO_Citizenship)
    * [.INFO_GovernmentRegID](#UserInfoConst.INFO_GovernmentRegID)
    * [.INFO_AvatarURL](#UserInfoConst.INFO_AvatarURL)

<a name="UserInfoConst.INFO_Login"></a>

### UserInfoConst.INFO_Login
Login Name

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>Login</code>  
<a name="UserInfoConst.INFO_Nick"></a>

### UserInfoConst.INFO_Nick
Nick Name

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>Nick</code>  
<a name="UserInfoConst.INFO_FirstName"></a>

### UserInfoConst.INFO_FirstName
First Name

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>FirstName</code>  
<a name="UserInfoConst.INFO_FullName"></a>

### UserInfoConst.INFO_FullName
Full Name

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>FullName</code>  
<a name="UserInfoConst.INFO_DateOfBirth"></a>

### UserInfoConst.INFO_DateOfBirth
Date if birth in ISO "YYYY-MM-DD" format

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>DateOfBirth</code>  
<a name="UserInfoConst.INFO_TimeOfBirth"></a>

### UserInfoConst.INFO_TimeOfBirth
Date if birth in ISO "HH:mm:ss" format, can be truncated to minutes

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>TimeOfBirth</code>  
<a name="UserInfoConst.INFO_ContactEmail"></a>

### UserInfoConst.INFO_ContactEmail
E-mail for contacts

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>ContactEmail</code>  
<a name="UserInfoConst.INFO_ContactPhone"></a>

### UserInfoConst.INFO_ContactPhone
Phone for contacts

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>ContactPhone</code>  
<a name="UserInfoConst.INFO_HomeAddress"></a>

### UserInfoConst.INFO_HomeAddress
Home address

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>HomeAddress</code>  
<a name="UserInfoConst.INFO_WorkAddress"></a>

### UserInfoConst.INFO_WorkAddress
Work address

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>WorkAddress</code>  
<a name="UserInfoConst.INFO_Citizenship"></a>

### UserInfoConst.INFO_Citizenship
Citizenship

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>Citizenship</code>  
<a name="UserInfoConst.INFO_GovernmentRegID"></a>

### UserInfoConst.INFO_GovernmentRegID
Country-specific unique registration ID, e,g, SSN, PersonalCode, etc.

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>GovernmentRegID</code>  
<a name="UserInfoConst.INFO_AvatarURL"></a>

### UserInfoConst.INFO_AvatarURL
URL of avatar image

**Kind**: static constant of [<code>UserInfoConst</code>](#UserInfoConst)  
**Default**: <code>AvatarURL</code>  


*documented by [jsdoc-to-markdown](https://github.com/75lb/jsdoc-to-markdown)*.


