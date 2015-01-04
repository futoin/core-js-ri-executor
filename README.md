
  [![NPM Version](https://img.shields.io/npm/v/futoin-executor.svg?style=flat)](https://www.npmjs.com/package/futoin-executor)
  [![NPM Downloads](https://img.shields.io/npm/dm/futoin-executor.svg?style=flat)](https://www.npmjs.com/package/futoin-executor)
  [![Build Status](https://travis-ci.org/futoin/core-js-ri-executor.svg?branch=master)](https://travis-ci.org/futoin/core-js-ri-executor)

  [![NPM](https://nodei.co/npm/futoin-executor.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/futoin-executor/)


# WARNING

This project is in **active development** and *is not feature-complete yet*, but is already **mature enough**.
The documentation of this specific implementation is not complete either.

# FutoIn reference implementation

Reference implementation of:
 
    FTN6: FutoIn Executor Concept
    Version: 1.0
    
Spec: [FTN6: Interface Executor Concept v1.x](http://specs.futoin.org/final/preview/ftn6_iface_executor_concept-1.html)

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

# Installation for Browser

```sh
$ bower install futoin-executor --save
```

Please note that browser build is available under in dist/ folder in sources generated
with [pure-sjc](https://github.com/RReverser/pure-cjs). It depends on
[lodash](https://www.npmjs.com/package/lodash) and
[futoin-invoker](https://www.npmjs.com/package/futoin-invoker).

*Note: there are the following globals available*:

* SimpleCCM - global reference to futoin-invoker.SimpleCCM class
* AdvancedCCM - global reference to futoin-invoker.AdvancedCCM class
* futoin.Invoker - global reference to futoin-invoker module

    
# API documentation

The concept is described in FutoIn specification: [FTN6: Interface Executor Concept v1.x](http://specs.futoin.org/final/preview/ftn6_iface_executor_concept-1.html)

#Index

**Modules**

* [futoin-executor](#module_futoin-executor)

**Members**

* [FutoInExecutor](#FutoInExecutor)
* [Executor](#Executor)
 
<a name="module_futoin-executor"></a>
#futoin-executor
<a name="FutoInExecutor"></a>
#FutoInExecutor
Browser-only reference to futoin-executor

<a name="Executor"></a>
#Executor
Browser-only reference to futoin-executor




*documented by [jsdoc-to-markdown](https://github.com/75lb/jsdoc-to-markdown)*.


